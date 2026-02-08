#!/usr/bin/env bun

/**
 * CLI entry point for community-intel-cache.
 *
 * Two commands:
 *   refresh - Check staleness, gather, synthesize, write cache
 *   reset   - Delete cache files to force refresh on next run
 *
 * Always exits 0 -- never blocks Claude Code hooks.
 *
 * Usage:
 *   bunx @side-quest/community-intel-cache refresh \
 *     --config ./community-intel.json \
 *     --cache-dir ./skills/hooks/cache
 *
 *   bunx @side-quest/community-intel-cache reset \
 *     --cache-dir ./skills/hooks/cache
 */

import { existsSync, unlinkSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { readJsonFileSync } from '@side-quest/core/fs'
import {
	buildBackoffMetadata,
	calculateNextUpdate,
	getIntervalDays,
	hasExistingCache,
	isCacheFresh,
} from './cache.js'
import { createDiagnostics, emitStatus } from './diagnostics.js'
import { formatMarkdown } from './format.js'
import { gatherTopics, hasData } from './gather.js'
import { synthesize } from './synthesize.js'
import type { CacheConfig, CacheMetadata, CliOptions } from './types.js'
import { writeBackoffMetadata, writeCacheFiles } from './write.js'

/** Parse CLI arguments into structured options. */
function parseCliArgs(argv: string[]): CliOptions {
	const args = argv.slice(2)
	const command = args[0] as 'refresh' | 'reset' | undefined

	if (!command || !['refresh', 'reset'].includes(command)) {
		console.error(
			'Usage: community-intel-cache <refresh|reset> --config <path> --cache-dir <path>',
		)
		process.exit(0)
	}

	let configPath = ''
	let cacheDir = ''
	let noSynthesize = false
	let force = false
	let verbose = false

	for (let i = 1; i < args.length; i++) {
		const arg = args[i]
		switch (arg) {
			case '--config':
				configPath = args[++i] ?? ''
				break
			case '--cache-dir':
				cacheDir = args[++i] ?? ''
				break
			case '--no-synthesize':
				noSynthesize = true
				break
			case '--force':
				force = true
				break
			case '--verbose':
				verbose = true
				break
		}
	}

	// Resolve relative paths from cwd
	if (configPath) configPath = resolve(configPath)
	if (cacheDir) cacheDir = resolve(cacheDir)

	return { command, configPath, cacheDir, noSynthesize, force, verbose }
}

/** Execute the reset command: delete cache files. */
function executeReset(cacheDir: string): void {
	if (!cacheDir) {
		console.error('--cache-dir is required for reset')
		process.exit(0)
	}

	const files = ['community-intel.md', 'last-updated.json']
	for (const file of files) {
		const path = join(cacheDir, file)
		if (existsSync(path)) {
			unlinkSync(path)
			if (process.stderr.isTTY) {
				console.error(`removed: ${file}`)
			}
		}
	}

	console.log(JSON.stringify({ status: 'reset' }))
}

/** Execute the refresh command: check staleness, gather, synthesize, write. */
async function executeRefresh(options: CliOptions): Promise<void> {
	const diagnostics = createDiagnostics()

	// Validate required args
	if (!options.configPath) {
		diagnostics.push({
			topic: 'init',
			reason: '--config is required for refresh',
		})
		emitStatus('failed', diagnostics)
		return
	}
	if (!options.cacheDir) {
		diagnostics.push({
			topic: 'init',
			reason: '--cache-dir is required for refresh',
		})
		emitStatus('failed', diagnostics)
		return
	}

	// Load config
	let config: CacheConfig
	try {
		config = readJsonFileSync<CacheConfig>(options.configPath)
	} catch (err) {
		diagnostics.push({
			topic: 'init',
			reason: `failed to read config: ${String(err)}`,
		})
		emitStatus('failed', diagnostics)
		return
	}

	if (!config.topics || config.topics.length === 0) {
		diagnostics.push({
			topic: 'init',
			reason: 'config.topics is empty or missing',
		})
		emitStatus('failed', diagnostics)
		return
	}

	// Fast path: cache is fresh (unless --force)
	if (!options.force && isCacheFresh(options.cacheDir)) {
		emitStatus('fresh', diagnostics)
		return
	}

	if (options.verbose) {
		console.error(
			`[refresh] ${options.force ? 'forced' : 'stale/missing'}, querying ${config.topics.length} topics`,
		)
	}

	const hadCache = hasExistingCache(options.cacheDir)

	// Gather: parallel last-30-days queries
	const results = await gatherTopics(
		config.topics,
		diagnostics,
		options.verbose,
	)

	// Count successful queries (returned data)
	const successCount = results.filter((r) => r !== null && hasData(r)).length

	// All failed: write backoff metadata and exit
	if (successCount === 0) {
		const backoffMeta = buildBackoffMetadata(options.cacheDir, config.topics)
		await writeBackoffMetadata(options.cacheDir, backoffMeta)
		emitStatus(
			hadCache ? 'failed' : 'no_cache',
			diagnostics,
			'all queries failed, backoff 4h',
		)
		return
	}

	const now = new Date()
	const updatedAt = now.toISOString()

	// Synthesize or format raw
	let markdown: string

	if (options.noSynthesize) {
		if (options.verbose) {
			console.error('[refresh] --no-synthesize: using raw format')
		}
		markdown = formatMarkdown(results, updatedAt)
	} else {
		const context = config.context ?? config.topics.join(', ')

		if (options.verbose) {
			console.error('[refresh] synthesizing via claude --print')
		}

		const synthesized = await synthesize(results, context, options.verbose)

		if (synthesized) {
			// Prepend header to synthesized output
			markdown = [
				'# Community Intelligence',
				'',
				`Synthesized by \`community-intel-cache\` on ${updatedAt}.`,
				'',
				synthesized,
			].join('\n')
		} else {
			if (options.verbose) {
				console.error('[refresh] synthesis failed, falling back to raw format')
			}
			markdown = formatMarkdown(results, updatedAt)
		}
	}

	// Calculate next update based on success rate
	const nextUpdate = calculateNextUpdate(
		successCount,
		config.topics.length,
		config,
		now,
	)
	const intervalDays = getIntervalDays(
		successCount,
		config.topics.length,
		config,
	)

	// Write cache files atomically
	const metadata: CacheMetadata = {
		last_updated: updatedAt,
		topics_researched: config.topics,
		next_update_after: nextUpdate.toISOString(),
	}

	await writeCacheFiles(options.cacheDir, markdown, metadata)

	emitStatus(
		'refreshed',
		diagnostics,
		`${successCount}/${config.topics.length} topics (interval: ${intervalDays}d)`,
	)
}

/** Main entry point -- wraps everything in try/catch, always exits 0. */
async function main(): Promise<void> {
	const options = parseCliArgs(process.argv)

	if (options.command === 'reset') {
		executeReset(options.cacheDir)
		return
	}

	await executeRefresh(options)
}

main().catch((err) => {
	const diagnostics = createDiagnostics()
	diagnostics.push({ topic: 'main', reason: `fatal: ${String(err)}` })
	emitStatus('failed', diagnostics)
	process.exit(0)
})

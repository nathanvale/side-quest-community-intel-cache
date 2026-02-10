#!/usr/bin/env bun

/**
 * CLI entry point for community-intel-cache.
 *
 * Commands:
 *   refresh - Check staleness, gather, synthesize, write cache
 *   reset   - Delete cache files to force refresh on next run
 *   extract - Get unreviewed findings from staged raw data
 *   review  - Record accept/reject decisions for findings
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
 *
 *   bunx @side-quest/community-intel-cache extract \
 *     --cache-dir ./skills/hooks/cache
 *
 *   bunx @side-quest/community-intel-cache review \
 *     --cache-dir ./skills/hooks/cache \
 *     --hashes hash1,hash2 --decision accepted
 */

import { existsSync, unlinkSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
	readJsonFileOrDefault,
	readJsonFileSync,
	writeJsonFileAtomic,
} from '@side-quest/core/fs'
import {
	buildBackoffMetadata,
	calculateNextUpdate,
	getIntervalDays,
	hasExistingCache,
	isCacheFresh,
} from './cache.js'
import { createDiagnostics, emitStatus } from './diagnostics.js'
import { getUnreviewedFindings } from './extract.js'
import { formatMarkdown } from './format.js'
import { gatherTopics, hasData } from './gather.js'
import { synthesize } from './synthesize.js'
import type {
	CacheConfig,
	CacheMetadata,
	CliOptions,
	ReviewedHashes,
} from './types.js'
import { CONFIG_DEFAULTS } from './types.js'
import { writeBackoffMetadata, writeCacheFiles } from './write.js'

/** Print full help text to stdout and exit 0. */
function printHelp(): never {
	console.log(`community-intel-cache - Community intelligence gathering and caching CLI

Usage: community-intel-cache <command> [options]

Commands:
  refresh   Check staleness, gather, synthesize, and write cache
  reset     Delete cache files to force refresh on next run
  extract   Get unreviewed findings from staged raw data
  review    Record accept/reject decisions for findings

Options:
  --config <path>      Path to community-intel.json (refresh)
  --cache-dir <path>   Cache directory path (all commands)
  --days <N>           Lookback window in days, 1-365 (refresh, default: 7)
  --no-synthesize      Skip LLM synthesis, use raw markdown (refresh)
  --force              Ignore staleness, force refresh (refresh)
  --verbose            Emit diagnostic messages to stderr (refresh)
  --hashes <h1,h2>    Comma-separated finding hashes (review)
  --decision <value>   "accepted" or "rejected" (review)
  --help, -h           Show this help message`)
	process.exit(0)
}

/** Parse CLI arguments into structured options. */
function parseCliArgs(argv: string[]): CliOptions {
	const args = argv.slice(2)

	// Top-level --help before command parsing
	if (args[0] === '--help' || args[0] === '-h') {
		printHelp()
	}

	const command = args[0] as CliOptions['command'] | undefined

	const validCommands = ['refresh', 'reset', 'extract', 'review']
	if (!command || !validCommands.includes(command)) {
		console.error(
			'Usage: community-intel-cache <refresh|reset|extract|review> --cache-dir <path> [options]',
		)
		console.error('Run with --help for usage information.')
		process.exit(0)
	}

	let configPath = ''
	let cacheDir = ''
	let days: number | undefined
	let noSynthesize = false
	let force = false
	let verbose = false
	let hashes: string[] = []
	let decision: 'accepted' | 'rejected' = 'accepted'

	for (let i = 1; i < args.length; i++) {
		const arg = args[i]
		switch (arg) {
			case '--help':
			case '-h':
				printHelp()
				break
			case '--config':
				configPath = args[++i] ?? ''
				break
			case '--cache-dir':
				cacheDir = args[++i] ?? ''
				break
			case '--days': {
				const raw = args[++i]
				const n = Number(raw)
				if (Number.isNaN(n)) {
					if (verbose) {
						console.error(
							`[cli] --days received non-numeric value "${raw}", using default ${CONFIG_DEFAULTS.days}`,
						)
					}
					days = CONFIG_DEFAULTS.days
				} else {
					days = Math.max(1, Math.min(365, n))
				}
				break
			}
			case '--no-synthesize':
				noSynthesize = true
				break
			case '--force':
				force = true
				break
			case '--verbose':
				verbose = true
				break
			case '--hashes':
				hashes = (args[++i] ?? '').split(',').filter(Boolean)
				break
			case '--decision':
				decision = (args[++i] ?? 'accepted') as 'accepted' | 'rejected'
				break
		}
	}

	// Resolve relative paths from cwd
	if (configPath) configPath = resolve(configPath)
	if (cacheDir) cacheDir = resolve(cacheDir)

	return {
		command,
		configPath,
		cacheDir,
		days,
		noSynthesize,
		force,
		verbose,
		hashes,
		decision,
	}
}

/** Execute the reset command: delete cache files. */
function executeReset(cacheDir: string): void {
	if (!cacheDir) {
		console.error('--cache-dir is required for reset')
		process.exit(0)
	}

	const files = ['staged-intel.md', 'staged-raw.json', 'last-updated.json']
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

	// Resolve days: CLI flag wins, then config, then default
	const days = options.days ?? config.days ?? CONFIG_DEFAULTS.days

	// Gather: parallel last-30-days queries
	const results = await gatherTopics(
		config.topics,
		diagnostics,
		options.verbose,
		days,
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

	await writeCacheFiles(options.cacheDir, markdown, metadata, results)

	emitStatus(
		'refreshed',
		diagnostics,
		`${successCount}/${config.topics.length} topics (interval: ${intervalDays}d)`,
	)
}

/** Execute the extract command: get unreviewed findings from staged data. */
function executeExtract(cacheDir: string): void {
	if (!cacheDir) {
		console.error('--cache-dir is required for extract')
		process.exit(0)
	}

	const result = getUnreviewedFindings(cacheDir)
	console.log(JSON.stringify(result, null, '\t'))
}

/**
 * Execute the review command: record accept/reject decisions for findings.
 *
 * Uses readJsonFileOrDefault + writeJsonFileAtomic for safe
 * read-modify-write of reviewed-hashes.json.
 */
async function executeReview(options: CliOptions): Promise<void> {
	if (!options.cacheDir) {
		console.error('--cache-dir is required for review')
		process.exit(0)
	}

	if (options.hashes.length === 0) {
		console.error('--hashes is required for review (comma-separated)')
		process.exit(0)
	}

	if (!['accepted', 'rejected'].includes(options.decision)) {
		console.error('--decision must be "accepted" or "rejected"')
		process.exit(0)
	}

	const now = new Date().toISOString()
	const newEntries = options.hashes.map((hash) => ({
		hash,
		decision: options.decision,
		date: now,
	}))

	const reviewedPath = join(options.cacheDir, 'reviewed-hashes.json')
	const existing = readJsonFileOrDefault<ReviewedHashes>(reviewedPath, {
		version: 1,
		reviewed: [],
	})
	const newHashSet = new Set(newEntries.map((e) => e.hash))
	// Remove any prior decisions for the same hashes (last decision wins)
	existing.reviewed = existing.reviewed.filter((r) => !newHashSet.has(r.hash))
	existing.reviewed.push(...newEntries)
	await writeJsonFileAtomic(reviewedPath, existing)

	console.log(
		JSON.stringify({
			status: 'recorded',
			count: newEntries.length,
			decision: options.decision,
		}),
	)
}

/** Main entry point -- wraps everything in try/catch, always exits 0. */
async function main(): Promise<void> {
	const options = parseCliArgs(process.argv)

	switch (options.command) {
		case 'reset':
			executeReset(options.cacheDir)
			return
		case 'extract':
			executeExtract(options.cacheDir)
			return
		case 'review':
			await executeReview(options)
			return
		case 'refresh':
			await executeRefresh(options)
			return
	}
}

main().catch((err) => {
	const diagnostics = createDiagnostics()
	diagnostics.push({ topic: 'main', reason: `fatal: ${String(err)}` })
	emitStatus('failed', diagnostics)
	process.exit(0)
})

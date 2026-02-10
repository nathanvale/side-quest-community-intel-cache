/**
 * Parallel research query execution via @side-quest/last-30-days.
 *
 * Uses @side-quest/core/spawn for safe process execution with timeouts,
 * replacing the hand-rolled Promise.race + proc.kill() pattern.
 */

import {
	buildEnhancedPath,
	spawnWithTimeout,
	whichCommand,
} from '@side-quest/core/spawn'
import type { Last30DaysReport, QueryError } from './types.js'
import { QUERY_TIMEOUT_MS } from './types.js'

/**
 * Resolve the full path to bunx so spawning works even with a minimal PATH.
 *
 * Uses @side-quest/core/spawn's whichCommand with buildEnhancedPath
 * to cover Homebrew, /usr/local, and other common tool locations.
 */
function resolveBunx(): string {
	const found = whichCommand('bunx')
	if (found) return found

	// Explicit fallback candidates for constrained environments
	const candidates = ['/opt/homebrew/bin/bunx', '/usr/local/bin/bunx']
	for (const c of candidates) {
		if (Bun.which(c)) return c
	}

	return 'bunx' // last resort: hope it's on PATH at runtime
}

/** Validate that parsed JSON matches the expected Last30DaysReport shape. */
function isValidReport(parsed: unknown): parsed is Last30DaysReport {
	if (typeof parsed !== 'object' || parsed === null) return false
	const obj = parsed as Record<string, unknown>
	return (
		typeof obj.topic === 'string' &&
		Array.isArray(obj.reddit) &&
		Array.isArray(obj.x) &&
		Array.isArray(obj.web)
	)
}

/** Check whether a report has any actual data across all source arrays. */
export function hasData(report: Last30DaysReport): boolean {
	return report.reddit.length + report.x.length + report.web.length > 0
}

/**
 * Run a single last-30-days query with timeout.
 *
 * Returns the parsed report or null on failure.
 * All errors are collected into the diagnostics array for the caller.
 */
async function runQuery(
	topic: string,
	diagnostics: QueryError[],
	verbose: boolean,
): Promise<Last30DaysReport | null> {
	const bunx = resolveBunx()
	const cmd = [
		bunx,
		'--bun',
		'@side-quest/last-30-days',
		topic,
		'--emit=json',
		'--quick',
	]

	if (verbose) {
		console.error(`[gather] querying: ${topic}`)
	}

	let result: Awaited<ReturnType<typeof spawnWithTimeout>>
	try {
		result = await spawnWithTimeout(cmd, QUERY_TIMEOUT_MS, {
			env: { NO_COLOR: '1', PATH: buildEnhancedPath() },
		})
	} catch (err) {
		diagnostics.push({
			topic,
			reason: `spawn failed: ${String(err)}`,
		})
		return null
	}

	if (result.timedOut) {
		diagnostics.push({
			topic,
			reason: `timeout after ${QUERY_TIMEOUT_MS}ms`,
		})
		return null
	}

	if (result.exitCode !== 0) {
		diagnostics.push({
			topic,
			reason: `exit code ${result.exitCode}`,
			stderr: result.stderr.slice(0, 300),
		})
		return null
	}

	try {
		const parsed = JSON.parse(result.stdout.trim())
		if (!isValidReport(parsed)) {
			diagnostics.push({
				topic,
				reason: 'invalid report shape',
			})
			return { topic, reddit: [], x: [], web: [] }
		}
		return parsed
	} catch {
		diagnostics.push({
			topic,
			reason: 'stdout was not valid JSON',
			stderr: result.stderr.slice(0, 300),
		})
		// Return empty report so it counts as "ran but no data"
		return { topic, reddit: [], x: [], web: [] }
	}
}

/**
 * Run all topic queries in parallel and return results.
 *
 * Returns an array matching the input topics order.
 * Null entries indicate failed queries.
 */
export async function gatherTopics(
	topics: string[],
	diagnostics: QueryError[],
	verbose = false,
): Promise<Array<Last30DaysReport | null>> {
	return Promise.all(
		topics.map((topic) => runQuery(topic, diagnostics, verbose)),
	)
}

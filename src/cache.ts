/**
 * Cache staleness checking, interval calculation, and backoff logic.
 *
 * Ported from dell-u4025qw/scripts/refresh-cache.ts, now config-driven
 * instead of hardcoded. Uses @side-quest/core/fs for safe file reads.
 */

import { join } from 'node:path'
import { pathExistsSync, readJsonFileOrDefault } from '@side-quest/core/fs'
import type { CacheConfig, CacheMetadata } from './types.js'
import { BACKOFF_HOURS, CONFIG_DEFAULTS, MAX_CACHE_AGE_DAYS } from './types.js'

/**
 * Check whether the cache is still fresh (skip refresh if true).
 *
 * A cache is fresh when:
 * 1. Both last-updated.json and staged-intel.md exist
 * 2. The metadata parses successfully
 * 3. last_updated is not older than MAX_CACHE_AGE_DAYS (clock skew guard)
 * 4. next_update_after is in the future
 */
export function isCacheFresh(cacheDir: string): boolean {
	const metadataPath = join(cacheDir, 'last-updated.json')
	if (!pathExistsSync(metadataPath)) return false

	// Cache requires both metadata and the actual intel file
	if (!pathExistsSync(join(cacheDir, 'staged-intel.md'))) return false

	const metadata = readJsonFileOrDefault<CacheMetadata | null>(
		metadataPath,
		null,
	)
	if (!metadata) return false

	try {
		// Guard against clock skew: if last_updated > 60 days old, force refresh
		const lastUpdated = new Date(metadata.last_updated)
		const ageMs = Date.now() - lastUpdated.getTime()
		if (ageMs > MAX_CACHE_AGE_DAYS * 24 * 60 * 60 * 1000) return false

		const nextUpdate = new Date(metadata.next_update_after)
		return nextUpdate.getTime() > Date.now()
	} catch {
		return false
	}
}

/**
 * Calculate the next update timestamp based on query success rate.
 *
 * If fewer than 50% of topics returned data, use the thin cache interval
 * so the cache self-heals faster instead of waiting the full cycle.
 */
export function calculateNextUpdate(
	successCount: number,
	totalTopics: number,
	config: CacheConfig,
	now: Date = new Date(),
): Date {
	const refreshDays =
		config.refreshIntervalDays ?? CONFIG_DEFAULTS.refreshIntervalDays
	const thinDays =
		config.thinCacheIntervalDays ?? CONFIG_DEFAULTS.thinCacheIntervalDays

	const intervalDays = successCount < totalTopics / 2 ? thinDays : refreshDays

	return new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000)
}

/**
 * Get the interval in days that was used for a given success rate.
 * Useful for status reporting.
 */
export function getIntervalDays(
	successCount: number,
	totalTopics: number,
	config: CacheConfig,
): number {
	const refreshDays =
		config.refreshIntervalDays ?? CONFIG_DEFAULTS.refreshIntervalDays
	const thinDays =
		config.thinCacheIntervalDays ?? CONFIG_DEFAULTS.thinCacheIntervalDays

	return successCount < totalTopics / 2 ? thinDays : refreshDays
}

/**
 * Build backoff metadata when all queries fail.
 *
 * Preserves the original last_updated timestamp (don't advance it on failure)
 * and sets next_update_after to BACKOFF_HOURS in the future to cap retries.
 */
export function buildBackoffMetadata(
	cacheDir: string,
	topics: string[],
): CacheMetadata {
	const metadataPath = join(cacheDir, 'last-updated.json')
	const existing = readJsonFileOrDefault<CacheMetadata | null>(
		metadataPath,
		null,
	)

	const preservedTimestamp = existing?.last_updated ?? new Date().toISOString()

	return {
		last_updated: preservedTimestamp,
		topics_researched: topics,
		next_update_after: new Date(
			Date.now() + BACKOFF_HOURS * 60 * 60 * 1000,
		).toISOString(),
	}
}

/** Check whether an existing cache file is present (for status reporting). */
export function hasExistingCache(cacheDir: string): boolean {
	return pathExistsSync(join(cacheDir, 'staged-intel.md'))
}

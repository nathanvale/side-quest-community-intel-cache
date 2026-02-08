/**
 * Shared type definitions for the community-intel-cache CLI.
 *
 * CacheConfig mirrors the community-intel.json file consumers provide.
 * Last30DaysReport matches the `--emit=json` output shape from @side-quest/last-30-days.
 */

/** Configuration loaded from community-intel.json. */
export interface CacheConfig {
	/** Search queries for @side-quest/last-30-days. */
	topics: string[]
	/** Full-success refresh interval in days (default: 30). */
	refreshIntervalDays?: number
	/** Interval when <50% queries succeed, for self-healing (default: 7). */
	thinCacheIntervalDays?: number
	/**
	 * Skill context for LLM synthesis.
	 * If omitted, synthesis uses topics as context.
	 */
	context?: string
}

/** Metadata stored in last-updated.json to track cache staleness. */
export interface CacheMetadata {
	last_updated: string
	topics_researched: string[]
	next_update_after: string
}

/**
 * Matches the serialized output shape from `@side-quest/last-30-days --emit=json`.
 * This is the `reportToDict()` output, not the internal `Report` type.
 */
export interface Last30DaysReport {
	topic: string
	range?: { from: string; to: string }
	reddit: Array<{
		title: string
		url: string
		subreddit: string
		date: string | null
		why_relevant: string
		score: number
		comment_insights: string[]
	}>
	x: Array<{
		text: string
		url: string
		author_handle: string
		date: string | null
		why_relevant: string
		score: number
	}>
	web: Array<{
		title: string
		url: string
		source_domain: string
		snippet: string
		why_relevant: string
		score: number
	}>
}

/** Status reported on exit via JSON to stdout. */
export type RefreshStatus = 'fresh' | 'no_cache' | 'refreshed' | 'failed'

/** A single error collected during a query or processing step. */
export interface QueryError {
	topic: string
	reason: string
	stderr?: string
}

/** JSON status emitted to stdout for hook/caller consumption. */
export interface StatusReport {
	status: RefreshStatus
	detail?: string
	errors?: QueryError[]
}

/** Resolved CLI options after argument parsing. */
export interface CliOptions {
	command: 'refresh' | 'reset'
	configPath: string
	cacheDir: string
	noSynthesize: boolean
	force: boolean
	verbose: boolean
}

/** Defaults for optional config fields. */
export const CONFIG_DEFAULTS = {
	refreshIntervalDays: 30,
	thinCacheIntervalDays: 7,
} as const

/** Maximum cache age before forced refresh (clock skew guard). */
export const MAX_CACHE_AGE_DAYS = 60

/** Per-query timeout in milliseconds. */
export const QUERY_TIMEOUT_MS = 60_000

/** Backoff period in hours when all queries fail. */
export const BACKOFF_HOURS = 4

/** Synthesis timeout in milliseconds. */
export const SYNTHESIS_TIMEOUT_MS = 90_000

/** Top N results per source type in raw markdown format. */
export const TOP_N = 5

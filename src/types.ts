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
	/** Lookback window in days for @side-quest/last-30-days (1-365, default: 7). */
	days?: number
	/** Minimum engagement score for a finding to pass quality filtering (default: 25). */
	minScore?: number
	/** Minimum character length for why_relevant/summary to pass quality filtering (default: 40). */
	minSummaryLength?: number
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
	/** Lookback window used for this query. */
	days?: number
	/** ISO timestamp when this report was generated. */
	generated_at?: string
	/** Source mode used (e.g. "both", "reddit", "x"). */
	mode?: string
	/** OpenAI model used for Reddit synthesis. */
	openai_model_used?: string
	/** xAI model used for X synthesis. */
	xai_model_used?: string
	/** Best practices extracted from research. */
	best_practices?: string[]
	/** Prompt snippets derived from research. */
	prompt_pack?: string[]
	/** Pre-formatted markdown context snippet. */
	context_snippet_md?: string
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
	command: 'refresh' | 'reset' | 'extract' | 'review'
	configPath: string
	cacheDir: string
	noSynthesize: boolean
	force: boolean
	verbose: boolean
	/** Lookback window in days for @side-quest/last-30-days (1-365). Undefined when not provided via CLI. */
	days: number | undefined
	/** Comma-separated finding hashes for the review command. */
	hashes: string[]
	/** Decision for the review command. */
	decision: 'accepted' | 'rejected'
}

/** A single finding extracted from a Last30DaysReport for review. */
export interface Finding {
	/** SHA-256 hash of the finding's URL (stable identity). */
	hash: string
	/** Source type: reddit, x, or web. */
	type: 'reddit' | 'x' | 'web'
	/** Research topic this finding came from. */
	topic: string
	/** Human-readable title or text preview. */
	title: string
	/** Brief summary of what this finding is about. */
	summary: string
	/** Source URL (the identity key for hashing). */
	url: string
	/** Engagement score from the source. */
	score: number
	/** Date of the finding, if available. */
	date: string | null
}

/** A record of a review decision for a finding hash. */
export interface ReviewedEntry {
	/** SHA-256 hash of the finding's URL. */
	hash: string
	/** Whether the finding was accepted or rejected. */
	decision: 'accepted' | 'rejected'
	/** ISO timestamp of when the decision was made. */
	date: string
}

/** Persisted file tracking which findings have been reviewed. */
export interface ReviewedHashes {
	/** Schema version for forward compatibility. */
	version: number
	/** All review decisions. */
	reviewed: ReviewedEntry[]
}

/** Result from extracting unreviewed findings. */
export interface ExtractResult {
	/** Whether there are new findings to review. */
	status: 'has_new' | 'no_new' | 'no_staged'
	/** Unreviewed findings (empty if status is not 'has_new'). */
	findings: Finding[]
}

/** Options for quality filtering during finding extraction. */
export interface QualityFilterOptions {
	/** Minimum engagement score (default: CONFIG_DEFAULTS.minScore). */
	minScore?: number
	/** Minimum character length for summary/why_relevant (default: CONFIG_DEFAULTS.minSummaryLength). */
	minSummaryLength?: number
}

/** Defaults for optional config fields. */
export const CONFIG_DEFAULTS = {
	refreshIntervalDays: 30,
	thinCacheIntervalDays: 7,
	days: 7,
	minScore: 25,
	minSummaryLength: 40,
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

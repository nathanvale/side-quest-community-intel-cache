/**
 * @side-quest/community-intel-cache
 *
 * Shared CLI for community intelligence gathering, LLM synthesis,
 * and caching for Claude Code plugin skills.
 *
 * Library exports for programmatic use. The CLI entry point is in cli.ts.
 */

// Cache staleness
export {
	buildBackoffMetadata,
	calculateNextUpdate,
	getIntervalDays,
	hasExistingCache,
	isCacheFresh,
} from './cache.js'
// Diagnostics
export { createDiagnostics, emitStatus } from './diagnostics.js'
// Extract
export {
	computeFindingHash,
	extractFindings,
	getUnreviewedFindings,
} from './extract.js'
// Format
export { formatMarkdown } from './format.js'

// Gather
export { gatherTopics, hasData } from './gather.js'

// Synthesize
export { synthesize } from './synthesize.js'
// Types
export type {
	CacheConfig,
	CacheMetadata,
	CliOptions,
	ExtractResult,
	Finding,
	Last30DaysReport,
	QualityFilterOptions,
	QueryError,
	RefreshStatus,
	ReviewedEntry,
	ReviewedHashes,
	StatusReport,
} from './types.js'
export {
	BACKOFF_HOURS,
	CONFIG_DEFAULTS,
	MAX_CACHE_AGE_DAYS,
	QUERY_TIMEOUT_MS,
	SYNTHESIS_TIMEOUT_MS,
	TOP_N,
} from './types.js'
// Write
export { writeBackoffMetadata, writeCacheFiles } from './write.js'

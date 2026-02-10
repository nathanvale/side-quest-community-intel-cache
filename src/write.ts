/**
 * Atomic file writes for cache output.
 *
 * Uses @side-quest/core/fs atomic write functions to prevent
 * half-written files if the process crashes mid-write.
 */

import { join } from 'node:path'
import {
	ensureDir,
	writeJsonFileAtomic,
	writeTextFileAtomic,
} from '@side-quest/core/fs'
import type { CacheMetadata, Last30DaysReport } from './types.js'

/**
 * Write all cache files atomically.
 *
 * Ensures the cache directory exists, then writes:
 * 1. staged-intel.md (synthesized or raw markdown)
 * 2. staged-raw.json (raw Last30DaysReport[] for finding extraction)
 * 3. last-updated.json (metadata for staleness checking)
 *
 * Content first, metadata last -- if the process crashes between them,
 * content-without-metadata is treated as stale (safe). Metadata-without-content
 * would appear fresh but have stale/missing content (unsafe).
 */
export async function writeCacheFiles(
	cacheDir: string,
	markdown: string,
	metadata: CacheMetadata,
	rawResults: Array<Last30DaysReport | null>,
): Promise<void> {
	await ensureDir(cacheDir)

	const filtered = rawResults.filter((r): r is Last30DaysReport => r !== null)

	// Content first, metadata last (safe crash ordering)
	await writeTextFileAtomic(join(cacheDir, 'staged-intel.md'), markdown)
	await writeJsonFileAtomic(join(cacheDir, 'staged-raw.json'), filtered)
	await writeJsonFileAtomic(join(cacheDir, 'last-updated.json'), metadata)
}

/**
 * Write only the metadata file (used for backoff on total failure).
 *
 * Preserves the existing staged-intel.md if present.
 */
export async function writeBackoffMetadata(
	cacheDir: string,
	metadata: CacheMetadata,
): Promise<void> {
	await ensureDir(cacheDir)
	await writeJsonFileAtomic(join(cacheDir, 'last-updated.json'), metadata)
}

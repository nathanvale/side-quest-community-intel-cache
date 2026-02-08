/**
 * Atomic file writes for cache output.
 *
 * Uses @side-quest/core/fs atomic write functions to prevent
 * half-written files if the process crashes mid-write.
 */

import { join } from 'node:path'
import { ensureDir, writeTextFileAtomic } from '@side-quest/core/fs'
import type { CacheMetadata } from './types.js'

/**
 * Write both cache files atomically.
 *
 * Ensures the cache directory exists, then writes:
 * 1. community-intel.md (synthesized or raw markdown)
 * 2. last-updated.json (metadata for staleness checking)
 *
 * Each file is written to a temp path first, then renamed atomically.
 */
export async function writeCacheFiles(
	cacheDir: string,
	markdown: string,
	metadata: CacheMetadata,
): Promise<void> {
	await ensureDir(cacheDir)

	const metadataJson = `${JSON.stringify(metadata, null, '\t')}\n`
	await Promise.all([
		writeTextFileAtomic(join(cacheDir, 'community-intel.md'), markdown),
		writeTextFileAtomic(join(cacheDir, 'last-updated.json'), metadataJson),
	])
}

/**
 * Write only the metadata file (used for backoff on total failure).
 *
 * Preserves the existing community-intel.md if present.
 */
export async function writeBackoffMetadata(
	cacheDir: string,
	metadata: CacheMetadata,
): Promise<void> {
	await ensureDir(cacheDir)
	const metadataJson = `${JSON.stringify(metadata, null, '\t')}\n`
	await writeTextFileAtomic(join(cacheDir, 'last-updated.json'), metadataJson)
}

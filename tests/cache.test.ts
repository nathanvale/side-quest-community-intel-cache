import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
	buildBackoffMetadata,
	calculateNextUpdate,
	getIntervalDays,
	hasExistingCache,
	isCacheFresh,
} from '../src/cache'
import type { CacheConfig, CacheMetadata } from '../src/types'

let testDir: string

beforeEach(() => {
	testDir = join(tmpdir(), `cic-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
	mkdirSync(testDir, { recursive: true })
})

afterEach(() => {
	rmSync(testDir, { recursive: true, force: true })
})

function writeMetadata(metadata: CacheMetadata): void {
	writeFileSync(join(testDir, 'last-updated.json'), JSON.stringify(metadata, null, '\t'))
}

function writeIntelFile(content = '# test'): void {
	writeFileSync(join(testDir, 'staged-intel.md'), content)
}

describe('isCacheFresh', () => {
	it('returns false when no metadata exists', () => {
		expect(isCacheFresh(testDir)).toBe(false)
	})

	it('returns false when metadata exists but no intel file', () => {
		writeMetadata({
			last_updated: new Date().toISOString(),
			topics_researched: ['test'],
			next_update_after: new Date(Date.now() + 86400000).toISOString(),
		})
		expect(isCacheFresh(testDir)).toBe(false)
	})

	it('returns true when cache is fresh', () => {
		const meta: CacheMetadata = {
			last_updated: new Date().toISOString(),
			topics_researched: ['test'],
			next_update_after: new Date(Date.now() + 86400000).toISOString(),
		}
		writeMetadata(meta)
		writeIntelFile()
		expect(isCacheFresh(testDir)).toBe(true)
	})

	it('returns false when next_update_after is in the past', () => {
		const meta: CacheMetadata = {
			last_updated: new Date(Date.now() - 86400000 * 31).toISOString(),
			topics_researched: ['test'],
			next_update_after: new Date(Date.now() - 1000).toISOString(),
		}
		writeMetadata(meta)
		writeIntelFile()
		expect(isCacheFresh(testDir)).toBe(false)
	})

	it('returns false when cache is older than MAX_CACHE_AGE_DAYS', () => {
		const meta: CacheMetadata = {
			last_updated: new Date(Date.now() - 86400000 * 61).toISOString(),
			topics_researched: ['test'],
			next_update_after: new Date(Date.now() + 86400000).toISOString(),
		}
		writeMetadata(meta)
		writeIntelFile()
		expect(isCacheFresh(testDir)).toBe(false)
	})

	it('returns false when metadata is corrupt JSON', () => {
		writeFileSync(join(testDir, 'last-updated.json'), 'not json')
		writeIntelFile()
		expect(isCacheFresh(testDir)).toBe(false)
	})
})

describe('calculateNextUpdate', () => {
	const config: CacheConfig = {
		topics: ['a', 'b', 'c', 'd'],
		refreshIntervalDays: 30,
		thinCacheIntervalDays: 7,
	}

	it('uses full interval when >= 50% success', () => {
		const now = new Date('2026-01-01T00:00:00Z')
		const next = calculateNextUpdate(2, 4, config, now)
		const expected = new Date('2026-01-31T00:00:00Z')
		expect(next.getTime()).toBe(expected.getTime())
	})

	it('uses thin interval when < 50% success', () => {
		const now = new Date('2026-01-01T00:00:00Z')
		const next = calculateNextUpdate(1, 4, config, now)
		const expected = new Date('2026-01-08T00:00:00Z')
		expect(next.getTime()).toBe(expected.getTime())
	})

	it('uses defaults when config omits intervals', () => {
		const minimalConfig: CacheConfig = { topics: ['a', 'b'] }
		const now = new Date('2026-01-01T00:00:00Z')
		const next = calculateNextUpdate(2, 2, minimalConfig, now)
		// Default refreshIntervalDays is 30
		const expected = new Date('2026-01-31T00:00:00Z')
		expect(next.getTime()).toBe(expected.getTime())
	})
})

describe('getIntervalDays', () => {
	const config: CacheConfig = {
		topics: ['a', 'b', 'c', 'd'],
		refreshIntervalDays: 30,
		thinCacheIntervalDays: 7,
	}

	it('returns full interval for >= 50% success', () => {
		expect(getIntervalDays(3, 4, config)).toBe(30)
	})

	it('returns thin interval for < 50% success', () => {
		expect(getIntervalDays(1, 4, config)).toBe(7)
	})
})

describe('buildBackoffMetadata', () => {
	it('preserves existing last_updated when metadata exists', () => {
		const existingDate = '2026-01-01T00:00:00.000Z'
		writeMetadata({
			last_updated: existingDate,
			topics_researched: ['old'],
			next_update_after: '2026-01-02T00:00:00.000Z',
		})

		const result = buildBackoffMetadata(testDir, ['new-topic'])
		expect(result.last_updated).toBe(existingDate)
		expect(result.topics_researched).toEqual(['new-topic'])
	})

	it('uses current time when no metadata exists', () => {
		const before = Date.now()
		const result = buildBackoffMetadata(testDir, ['topic'])
		const after = Date.now()

		const ts = new Date(result.last_updated).getTime()
		expect(ts).toBeGreaterThanOrEqual(before)
		expect(ts).toBeLessThanOrEqual(after)
	})

	it('sets next_update_after to 4 hours in the future', () => {
		const before = Date.now()
		const result = buildBackoffMetadata(testDir, ['topic'])
		const nextUpdate = new Date(result.next_update_after).getTime()

		// Should be ~4 hours from now
		const fourHoursMs = 4 * 60 * 60 * 1000
		expect(nextUpdate).toBeGreaterThanOrEqual(before + fourHoursMs - 1000)
		expect(nextUpdate).toBeLessThanOrEqual(before + fourHoursMs + 1000)
	})
})

describe('hasExistingCache', () => {
	it('returns false when no cache file', () => {
		expect(hasExistingCache(testDir)).toBe(false)
	})

	it('returns true when cache file exists', () => {
		writeIntelFile()
		expect(hasExistingCache(testDir)).toBe(true)
	})
})

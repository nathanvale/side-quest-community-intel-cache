import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CacheMetadata, Last30DaysReport } from '../src/types'
import { writeBackoffMetadata, writeCacheFiles } from '../src/write'

let testDir: string

beforeEach(() => {
	testDir = join(tmpdir(), `cic-write-${Date.now()}-${Math.random().toString(36).slice(2)}`)
})

afterEach(() => {
	rmSync(testDir, { recursive: true, force: true })
})

const sampleMetadata: CacheMetadata = {
	last_updated: '2026-01-01T00:00:00.000Z',
	topics_researched: ['topic-a', 'topic-b'],
	next_update_after: '2026-01-31T00:00:00.000Z',
}

const sampleReport: Last30DaysReport = {
	topic: 'test topic',
	reddit: [
		{
			title: 'Post',
			url: 'https://reddit.com/r/test/1',
			subreddit: 'test',
			date: '2026-01-01',
			why_relevant: 'test',
			score: 10,
			comment_insights: [],
		},
	],
	x: [],
	web: [],
}

describe('writeCacheFiles', () => {
	it('creates cache directory if missing', async () => {
		expect(existsSync(testDir)).toBe(false)
		await writeCacheFiles(testDir, '# Test', sampleMetadata, [])
		expect(existsSync(testDir)).toBe(true)
	})

	it('writes staged-intel.md', async () => {
		await writeCacheFiles(testDir, '# Community Intel', sampleMetadata, [])
		const content = readFileSync(join(testDir, 'staged-intel.md'), 'utf-8')
		expect(content).toBe('# Community Intel')
	})

	it('writes last-updated.json as valid JSON', async () => {
		await writeCacheFiles(testDir, '# Test', sampleMetadata, [])
		const content = readFileSync(join(testDir, 'last-updated.json'), 'utf-8')
		const parsed = JSON.parse(content)
		expect(parsed.last_updated).toBe('2026-01-01T00:00:00.000Z')
		expect(parsed.topics_researched).toEqual(['topic-a', 'topic-b'])
		// Verify trailing newline
		expect(content.endsWith('\n')).toBe(true)
	})

	it('writes all three files in same call', async () => {
		await writeCacheFiles(testDir, '# Both', sampleMetadata, [sampleReport])
		expect(existsSync(join(testDir, 'staged-intel.md'))).toBe(true)
		expect(existsSync(join(testDir, 'staged-raw.json'))).toBe(true)
		expect(existsSync(join(testDir, 'last-updated.json'))).toBe(true)
	})

	it('writes staged-raw.json filtering null results', async () => {
		await writeCacheFiles(testDir, '# Test', sampleMetadata, [sampleReport, null])
		const content = readFileSync(join(testDir, 'staged-raw.json'), 'utf-8')
		const parsed = JSON.parse(content)
		expect(parsed).toHaveLength(1)
		expect(parsed[0].topic).toBe('test topic')
	})
})

describe('writeBackoffMetadata', () => {
	it('creates directory and writes metadata', async () => {
		await writeBackoffMetadata(testDir, sampleMetadata)
		expect(existsSync(join(testDir, 'last-updated.json'))).toBe(true)
	})

	it('does not create staged-intel.md', async () => {
		await writeBackoffMetadata(testDir, sampleMetadata)
		expect(existsSync(join(testDir, 'staged-intel.md'))).toBe(false)
	})

	it('preserves existing staged-intel.md', async () => {
		mkdirSync(testDir, { recursive: true })
		const intelPath = join(testDir, 'staged-intel.md')
		writeFileSync(intelPath, '# Existing')
		await writeBackoffMetadata(testDir, sampleMetadata)
		const content = readFileSync(intelPath, 'utf-8')
		expect(content).toBe('# Existing')
	})
})

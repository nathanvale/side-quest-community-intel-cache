import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CacheMetadata } from '../src/types'
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

describe('writeCacheFiles', () => {
	it('creates cache directory if missing', async () => {
		expect(existsSync(testDir)).toBe(false)
		await writeCacheFiles(testDir, '# Test', sampleMetadata)
		expect(existsSync(testDir)).toBe(true)
	})

	it('writes community-intel.md', async () => {
		await writeCacheFiles(testDir, '# Community Intel', sampleMetadata)
		const content = readFileSync(join(testDir, 'community-intel.md'), 'utf-8')
		expect(content).toBe('# Community Intel')
	})

	it('writes last-updated.json with tab indentation', async () => {
		await writeCacheFiles(testDir, '# Test', sampleMetadata)
		const content = readFileSync(join(testDir, 'last-updated.json'), 'utf-8')
		const parsed = JSON.parse(content)
		expect(parsed.last_updated).toBe('2026-01-01T00:00:00.000Z')
		expect(parsed.topics_researched).toEqual(['topic-a', 'topic-b'])
		// Verify tab indentation
		expect(content).toContain('\t')
		// Verify trailing newline
		expect(content.endsWith('\n')).toBe(true)
	})

	it('writes both files in same call', async () => {
		await writeCacheFiles(testDir, '# Both', sampleMetadata)
		expect(existsSync(join(testDir, 'community-intel.md'))).toBe(true)
		expect(existsSync(join(testDir, 'last-updated.json'))).toBe(true)
	})
})

describe('writeBackoffMetadata', () => {
	it('creates directory and writes metadata', async () => {
		await writeBackoffMetadata(testDir, sampleMetadata)
		expect(existsSync(join(testDir, 'last-updated.json'))).toBe(true)
	})

	it('does not create community-intel.md', async () => {
		await writeBackoffMetadata(testDir, sampleMetadata)
		expect(existsSync(join(testDir, 'community-intel.md'))).toBe(false)
	})

	it('preserves existing community-intel.md', async () => {
		mkdirSync(testDir, { recursive: true })
		const intelPath = join(testDir, 'community-intel.md')
		writeFileSync(intelPath, '# Existing')
		await writeBackoffMetadata(testDir, sampleMetadata)
		const content = readFileSync(intelPath, 'utf-8')
		expect(content).toBe('# Existing')
	})
})

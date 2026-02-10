import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { computeFindingHash, extractFindings, getUnreviewedFindings } from '../src/extract'
import type { Last30DaysReport, ReviewedHashes } from '../src/types'

let testDir: string

beforeEach(() => {
	testDir = join(tmpdir(), `cic-extract-${Date.now()}-${Math.random().toString(36).slice(2)}`)
	mkdirSync(testDir, { recursive: true })
})

afterEach(() => {
	rmSync(testDir, { recursive: true, force: true })
})

const sampleReport: Last30DaysReport = {
	topic: 'Dell U4025QW firmware',
	reddit: [
		{
			title: 'M3T106 fixes sleep/wake',
			url: 'https://reddit.com/r/ultrawide/abc123',
			subreddit: 'ultrawide',
			date: '2026-01-28',
			why_relevant: 'Users report firmware fixes disconnect issues',
			score: 42,
			comment_insights: ['Confirmed fix for TB4 wake'],
		},
	],
	x: [
		{
			text: 'BetterDisplay 3.2 now supports PBP mode control for U4025QW',
			url: 'https://x.com/waydabber/status/123',
			author_handle: 'waydabber',
			date: '2026-01-25',
			why_relevant: 'New PBP feature for the monitor',
			score: 28,
		},
	],
	web: [
		{
			title: 'DDC Workaround for Tahoe',
			url: 'https://example.com/ddc-workaround',
			source_domain: 'example.com',
			snippet: 'A new method for DDC control after sleep',
			why_relevant: 'New DDC workaround for macOS Tahoe',
			score: 15,
		},
	],
}

describe('computeFindingHash', () => {
	it('returns deterministic hash for same URL', () => {
		const hash1 = computeFindingHash('https://reddit.com/r/test/1')
		const hash2 = computeFindingHash('https://reddit.com/r/test/1')
		expect(hash1).toBe(hash2)
	})

	it('returns different hashes for different URLs', () => {
		const hash1 = computeFindingHash('https://reddit.com/r/test/1')
		const hash2 = computeFindingHash('https://reddit.com/r/test/2')
		expect(hash1).not.toBe(hash2)
	})

	it('returns a hex string', () => {
		const hash = computeFindingHash('https://example.com')
		expect(hash).toMatch(/^[0-9a-f]+$/)
	})
})

describe('extractFindings', () => {
	it('flattens reports into findings array', () => {
		const findings = extractFindings([sampleReport])
		expect(findings).toHaveLength(3)
	})

	it('maps reddit fields correctly', () => {
		const findings = extractFindings([sampleReport])
		const reddit = findings.find((f) => f.type === 'reddit')
		expect(reddit).toBeDefined()
		expect(reddit!.title).toBe('M3T106 fixes sleep/wake')
		expect(reddit!.summary).toBe('Users report firmware fixes disconnect issues')
		expect(reddit!.url).toBe('https://reddit.com/r/ultrawide/abc123')
		expect(reddit!.score).toBe(42)
		expect(reddit!.date).toBe('2026-01-28')
		expect(reddit!.topic).toBe('Dell U4025QW firmware')
	})

	it('maps x fields correctly with text preview', () => {
		const findings = extractFindings([sampleReport])
		const xPost = findings.find((f) => f.type === 'x')
		expect(xPost).toBeDefined()
		expect(xPost!.title).toBe('BetterDisplay 3.2 now supports PBP mode control for U4025QW')
		expect(xPost!.score).toBe(28)
	})

	it('maps web fields correctly with null date', () => {
		const findings = extractFindings([sampleReport])
		const web = findings.find((f) => f.type === 'web')
		expect(web).toBeDefined()
		expect(web!.title).toBe('DDC Workaround for Tahoe')
		expect(web!.date).toBeNull()
	})

	it('truncates long x text to 120 chars', () => {
		const longReport: Last30DaysReport = {
			topic: 'test',
			reddit: [],
			x: [
				{
					text: 'A'.repeat(200),
					url: 'https://x.com/test/1',
					author_handle: 'test',
					date: null,
					why_relevant: 'test',
					score: 1,
				},
			],
			web: [],
		}
		const findings = extractFindings([longReport])
		expect(findings[0].title).toBe(`${'A'.repeat(120)}...`)
	})

	it('handles empty reports', () => {
		const empty: Last30DaysReport = {
			topic: 'empty',
			reddit: [],
			x: [],
			web: [],
		}
		const findings = extractFindings([empty])
		expect(findings).toHaveLength(0)
	})

	it('handles multiple reports', () => {
		const findings = extractFindings([sampleReport, sampleReport])
		// Same URLs produce same hashes - deduped to 3 unique findings
		expect(findings).toHaveLength(3)
	})
})

describe('getUnreviewedFindings', () => {
	it('returns no_staged when staged-raw.json does not exist', () => {
		const result = getUnreviewedFindings(testDir)
		expect(result.status).toBe('no_staged')
		expect(result.findings).toHaveLength(0)
	})

	it('returns no_new when staged data has no findings', () => {
		writeFileSync(join(testDir, 'staged-raw.json'), JSON.stringify([]))
		const result = getUnreviewedFindings(testDir)
		expect(result.status).toBe('no_new')
		expect(result.findings).toHaveLength(0)
	})

	it('returns has_new with all findings when none reviewed', () => {
		writeFileSync(join(testDir, 'staged-raw.json'), JSON.stringify([sampleReport]))
		const result = getUnreviewedFindings(testDir)
		expect(result.status).toBe('has_new')
		expect(result.findings).toHaveLength(3)
	})

	it('filters out reviewed hashes', () => {
		writeFileSync(join(testDir, 'staged-raw.json'), JSON.stringify([sampleReport]))

		// Mark the reddit finding as reviewed
		const redditHash = computeFindingHash('https://reddit.com/r/ultrawide/abc123')
		const reviewed: ReviewedHashes = {
			version: 1,
			reviewed: [{ hash: redditHash, decision: 'accepted', date: '2026-01-01' }],
		}
		writeFileSync(join(testDir, 'reviewed-hashes.json'), JSON.stringify(reviewed))

		const result = getUnreviewedFindings(testDir)
		expect(result.status).toBe('has_new')
		expect(result.findings).toHaveLength(2)
		expect(result.findings.every((f) => f.hash !== redditHash)).toBe(true)
	})

	it('returns no_new when all findings are reviewed', () => {
		writeFileSync(join(testDir, 'staged-raw.json'), JSON.stringify([sampleReport]))

		// Mark all findings as reviewed
		const allFindings = extractFindings([sampleReport])
		const reviewed: ReviewedHashes = {
			version: 1,
			reviewed: allFindings.map((f) => ({
				hash: f.hash,
				decision: 'rejected' as const,
				date: '2026-01-01',
			})),
		}
		writeFileSync(join(testDir, 'reviewed-hashes.json'), JSON.stringify(reviewed))

		const result = getUnreviewedFindings(testDir)
		expect(result.status).toBe('no_new')
		expect(result.findings).toHaveLength(0)
	})

	it('handles empty reports with data', () => {
		const emptyReport: Last30DaysReport = {
			topic: 'empty',
			reddit: [],
			x: [],
			web: [],
		}
		writeFileSync(join(testDir, 'staged-raw.json'), JSON.stringify([emptyReport]))
		const result = getUnreviewedFindings(testDir)
		expect(result.status).toBe('no_new')
	})
})

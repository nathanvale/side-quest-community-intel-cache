import { describe, expect, it } from 'bun:test'
import { formatMarkdown } from '../src/format'
import type { Last30DaysReport } from '../src/types'

function makeReport(overrides: Partial<Last30DaysReport> = {}): Last30DaysReport {
	return {
		topic: 'Test Topic',
		reddit: [],
		x: [],
		web: [],
		...overrides,
	}
}

describe('formatMarkdown', () => {
	it('generates header with timestamp', () => {
		const result = formatMarkdown([], '2026-01-01T00:00:00.000Z')
		expect(result).toContain('# Community Intelligence')
		expect(result).toContain('2026-01-01T00:00:00.000Z')
	})

	it('skips null results', () => {
		const result = formatMarkdown([null, makeReport()], '2026-01-01T00:00:00.000Z')
		expect(result).toContain('## Test Topic')
		expect(result).not.toContain('## null')
	})

	it('shows no-activity message for empty reports', () => {
		const result = formatMarkdown([makeReport()], '2026-01-01T00:00:00.000Z')
		expect(result).toContain('No significant community activity found')
	})

	it('formats reddit results sorted by score', () => {
		const report = makeReport({
			reddit: [
				{
					title: 'Low Score',
					url: 'https://reddit.com/1',
					subreddit: 'test',
					date: null,
					why_relevant: 'low relevance',
					score: 5,
					comment_insights: [],
				},
				{
					title: 'High Score',
					url: 'https://reddit.com/2',
					subreddit: 'test',
					date: null,
					why_relevant: 'high relevance',
					score: 100,
					comment_insights: ['insight 1'],
				},
			],
		})

		const result = formatMarkdown([report], '2026-01-01T00:00:00.000Z')
		const highIdx = result.indexOf('High Score')
		const lowIdx = result.indexOf('Low Score')
		expect(highIdx).toBeLessThan(lowIdx)
		expect(result).toContain('### Reddit')
		expect(result).toContain('  - insight 1')
	})

	it('formats X posts with preview truncation', () => {
		const longText = 'A'.repeat(200)
		const report = makeReport({
			x: [
				{
					text: longText,
					url: 'https://x.com/1',
					author_handle: 'user1',
					date: null,
					why_relevant: 'relevant',
					score: 10,
				},
			],
		})

		const result = formatMarkdown([report], '2026-01-01T00:00:00.000Z')
		expect(result).toContain('### X (Twitter)')
		expect(result).toContain('...')
		expect(result).not.toContain(longText)
	})

	it('formats web results with domain', () => {
		const report = makeReport({
			web: [
				{
					title: 'Web Article',
					url: 'https://example.com/article',
					source_domain: 'example.com',
					snippet: 'A useful snippet',
					why_relevant: 'very relevant',
					score: 50,
				},
			],
		})

		const result = formatMarkdown([report], '2026-01-01T00:00:00.000Z')
		expect(result).toContain('### Web')
		expect(result).toContain('(example.com)')
	})

	it('includes sources list when URLs present', () => {
		const report = makeReport({
			reddit: [
				{
					title: 'Post',
					url: 'https://reddit.com/1',
					subreddit: 'test',
					date: null,
					why_relevant: 'reason',
					score: 10,
					comment_insights: [],
				},
			],
		})

		const result = formatMarkdown([report], '2026-01-01T00:00:00.000Z')
		expect(result).toContain('### Sources')
		expect(result).toContain('- https://reddit.com/1')
	})

	it('limits to TOP_N results per source', () => {
		const report = makeReport({
			reddit: Array.from({ length: 10 }, (_, i) => ({
				title: `Post ${i}`,
				url: `https://reddit.com/${i}`,
				subreddit: 'test',
				date: null,
				why_relevant: 'reason',
				score: 10 - i,
				comment_insights: [],
			})),
		})

		const result = formatMarkdown([report], '2026-01-01T00:00:00.000Z')
		// Should only have 5 (TOP_N) reddit entries
		const redditLinks = result.match(/\[Post \d\]/g)
		expect(redditLinks?.length).toBe(5)
	})
})

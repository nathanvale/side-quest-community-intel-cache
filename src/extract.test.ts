import { describe, expect, test } from 'bun:test'
import { extractFindings } from './extract.js'
import type { Last30DaysReport } from './types.js'
import { CONFIG_DEFAULTS } from './types.js'

/** Helper to build a minimal Last30DaysReport with one reddit item. */
function makeReport(
	overrides: { score?: number; why_relevant?: string; url?: string; topic?: string } = {},
): Last30DaysReport {
	return {
		topic: overrides.topic ?? 'test-topic',
		reddit: [
			{
				title: 'Test Post',
				url: overrides.url ?? 'https://reddit.com/r/test/1',
				subreddit: 'test',
				date: '2025-01-01',
				why_relevant:
					overrides.why_relevant ??
					'This is a relevant finding with enough detail to pass the quality filter easily',
				score: overrides.score ?? 100,
				comment_insights: [],
			},
		],
		x: [],
		web: [],
	}
}

/** Helper to build a report with one X finding. */
function makeXReport(
	overrides: { score?: number; why_relevant?: string; url?: string } = {},
): Last30DaysReport {
	return {
		topic: 'test-topic',
		reddit: [],
		x: [
			{
				text: 'A tweet about something interesting happening in the community',
				url: overrides.url ?? 'https://x.com/user/status/123',
				author_handle: '@testuser',
				date: '2025-01-01',
				why_relevant:
					overrides.why_relevant ??
					'This tweet is relevant because it discusses a key community topic in detail',
				score: overrides.score ?? 100,
			},
		],
		web: [],
	}
}

/** Helper to build a report with one web finding. */
function makeWebReport(
	overrides: { score?: number; why_relevant?: string; url?: string } = {},
): Last30DaysReport {
	return {
		topic: 'test-topic',
		reddit: [],
		x: [],
		web: [
			{
				title: 'Web Article',
				url: overrides.url ?? 'https://example.com/article',
				source_domain: 'example.com',
				snippet: 'An article snippet',
				why_relevant:
					overrides.why_relevant ??
					'This article is relevant because it covers a detailed analysis of the topic',
				score: overrides.score ?? 100,
			},
		],
	}
}

describe('extractFindings', () => {
	describe('default quality thresholds', () => {
		test('filters out findings with score below default minScore', () => {
			const lowScore = makeReport({ score: CONFIG_DEFAULTS.minScore - 1 })
			const result = extractFindings([lowScore])
			expect(result).toHaveLength(0)
		})

		test('filters out findings with short summary below default minSummaryLength', () => {
			const shortSummary = makeReport({ why_relevant: 'Too short' })
			expect('Too short'.length).toBeLessThan(CONFIG_DEFAULTS.minSummaryLength)
			const result = extractFindings([shortSummary])
			expect(result).toHaveLength(0)
		})

		test('passes findings that meet both default thresholds', () => {
			const good = makeReport({
				score: CONFIG_DEFAULTS.minScore,
				why_relevant: 'A'.repeat(CONFIG_DEFAULTS.minSummaryLength),
			})
			const result = extractFindings([good])
			expect(result).toHaveLength(1)
		})

		test('filters findings that fail score but pass summary length', () => {
			const report = makeReport({
				score: CONFIG_DEFAULTS.minScore - 1,
				why_relevant: 'A'.repeat(CONFIG_DEFAULTS.minSummaryLength + 10),
			})
			const result = extractFindings([report])
			expect(result).toHaveLength(0)
		})

		test('filters findings that pass score but fail summary length', () => {
			const report = makeReport({
				score: CONFIG_DEFAULTS.minScore + 10,
				why_relevant: 'short',
			})
			const result = extractFindings([report])
			expect(result).toHaveLength(0)
		})
	})

	describe('custom quality thresholds', () => {
		test('respects custom minScore override', () => {
			const report = makeReport({ score: 10 })
			// Default threshold (25) would reject, custom (5) should accept
			const resultDefault = extractFindings([report])
			expect(resultDefault).toHaveLength(0)

			const resultCustom = extractFindings([report], { minScore: 5 })
			expect(resultCustom).toHaveLength(1)
		})

		test('respects custom minSummaryLength override', () => {
			const summary = 'Short but ok'
			const report = makeReport({ why_relevant: summary, score: 100 })

			const resultDefault = extractFindings([report])
			expect(resultDefault).toHaveLength(0)

			const resultCustom = extractFindings([report], {
				minSummaryLength: summary.length,
			})
			expect(resultCustom).toHaveLength(1)
		})

		test('allows disabling filters with threshold 0', () => {
			const report = makeReport({ score: 0, why_relevant: '' })
			const result = extractFindings([report], {
				minScore: 0,
				minSummaryLength: 0,
			})
			expect(result).toHaveLength(1)
		})
	})

	describe('applies filtering to all source types', () => {
		test('filters low-score X findings', () => {
			const report = makeXReport({ score: CONFIG_DEFAULTS.minScore - 1 })
			const result = extractFindings([report])
			expect(result).toHaveLength(0)
		})

		test('passes high-quality X findings', () => {
			const report = makeXReport({ score: CONFIG_DEFAULTS.minScore })
			const result = extractFindings([report])
			expect(result).toHaveLength(1)
			expect(result[0].type).toBe('x')
		})

		test('filters low-score web findings', () => {
			const report = makeWebReport({ score: CONFIG_DEFAULTS.minScore - 1 })
			const result = extractFindings([report])
			expect(result).toHaveLength(0)
		})

		test('passes high-quality web findings', () => {
			const report = makeWebReport({ score: CONFIG_DEFAULTS.minScore })
			const result = extractFindings([report])
			expect(result).toHaveLength(1)
			expect(result[0].type).toBe('web')
		})
	})

	describe('dedup still works after filtering', () => {
		test('deduplicates findings with the same URL across reports', () => {
			const url = 'https://reddit.com/r/test/duplicate'
			const report1 = makeReport({ url, score: 50 })
			const report2 = makeReport({ url, score: 75, topic: 'other-topic' })

			const result = extractFindings([report1, report2])
			expect(result).toHaveLength(1)
			// First occurrence wins
			expect(result[0].topic).toBe('test-topic')
		})

		test('dedup only sees quality-filtered findings', () => {
			const url = 'https://reddit.com/r/test/same'
			// First report has low score (filtered out)
			const lowQuality = makeReport({ url, score: 1 })
			// Second report has high score (passes)
			const highQuality = makeReport({ url, score: 100, topic: 'topic-2' })

			const result = extractFindings([lowQuality, highQuality])
			expect(result).toHaveLength(1)
			// The high-quality one should win since the low-quality one was filtered
			expect(result[0].topic).toBe('topic-2')
			expect(result[0].score).toBe(100)
		})
	})

	describe('edge cases', () => {
		test('returns empty array for empty reports', () => {
			const result = extractFindings([])
			expect(result).toHaveLength(0)
		})

		test('returns empty array when all findings are filtered', () => {
			const report = makeReport({ score: 1, why_relevant: 'x' })
			const result = extractFindings([report])
			expect(result).toHaveLength(0)
		})

		test('handles mixed quality findings in a single report', () => {
			const report: Last30DaysReport = {
				topic: 'mixed',
				reddit: [
					{
						title: 'Good Post',
						url: 'https://reddit.com/r/test/good',
						subreddit: 'test',
						date: '2025-01-01',
						why_relevant: 'This finding has a detailed and thorough explanation of why it matters',
						score: 50,
						comment_insights: [],
					},
					{
						title: 'Bad Post',
						url: 'https://reddit.com/r/test/bad',
						subreddit: 'test',
						date: '2025-01-01',
						why_relevant: 'meh',
						score: 5,
						comment_insights: [],
					},
				],
				x: [],
				web: [],
			}
			const result = extractFindings([report])
			expect(result).toHaveLength(1)
			expect(result[0].title).toBe('Good Post')
		})
	})
})

/**
 * Finding extraction and dedup for the review/upgrade workflow.
 *
 * Extracts individual findings from raw Last30DaysReport arrays,
 * computes stable content hashes (by URL), and filters out
 * previously reviewed findings.
 */

import { join } from 'node:path'
import { pathExistsSync, readJsonFileOrDefault } from '@side-quest/core/fs'
import { sha256 } from '@side-quest/core/hash'
import type {
	ExtractResult,
	Finding,
	Last30DaysReport,
	QualityFilterOptions,
	ReviewedHashes,
} from './types.js'
import { CONFIG_DEFAULTS } from './types.js'

/**
 * Compute a stable hash for a finding based on its URL.
 *
 * The same post across multiple refreshes produces the same hash,
 * so previously reviewed findings are correctly filtered out.
 */
export function computeFindingHash(url: string): string {
	return sha256(url)
}

/**
 * Extract individual findings from raw Last30DaysReport arrays.
 *
 * Flattens the nested reddit/x/web arrays from each report into
 * a flat list of Finding objects with stable URL-based hashes.
 * Applies quality filtering (minScore, minSummaryLength) before
 * dedup so low-signal entries never reach consumers.
 */
export function extractFindings(
	reports: Last30DaysReport[],
	options?: QualityFilterOptions,
): Finding[] {
	const minScore = options?.minScore ?? CONFIG_DEFAULTS.minScore
	const minSummaryLength =
		options?.minSummaryLength ?? CONFIG_DEFAULTS.minSummaryLength

	const findings: Finding[] = []

	for (const report of reports) {
		// Reddit findings
		for (const item of report.reddit) {
			if (item.score < minScore) continue
			if (item.why_relevant.length < minSummaryLength) continue
			findings.push({
				hash: computeFindingHash(item.url),
				type: 'reddit',
				topic: report.topic,
				title: item.title,
				summary: item.why_relevant,
				url: item.url,
				score: item.score,
				date: item.date,
			})
		}

		// X findings
		for (const item of report.x) {
			if (item.score < minScore) continue
			if (item.why_relevant.length < minSummaryLength) continue
			const preview =
				item.text.length > 120 ? `${item.text.slice(0, 120)}...` : item.text
			findings.push({
				hash: computeFindingHash(item.url),
				type: 'x',
				topic: report.topic,
				title: preview,
				summary: item.why_relevant,
				url: item.url,
				score: item.score,
				date: item.date,
			})
		}

		// Web findings
		for (const item of report.web) {
			if (item.score < minScore) continue
			if (item.why_relevant.length < minSummaryLength) continue
			findings.push({
				hash: computeFindingHash(item.url),
				type: 'web',
				topic: report.topic,
				title: item.title,
				summary: item.why_relevant,
				url: item.url,
				score: item.score,
				date: null,
			})
		}
	}

	// Deduplicate by hash (first occurrence wins)
	const seen = new Set<string>()
	return findings.filter((f) => {
		if (seen.has(f.hash)) return false
		seen.add(f.hash)
		return true
	})
}

/**
 * Load staged raw results and return only unreviewed findings.
 *
 * Reads staged-raw.json for the raw reports and reviewed-hashes.json
 * for previously reviewed finding hashes. Returns findings that
 * haven't been reviewed yet. Quality filtering is applied via options.
 */
export function getUnreviewedFindings(
	cacheDir: string,
	options?: QualityFilterOptions,
): ExtractResult {
	const rawPath = join(cacheDir, 'staged-raw.json')

	if (!pathExistsSync(rawPath)) {
		return { status: 'no_staged', findings: [] }
	}

	const reports = readJsonFileOrDefault<Last30DaysReport[]>(rawPath, [])
	const allFindings = extractFindings(reports, options)

	if (allFindings.length === 0) {
		return { status: 'no_new', findings: [] }
	}

	// Load reviewed hashes
	const reviewedPath = join(cacheDir, 'reviewed-hashes.json')
	const reviewed = readJsonFileOrDefault<ReviewedHashes>(reviewedPath, {
		version: 1,
		reviewed: [],
	})
	const reviewedSet = new Set(reviewed.reviewed.map((r) => r.hash))

	// Filter to unreviewed only
	const unreviewed = allFindings.filter((f) => !reviewedSet.has(f.hash))

	if (unreviewed.length === 0) {
		return { status: 'no_new', findings: [] }
	}

	return { status: 'has_new', findings: unreviewed }
}

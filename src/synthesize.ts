/**
 * LLM synthesis via `claude --print` (headless mode).
 *
 * Transforms raw research results into clean, structured markdown
 * by piping data through Claude's CLI. Uses existing Claude Code
 * subscription -- zero extra API cost.
 *
 * Falls back to raw markdown formatting on any failure.
 */

import { buildEnhancedPath } from '@side-quest/core/spawn'
import type { Last30DaysReport } from './types.js'
import { SYNTHESIS_TIMEOUT_MS } from './types.js'

/**
 * Build the synthesis prompt that instructs Claude to process raw results.
 *
 * The prompt includes the skill context (from community-intel.json)
 * so Claude can filter noise and focus on what matters for the skill.
 */
function buildPrompt(context: string): string {
	return `You are a research synthesizer for a Claude Code plugin skill.

Context: ${context}

Below are raw community research results (Reddit, X, web) from the last 30 days.
Synthesize into structured, actionable markdown:

## New Findings
Discoveries, announcements, or changes from the last 30 days.

## Confirmed Workarounds
Solutions that multiple sources confirm work.

## Known Issues
Problems people are actively reporting.

## Emerging Patterns
Trends, shifts in community practice, or early signals.

Rules:
- Deduplicate: same issue across Reddit/X/web = one entry
- Extract the actionable insight, not raw text
- Include source URLs as inline links
- Filter noise: ignore tangential, off-topic, or low-signal results
- If no meaningful findings for a section, omit it entirely
- Keep it concise -- this will be loaded into an LLM context window`
}

/**
 * Synthesize raw research results into structured markdown using Claude.
 *
 * Spawns `claude --print` with raw JSON piped via stdin.
 * Returns synthesized markdown on success, or null on failure
 * (caller should fall back to raw formatMarkdown).
 *
 * @param results - Raw results from @side-quest/last-30-days queries
 * @param context - Skill context from community-intel.json config
 * @param verbose - Whether to emit diagnostic messages to stderr
 */
export async function synthesize(
	results: Array<Last30DaysReport | null>,
	context: string,
	verbose = false,
): Promise<string | null> {
	const prompt = buildPrompt(context)
	const input = JSON.stringify(
		results.filter((r) => r !== null),
		null,
		2,
	)

	if (verbose) {
		console.error(
			`[synthesize] sending ${input.length} bytes to claude --print`,
		)
	}

	try {
		const proc = Bun.spawn(['claude', '--print', prompt], {
			stdin: 'pipe',
			stdout: 'pipe',
			stderr: 'pipe',
			env: {
				...process.env,
				PATH: buildEnhancedPath(),
				NO_COLOR: '1',
			},
		})

		// Pipe raw results via stdin (avoids arg length limits)
		await proc.stdin.write(input)
		await proc.stdin.end()

		// Race between completion and timeout
		const exitCode = await Promise.race([
			proc.exited,
			new Promise<null>((resolve) =>
				setTimeout(() => {
					proc.kill()
					resolve(null)
				}, SYNTHESIS_TIMEOUT_MS),
			),
		])

		if (exitCode === null) {
			if (verbose) {
				console.error(`[synthesize] timed out after ${SYNTHESIS_TIMEOUT_MS}ms`)
			}
			return null
		}

		const stdout = await new Response(proc.stdout).text()

		if (exitCode !== 0) {
			const stderr = await new Response(proc.stderr).text()
			if (verbose) {
				console.error(
					`[synthesize] exit code ${exitCode}: ${stderr.slice(0, 300)}`,
				)
			}
			return null
		}

		const trimmed = stdout.trim()
		if (!trimmed) {
			if (verbose) {
				console.error('[synthesize] empty output from claude --print')
			}
			return null
		}

		return trimmed
	} catch (err) {
		if (verbose) {
			console.error(`[synthesize] error: ${String(err)}`)
		}
		return null
	}
}

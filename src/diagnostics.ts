/**
 * Error collection and status emission.
 *
 * All output goes to stdout as JSON for hook consumption.
 * Hooks only capture stdout -- stderr is silently dropped.
 */

import type { QueryError, RefreshStatus, StatusReport } from './types.js'

/**
 * Create a mutable diagnostics collector.
 *
 * Errors are pushed throughout the run, then included in the final status.
 */
export function createDiagnostics(): QueryError[] {
	return []
}

/**
 * Emit a JSON status line to stdout for observability.
 *
 * This is the only output the CLI produces on stdout.
 * All diagnostics are included so failures are visible
 * regardless of how the script is invoked.
 */
export function emitStatus(
	status: RefreshStatus,
	diagnostics: QueryError[],
	detail?: string,
): void {
	const report: StatusReport = { status }
	if (detail) report.detail = detail
	if (diagnostics.length > 0) report.errors = diagnostics
	console.log(JSON.stringify(report))
}

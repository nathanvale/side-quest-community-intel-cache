import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { createDiagnostics, emitStatus } from '../src/diagnostics'

describe('createDiagnostics', () => {
	it('returns an empty array', () => {
		const diags = createDiagnostics()
		expect(diags).toEqual([])
	})

	it('is mutable for collecting errors', () => {
		const diags = createDiagnostics()
		diags.push({ topic: 'test', reason: 'failed' })
		expect(diags).toHaveLength(1)
	})
})

describe('emitStatus', () => {
	let originalLog: typeof console.log
	let captured: string[]

	beforeEach(() => {
		originalLog = console.log
		captured = []
		console.log = (...args: unknown[]) => {
			captured.push(args.join(' '))
		}
	})

	afterEach(() => {
		console.log = originalLog
	})

	it('emits JSON with status', () => {
		emitStatus('fresh', [])
		expect(captured).toHaveLength(1)
		const parsed = JSON.parse(captured[0])
		expect(parsed.status).toBe('fresh')
	})

	it('includes detail when provided', () => {
		emitStatus('refreshed', [], '5/6 topics')
		const parsed = JSON.parse(captured[0])
		expect(parsed.detail).toBe('5/6 topics')
	})

	it('omits detail when not provided', () => {
		emitStatus('fresh', [])
		const parsed = JSON.parse(captured[0])
		expect(parsed.detail).toBeUndefined()
	})

	it('includes errors when diagnostics has entries', () => {
		const diags = [{ topic: 'test', reason: 'timeout' }]
		emitStatus('failed', diags)
		const parsed = JSON.parse(captured[0])
		expect(parsed.errors).toEqual(diags)
	})

	it('omits errors when diagnostics is empty', () => {
		emitStatus('fresh', [])
		const parsed = JSON.parse(captured[0])
		expect(parsed.errors).toBeUndefined()
	})
})

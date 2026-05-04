import { describe, it, expect } from 'vitest';
import { formatLazyProgress, formatDuration } from '../../src/csv/lazyProgressFormat';

describe('formatLazyProgress', () => {
	it('zero progress → 0% with no ETA', () => {
		expect(formatLazyProgress(0, 100 * 1024 * 1024, 0)).toBe('0% — 0.0 / 100.0 MB');
	});

	it('mid-copy with throughput → includes ETA', () => {
		// 50 MB written in 1s of a 100 MB file → 50 MB/s, remaining 1s
		const out = formatLazyProgress(50 * 1024 * 1024, 100 * 1024 * 1024, 1000);
		expect(out).toBe('50% — 50.0 / 100.0 MB · ETA 1s');
	});

	it('large file mid-copy → ETA in seconds', () => {
		// 100 MB written in 1s of 1 GB → 100 MB/s, remaining 924/100 = 9.24s
		// (round() keeps it at 9s, but pct=10% from Math.round(100/1024*100))
		const out = formatLazyProgress(100 * 1024 * 1024, 1024 * 1024 * 1024, 1000);
		expect(out).toBe('10% — 100.0 / 1024.0 MB · ETA 9s');
	});

	it('ETA suppressed before 250ms (noisy estimate)', () => {
		const out = formatLazyProgress(10 * 1024 * 1024, 100 * 1024 * 1024, 100);
		expect(out).toBe('10% — 10.0 / 100.0 MB');
	});

	it('ETA suppressed at 100% (nothing left)', () => {
		const out = formatLazyProgress(100 * 1024 * 1024, 100 * 1024 * 1024, 1000);
		expect(out).toBe('100% — 100.0 / 100.0 MB');
	});

	it('zero total guarded → 0%', () => {
		expect(formatLazyProgress(0, 0, 0)).toBe('0% — 0.0 / 0.0 MB');
	});
});

describe('formatDuration', () => {
	it('sub-second rounds up to 1s', () => {
		expect(formatDuration(500)).toBe('1s');
	});

	it('seconds < 60', () => {
		expect(formatDuration(8000)).toBe('8s');
		expect(formatDuration(59000)).toBe('59s');
	});

	it('minutes < 10 with leftover seconds', () => {
		expect(formatDuration(83000)).toBe('1m 23s');
	});

	it('exactly 1 minute → 1m (no zero seconds)', () => {
		expect(formatDuration(60000)).toBe('1m');
	});

	it('minutes >= 10 → minutes only (drops seconds)', () => {
		expect(formatDuration(12 * 60 * 1000 + 30 * 1000)).toBe('12m');
	});

	it('zero / negative / non-finite → 0s', () => {
		expect(formatDuration(0)).toBe('0s');
		expect(formatDuration(-100)).toBe('0s');
		expect(formatDuration(Infinity)).toBe('0s');
		expect(formatDuration(NaN)).toBe('0s');
	});
});

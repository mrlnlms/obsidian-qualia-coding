/**
 * Cold-start progress formatter for the lazy-mode OPFS copy banner.
 *
 * Returns a single-line status: `"45% — 134.5 / 297.0 MB · ETA 8s"`. ETA is
 * computed from the throughput observed so far (`written / elapsedMs`); during
 * the first 250ms or while no bytes have been written the ETA segment is
 * suppressed (the estimate is too noisy to be useful that early).
 *
 * Pure helper — no DOM, no Date.now() inside (caller passes elapsedMs). Tests
 * exercise edge cases (zero total, zero elapsed, gigabyte-class files).
 */
export function formatLazyProgress(
	bytesWritten: number,
	bytesTotal: number,
	elapsedMs: number,
): string {
	const wMb = (bytesWritten / (1024 * 1024)).toFixed(1);
	const tMb = (bytesTotal / (1024 * 1024)).toFixed(1);
	const pct = bytesTotal > 0 ? Math.round((bytesWritten / bytesTotal) * 100) : 0;

	const showEta =
		elapsedMs >= 250 &&
		bytesWritten > 0 &&
		bytesTotal > bytesWritten;
	if (!showEta) {
		return `${pct}% — ${wMb} / ${tMb} MB`;
	}
	const bytesPerMs = bytesWritten / elapsedMs;
	const remainingMs = (bytesTotal - bytesWritten) / bytesPerMs;
	return `${pct}% — ${wMb} / ${tMb} MB · ETA ${formatDuration(remainingMs)}`;
}

/** Compact duration for ETA: "8s" / "1m 23s" / "12m". Sub-second rounds up to 1s. */
export function formatDuration(ms: number): string {
	if (!Number.isFinite(ms) || ms <= 0) return '0s';
	const totalSec = Math.max(1, Math.round(ms / 1000));
	if (totalSec < 60) return `${totalSec}s`;
	const min = Math.floor(totalSec / 60);
	const sec = totalSec % 60;
	if (min < 10 && sec > 0) return `${min}m ${sec}s`;
	return `${min}m`;
}

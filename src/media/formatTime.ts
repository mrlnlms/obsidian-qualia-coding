/**
 * Format seconds as M:SS.s (e.g., "1:23.4", "0:05.0", "12:00.0")
 */
export function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00.0";
  // Round to 1 decimal FIRST to avoid 59.95 → "0:60.0"
  const rounded = Math.round(seconds * 10) / 10;
  const m = Math.floor(rounded / 60);
  const s = rounded % 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

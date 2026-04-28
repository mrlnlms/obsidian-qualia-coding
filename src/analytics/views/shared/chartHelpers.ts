
import type { CooccurrenceResult } from "../../data/dataTypes";
import type { DisplayMode } from "../analyticsViewContext";

export function heatmapColor(value: number, maxValue: number, isDark: boolean): string {
  if (value === 0 || maxValue === 0) return isDark ? "#2a2a2a" : "#f5f5f5";
  const intensity = value / maxValue;
  if (isDark) {
    const r = Math.round(42 + intensity * (229 - 42));
    const g = Math.round(42 + intensity * (57 - 42));
    const b = Math.round(42 + intensity * (53 - 42));
    return `rgb(${r},${g},${b})`;
  } else {
    const r = Math.round(245 + intensity * (229 - 245));
    const g = Math.round(245 + intensity * (57 - 245));
    const b = Math.round(245 + intensity * (53 - 245));
    return `rgb(${r},${g},${b})`;
  }
}

export function isLightColor(color: string): boolean {
  const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (!match) return true;
  const [, r, g, b] = match.map(Number);
  const luminance = (0.299 * r! + 0.587 * g! + 0.114 * b!) / 255;
  return luminance > 0.5;
}

export function generateFileColors(count: number): string[] {
  const colors: string[] = [];
  for (let i = 0; i < count; i++) {
    const hue = (i * 137.5) % 360; // golden angle for good distribution
    colors.push(`hsl(${hue}, 60%, 55%)`);
  }
  return colors;
}

export function computeDisplayMatrix(result: CooccurrenceResult, displayMode: DisplayMode): number[][] {
  const n = result.codes.length;
  const m: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const raw = result.matrix[i]![j]!;
      if (displayMode === "absolute") {
        m[i]![j] = raw;
      } else if (displayMode === "presence") {
        m[i]![j] = raw > 0 ? 1 : 0;
      } else if (displayMode === "jaccard") {
        if (i === j) {
          m[i]![j] = raw > 0 ? 1 : 0;
        } else {
          const union = result.matrix[i]![i]! + result.matrix[j]![j]! - raw;
          m[i]![j] = union > 0 ? Math.round((raw / union) * 100) / 100 : 0;
        }
      } else if (displayMode === "dice") {
        if (i === j) {
          m[i]![j] = raw > 0 ? 1 : 0;
        } else {
          const sum = result.matrix[i]![i]! + result.matrix[j]![j]!;
          m[i]![j] = sum > 0 ? Math.round((2 * raw / sum) * 100) / 100 : 0;
        }
      } else {
        // percentage
        if (i === j) {
          m[i]![j] = raw;
        } else {
          const minFreq = Math.min(result.matrix[i]![i]!, result.matrix[j]![j]!);
          m[i]![j] = minFreq > 0 ? Math.round((raw / minFreq) * 100) : 0;
        }
      }
    }
  }
  return m;
}

export function divergentColor(z: number, maxZ: number, isDark: boolean): string {
  const intensity = Math.min(Math.abs(z) / Math.max(maxZ, 3), 1);
  if (z > 0) {
    // Red (activation)
    if (isDark) {
      const r = Math.round(42 + intensity * (229 - 42));
      const g = Math.round(42 + intensity * (57 - 42));
      const b = Math.round(42 + intensity * (53 - 42));
      return `rgb(${r},${g},${b})`;
    } else {
      const r = Math.round(255 - intensity * (255 - 229));
      const g = Math.round(255 - intensity * (255 - 57));
      const b = Math.round(255 - intensity * (255 - 53));
      return `rgb(${r},${g},${b})`;
    }
  } else {
    // Blue (inhibition)
    if (isDark) {
      const r = Math.round(42 + intensity * (33 - 42));
      const g = Math.round(42 + intensity * (150 - 42));
      const b = Math.round(42 + intensity * (243 - 42));
      return `rgb(${r},${g},${b})`;
    } else {
      const r = Math.round(255 - intensity * (255 - 33));
      const g = Math.round(255 - intensity * (255 - 150));
      const b = Math.round(255 - intensity * (255 - 243));
      return `rgb(${r},${g},${b})`;
    }
  }
}

export function isDivergentLight(z: number, maxZ: number, isDark: boolean): boolean {
  const intensity = Math.min(Math.abs(z) / Math.max(maxZ, 3), 1);
  if (isDark) return intensity < 0.3;
  return intensity < 0.5;
}

/** RFC 4180 CSV escaping: quote fields containing comma, quote, or newline */
function escapeCsvField(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n') || field.includes('\r')) {
    return '"' + field.replace(/"/g, '""') + '"';
  }
  return field;
}

/** Build RFC 4180 compliant CSV string from rows of string values */
export function buildCsv(rows: string[][]): string {
  return rows.map(r => r.map(escapeCsvField).join(',')).join('\n');
}

/** Build CSV from rows + trigger browser download. Helper pra eliminar boilerplate em exportXxxCSV. */
export function downloadCsv(rows: string[][], filename: string): void {
  const csvContent = buildCsv(rows);
  const blob = new Blob([csvContent], { type: "text/csv" });
  const link = document.createElement("a");
  link.download = filename;
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
}

export const SOURCE_COLORS: Record<string, string> = {
  markdown: "#42A5F5",
  "csv-segment": "#66BB6A",
  "csv-row": "#81C784",
  image: "#FFA726",
  pdf: "#EF5350",
  audio: "#AB47BC",
  video: "#7E57C2",
};

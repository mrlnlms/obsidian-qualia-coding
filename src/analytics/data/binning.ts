import type { VariableValue } from "../../core/caseVariables/caseVariablesTypes";

const MS_DAY = 86_400_000;
const MS_MONTH = 30 * MS_DAY;
const MS_YEAR = 365 * MS_DAY;

/** Quartile-based binning for numeric values. ≤4 uniques → categorical literal. */
export function binNumeric(values: number[]): {
  bins: string[];
  assign: (v: number) => string;
} {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) {
    return { bins: [], assign: () => "" };
  }

  const unique = Array.from(new Set(finite)).sort((a, b) => a - b);

  if (unique.length === 1) {
    const label = formatNumber(unique[0]!);
    return { bins: [label], assign: () => label };
  }

  if (unique.length <= 4) {
    const bins = unique.map(formatNumber);
    return {
      bins,
      assign: (v: number) => formatNumber(v),
    };
  }

  // Quartile binning
  const sorted = [...finite].sort((a, b) => a - b);
  const q = (p: number) => {
    const idx = (sorted.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo]!;
    const frac = idx - lo;
    return sorted[lo]! * (1 - frac) + sorted[hi]! * frac;
  };
  const min = sorted[0]!;
  const q1 = q(0.25);
  const q2 = q(0.5);
  const q3 = q(0.75);
  const max = sorted[sorted.length - 1]!;

  const bins = [
    `[${formatNumber(min)}–${formatNumber(q1)}]`,
    `(${formatNumber(q1)}–${formatNumber(q2)}]`,
    `(${formatNumber(q2)}–${formatNumber(q3)}]`,
    `(${formatNumber(q3)}–${formatNumber(max)}]`,
  ];

  return {
    bins,
    assign: (v: number) => {
      if (v <= q1) return bins[0]!;
      if (v <= q2) return bins[1]!;
      if (v <= q3) return bins[2]!;
      return bins[3]!;
    },
  };
}

function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/** Auto-granularity binning for dates. Range >2y → year, 1mo–2y → month, <1mo → day. */
export function binDate(values: Date[]): {
  bins: string[];
  assign: (v: Date) => string;
} {
  if (values.length === 0) {
    return { bins: [], assign: () => "" };
  }

  const times = values.map((d) => d.getTime()).sort((a, b) => a - b);
  const range = times[times.length - 1]! - times[0]!;
  const granularity: "year" | "month" | "day" =
    range > 2 * MS_YEAR ? "year" : range >= MS_MONTH ? "month" : "day";

  const formatDate = (d: Date): string => {
    // UTC pra evitar drift de timezone com datas ISO (`new Date('2020-01-01')` é UTC-midnight)
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    if (granularity === "year") return String(y);
    if (granularity === "month") return `${y}-${m}`;
    return `${y}-${m}-${dd}`;
  };

  const binSet = new Set<string>();
  for (const d of values) binSet.add(formatDate(d));
  const bins = Array.from(binSet).sort();

  return { bins, assign: formatDate };
}

/** Convert any VariableValue into a list of category labels. Multitext → multiple. */
export function explodeMultitext(value: VariableValue | null | undefined): string[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    return value
      .map((v) => String(v).trim())
      .filter((s) => s.length > 0);
  }
  const s = String(value).trim();
  return s.length > 0 ? [s] : [];
}

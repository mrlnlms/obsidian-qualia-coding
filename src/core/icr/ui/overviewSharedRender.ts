/**
 * Helpers compartilhados pelos 3 modes de overview (matrix, table, heatmap).
 *
 * Extraídos do `overviewMatrix.ts` original quando Modes B/C entraram (Slice E2).
 * Thresholds + classNames pra color scale ficam aqui — caller aplica via addClass.
 */

export const KAPPA_THRESHOLDS = { low: 0.4, midLow: 0.6, midHigh: 0.8 } as const;

export function kappaClass(k: number): string {
	if (k < KAPPA_THRESHOLDS.low) return 'qc-kappa-low';
	if (k < KAPPA_THRESHOLDS.midLow) return 'qc-kappa-mid-low';
	if (k < KAPPA_THRESHOLDS.midHigh) return 'qc-kappa-mid-high';
	return 'qc-kappa-high';
}

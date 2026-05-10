/**
 * Compare mode helpers — gradient CSS por row + index de markers por cell.
 *
 * Puro. Consumido por csvCodingView.cellStyle quando compare mode está ativo.
 */

import type { RowMarker } from '../../../csv/csvCodingTypes';

export interface CoderRowApplication {
	coderId: string;
	codeColor: string;
}

/**
 * Gera CSS gradient com N stripes de igual largura, 1 por coder.
 * Retorna string vazia se cohort vazio (caller usa pra null cellStyle).
 */
export function computeRowGradient(applications: CoderRowApplication[]): string {
	if (applications.length === 0) return '';
	if (applications.length === 1) {
		return hexToRgba(applications[0]!.codeColor, 0.4);
	}
	const stripeWidth = 100 / applications.length;
	const stops: string[] = [];
	applications.forEach((app, i) => {
		const start = (stripeWidth * i).toFixed(2);
		const end = (stripeWidth * (i + 1)).toFixed(2);
		const color = hexToRgba(app.codeColor, 0.4);
		stops.push(`${color} ${start}%, ${color} ${end}%`);
	});
	return `linear-gradient(to right, ${stops.join(', ')})`;
}

function hexToRgba(hex: string, alpha: number): string {
	const cleaned = hex.replace('#', '');
	if (cleaned.length !== 6) return `rgba(136, 136, 136, ${alpha})`;
	const r = parseInt(cleaned.slice(0, 2), 16);
	const g = parseInt(cleaned.slice(2, 4), 16);
	const b = parseInt(cleaned.slice(4, 6), 16);
	if (isNaN(r) || isNaN(g) || isNaN(b)) return `rgba(136, 136, 136, ${alpha})`;
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Agrupa RowMarker[] por (sourceRowId, column). Key formato `${sourceRowId}::${column}`.
 * Cell em AG Grid lookup: rowData.sourceRowId + column.id.
 */
export function computeRowMarkersByCell(markers: RowMarker[]): Map<string, RowMarker[]> {
	const map = new Map<string, RowMarker[]>();
	for (const m of markers) {
		const key = `${m.sourceRowId}::${m.column}`;
		const list = map.get(key) ?? [];
		list.push(m);
		map.set(key, list);
	}
	return map;
}

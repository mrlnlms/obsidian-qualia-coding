// src/export/tabular/csvWriter.ts

/**
 * Convert a 2D array of cells to a CSV string. Handles escape of comma,
 * double quote, and newline per RFC 4180. UTF-8 BOM prepended so Excel
 * detects encoding correctly.
 *
 * Null/undefined → empty cell. Numbers/booleans coerced via String().
 */
export type CellValue = string | number | boolean | null | undefined;

const BOM = '﻿';

export function toCsv(rows: CellValue[][]): string {
	if (rows.length === 0) return BOM;
	return BOM + rows.map(rowToCsv).join('\n') + '\n';
}

function rowToCsv(row: CellValue[]): string {
	return row.map(cellToCsv).join(',');
}

function cellToCsv(cell: CellValue): string {
	if (cell === null || cell === undefined) return '';
	const s = String(cell);
	if (needsQuoting(s)) {
		return '"' + s.replace(/"/g, '""') + '"';
	}
	return s;
}

function needsQuoting(s: string): boolean {
	return s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r');
}

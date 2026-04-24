import type { DataManager } from '../../core/dataManager';
import type { CellValue } from './csvWriter';

export interface SegmentsOptions {
	includeShapeCoords: boolean;
}

export interface SegmentsResult {
	rows: CellValue[][];
	warnings: string[];
}

const BASE_COLS = [
	'id', 'fileId', 'engine', 'sourceType', 'text', 'memo',
	'createdAt', 'updatedAt',
	'page',
	'begin_index', 'begin_offset', 'end_index', 'end_offset',
	'line_from', 'ch_from', 'line_to', 'ch_to',
	'row', 'column', 'cell_from', 'cell_to',
	'time_from', 'time_to',
];
const SHAPE_COLS = ['shape_type', 'shape_coords'];

export function buildSegmentsTable(
	dm: DataManager,
	csvTexts: Map<string, string>,
	opts: SegmentsOptions,
): SegmentsResult {
	const header = opts.includeShapeCoords ? [...BASE_COLS, ...SHAPE_COLS] : [...BASE_COLS];
	const rows: CellValue[][] = [header];
	const warnings: string[] = [];
	const idx = (col: string) => header.indexOf(col);

	const newRow = (): CellValue[] => header.map(() => '');

	const setCommon = (row: CellValue[], id: string, fileId: string, engine: string, sourceType: string, text: string, memo: string, createdAt: number, updatedAt: number) => {
		row[idx('id')] = id;
		row[idx('fileId')] = fileId;
		row[idx('engine')] = engine;
		row[idx('sourceType')] = sourceType;
		row[idx('text')] = text;
		row[idx('memo')] = memo;
		row[idx('createdAt')] = isoOrWarn(createdAt, id, warnings);
		row[idx('updatedAt')] = isoOrWarn(updatedAt, id, warnings);
	};

	// markdown — markers is Record<fileId, Marker[]>
	for (const markers of Object.values(dm.section('markdown').markers)) {
		for (const m of markers) {
			const row = newRow();
			setCommon(row, m.id, m.fileId, 'markdown', 'markdown', m.text ?? '', m.memo ?? '', m.createdAt, m.updatedAt);
			row[idx('line_from')] = m.range.from.line;
			row[idx('ch_from')] = m.range.from.ch;
			row[idx('line_to')] = m.range.to.line;
			row[idx('ch_to')] = m.range.to.ch;
			rows.push(row);
		}
	}

	for (const m of dm.section('pdf').markers) {
		const row = newRow();
		setCommon(row, m.id, m.fileId, 'pdf', 'pdf_text', m.text, m.memo ?? '', m.createdAt, m.updatedAt);
		row[idx('page')] = m.page;
		row[idx('begin_index')] = m.beginIndex;
		row[idx('begin_offset')] = m.beginOffset;
		row[idx('end_index')] = m.endIndex;
		row[idx('end_offset')] = m.endOffset;
		rows.push(row);
	}

	for (const s of dm.section('pdf').shapes) {
		const row = newRow();
		setCommon(row, s.id, s.fileId, 'pdf', 'pdf_shape', '', s.memo ?? '', s.createdAt, s.updatedAt);
		row[idx('page')] = s.page;
		fillShape(row, s.shape, s.coords, header, opts.includeShapeCoords, s.id, warnings);
		rows.push(row);
	}

	for (const m of dm.section('image').markers) {
		const row = newRow();
		setCommon(row, m.id, m.fileId, 'image', 'image', '', m.memo ?? '', m.createdAt, m.updatedAt);
		fillShape(row, m.shape, m.coords, header, opts.includeShapeCoords, m.id, warnings);
		rows.push(row);
	}

	for (const sourceType of ['audio', 'video'] as const) {
		for (const f of dm.section(sourceType).files) {
			for (const m of f.markers) {
				const row = newRow();
				setCommon(row, m.id, m.fileId, sourceType, sourceType, '', m.memo ?? '', m.createdAt, m.updatedAt);
				row[idx('time_from')] = secondsToMs(m.from, m.id, 'from', warnings);
				row[idx('time_to')] = secondsToMs(m.to, m.id, 'to', warnings);
				rows.push(row);
			}
		}
	}

	for (const m of dm.section('csv').segmentMarkers) {
		const row = newRow();
		setCommon(row, m.id, m.fileId, 'csv', 'csv_segment', csvTexts.get(m.id) ?? '', m.memo ?? '', m.createdAt, m.updatedAt);
		row[idx('row')] = m.row;
		row[idx('column')] = m.column;
		row[idx('cell_from')] = m.from;
		row[idx('cell_to')] = m.to;
		rows.push(row);
	}
	for (const m of dm.section('csv').rowMarkers) {
		const row = newRow();
		setCommon(row, m.id, m.fileId, 'csv', 'csv_row', csvTexts.get(m.id) ?? '', m.memo ?? '', m.createdAt, m.updatedAt);
		row[idx('row')] = m.row;
		row[idx('column')] = m.column;
		rows.push(row);
	}

	return { rows, warnings };
}

function secondsToMs(sec: number, id: string, label: string, warnings: string[]): CellValue {
	if (!Number.isFinite(sec)) {
		warnings.push(`Media marker ${id} has NaN ${label} time — emitted empty`);
		return '';
	}
	return Math.round(sec * 1000);
}

function fillShape(row: CellValue[], shape: string, coords: any, header: string[], include: boolean, id: string, warnings: string[]): void {
	if (!include) return;
	const idx = (col: string) => header.indexOf(col);
	if (!coords || typeof coords !== 'object' || !coords.type) {
		warnings.push(`Shape marker ${id} has malformed coords — omitted`);
		return;
	}
	let serialized: string;
	try {
		serialized = JSON.stringify(coords);
	} catch {
		warnings.push(`Shape marker ${id} coords not JSON-serializable — omitted`);
		return;
	}
	row[idx('shape_type')] = shape;
	row[idx('shape_coords')] = serialized;
}

function isoOrWarn(ms: number, id: string, warnings: string[]): string {
	if (!Number.isFinite(ms)) {
		warnings.push(`Segment ${id} has non-finite timestamp — emitted empty`);
		return '';
	}
	try {
		return new Date(ms).toISOString();
	} catch {
		warnings.push(`Segment ${id} timestamp invalid — emitted empty`);
		return '';
	}
}

import type { CodeApplication } from '../core/types';
import type { MemoRecord } from '../core/memoTypes';

/** Coding of a specific text segment within a cell */
export interface SegmentMarker {
	id: string;
	fileId: string;     // CSV file path
	sourceRowId: number; // Stable row identity. In eager mode == papaparse row index (0-based).
	column: string;     // source column field name
	from: number;       // char offset start within cell text
	to: number;         // char offset end within cell text
	codes: CodeApplication[];
	memo?: MemoRecord;
	colorOverride?: string;
	createdAt: number;
	updatedAt: number;
}

/** Coding of an entire row for a column */
export interface RowMarker {
	id: string;
	fileId: string;
	sourceRowId: number;
	column: string;
	codes: CodeApplication[];
	memo?: MemoRecord;
	colorOverride?: string;
	createdAt: number;
	updatedAt: number;
}

/** Union type for all CSV markers */
export type CsvMarker = SegmentMarker | RowMarker;

/** Persisted data structure (saved via DataManager csv section) */
export interface CodingData {
	segmentMarkers: SegmentMarker[];
	rowMarkers: RowMarker[];
}

/** Snapshot of a selection — used by menu actions */
export interface CodingSnapshot {
	from: number;
	to: number;
	text: string;
	fileId: string;
	sourceRowId: number;
	column: string;
}

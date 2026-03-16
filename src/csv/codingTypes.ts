/** Coding of a specific text segment within a cell */
export interface SegmentMarker {
	id: string;
	fileId: string;     // CSV file path
	row: number;        // 0-based row index (excluding header)
	column: string;     // source column field name
	from: number;       // char offset start within cell text
	to: number;         // char offset end within cell text
	codes: string[];    // code names applied to this segment
	memo?: string;
	colorOverride?: string;
	createdAt: number;
	updatedAt: number;
}

/** Coding of an entire row for a column */
export interface RowMarker {
	id: string;
	fileId: string;
	row: number;
	column: string;
	codes: string[];
	memo?: string;
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
	row: number;
	column: string;
}

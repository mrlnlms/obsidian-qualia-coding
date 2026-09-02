// Re-export shared shape types from core
export type { ShapeType, RectCoords, EllipseCoords, PolygonCoords, PercentShapeCoords } from '../core/shapeTypes';
import type { CodeApplication } from '../core/types';
import type { MemoRecord } from '../core/memoTypes';
import type { CoderId } from '../core/icr/coderTypes';

/**
 * Portable text anchor — used only by the QDPX export/import pipeline to
 * locate text in the consolidated PlainText. NOT persisted on markers; markers
 * use DOM-aligned indices as before.
 */
export interface PdfAnchor {
	text: string;
	contextBefore: string;
	contextAfter: string;
	occurrenceIndex: number;
}

export interface PdfSelectionBBoxHint {
	source: 'qdpx-pdf-selection';
	page: number;
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface ImportedPdfTextContext {
	source: 'qdpx-plain-text-selection';
	startPosition?: number;
	endPosition?: number;
	before: string;
	exact: string;
	after: string;
	resolutionStrategy: 'offset' | 'name+length' | 'name+prefix' | 'unresolved';
}

export interface QdpxContinuedByHint {
	source: 'qdpx-continued-by';
	role: 'origin' | 'target' | 'both';
	linkIds: string[];
	relatedSelectionGuids: string[];
}

export interface QdpxMultipageFragmentHint {
	source: 'qdpx-multipage-fragment';
	groupId: string;
	role: 'anchor' | 'continuation';
	relatedSelectionGuids: string[];
}

export interface QdpxSelectionProvenance {
	source: 'refi-qda-selection';
	selectionGuid: string;
	/** Ordered PDFSelection GUIDs belonging to one imported logical marker. */
	selectionGuids?: string[];
	/** Missing/unknown creatingUser: never treat as legacy Default ownership. */
	unattributedOwner?: true;
}

export interface PdfMarkerSegment {
	page: number;
	beginIndex: number;
	beginOffset: number;
	endIndex: number;
	endOffset: number;
	text: string;
	importedSelectionGuid?: string;
	importedPdfSelectionBBox?: PdfSelectionBBoxHint;
	resolution?: 'resolved' | 'pending';
}

export interface PdfMarker {
	markerType: 'pdf';
	id: string;
	fileId: string;
	page: number;
	beginIndex: number;
	beginOffset: number;
	endIndex: number;
	endOffset: number;
	text: string;
	/** Authoritative geometry for a logical marker spanning multiple PDF pages. */
	segments?: PdfMarkerSegment[];
	codes: CodeApplication[];
	memo?: MemoRecord;
	colorOverride?: string;
	codedBy?: CoderId;
	sourceHashAtCoding?: string;
	importedPdfSelectionBBox?: PdfSelectionBBoxHint;
	importedPdfTextContext?: ImportedPdfTextContext;
	importedQdpxContinuedBy?: QdpxContinuedByHint;
	importedQdpxMultipageFragment?: QdpxMultipageFragmentHint;
	importedQdpxSelection?: QdpxSelectionProvenance;
	createdAt: number;
	updatedAt: number;
}

/** Ephemeral page-local view of a canonical PDF marker segment. */
export interface PdfMarkerPageProjection extends PdfMarker {
	renderSegmentIndex: number;
	renderSegmentCount: number;
	renderSegmentResolution: 'resolved' | 'pending';
	logicalText: string;
}

export type PdfMarkerRangeChanges = Partial<Pick<
	PdfMarkerSegment,
	'beginIndex' | 'beginOffset' | 'endIndex' | 'endOffset' | 'text'
>>;

export interface PdfShapeMarker {
	markerType: 'pdf';
	id: string;
	fileId: string;
	page: number;
	shape: import('../core/shapeTypes').ShapeType;
	coords: import('../core/shapeTypes').PercentShapeCoords;
	codes: CodeApplication[];
	memo?: MemoRecord;
	colorOverride?: string;
	codedBy?: CoderId;
	sourceHashAtCoding?: string;
	createdAt: number;
	updatedAt: number;
}

export interface PdfCodingData {
	markers: PdfMarker[];
	shapes: PdfShapeMarker[];
	registry: any;
}

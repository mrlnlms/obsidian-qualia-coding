import type { CodeDefinitionRegistry } from './codeDefinitionRegistry';
import type { CodeMarkerSettings } from '../markdown/models/settings';
import type { Marker } from '../markdown/models/codeMarkerModel';
import type { SegmentMarker, RowMarker } from '../csv/csvCodingTypes';
import type { ImageMarker } from '../image/imageCodingTypes';
import type { PdfMarker, PdfShapeMarker } from '../pdf/pdfCodingTypes';
import type { AudioFile } from '../audio/audioCodingTypes';
import type { VideoFile } from '../video/videoCodingTypes';
import type { CaseVariablesSection } from './caseVariables/caseVariablesTypes';
import type { MemoRecord } from './memoTypes';

// ─── Base interfaces for sidebar views (all engines) ─────────────

// 8-color pastel palette for Code Groups. Distinct from DEFAULT_PALETTE (codes) to avoid visual confusion in chip counters.
export const GROUP_PALETTE: readonly string[] = [
	'#AEC6FF',  // pastel blue
	'#B7E4C7',  // pastel green
	'#FFD6A5',  // pastel peach
	'#FFADAD',  // pastel coral
	'#CAFFBF',  // pastel mint
	'#BDB2FF',  // pastel violet
	'#FDFFB6',  // pastel yellow
	'#FFC6FF',  // pastel pink
];

export type MarkerType = 'markdown' | 'pdf' | 'csv' | 'image' | 'audio' | 'video';

export interface CodeRelation {
	label: string;
	target: string;
	directed: boolean;
	memo?: MemoRecord;
}

export interface CodeApplication {
	codeId: string;
	magnitude?: string;
	relations?: CodeRelation[];
}

export interface BaseMarker {
	markerType: MarkerType;
	id: string;
	fileId: string;
	codes: CodeApplication[];
	colorOverride?: string;
	memo?: MemoRecord;
	createdAt: number;
	updatedAt: number;
}

export interface SidebarModelInterface {
	registry: CodeDefinitionRegistry;
	onChange(fn: () => void): void;
	offChange(fn: () => void): void;
	getAllMarkers(): BaseMarker[];
	getMarkerById(id: string): BaseMarker | null;
	getAllFileIds(): string[];
	getMarkersForFile(fileId: string): BaseMarker[];

	saveMarkers(): void;

	/** Update mutable fields (memo, colorOverride) on a marker by ID. */
	updateMarkerFields(markerId: string, fields: { memo?: MemoRecord | undefined; colorOverride?: string | undefined }): void;

	/** Force CM6 decoration rebuild for a file (e.g. after color change). */
	updateDecorations(fileId: string): void;

	/** Delete a single marker/segment by ID. */
	removeMarker(markerId: string): boolean;

	/** Delete a code definition and remove it from all markers. */
	deleteCode(codeId: string): void;

	// Hover state (bidirectional: sidebar ↔ main view)
	setHoverState(markerId: string | null, codeName: string | null, hoveredIds?: string[]): void;
	getHoverMarkerId(): string | null;
	getHoverMarkerIds(): string[];
	onHoverChange(fn: () => void): void;
	offHoverChange(fn: () => void): void;
}

// ─── Code definition ─────────────────────────────────────────────

export interface CodeDefinition {
	id: string;
	name: string;
	color: string;
	description?: string;
	memo?: MemoRecord;
	paletteIndex: number;
	createdAt: number;
	updatedAt: number;
	// Hierarchy (Phase A)
	parentId?: string;
	childrenOrder: string[];
	mergedFrom?: string[];
	// Visibility toggle (Phase F)
	/** When true, this code is globally hidden from editor renders. Analytics/export não são afetados. */
	hidden?: boolean;
	// Virtual folders (Phase B)
	folder?: string;        // folder id — undefined = no folder (root level)
	// Magnitude (Phase D)
	magnitude?: { type: 'nominal' | 'ordinal' | 'continuous'; values: string[] };
	// Groups (Tier 1.5 — flat N:N, orthogonal to parentId)
	groups?: string[];  // array de groupIds. undefined/empty = sem groups.
	// Relations code-level (Phase E)
	relations?: CodeRelation[];
}

export interface FolderDefinition {
	id: string;
	name: string;
	parentId?: string;
	subfolderOrder?: string[];
	createdAt: number;
}

export interface GroupDefinition {
	id: string;              // g_XX (estável)
	name: string;            // livre, renameable
	color: string;           // REQUIRED — auto-atribuído do GROUP_PALETTE
	description?: string;    // opcional, multiline
	memo?: MemoRecord;       // opcional, reflexão analítica processual
	paletteIndex: number;    // índice no GROUP_PALETTE; -1 se cor customizada
	parentId?: string;       // SCHEMA-READY pra tier 3; UI 1.5 NUNCA escreve
	createdAt: number;
}

export type EngineCleanup = () => void | Promise<void>;

export interface EngineRegistration<M = unknown> {
	cleanup: EngineCleanup;
	model: M;
}

export interface GeneralSettings {
	showMagnitudeInPopover: boolean;
	showRelationsInPopover: boolean;
	openToggleInNewTab: boolean;
}

export interface QualiaData {
	registry: {
		definitions: Record<string, CodeDefinition>;
		nextPaletteIndex: number;
		folders: Record<string, FolderDefinition>;
		folderOrder: string[];
		rootOrder: string[];
		// Groups (Tier 1.5)
		groups: Record<string, GroupDefinition>;
		groupOrder: string[];
		nextGroupPaletteIndex: number;
	};
	general: GeneralSettings;
	markdown: { markers: Record<string, Marker[]>; settings: CodeMarkerSettings };
	csv: {
		segmentMarkers: SegmentMarker[];
		rowMarkers: RowMarker[];
		settings: {
			/** Limite em MB pra mostrar banner de "Large file" antes de carregar parquet. Default 50. */
			parquetSizeWarningMB: number;
			/** Limite em MB pra mostrar banner antes de carregar csv. Default 100. */
			csvSizeWarningMB: number;
		};
	};
	image: { markers: ImageMarker[]; settings: { autoOpen: boolean; showButton: boolean; fileStates: Record<string, { zoom: number; panX: number; panY: number }> } };
	pdf: { markers: PdfMarker[]; shapes: PdfShapeMarker[]; settings: { autoOpen: boolean; showButton: boolean } };
	audio: {
		files: AudioFile[];
		settings: {
			autoOpen: boolean;
			showButton: boolean;
			defaultZoom: number;
			regionOpacity: number;
			showLabelsOnRegions: boolean;
			fileStates: Record<string, { zoom: number; lastPosition: number }>;
		};
	};
	video: {
		files: VideoFile[];
		settings: {
			autoOpen: boolean;
			showButton: boolean;
			defaultZoom: number;
			regionOpacity: number;
			showLabelsOnRegions: boolean;
			videoFit: 'contain' | 'cover';
			fileStates: Record<string, { zoom: number; lastPosition: number }>;
		};
	};
	caseVariables: CaseVariablesSection;
	/** Per-doc visibility overrides. overrides[fileId][codeId] = effective visibility in that doc.
	 *  Self-cleaning: entries só existem quando divergem do global. */
	visibilityOverrides: Record<string, Record<string, boolean>>;
	/**
	 * Audit log central — registra eventos analíticos por código (created, renamed, merged, etc.)
	 * pra defender escolhas analíticas em paper. Soft delete via `hidden: true`.
	 * Ver `src/core/auditLog.ts` pra helpers e `docs/ROADMAP.md #29` pro contexto.
	 */
	auditLog: AuditEntry[];
}

// ─── Audit log ────────────────────────────────────────────

interface BaseAuditEntry {
	/** ID único pra hide/unhide reversível. */
	id: string;
	/** ID do código a que esse event se refere. Pra códigos deletados, ainda preserva o id. */
	codeId: string;
	/** Timestamp ms. */
	at: number;
	/** Soft delete: true esconde da timeline e do export, mas mantém no JSON pra auditoria/restore. */
	hidden?: true;
}

export type AuditEntry =
	| (BaseAuditEntry & { type: 'created' })
	| (BaseAuditEntry & { type: 'renamed'; from: string; to: string })
	| (BaseAuditEntry & { type: 'description_edited'; from: string; to: string })
	| (BaseAuditEntry & { type: 'memo_edited'; from: string; to: string })
	| (BaseAuditEntry & { type: 'absorbed'; absorbedNames: string[]; absorbedIds: string[] })
	| (BaseAuditEntry & { type: 'merged_into'; intoId: string; intoName: string })
	| (BaseAuditEntry & { type: 'deleted' });

export function createDefaultData(): QualiaData {
	return {
		registry: { definitions: {}, nextPaletteIndex: 0, folders: {}, folderOrder: [], rootOrder: [], groups: {}, groupOrder: [], nextGroupPaletteIndex: 0 },
		general: { showMagnitudeInPopover: true, showRelationsInPopover: true, openToggleInNewTab: false },
		markdown: { markers: {}, settings: {
			defaultColor: '#6200EE',
			markerOpacity: 0.4,
			showHandlesOnHover: true,
			handleSize: 12,
			showMenuOnSelection: true,
			showMenuOnRightClick: true,
			showRibbonButton: true,
		} },
		csv: {
			segmentMarkers: [], rowMarkers: [],
			settings: { parquetSizeWarningMB: 50, csvSizeWarningMB: 100 },
		},
		image: { markers: [], settings: { autoOpen: false, showButton: true, fileStates: {} } },
		pdf: { markers: [], shapes: [], settings: { autoOpen: false, showButton: true } },
		audio: {
			files: [],
			settings: { autoOpen: false, showButton: true, defaultZoom: 50, regionOpacity: 0.4, showLabelsOnRegions: true, fileStates: {} },
		},
		video: {
			files: [],
			settings: { autoOpen: false, showButton: true, defaultZoom: 50, regionOpacity: 0.4, showLabelsOnRegions: true, videoFit: 'contain', fileStates: {} },
		},
		caseVariables: { values: {}, types: {} },
		visibilityOverrides: {},
		auditLog: [],
	};
}

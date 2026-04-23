import type { CodeDefinitionRegistry } from './codeDefinitionRegistry';
import type { CodeMarkerSettings } from '../markdown/models/settings';
import type { Marker } from '../markdown/models/codeMarkerModel';
import type { SegmentMarker, RowMarker } from '../csv/csvCodingTypes';
import type { ImageMarker } from '../image/imageCodingTypes';
import type { PdfMarker, PdfShapeMarker } from '../pdf/pdfCodingTypes';
import type { AudioFile } from '../audio/audioCodingTypes';
import type { VideoFile } from '../video/videoCodingTypes';
import type { CaseVariablesSection } from './caseVariables/caseVariablesTypes';

// ─── Base interfaces for sidebar views (all engines) ─────────────

export type MarkerType = 'markdown' | 'pdf' | 'csv' | 'image' | 'audio' | 'video';

export interface CodeRelation {
	label: string;
	target: string;
	directed: boolean;
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
	memo?: string;
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
	updateMarkerFields(markerId: string, fields: { memo?: string | undefined; colorOverride?: string | undefined }): void;

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
	paletteIndex: number;
	createdAt: number;
	updatedAt: number;
	// Hierarchy (Phase A)
	parentId?: string;
	childrenOrder: string[];
	mergedFrom?: string[];
	// Virtual folders (Phase B)
	folder?: string;        // folder id — undefined = no folder (root level)
	// Magnitude (Phase D)
	magnitude?: { type: 'nominal' | 'ordinal' | 'continuous'; values: string[] };
	// Relations code-level (Phase E)
	relations?: CodeRelation[];
}

export interface FolderDefinition {
	id: string;
	name: string;
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
		rootOrder: string[];
	};
	general: GeneralSettings;
	markdown: { markers: Record<string, Marker[]>; settings: CodeMarkerSettings };
	csv: { segmentMarkers: SegmentMarker[]; rowMarkers: RowMarker[] };
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
}

export function createDefaultData(): QualiaData {
	return {
		registry: { definitions: {}, nextPaletteIndex: 0, folders: {}, rootOrder: [] },
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
		csv: { segmentMarkers: [], rowMarkers: [] },
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
	};
}

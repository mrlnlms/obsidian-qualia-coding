/**
 * Shared types for time-based media engines (audio + video).
 */

import type { CodeApplication } from '../core/types';
import type { CodeDefinitionRegistry } from '../core/codeDefinitionRegistry';
import type { MemoRecord } from '../core/memoTypes';

/** A coded region on a timeline (used by both Audio and Video). */
export interface MediaMarker {
	id: string;
	fileId: string;
	from: number;
	to: number;
	codes: CodeApplication[];
	colorOverride?: string;
	memo?: MemoRecord;
	createdAt: number;
	updatedAt: number;
}

/** A file containing time-based markers (used by both Audio and Video). */
export interface MediaFile<M extends MediaMarker = MediaMarker> {
	path: string;
	markers: M[];
}

/** Shared settings for time-based media engines. */
export interface BaseMediaSettings {
	autoOpen: boolean;
	showButton: boolean;
	defaultZoom: number;
	regionOpacity: number;
	showLabelsOnRegions: boolean;
	fileStates: Record<string, { zoom: number; lastPosition: number; lastCurrentTime?: number }>;
}

/** Default values for BaseMediaSettings fields. */
export const DEFAULT_MEDIA_SETTINGS: BaseMediaSettings = {
	autoOpen: false,
	showButton: true,
	defaultZoom: 50,
	regionOpacity: 0.4,
	showLabelsOnRegions: true,
	fileStates: {},
};

/** Minimal model interface consumed by MediaRegionRenderer. */
export interface MediaCodingModelLike {
	registry: CodeDefinitionRegistry;
	settings: { regionOpacity: number; showLabelsOnRegions: boolean };
	findMarkerById(id: string): MediaMarker | undefined;
	getMarkersForFile(filePath: string): MediaMarker[];
	setHoverState(markerId: string | null, codeName: string | null): void;
	getHoverMarkerId(): string | null;
	onHoverChange(fn: () => void): void;
	offHoverChange(fn: () => void): void;
}

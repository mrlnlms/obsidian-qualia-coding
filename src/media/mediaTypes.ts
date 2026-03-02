/**
 * Shared types for time-based media engines (audio + video).
 */

import type { CodeDefinitionRegistry } from '../core/codeDefinitionRegistry';

/** A coded region on a timeline (used by both Audio and Video). */
export interface MediaMarker {
	id: string;
	from: number;
	to: number;
	codes: string[];
	memo?: string;
	createdAt: number;
	updatedAt: number;
}

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

/**
 * MediaSidebarAdapter — shared base for Audio and Video sidebar adapters.
 * Extends BaseSidebarAdapter with media-specific logic (markerToBase, CRUD).
 */

import type { BaseMarker } from '../core/types';
import type { MediaMarker } from './mediaTypes';
import type { MediaCodingModel } from './mediaCodingModel';
import { BaseSidebarAdapter } from '../core/baseSidebarAdapter';

export interface MediaBaseMarker extends BaseMarker {
	startTime: number;
	endTime: number;
	mediaType: string;
	markerLabel: string;
	markerText: string | null;
}

export class MediaSidebarAdapter<
	M extends MediaMarker,
	BM extends MediaBaseMarker,
> extends BaseSidebarAdapter {
	protected declare readonly model: MediaCodingModel<M, any, any>;
	private mediaType: string;

	constructor(model: MediaCodingModel<M, any, any>, mediaType: string) {
		super(model);
		this.mediaType = mediaType;
	}

	protected markerToBase(m: M): BM {
		return {
			id: m.id,
			fileId: m.fileId,
			codes: m.codes,
			colorOverride: m.colorOverride,
			memo: m.memo,
			createdAt: m.createdAt,
			updatedAt: m.updatedAt,
			startTime: m.from,
			endTime: m.to,
			mediaType: this.mediaType,
			markerLabel: this.model.getMarkerLabel(m),
			markerText: m.memo ?? null,
		} as unknown as BM;
	}

	getAllMarkers(): BM[] {
		return this.model.getAllMarkers().map(m => this.markerToBase(m));
	}

	getMarkerById(id: string): BM | null {
		const m = this.model.findMarkerById(id);
		if (m) return this.markerToBase(m);
		return null;
	}

	getAllFileIds(): string[] {
		return this.model.getAllFileIds();
	}

	getMarkersForFile(fileId: string): BM[] {
		return this.model.getMarkersForFile(fileId).map(m => this.markerToBase(m));
	}

	saveMarkers(): void {
		this.model.saveMarkers();
	}

	protected override notifyAfterFieldUpdate(): void {
		this.model.notify();
	}

	updateDecorations(_fileId: string): void {
		this.model.notifyChange();
	}

	removeMarker(markerId: string): boolean {
		return this.model.removeMarker(markerId);
	}

}

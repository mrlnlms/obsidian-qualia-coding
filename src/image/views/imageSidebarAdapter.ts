/**
 * ImageSidebarAdapter — wraps ImageCodingModel into the SidebarModelInterface.
 */

import type { BaseMarker } from '../../core/types';
import type { ImageCodingModel } from '../models/codingModel';
import type { ImageMarker } from '../models/codingTypes';
import { BaseSidebarAdapter } from '../../core/baseSidebarAdapter';

export interface ImageBaseMarker extends BaseMarker {
	shape: string;
	shapeLabel: string;
}

function markerToBase(m: ImageMarker, model: ImageCodingModel): ImageBaseMarker {
	return {
		id: m.id,
		fileId: m.fileId,
		codes: m.codes,
		colorOverride: m.colorOverride,
		memo: m.memo,
		createdAt: m.createdAt,
		updatedAt: m.updatedAt,
		shape: m.shape,
		shapeLabel: model.getMarkerLabel(m),
	};
}

export class ImageSidebarAdapter extends BaseSidebarAdapter {
	protected declare readonly model: ImageCodingModel;

	constructor(model: ImageCodingModel) {
		super(model);
	}

	getAllMarkers(): ImageBaseMarker[] {
		return this.model.getAllMarkers().map(m => markerToBase(m, this.model));
	}

	getMarkerById(id: string): ImageBaseMarker | null {
		const m = this.model.findMarkerById(id);
		if (m) return markerToBase(m, this.model);
		return null;
	}

	getAllFileIds(): string[] {
		return this.model.getAllFileIds();
	}

	getMarkersForFile(fileId: string): ImageBaseMarker[] {
		return this.model.getMarkersForFile(fileId).map(m => markerToBase(m, this.model));
	}

	saveMarkers(): void {
		this.model.saveMarkers();
	}

	protected override notifyAfterFieldUpdate(): void {
		this.model.notify();
	}

	updateDecorations(_fileId: string): void {
		this.model.notify();
	}

	removeMarker(markerId: string): boolean {
		return this.model.removeMarker(markerId);
	}

}

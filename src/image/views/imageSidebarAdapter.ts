/**
 * ImageSidebarAdapter — wraps ImageCodingModel into the SidebarModelInterface
 * expected by unified sidebar views.
 *
 * Maps ImageMarker fields to BaseMarker interface.
 */

import type { BaseMarker, SidebarModelInterface } from '../../core/types';
import type { CodeDefinitionRegistry } from '../../core/codeDefinitionRegistry';
import type { ImageCodingModel } from '../models/codingModel';
import type { ImageMarker } from '../models/codingTypes';

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

export class ImageSidebarAdapter implements SidebarModelInterface {
	readonly registry: CodeDefinitionRegistry;
	private model: ImageCodingModel;

	private changeListeners = new Map<() => void, () => void>();
	private hoverListeners = new Map<() => void, (markerId: string | null, codeName: string | null) => void>();

	constructor(model: ImageCodingModel) {
		this.model = model;
		this.registry = model.registry;
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

	updateMarkerFields(markerId: string, fields: { memo?: string; colorOverride?: string }): void {
		const m = this.model.findMarkerById(markerId);
		if (!m) return;
		if ('memo' in fields) m.memo = fields.memo;
		if ('colorOverride' in fields) m.colorOverride = fields.colorOverride;
		m.updatedAt = Date.now();
		this.model.notify();
	}

	updateDecorations(_fileId: string): void {
		this.model.notify();
	}

	removeMarker(markerId: string): boolean {
		return this.model.deleteMarker(markerId);
	}

	deleteCode(codeName: string): void {
		for (const m of this.model.getAllMarkers()) {
			if (m.codes.includes(codeName)) {
				this.model.removeCodeFromMarker(m.id, codeName, true);
			}
		}
		const def = this.registry.getByName(codeName);
		if (def) this.registry.delete(def.id);
		this.saveMarkers();
	}

	// ── Hover state ──

	setHoverState(markerId: string | null, codeName: string | null): void {
		this.model.setHoverState(markerId, codeName);
	}

	getHoverMarkerId(): string | null {
		return this.model.getHoverMarkerId();
	}

	getHoverMarkerIds(): string[] {
		const id = this.model.getHoverMarkerId();
		return id ? [id] : [];
	}

	onChange(fn: () => void): void {
		this.changeListeners.set(fn, fn);
		this.model.onChange(fn);
	}

	offChange(fn: () => void): void {
		const wrapped = this.changeListeners.get(fn);
		if (wrapped) {
			this.model.offChange(wrapped);
			this.changeListeners.delete(fn);
		}
	}

	onHoverChange(fn: () => void): void {
		const wrapper = (_markerId: string | null, _codeName: string | null) => fn();
		this.hoverListeners.set(fn, wrapper);
		this.model.onHoverChange(wrapper);
	}

	offHoverChange(fn: () => void): void {
		const wrapper = this.hoverListeners.get(fn);
		if (wrapper) {
			this.model.offHoverChange(wrapper);
			this.hoverListeners.delete(fn);
		}
	}
}

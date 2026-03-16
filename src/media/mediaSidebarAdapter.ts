/**
 * MediaSidebarAdapter — generic base class for Audio and Video sidebar adapters.
 * Subclasses only need to call super() with their model and mediaType.
 */

import type { BaseMarker, SidebarModelInterface } from '../core/types';
import type { CodeDefinitionRegistry } from '../core/codeDefinitionRegistry';
import type { MediaMarker } from './mediaTypes';
import type { MediaCodingModel } from './mediaCodingModel';

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
> implements SidebarModelInterface {
	readonly registry: CodeDefinitionRegistry;
	protected model: MediaCodingModel<M, any, any>;
	private mediaType: string;

	private changeListeners = new Map<() => void, () => void>();
	private hoverListeners = new Map<() => void, () => void>();

	constructor(model: MediaCodingModel<M, any, any>, mediaType: string) {
		this.model = model;
		this.registry = model.registry;
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

	updateMarkerFields(markerId: string, fields: { memo?: string; colorOverride?: string }): void {
		const m = this.model.findMarkerById(markerId);
		if (!m) return;
		if ('memo' in fields) m.memo = fields.memo;
		if ('colorOverride' in fields) m.colorOverride = fields.colorOverride;
		m.updatedAt = Date.now();
		this.model.notify();
	}

	updateDecorations(_fileId: string): void {
		this.model.notifyChange();
	}

	removeMarker(markerId: string): boolean {
		return this.model.removeMarker(markerId);
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
		this.hoverListeners.set(fn, fn);
		this.model.onHoverChange(fn);
	}

	offHoverChange(fn: () => void): void {
		const wrapped = this.hoverListeners.get(fn);
		if (wrapped) {
			this.model.offHoverChange(wrapped);
			this.hoverListeners.delete(fn);
		}
	}
}

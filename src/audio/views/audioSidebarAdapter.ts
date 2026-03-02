/**
 * AudioSidebarAdapter — wraps AudioCodingModel into the SidebarModelInterface
 * expected by unified sidebar views.
 */

import type { BaseMarker, SidebarModelInterface } from '../../core/types';
import type { CodeDefinitionRegistry } from '../../core/codeDefinitionRegistry';
import type { AudioCodingModel } from '../audioCodingModel';
import type { AudioMarker } from '../audioCodingTypes';

export interface AudioBaseMarker extends BaseMarker {
	startTime: number;
	endTime: number;
	mediaType: 'audio';
	markerLabel: string;
	markerText: string | null;
}

function markerToBase(m: AudioMarker, model: AudioCodingModel): AudioBaseMarker {
	return {
		id: m.id,
		fileId: model.getFileForMarker(m.id) ?? '',
		codes: m.codes,
		memo: m.memo,
		createdAt: m.createdAt,
		updatedAt: m.createdAt,
		startTime: m.from,
		endTime: m.to,
		mediaType: 'audio',
		markerLabel: model.getMarkerLabel(m),
		markerText: m.memo ?? null,
	};
}

export class AudioSidebarAdapter implements SidebarModelInterface {
	readonly registry: CodeDefinitionRegistry;
	private model: AudioCodingModel;

	private changeListeners = new Map<() => void, () => void>();
	private hoverListeners = new Map<() => void, () => void>();

	constructor(model: AudioCodingModel) {
		this.model = model;
		this.registry = model.registry;
	}

	getAllMarkers(): AudioBaseMarker[] {
		return this.model.getAllMarkers().map(m => markerToBase(m, this.model));
	}

	getMarkerById(id: string): AudioBaseMarker | null {
		const m = this.model.findMarkerById(id);
		if (m) return markerToBase(m, this.model);
		return null;
	}

	getAllFileIds(): string[] {
		return this.model.getAllFileIds();
	}

	getMarkersForFile(fileId: string): AudioBaseMarker[] {
		return this.model.getMarkersForFile(fileId).map(m => markerToBase(m, this.model));
	}

	saveMarkers(): void {
		this.model.saveMarkers();
	}

	updateMarkerFields(markerId: string, fields: { memo?: string; colorOverride?: string }): void {
		const m = this.model.findMarkerById(markerId);
		if (!m) return;
		if ('memo' in fields) m.memo = fields.memo;
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
		const wrapper = this.hoverListeners.get(fn);
		if (wrapper) {
			this.model.offHoverChange(wrapper);
			this.hoverListeners.delete(fn);
		}
	}
}

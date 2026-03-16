/**
 * VideoSidebarAdapter — wraps VideoCodingModel into the SidebarModelInterface.
 */

import type { BaseMarker, SidebarModelInterface } from '../../core/types';
import type { CodeDefinitionRegistry } from '../../core/codeDefinitionRegistry';
import type { VideoCodingModel } from '../videoCodingModel';
import type { VideoMarker } from '../videoCodingTypes';
import { formatTime } from '../../media/formatTime';

export interface VideoBaseMarker extends BaseMarker {
	startTime: number;
	endTime: number;
	mediaType: 'video';
	markerLabel: string;
	markerText: string | null;
}

function markerToBase(m: VideoMarker, filePath: string): VideoBaseMarker {
	return {
		id: m.id,
		fileId: filePath,
		codes: m.codes,
		createdAt: m.createdAt,
		updatedAt: m.updatedAt,
		startTime: m.from,
		endTime: m.to,
		mediaType: 'video',
		markerLabel: formatTime(m.from) + ' – ' + formatTime(m.to),
		markerText: m.memo ?? null,
	};
}

export class VideoSidebarAdapter implements SidebarModelInterface {
	readonly registry: CodeDefinitionRegistry;
	private model: VideoCodingModel;

	private changeListeners = new Map<() => void, () => void>();
	private hoverListeners = new Map<() => void, () => void>();

	constructor(model: VideoCodingModel) {
		this.model = model;
		this.registry = model.registry;
	}

	getAllMarkers(): VideoBaseMarker[] {
		const result: VideoBaseMarker[] = [];
		for (const vf of this.model.files) {
			for (const m of vf.markers) {
				result.push(markerToBase(m, vf.path));
			}
		}
		return result;
	}

	getMarkerById(id: string): VideoBaseMarker | null {
		for (const vf of this.model.files) {
			const m = vf.markers.find(mk => mk.id === id);
			if (m) return markerToBase(m, vf.path);
		}
		return null;
	}

	getAllFileIds(): string[] {
		return this.model.getAllFileIds();
	}

	getMarkersForFile(fileId: string): VideoBaseMarker[] {
		return this.model.getMarkersForFile(fileId).map(m => markerToBase(m, fileId));
	}

	saveMarkers(): void {
		this.model.saveMarkers();
	}

	updateMarkerFields(markerId: string, fields: { memo?: string; colorOverride?: string }): void {
		const m = this.model.findMarkerById(markerId);
		if (!m) return;
		if (fields.memo !== undefined) m.memo = fields.memo || undefined;
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

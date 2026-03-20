/**
 * UnifiedModelAdapter — combines multiple SidebarModelInterface implementations
 * (markdown, PDF, future engines) into a single unified model for sidebar views.
 *
 * All markers from all engines appear in a single explorer/detail view.
 * Write operations are delegated to the engine that owns the marker.
 */

import type { BaseMarker, SidebarModelInterface } from './types';
import type { CodeDefinitionRegistry } from './codeDefinitionRegistry';

export class UnifiedModelAdapter implements SidebarModelInterface {
	readonly registry: CodeDefinitionRegistry;
	private models: SidebarModelInterface[];

	private dirty = true;
	private cachedMarkers: BaseMarker[] = [];
	private cachedFileIndex = new Map<string, BaseMarker[]>();
	private cachedIdIndex = new Map<string, BaseMarker>();
	private wrappedListeners = new Map<() => void, () => void>();

	constructor(registry: CodeDefinitionRegistry, models: SidebarModelInterface[]) {
		this.registry = registry;
		this.models = models;
	}

	private rebuild(): void {
		this.cachedMarkers = this.models.flatMap(m => m.getAllMarkers());
		this.cachedFileIndex = new Map();
		this.cachedIdIndex = new Map();
		for (const marker of this.cachedMarkers) {
			const list = this.cachedFileIndex.get(marker.fileId);
			if (list) list.push(marker);
			else this.cachedFileIndex.set(marker.fileId, [marker]);
			this.cachedIdIndex.set(marker.id, marker);
		}
		this.dirty = false;
	}

	getAllMarkers(): BaseMarker[] {
		if (this.dirty) this.rebuild();
		return this.cachedMarkers;
	}

	getMarkerById(id: string): BaseMarker | null {
		if (this.dirty) this.rebuild();
		return this.cachedIdIndex.get(id) ?? null;
	}

	getAllFileIds(): string[] {
		if (this.dirty) this.rebuild();
		return Array.from(this.cachedFileIndex.keys());
	}

	getMarkersForFile(fileId: string): BaseMarker[] {
		if (this.dirty) this.rebuild();
		return this.cachedFileIndex.get(fileId) ?? [];
	}

	saveMarkers(): void {
		for (const m of this.models) m.saveMarkers();
	}

	updateMarkerFields(markerId: string, fields: { memo?: string; colorOverride?: string }): void {
		for (const m of this.models) {
			if (m.getMarkerById(markerId)) {
				m.updateMarkerFields(markerId, fields);
				return;
			}
		}
	}

	updateDecorations(fileId: string): void {
		for (const m of this.models) m.updateDecorations(fileId);
	}

	removeMarker(markerId: string): boolean {
		for (const m of this.models) {
			if (m.getMarkerById(markerId)) {
				return m.removeMarker(markerId);
			}
		}
		return false;
	}

	renameCode(oldName: string, newName: string): void {
		for (const m of this.models) m.renameCode(oldName, newName);
	}

	deleteCode(codeName: string): void {
		for (const m of this.models) m.deleteCode(codeName);
	}

	getAutoRevealOnSegmentClick(): boolean {
		for (const m of this.models) {
			if (m.getAutoRevealOnSegmentClick) {
				return m.getAutoRevealOnSegmentClick();
			}
		}
		return true;
	}

	setHoverState(markerId: string | null, codeName: string | null, hoveredIds?: string[]): void {
		for (const m of this.models) {
			if (markerId === null) {
				m.setHoverState(null, null);
			} else if (m.getMarkerById(markerId)) {
				m.setHoverState(markerId, codeName, hoveredIds);
			} else {
				m.setHoverState(null, null);
			}
		}
	}

	getHoverMarkerId(): string | null {
		for (const m of this.models) {
			const id = m.getHoverMarkerId();
			if (id) return id;
		}
		return null;
	}

	getHoverMarkerIds(): string[] {
		for (const m of this.models) {
			const ids = m.getHoverMarkerIds();
			if (ids.length > 0) return ids;
		}
		return [];
	}

	onChange(fn: () => void): void {
		const wrapped = () => {
			this.dirty = true;
			fn();
		};
		this.wrappedListeners.set(fn, wrapped);
		for (const m of this.models) m.onChange(wrapped);
	}

	offChange(fn: () => void): void {
		const wrapped = this.wrappedListeners.get(fn);
		if (!wrapped) return;
		this.wrappedListeners.delete(fn);
		for (const m of this.models) m.offChange(wrapped);
	}

	onHoverChange(fn: () => void): void {
		for (const m of this.models) m.onHoverChange(fn);
	}

	offHoverChange(fn: () => void): void {
		for (const m of this.models) m.offHoverChange(fn);
	}
}

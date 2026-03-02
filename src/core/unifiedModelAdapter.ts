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

	constructor(registry: CodeDefinitionRegistry, models: SidebarModelInterface[]) {
		this.registry = registry;
		this.models = models;
	}

	getAllMarkers(): BaseMarker[] {
		return this.models.flatMap(m => m.getAllMarkers());
	}

	getMarkerById(id: string): BaseMarker | null {
		for (const m of this.models) {
			const marker = m.getMarkerById(id);
			if (marker) return marker;
		}
		return null;
	}

	getAllFileIds(): string[] {
		const ids = new Set<string>();
		for (const m of this.models) {
			for (const id of m.getAllFileIds()) ids.add(id);
		}
		return [...ids];
	}

	getMarkersForFile(fileId: string): BaseMarker[] {
		return this.models.flatMap(m => m.getMarkersForFile(fileId));
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
		for (const m of this.models) m.onChange(fn);
	}

	offChange(fn: () => void): void {
		for (const m of this.models) m.offChange(fn);
	}

	onHoverChange(fn: () => void): void {
		for (const m of this.models) m.onHoverChange(fn);
	}

	offHoverChange(fn: () => void): void {
		for (const m of this.models) m.offHoverChange(fn);
	}
}

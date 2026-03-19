/**
 * BaseSidebarAdapter — shared boilerplate for all engine sidebar adapters.
 *
 * Handles listener wrapping (onChange, onHoverChange), hover state proxy,
 * constructor setup, and shared CRUD (deleteCode, updateMarkerFields).
 * Subclasses implement engine-specific methods (getAllMarkers, removeMarker, etc.).
 */

import type { CodeDefinitionRegistry } from './codeDefinitionRegistry';
import type { BaseMarker, SidebarModelInterface } from './types';

/** Minimal model interface that all engine models satisfy for adapter plumbing. */
export interface AdapterModel {
	registry: CodeDefinitionRegistry;
	onChange(fn: () => void): void;
	offChange(fn: () => void): void;
	onHoverChange(fn: (...args: unknown[]) => void): void;
	offHoverChange(fn: (...args: unknown[]) => void): void;
	setHoverState(markerId: string | null, codeName: string | null): void;
	getHoverMarkerId(): string | null;
	getAllMarkers(): Array<{ id: string; codes: string[] }>;
	removeCodeFromMarker(markerId: string, codeName: string, keepIfEmpty?: boolean): void;
	removeMarker(id: string): boolean;
	findMarkerById(id: string): { memo?: string; colorOverride?: string; updatedAt: number } | undefined | null;
}

export abstract class BaseSidebarAdapter implements SidebarModelInterface {
	readonly registry: CodeDefinitionRegistry;
	protected readonly model: AdapterModel;

	private changeListeners = new Map<() => void, () => void>();
	private hoverListeners = new Map<() => void, (...args: unknown[]) => void>();

	constructor(model: AdapterModel) {
		this.model = model;
		this.registry = model.registry;
	}

	// ── Listener wrapping ──

	onChange(fn: () => void): void {
		if (this.changeListeners.has(fn)) return; // prevent duplicate registration
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
		// Remove previous wrapper if re-registering same fn (prevents leak)
		const existing = this.hoverListeners.get(fn);
		if (existing) {
			this.model.offHoverChange(existing);
		}
		const wrapper = (..._args: unknown[]) => fn();
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

	// ── Hover state proxy ──

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

	// ── Abstract — subclasses implement ──

	abstract getAllMarkers(): BaseMarker[];
	abstract getMarkerById(id: string): BaseMarker | null;
	abstract getAllFileIds(): string[];
	abstract getMarkersForFile(fileId: string): BaseMarker[];
	abstract saveMarkers(): void;
	abstract updateDecorations(fileId: string): void;
	abstract removeMarker(markerId: string): boolean;

	// ── Shared implementations (override for engine-specific behavior) ──

	/** Notification after field update. Override per engine (notify, notifyAndSave, etc.) */
	protected abstract notifyAfterFieldUpdate(): void;

	/** Update memo/colorOverride on a marker. PDF overrides for dual text/shape lookup. */
	updateMarkerFields(markerId: string, fields: { memo?: string; colorOverride?: string }): void {
		const m = this.model.findMarkerById(markerId);
		if (!m) return;
		if ('memo' in fields) m.memo = fields.memo;
		if ('colorOverride' in fields) m.colorOverride = fields.colorOverride;
		m.updatedAt = Date.now();
		this.notifyAfterFieldUpdate();
	}

	/** Rename a code across all markers and notify listeners for UI refresh. */
	renameCode(oldName: string, newName: string): void {
		for (const m of this.model.getAllMarkers()) {
			const idx = m.codes.indexOf(oldName);
			if (idx >= 0) {
				m.codes[idx] = newName;
			}
		}
		this.saveMarkers();
		this.notifyAfterFieldUpdate();
	}

	/** Remove a code from all markers and delete its definition. PDF overrides for shapes. */
	deleteCode(codeName: string): void {
		for (const m of this.model.getAllMarkers()) {
			if (m.codes.includes(codeName)) {
				this.model.removeCodeFromMarker(m.id, codeName, true);
			}
		}
		// Clean up orphan markers left with no codes
		for (const m of this.model.getAllMarkers()) {
			if (m.codes.length === 0) {
				this.model.removeMarker(m.id);
			}
		}
		const def = this.registry.getByName(codeName);
		if (def) this.registry.delete(def.id);
		this.saveMarkers();
	}
}

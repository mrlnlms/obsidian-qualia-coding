/**
 * BaseSidebarAdapter — shared boilerplate for all engine sidebar adapters.
 *
 * Handles listener wrapping (onChange, onHoverChange), hover state proxy,
 * and constructor setup. Subclasses implement engine-specific methods
 * (getAllMarkers, updateMarkerFields, removeMarker, deleteCode, etc.).
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
	abstract updateMarkerFields(markerId: string, fields: { memo?: string; colorOverride?: string }): void;
	abstract updateDecorations(fileId: string): void;
	abstract removeMarker(markerId: string): boolean;
	abstract deleteCode(codeName: string): void;
}

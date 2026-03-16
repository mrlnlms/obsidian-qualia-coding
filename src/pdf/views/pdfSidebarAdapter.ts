/**
 * PdfSidebarAdapter — wraps PdfCodingModel into the SidebarModelInterface
 * expected by BaseCodeDetailView and BaseCodeExplorerView.
 *
 * Maps PdfMarker/PdfShapeMarker fields to BaseMarker and merges text markers + shapes
 * into a unified BaseMarker[] stream.
 */

import type { BaseMarker, SidebarModelInterface } from '../../core/types';
import type { CodeDefinitionRegistry } from '../../core/codeDefinitionRegistry';
import type { PdfCodingModel } from '../pdfCodingModel';
import type { PdfMarker, PdfShapeMarker } from '../pdfCodingTypes';

/** Extended BaseMarker carrying PDF-specific metadata for hooks. */
export interface PdfBaseMarker extends BaseMarker {
	/** Page number in the PDF document. */
	page: number;
	/** Whether this marker is a drawn shape (vs text selection). */
	isShape: boolean;
	/** Original text for text markers, empty for shapes. */
	text: string;
	/** Shape label for shapes (e.g. "Rectangle — Page 3"). */
	shapeLabel?: string;
}

function textMarkerToBase(m: PdfMarker, model: PdfCodingModel): PdfBaseMarker {
	return {
		id: m.id,
		fileId: m.fileId,
		codes: m.codes,
		colorOverride: m.colorOverride,
		memo: m.memo,
		createdAt: m.createdAt,
		updatedAt: m.updatedAt,
		page: m.page,
		isShape: false,
		text: m.text,
	};
}

function shapeMarkerToBase(s: PdfShapeMarker, model: PdfCodingModel): PdfBaseMarker {
	return {
		id: s.id,
		fileId: s.fileId,
		codes: s.codes,
		colorOverride: s.colorOverride,
		memo: s.memo,
		createdAt: s.createdAt,
		updatedAt: s.updatedAt,
		page: s.page,
		isShape: true,
		text: '',
		shapeLabel: model.getShapeLabel(s),
	};
}

export class PdfSidebarAdapter implements SidebarModelInterface {
	readonly registry: CodeDefinitionRegistry;
	private model: PdfCodingModel;

	/** Change listeners that wrap PdfCodingModel's ChangeListener. */
	private changeListeners = new Map<() => void, () => void>();
	/** Hover listeners that wrap PdfCodingModel's HoverListener. */
	private hoverListeners = new Map<() => void, (markerId: string | null, codeName: string | null) => void>();

	constructor(model: PdfCodingModel) {
		this.model = model;
		this.registry = model.registry;
	}

	getAllMarkers(): PdfBaseMarker[] {
		const textMarkers = this.model.getAllMarkers().map(m => textMarkerToBase(m, this.model));
		const shapeMarkers = this.model.getAllShapes().map(s => shapeMarkerToBase(s, this.model));
		return [...textMarkers, ...shapeMarkers];
	}

	getMarkerById(id: string): PdfBaseMarker | null {
		const tm = this.model.findMarkerById(id);
		if (tm) return textMarkerToBase(tm, this.model);
		const shape = this.model.findShapeById(id);
		if (shape) return shapeMarkerToBase(shape, this.model);
		return null;
	}

	getAllFileIds(): string[] {
		const fileIds = new Set<string>();
		for (const m of this.model.getAllMarkers()) fileIds.add(m.fileId);
		for (const s of this.model.getAllShapes()) fileIds.add(s.fileId);
		return [...fileIds];
	}

	getMarkersForFile(fileId: string): PdfBaseMarker[] {
		const textMarkers = this.model.getMarkersForFile(fileId).map(m => textMarkerToBase(m, this.model));
		const shapeMarkers = this.model.getShapesForFile(fileId).map(s => shapeMarkerToBase(s, this.model));
		return [...textMarkers, ...shapeMarkers];
	}

	saveMarkers(): void {
		// PdfCodingModel auto-saves on every mutation via notify().
		// This is called from base views for memo/color edits — trigger a save.
		(this.model as any).save?.();
	}

	updateMarkerFields(markerId: string, fields: { memo?: string; colorOverride?: string }): void {
		const tm = this.model.findMarkerById(markerId);
		if (tm) {
			if ('memo' in fields) tm.memo = fields.memo;
			if ('colorOverride' in fields) tm.colorOverride = fields.colorOverride;
			tm.updatedAt = Date.now();
			(this.model as any).notify();
			return;
		}
		const shape = this.model.findShapeById(markerId);
		if (shape) {
			if ('memo' in fields) shape.memo = fields.memo;
			if ('colorOverride' in fields) shape.colorOverride = fields.colorOverride;
			shape.updatedAt = Date.now();
			(this.model as any).notify();
		}
	}

	updateDecorations(_fileId: string): void {
		// PDF highlights are observer-driven, not decoration-driven.
		// Trigger save + change notification to refresh observers (page highlights).
		(this.model as any).notify();
	}

	removeMarker(markerId: string): boolean {
		// Try text marker first
		const tm = this.model.findMarkerById(markerId);
		if (tm) {
			this.model.removeAllCodesFromMarker(markerId);
			return true;
		}
		// Try shape
		const shape = this.model.findShapeById(markerId);
		if (shape) {
			this.model.deleteShape(markerId);
			return true;
		}
		return false;
	}

	deleteCode(codeName: string): void {
		// Remove code from all text markers
		for (const m of this.model.getAllMarkers()) {
			if (m.codes.includes(codeName)) {
				this.model.removeCodeFromMarker(m.id, codeName);
			}
		}
		// Remove code from all shapes
		for (const s of this.model.getAllShapes()) {
			if (s.codes.includes(codeName)) {
				this.model.removeCodeFromShape(s.id, codeName);
			}
		}
		// Delete from registry
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
		// PdfCodingModel.onChange expects () => void — same signature
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
		// PdfCodingModel.onHoverChange expects (markerId, codeName) => void
		// Base views expect () => void — wrap the call
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

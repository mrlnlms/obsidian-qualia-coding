/**
 * PdfSidebarAdapter — wraps PdfCodingModel into the SidebarModelInterface.
 *
 * Maps PdfMarker/PdfShapeMarker fields to BaseMarker and merges text markers + shapes
 * into a unified BaseMarker[] stream.
 */

import type { BaseMarker } from '../../core/types';
import type { PdfCodingModel } from '../pdfCodingModel';
import type { PdfMarker, PdfShapeMarker } from '../pdfCodingTypes';
import { BaseSidebarAdapter } from '../../core/baseSidebarAdapter';

/** Extended BaseMarker carrying PDF-specific metadata for hooks. */
export interface PdfBaseMarker extends BaseMarker {
	page: number;
	isShape: boolean;
	text: string;
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

export class PdfSidebarAdapter extends BaseSidebarAdapter {
	protected declare readonly model: PdfCodingModel;

	constructor(model: PdfCodingModel) {
		super(model);
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
		this.model.save();
	}

	protected override notifyAfterFieldUpdate(): void {
		this.model.notify();
	}

	override updateMarkerFields(markerId: string, fields: { memo?: string; colorOverride?: string }): void {
		const tm = this.model.findMarkerById(markerId);
		if (tm) {
			if ('memo' in fields) tm.memo = fields.memo;
			if ('colorOverride' in fields) tm.colorOverride = fields.colorOverride;
			tm.updatedAt = Date.now();
			this.model.notify();
			return;
		}
		const shape = this.model.findShapeById(markerId);
		if (shape) {
			if ('memo' in fields) shape.memo = fields.memo;
			if ('colorOverride' in fields) shape.colorOverride = fields.colorOverride;
			shape.updatedAt = Date.now();
			this.model.notify();
		}
	}

	updateDecorations(_fileId: string): void {
		this.model.notify();
	}

	removeMarker(markerId: string): boolean {
		const tm = this.model.findMarkerById(markerId);
		if (tm) {
			this.model.removeAllCodesFromMarker(markerId);
			return true;
		}
		const shape = this.model.findShapeById(markerId);
		if (shape) {
			this.model.deleteShape(markerId);
			return true;
		}
		return false;
	}

	deleteCode(codeName: string): void {
		for (const m of this.model.getAllMarkers()) {
			if (m.codes.includes(codeName)) {
				this.model.removeCodeFromMarker(m.id, codeName);
			}
		}
		for (const s of this.model.getAllShapes()) {
			if (s.codes.includes(codeName)) {
				this.model.removeCodeFromShape(s.id, codeName);
			}
		}
		const def = this.registry.getByName(codeName);
		if (def) this.registry.delete(def.id);
		this.saveMarkers();
	}
}

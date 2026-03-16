/**
 * CsvSidebarAdapter — wraps CsvCodingModel into the SidebarModelInterface.
 */

import type { BaseMarker } from '../../core/types';
import type { CsvCodingModel } from '../codingModel';
import type { CsvMarker } from '../codingTypes';
import { BaseSidebarAdapter } from '../../core/baseSidebarAdapter';

export interface CsvBaseMarker extends BaseMarker {
	rowIndex: number;
	columnId: string;
	isSegment: boolean;
	markerLabel: string;
	markerText: string | null;
}

function markerToBase(m: CsvMarker, model: CsvCodingModel): CsvBaseMarker {
	return {
		id: m.id,
		fileId: m.fileId,
		codes: m.codes,
		createdAt: m.createdAt,
		updatedAt: m.updatedAt,
		rowIndex: m.row,
		columnId: m.column,
		isSegment: 'from' in m,
		markerLabel: model.getMarkerLabel(m),
		markerText: model.getMarkerText(m),
	};
}

export class CsvSidebarAdapter extends BaseSidebarAdapter {
	protected declare readonly model: CsvCodingModel;

	constructor(model: CsvCodingModel) {
		super(model);
	}

	getAllMarkers(): CsvBaseMarker[] {
		return this.model.getAllMarkers().map(m => markerToBase(m, this.model));
	}

	getMarkerById(id: string): CsvBaseMarker | null {
		const m = this.model.findMarkerById(id);
		if (m) return markerToBase(m, this.model);
		return null;
	}

	getAllFileIds(): string[] {
		return this.model.getAllFileIds();
	}

	getMarkersForFile(fileId: string): CsvBaseMarker[] {
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
		this.model.notifyAndSave();
	}

	updateDecorations(_fileId: string): void {
		this.model.notifyAndSave();
	}

	removeMarker(markerId: string): boolean {
		const result = this.model.removeMarker(markerId);
		if (result) this.model.notifyAndSave();
		return result;
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
}

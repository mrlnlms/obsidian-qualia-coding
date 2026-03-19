/**
 * CsvSidebarAdapter — wraps CsvCodingModel into the SidebarModelInterface.
 */

import type { BaseMarker } from '../../core/types';
import type { CsvCodingModel } from '../csvCodingModel';
import type { CsvMarker } from '../csvCodingTypes';
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
		markerType: 'csv',
		id: m.id,
		fileId: m.fileId,
		codes: m.codes,
		memo: m.memo,
		colorOverride: m.colorOverride,
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

	protected override notifyAfterFieldUpdate(): void {
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

}

import type { DataManager } from '../core/dataManager';
import type { CodeDefinitionRegistry } from '../core/codeDefinitionRegistry';
import type { SegmentMarker, RowMarker, CsvMarker, CodingSnapshot } from './csvCodingTypes';

type ChangeListener = () => void;
type HoverListener = (markerId: string | null, codeName: string | null) => void;

export class CsvCodingModel {
	readonly registry: CodeDefinitionRegistry;
	private dm: DataManager;
	private segmentMarkers: SegmentMarker[] = [];
	private rowMarkers: RowMarker[] = [];
	private listeners: ChangeListener[] = [];
	private hoverListeners: HoverListener[] = [];
	private _hoveredMarkerId: string | null = null;
	private _hoveredCodeName: string | null = null;
	private _hoveredMarkerIds: string[] = [];

	/** Cache of row data per file — populated by CsvCodingView on load, cleared on unload */
	rowDataCache: Map<string, Record<string, string>[]> = new Map();

	constructor(dm: DataManager, registry: CodeDefinitionRegistry) {
		this.dm = dm;
		this.registry = registry;
		this.loadFromDataManager();
	}

	// ── Persistence ──

	private loadFromDataManager(): void {
		const data = this.dm.section('csv');
		if (data.segmentMarkers) this.segmentMarkers = data.segmentMarkers;
		if (data.rowMarkers) this.rowMarkers = data.rowMarkers;
	}

	saveMarkers(): void {
		this.dm.setSection('csv', {
			segmentMarkers: this.segmentMarkers,
			rowMarkers: this.rowMarkers,
		});
	}

	private notify(): void {
		this.saveMarkers();
		for (const fn of this.listeners) fn();
	}

	onChange(fn: ChangeListener): void {
		this.listeners.push(fn);
	}

	offChange(fn: ChangeListener): void {
		this.listeners = this.listeners.filter(l => l !== fn);
	}

	// ── Hover state ──

	setHoverState(markerId: string | null, codeName: string | null, hoveredIds?: string[]): void {
		const newIds = hoveredIds ?? (markerId ? [markerId] : []);
		if (this._hoveredMarkerId === markerId && this._hoveredCodeName === codeName
			&& this._hoveredMarkerIds.length === newIds.length) return;
		this._hoveredMarkerId = markerId;
		this._hoveredCodeName = codeName;
		this._hoveredMarkerIds = newIds;
		for (const fn of this.hoverListeners) fn(markerId, codeName);
	}

	getHoverMarkerId(): string | null { return this._hoveredMarkerId; }
	getHoverCodeName(): string | null { return this._hoveredCodeName; }
	getHoverMarkerIds(): string[] { return this._hoveredMarkerIds; }

	onHoverChange(fn: HoverListener): void {
		this.hoverListeners.push(fn);
	}

	offHoverChange(fn: HoverListener): void {
		this.hoverListeners = this.hoverListeners.filter(l => l !== fn);
	}

	// ── Row Markers ──

	getRowMarkersForCell(file: string, row: number, column: string): RowMarker[] {
		return this.rowMarkers.filter(m => m.fileId === file && m.row === row && m.column === column);
	}

	findOrCreateRowMarker(file: string, row: number, column: string): RowMarker {
		const existing = this.rowMarkers.find(m => m.fileId === file && m.row === row && m.column === column);
		if (existing) return existing;
		const marker: RowMarker = {
			id: this.generateId(),
			fileId: file, row, column,
			codes: [],
			createdAt: Date.now(),
			updatedAt: Date.now(),
		};
		this.rowMarkers.push(marker);
		return marker;
	}

	// ── Segment Markers ──

	getSegmentMarkersForCell(file: string, row: number, column: string): SegmentMarker[] {
		return this.segmentMarkers.filter(m => m.fileId === file && m.row === row && m.column === column);
	}

	findOrCreateSegmentMarker(snapshot: CodingSnapshot): SegmentMarker {
		const existing = this.segmentMarkers.find(m =>
			m.fileId === snapshot.fileId && m.row === snapshot.row && m.column === snapshot.column &&
			m.from === snapshot.from && m.to === snapshot.to
		);
		if (existing) return existing;
		const marker: SegmentMarker = {
			id: this.generateId(),
			fileId: snapshot.fileId,
			row: snapshot.row,
			column: snapshot.column,
			from: snapshot.from,
			to: snapshot.to,
			codes: [],
			createdAt: Date.now(),
			updatedAt: Date.now(),
		};
		this.segmentMarkers.push(marker);
		return marker;
	}

	// ── Code assignment (works for both marker types) ──

	addCodeToMarker(markerId: string, codeName: string): void {
		this.registry.create(codeName);
		const marker = this.findMarkerById(markerId);
		if (!marker) return;
		if (!marker.codes.includes(codeName)) {
			marker.codes.push(codeName);
			marker.updatedAt = Date.now();
			this.notify();
		}
	}

	removeCodeFromMarker(markerId: string, codeName: string, keepIfEmpty = false): void {
		const marker = this.findMarkerById(markerId);
		if (!marker) return;
		marker.codes = marker.codes.filter(c => c !== codeName);
		marker.updatedAt = Date.now();
		if (marker.codes.length === 0 && !keepIfEmpty) {
			this.removeMarker(markerId);
		}
		this.notify();
	}

	// ── Lookup helpers ──

	findMarkerById(id: string): CsvMarker | undefined {
		return this.segmentMarkers.find(m => m.id === id) || this.rowMarkers.find(m => m.id === id);
	}

	getCodesForCell(file: string, row: number, column: string, type: 'segment' | 'row'): string[] {
		const markers = type === 'segment'
			? this.getSegmentMarkersForCell(file, row, column)
			: this.getRowMarkersForCell(file, row, column);
		const codes = new Set<string>();
		for (const m of markers) for (const c of m.codes) codes.add(c);
		return Array.from(codes);
	}

	getAllCodes() {
		return this.registry.getAll();
	}

	getAllMarkers(): CsvMarker[] {
		return [...this.segmentMarkers, ...this.rowMarkers];
	}

	migrateFilePath(oldPath: string, newPath: string): void {
		let changed = false;
		for (const m of this.segmentMarkers) {
			if (m.fileId === oldPath) { m.fileId = newPath; changed = true; }
		}
		for (const m of this.rowMarkers) {
			if (m.fileId === oldPath) { m.fileId = newPath; changed = true; }
		}
		// Migrate rowDataCache key to avoid orphaned entries
		const cachedRows = this.rowDataCache.get(oldPath);
		if (cachedRows) {
			this.rowDataCache.delete(oldPath);
			this.rowDataCache.set(newPath, cachedRows);
		}
		if (changed) this.notify();
	}

	getAllFileIds(): string[] {
		const ids = new Set<string>();
		for (const m of this.segmentMarkers) ids.add(m.fileId);
		for (const m of this.rowMarkers) ids.add(m.fileId);
		return Array.from(ids);
	}

	getMarkersForFile(fileId: string): CsvMarker[] {
		return this.getAllMarkers().filter(m => m.fileId === fileId);
	}

	getMarkerText(marker: CsvMarker): string | null {
		const rows = this.rowDataCache.get(marker.fileId);
		if (!rows || !rows[marker.row]) return null;
		const rawValue = rows[marker.row]![marker.column];
		if (rawValue == null) return null;
		const cellText = String(rawValue);
		if ('from' in marker && 'to' in marker) {
			return cellText.substring(marker.from, marker.to);
		}
		return cellText;
	}

	getMarkerLabel(marker: CsvMarker): string {
		const isSegment = 'from' in marker;
		return `Row ${marker.row + 1} · ${marker.column}${isSegment ? ' (seg)' : ''}`;
	}

	clearAllMarkers(): void {
		this.segmentMarkers = [];
		this.rowMarkers = [];
		this.notify();
	}

	deleteSegmentMarkersForCell(file: string, row: number, column: string): void {
		this.segmentMarkers = this.segmentMarkers.filter(
			m => !(m.fileId === file && m.row === row && m.column === column)
		);
	}

	notifyAndSave(): void {
		this.notify();
	}

	// ── Private ──

	removeMarker(id: string): boolean {
		const segIdx = this.segmentMarkers.findIndex(m => m.id === id);
		if (segIdx >= 0) { this.segmentMarkers.splice(segIdx, 1); return true; }
		const rowIdx = this.rowMarkers.findIndex(m => m.id === id);
		if (rowIdx >= 0) { this.rowMarkers.splice(rowIdx, 1); return true; }
		return false;
	}

	private generateId(): string {
		return Date.now().toString(36) + Math.random().toString(36).substring(2);
	}
}

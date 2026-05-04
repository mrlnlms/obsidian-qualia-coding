import type { DataManager } from '../core/dataManager';
import type { CodeDefinitionRegistry } from '../core/codeDefinitionRegistry';
import type { SegmentMarker, RowMarker, CsvMarker, CodingSnapshot } from './csvCodingTypes';
import { hasCode, getCodeIds, addCodeApplication, removeCodeApplication, normalizeCodeApplications } from '../core/codeApplicationHelpers';
import type { RowProvider } from './duckdb';

type ChangeListener = () => void;
type HoverListener = (markerId: string | null, codeName: string | null) => void;

export class CsvCodingModel {
	readonly registry: CodeDefinitionRegistry;
	readonly dm: DataManager;
	private segmentMarkers: SegmentMarker[] = [];
	private rowMarkers: RowMarker[] = [];
	private listeners: ChangeListener[] = [];
	private hoverListeners: HoverListener[] = [];
	private _hoveredMarkerId: string | null = null;
	private _hoveredCodeName: string | null = null;
	private _hoveredMarkerIds: string[] = [];

	/** Cache of row data per file — populated by CsvCodingView on load, cleared on unload */
	rowDataCache: Map<string, Record<string, string>[]> = new Map();

	/**
	 * Lazy-mode RowProviders per fileId. Populated by CsvCodingView when entering
	 * lazy mode for a file; cleared on unload. Used by getMarkerTextAsync to
	 * resolve text on demand from DuckDB+OPFS.
	 */
	private lazyProviders: Map<string, RowProvider> = new Map();

	constructor(dm: DataManager, registry: CodeDefinitionRegistry) {
		this.dm = dm;
		this.registry = registry;
		this.loadFromDataManager();
	}

	// ── Persistence ──

	private loadFromDataManager(): void {
		const data = this.dm.section('csv');
		let mutated = false;

		this.segmentMarkers = data.segmentMarkers;
		for (const m of this.segmentMarkers) {
			const result = normalizeCodeApplications(m.codes, this.registry);
			if (result.changed) {
				m.codes = result.normalized;
				mutated = true;
			}
		}

		this.rowMarkers = data.rowMarkers;
		for (const m of this.rowMarkers) {
			const result = normalizeCodeApplications(m.codes, this.registry);
			if (result.changed) {
				m.codes = result.normalized;
				mutated = true;
			}
		}

		if (mutated) this.saveMarkers();
	}

	/** Reload marker state from DataManager and notify listeners. Used after bulk imports. */
	reload(): void {
		this.loadFromDataManager();
		for (const fn of this.listeners) fn();
	}

	saveMarkers(): void {
		this.dm.setSection('csv', {
			segmentMarkers: this.segmentMarkers,
			rowMarkers: this.rowMarkers,
		});
	}

	notify(): void {
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

	getRowMarkersForCell(file: string, sourceRowId: number, column: string): RowMarker[] {
		return this.rowMarkers.filter(m => m.fileId === file && m.sourceRowId === sourceRowId && m.column === column);
	}

	findOrCreateRowMarker(file: string, sourceRowId: number, column: string): RowMarker {
		const existing = this.rowMarkers.find(m => m.fileId === file && m.sourceRowId === sourceRowId && m.column === column);
		if (existing) return existing;
		const marker: RowMarker = {
			id: this.generateId(),
			fileId: file, sourceRowId, column,
			codes: [],
			createdAt: Date.now(),
			updatedAt: Date.now(),
		};
		this.rowMarkers.push(marker);
		return marker;
	}

	// ── Bulk Row operations ──
	//
	// Per-marker `findOrCreateRowMarker` + `addCodeToMarker`/`removeCodeFromMarker`
	// is O(R × M) and notifies once per row — unusable for batch coding on
	// large files (660k+ rows). The bulk variants below build a single index
	// from `rowMarkers`, mutate in place, and emit one `notify()` at the end.

	private buildRowMarkerIndex(file: string, column: string): Map<number, RowMarker> {
		const idx = new Map<number, RowMarker>();
		for (const m of this.rowMarkers) {
			if (m.fileId === file && m.column === column) {
				idx.set(m.sourceRowId, m);
			}
		}
		return idx;
	}

	addCodeToManyRows(file: string, sourceRowIds: ReadonlyArray<number>, column: string, codeId: string): void {
		if (sourceRowIds.length === 0) return;
		const idx = this.buildRowMarkerIndex(file, column);
		const now = Date.now();
		let mutated = false;
		for (const rowId of sourceRowIds) {
			let marker = idx.get(rowId);
			if (!marker) {
				marker = {
					id: this.generateId(),
					fileId: file, sourceRowId: rowId, column,
					codes: [],
					createdAt: now,
					updatedAt: now,
				};
				this.rowMarkers.push(marker);
				idx.set(rowId, marker);
				mutated = true;
			}
			if (!hasCode(marker.codes, codeId)) {
				marker.codes = addCodeApplication(marker.codes, codeId);
				marker.updatedAt = now;
				mutated = true;
			}
		}
		if (mutated) this.notify();
	}

	removeCodeFromManyRows(file: string, sourceRowIds: ReadonlyArray<number>, column: string, codeId: string): void {
		if (sourceRowIds.length === 0) return;
		const idx = this.buildRowMarkerIndex(file, column);
		const now = Date.now();
		let mutated = false;
		const toDeleteIds = new Set<string>();
		for (const rowId of sourceRowIds) {
			const marker = idx.get(rowId);
			if (!marker || !hasCode(marker.codes, codeId)) continue;
			marker.codes = removeCodeApplication(marker.codes, codeId);
			marker.updatedAt = now;
			mutated = true;
			if (marker.codes.length === 0) toDeleteIds.add(marker.id);
		}
		if (toDeleteIds.size > 0) {
			this.rowMarkers = this.rowMarkers.filter(m => !toDeleteIds.has(m.id));
		}
		if (mutated) this.notify();
	}

	/** Removes all row markers for the given (file, column, sourceRowId) tuples. */
	removeAllRowMarkersFromMany(file: string, sourceRowIds: ReadonlyArray<number>, column: string): void {
		if (sourceRowIds.length === 0) return;
		const rowSet = new Set(sourceRowIds);
		const before = this.rowMarkers.length;
		this.rowMarkers = this.rowMarkers.filter(m =>
			!(m.fileId === file && m.column === column && rowSet.has(m.sourceRowId))
		);
		if (this.rowMarkers.length !== before) this.notify();
	}

	/**
	 * Returns the set of codeIds present in EVERY supplied row (intersection).
	 * Empty if any row has no markers, or if `sourceRowIds` is empty.
	 *
	 * Single pass over `rowMarkers` to build per-row code sets; intersection
	 * walks the visible rows with early-exit on empty intersection. O(M + R)
	 * worst-case, much faster than the O(K × R × M) naive approach.
	 */
	getCodeIntersectionForRows(file: string, sourceRowIds: ReadonlyArray<number>, column: string): Set<string> {
		if (sourceRowIds.length === 0) return new Set();
		const rowCodes = new Map<number, Set<string>>();
		for (const m of this.rowMarkers) {
			if (m.fileId !== file || m.column !== column) continue;
			let set = rowCodes.get(m.sourceRowId);
			if (!set) { set = new Set(); rowCodes.set(m.sourceRowId, set); }
			for (const id of getCodeIds(m.codes)) set.add(id);
		}
		let intersect: Set<string> | null = null;
		for (const rowId of sourceRowIds) {
			const codes = rowCodes.get(rowId);
			if (!codes || codes.size === 0) return new Set();
			if (intersect === null) {
				intersect = new Set(codes);
			} else {
				for (const id of intersect) if (!codes.has(id)) intersect.delete(id);
				if (intersect.size === 0) return new Set();
			}
		}
		return intersect ?? new Set();
	}

	// ── Segment Markers ──

	getSegmentMarkersForCell(file: string, sourceRowId: number, column: string): SegmentMarker[] {
		return this.segmentMarkers.filter(m => m.fileId === file && m.sourceRowId === sourceRowId && m.column === column);
	}

	findOrCreateSegmentMarker(snapshot: CodingSnapshot): SegmentMarker {
		const existing = this.segmentMarkers.find(m =>
			m.fileId === snapshot.fileId && m.sourceRowId === snapshot.sourceRowId && m.column === snapshot.column &&
			m.from === snapshot.from && m.to === snapshot.to
		);
		if (existing) return existing;
		const marker: SegmentMarker = {
			id: this.generateId(),
			fileId: snapshot.fileId,
			sourceRowId: snapshot.sourceRowId,
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

	addCodeToMarker(markerId: string, codeId: string): void {
		const marker = this.findMarkerById(markerId);
		if (!marker) return;
		if (!hasCode(marker.codes, codeId)) {
			marker.codes = addCodeApplication(marker.codes, codeId);
			marker.updatedAt = Date.now();
			this.notify();
		}
	}

	removeCodeFromMarker(markerId: string, codeId: string, keepIfEmpty = false): void {
		const marker = this.findMarkerById(markerId);
		if (!marker) return;
		marker.codes = removeCodeApplication(marker.codes, codeId);
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

	getCodesForCell(file: string, sourceRowId: number, column: string, type: 'segment' | 'row'): string[] {
		const markers = type === 'segment'
			? this.getSegmentMarkersForCell(file, sourceRowId, column)
			: this.getRowMarkersForCell(file, sourceRowId, column);
		const codeIds = new Set<string>();
		for (const m of markers) for (const id of getCodeIds(m.codes)) codeIds.add(id);
		return Array.from(codeIds);
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
		if (!rows || !rows[marker.sourceRowId]) return null;
		const rawValue = rows[marker.sourceRowId]![marker.column];
		if (rawValue == null) return null;
		const cellText = String(rawValue);
		if ('from' in marker && 'to' in marker) {
			return cellText.substring(marker.from, marker.to);
		}
		return cellText;
	}

	/**
	 * Async marker text resolution. In eager mode this delegates to the sync path
	 * (rowDataCache hit) and returns immediately. In lazy mode (no rowDataCache,
	 * but a RowProvider registered for the fileId) it queries DuckDB.
	 */
	async getMarkerTextAsync(marker: CsvMarker): Promise<string | null> {
		const eager = this.getMarkerText(marker);
		if (eager !== null) return eager;
		const provider = this.lazyProviders.get(marker.fileId);
		if (!provider) return null;
		const cellText = await provider.getMarkerText({
			sourceRowId: marker.sourceRowId,
			column: marker.column,
		});
		if (cellText == null) return null;
		if ('from' in marker && 'to' in marker) {
			return cellText.substring(marker.from, marker.to);
		}
		return cellText;
	}

	registerLazyProvider(fileId: string, provider: RowProvider): void {
		this.lazyProviders.set(fileId, provider);
	}

	unregisterLazyProvider(fileId: string): void {
		this.lazyProviders.delete(fileId);
	}

	getMarkerLabel(marker: CsvMarker): string {
		const isSegment = 'from' in marker;
		return `Row ${marker.sourceRowId + 1} · ${marker.column}${isSegment ? ' (seg)' : ''}`;
	}

	clearAllMarkers(): void {
		this.segmentMarkers = [];
		this.rowMarkers = [];
		this.notify();
	}

	deleteSegmentMarkersForCell(file: string, sourceRowId: number, column: string): void {
		this.segmentMarkers = this.segmentMarkers.filter(
			m => !(m.fileId === file && m.sourceRowId === sourceRowId && m.column === column)
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

	removeAllMarkersForFile(fileId: string): number {
		const beforeSeg = this.segmentMarkers.length;
		const beforeRow = this.rowMarkers.length;
		this.segmentMarkers = this.segmentMarkers.filter(m => m.fileId !== fileId);
		this.rowMarkers = this.rowMarkers.filter(m => m.fileId !== fileId);
		const removed = (beforeSeg - this.segmentMarkers.length) + (beforeRow - this.rowMarkers.length);
		if (removed > 0) this.notify();
		return removed;
	}

	private generateId(): string {
		return Date.now().toString(36) + Math.random().toString(36).substring(2);
	}
}

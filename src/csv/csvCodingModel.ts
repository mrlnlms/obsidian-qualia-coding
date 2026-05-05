import type { DataManager } from '../core/dataManager';
import type { CodeDefinitionRegistry } from '../core/codeDefinitionRegistry';
import type { MarkerMutationEvent } from '../core/types';
import type { SegmentMarker, RowMarker, CsvMarker, CodingSnapshot } from './csvCodingTypes';
import { hasCode, getCodeIds, addCodeApplication, removeCodeApplication, normalizeCodeApplications } from '../core/codeApplicationHelpers';
import type { RowProvider, MarkerRef } from './duckdb';

type ChangeListener = () => void;
type HoverListener = (markerId: string | null, codeName: string | null) => void;

export class CsvCodingModel {
	readonly registry: CodeDefinitionRegistry;
	readonly dm: DataManager;
	private segmentMarkers: SegmentMarker[] = [];
	private rowMarkers: RowMarker[] = [];
	private listeners: ChangeListener[] = [];
	private markerMutationListeners = new Set<(event: MarkerMutationEvent) => void>();
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

	/**
	 * Marker preview cache: markerId → resolved excerpt (cellText for row markers,
	 * `cellText.substring(from, to)` for segment markers). Populated on file load
	 * in lazy mode (via populateMarkerTextCacheForFile) and on add/async hit.
	 * Cleared per-file on unload + per-marker on remove. Sync `getMarkerText`
	 * checks this first so all UI consumers (sidebar, detail, evidence list)
	 * stay sync without cascading async into core/.
	 */
	private markerTextCache: Map<string, string> = new Map();

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

	/** Fire change listeners without persisting — used after preview cache top-ups
	 *  in lazy mode to trigger a UI re-render without spurious data.json writes. */
	notifyListenersOnly(): void {
		for (const fn of this.listeners) fn();
	}

	onChange(fn: ChangeListener): void {
		this.listeners.push(fn);
	}

	// SC3 granular mutation channel.
	onMarkerMutation(fn: (event: MarkerMutationEvent) => void): void { this.markerMutationListeners.add(fn); }
	offMarkerMutation(fn: (event: MarkerMutationEvent) => void): void { this.markerMutationListeners.delete(fn); }
	private emitMarkerMutation(args: { fileId: string; markerId: string; prevCodeIds: string[]; nextCodeIds: string[]; codeIds: string[]; marker: CsvMarker | undefined }): void {
		const event: MarkerMutationEvent = {
			engine: 'csv',
			fileId: args.fileId,
			markerId: args.markerId,
			prevCodeIds: args.prevCodeIds,
			nextCodeIds: args.nextCodeIds,
			codeIds: args.codeIds,
			marker: args.marker as unknown as MarkerMutationEvent['marker'],
		};
		for (const fn of this.markerMutationListeners) fn(event);
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
			markerType: 'csv',
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
			let prevCodeIds: string[];
			let rowMutated = false;
			if (!marker) {
				marker = {
					markerType: 'csv',
					id: this.generateId(),
					fileId: file, sourceRowId: rowId, column,
					codes: [],
					createdAt: now,
					updatedAt: now,
				};
				this.rowMarkers.push(marker);
				idx.set(rowId, marker);
				prevCodeIds = [];
				rowMutated = true;
			} else {
				prevCodeIds = marker.codes.map(c => c.codeId);
			}
			if (!hasCode(marker.codes, codeId)) {
				marker.codes = addCodeApplication(marker.codes, codeId);
				marker.updatedAt = now;
				rowMutated = true;
			}
			if (rowMutated) {
				mutated = true;
				this.emitMarkerMutation({
					fileId: file, markerId: marker.id,
					prevCodeIds, nextCodeIds: marker.codes.map(c => c.codeId),
					codeIds: [codeId], marker,
				});
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
			const prevCodeIds = marker.codes.map(c => c.codeId);
			marker.codes = removeCodeApplication(marker.codes, codeId);
			marker.updatedAt = now;
			mutated = true;
			const willDelete = marker.codes.length === 0;
			if (willDelete) toDeleteIds.add(marker.id);
			this.emitMarkerMutation({
				fileId: file, markerId: marker.id,
				prevCodeIds, nextCodeIds: willDelete ? [] : marker.codes.map(c => c.codeId),
				codeIds: [codeId], marker: willDelete ? undefined : marker,
			});
		}
		if (toDeleteIds.size > 0) {
			for (const id of toDeleteIds) this.markerTextCache.delete(id);
			this.rowMarkers = this.rowMarkers.filter(m => !toDeleteIds.has(m.id));
		}
		if (mutated) this.notify();
	}

	/** Removes all row markers for the given (file, column, sourceRowId) tuples. */
	removeAllRowMarkersFromMany(file: string, sourceRowIds: ReadonlyArray<number>, column: string): void {
		if (sourceRowIds.length === 0) return;
		const rowSet = new Set(sourceRowIds);
		const before = this.rowMarkers.length;
		const removed = this.rowMarkers.filter(m =>
			m.fileId === file && m.column === column && rowSet.has(m.sourceRowId)
		);
		for (const m of removed) {
			this.markerTextCache.delete(m.id);
			const codes = m.codes.map(c => c.codeId);
			this.emitMarkerMutation({
				fileId: m.fileId, markerId: m.id,
				prevCodeIds: codes, nextCodeIds: [],
				codeIds: codes, marker: undefined,
			});
		}
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
			markerType: 'csv',
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
			const prevCodeIds = marker.codes.map(c => c.codeId);
			marker.codes = addCodeApplication(marker.codes, codeId);
			marker.updatedAt = Date.now();
			this.emitMarkerMutation({
				fileId: marker.fileId, markerId,
				prevCodeIds, nextCodeIds: marker.codes.map(c => c.codeId),
				codeIds: [codeId], marker,
			});
			this.notify();
		}
	}

	removeCodeFromMarker(markerId: string, codeId: string, keepIfEmpty = false): void {
		const marker = this.findMarkerById(markerId);
		if (!marker) return;
		const prevCodeIds = marker.codes.map(c => c.codeId);
		marker.codes = removeCodeApplication(marker.codes, codeId);
		marker.updatedAt = Date.now();
		if (marker.codes.length === 0 && !keepIfEmpty) {
			// removeMarker emite REMOVE event próprio.
			this.removeMarker(markerId);
		} else {
			this.emitMarkerMutation({
				fileId: marker.fileId, markerId,
				prevCodeIds, nextCodeIds: marker.codes.map(c => c.codeId),
				codeIds: [codeId], marker,
			});
			this.notify();
		}
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
		const renamed: Array<{ id: string; codes: string[]; marker: CsvMarker }> = [];
		for (const m of this.segmentMarkers) {
			if (m.fileId === oldPath) {
				renamed.push({ id: m.id, codes: m.codes.map(c => c.codeId), marker: m });
				m.fileId = newPath;
			}
		}
		for (const m of this.rowMarkers) {
			if (m.fileId === oldPath) {
				renamed.push({ id: m.id, codes: m.codes.map(c => c.codeId), marker: m });
				m.fileId = newPath;
			}
		}
		// Migrate rowDataCache key to avoid orphaned entries
		const cachedRows = this.rowDataCache.get(oldPath);
		if (cachedRows) {
			this.rowDataCache.delete(oldPath);
			this.rowDataCache.set(newPath, cachedRows);
		}
		if (renamed.length === 0) return;
		for (const r of renamed) {
			this.emitMarkerMutation({
				fileId: oldPath, markerId: r.id,
				prevCodeIds: r.codes, nextCodeIds: [],
				codeIds: r.codes, marker: undefined,
			});
			this.emitMarkerMutation({
				fileId: newPath, markerId: r.id,
				prevCodeIds: [], nextCodeIds: r.codes,
				codeIds: r.codes, marker: r.marker,
			});
		}
		this.notify();
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
		const cached = this.markerTextCache.get(marker.id);
		if (cached !== undefined) return cached;
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
	 * Async marker text resolution. Delegates to the sync path (cache → eager
	 * rowDataCache); falls back to DuckDB query in lazy mode when neither has
	 * the marker. Populates the cache on async hit so subsequent sync reads
	 * hit immediately (e.g., reopening a marker detail).
	 */
	async getMarkerTextAsync(marker: CsvMarker): Promise<string | null> {
		const sync = this.getMarkerText(marker);
		if (sync !== null) return sync;
		const provider = this.lazyProviders.get(marker.fileId);
		if (!provider) return null;
		const cellText = await provider.getMarkerText({
			sourceRowId: marker.sourceRowId,
			column: marker.column,
		});
		if (cellText == null) return null;
		const text = ('from' in marker && 'to' in marker)
			? cellText.substring(marker.from, marker.to)
			: cellText;
		this.markerTextCache.set(marker.id, text);
		return text;
	}

	registerLazyProvider(fileId: string, provider: RowProvider): void {
		this.lazyProviders.set(fileId, provider);
	}

	unregisterLazyProvider(fileId: string): void {
		this.lazyProviders.delete(fileId);
	}

	/**
	 * Pre-populate the markerText cache for all markers in a file via batched
	 * DuckDB queries. Called on lazy file load — UI stays sync for previews.
	 *
	 * Chunked to keep IN clauses bounded (default 1000 markers/chunk). Refs are
	 * deduped per (sourceRowId, column) inside each chunk so multiple markers
	 * sharing a cell trigger a single fetch. Failures fall through silently —
	 * `getMarkerText` returns null on cache miss and the UI shows the marker
	 * without a preview rather than crashing.
	 */
	async populateMarkerTextCacheForFile(
		fileId: string,
		provider: RowProvider,
		opts: { chunkSize?: number } = {},
	): Promise<void> {
		const chunkSize = opts.chunkSize ?? 1000;
		const markers = this.getMarkersForFile(fileId);
		if (markers.length === 0) return;

		for (let i = 0; i < markers.length; i += chunkSize) {
			const slice = markers.slice(i, i + chunkSize);
			// Dedupe refs per (sourceRowId, column) — same cell may host multiple markers.
			const seen = new Set<string>();
			const refs: MarkerRef[] = [];
			for (const m of slice) {
				const key = `${m.sourceRowId}|${m.column}`;
				if (seen.has(key)) continue;
				seen.add(key);
				refs.push({ sourceRowId: m.sourceRowId, column: m.column });
			}
			const texts = await provider.batchGetMarkerText(refs);
			for (const m of slice) {
				const cellText = texts.get(`${m.sourceRowId}|${m.column}`);
				if (cellText == null) continue;
				const text = ('from' in m && 'to' in m)
					? cellText.substring(m.from, m.to)
					: cellText;
				this.markerTextCache.set(m.id, text);
			}
		}
	}

	/** Cache an already-known excerpt (from popovers that read the cell to code it). */
	cacheMarkerText(markerId: string, text: string): void {
		this.markerTextCache.set(markerId, text);
	}

	/**
	 * Idempotent variant of populate — only fetches markers without a cache hit.
	 * Used by the lazy view's onChange listener to top up after add operations
	 * without re-fetching previews already in cache. Returns the count of newly
	 * cached markers so the caller can decide whether to fire a UI re-render.
	 */
	async populateMissingMarkerTextsForFile(
		fileId: string,
		provider: RowProvider,
		opts: { chunkSize?: number } = {},
	): Promise<number> {
		const chunkSize = opts.chunkSize ?? 1000;
		const missing = this.getMarkersForFile(fileId).filter(m => !this.markerTextCache.has(m.id));
		if (missing.length === 0) return 0;

		let added = 0;
		for (let i = 0; i < missing.length; i += chunkSize) {
			const slice = missing.slice(i, i + chunkSize);
			const seen = new Set<string>();
			const refs: MarkerRef[] = [];
			for (const m of slice) {
				const key = `${m.sourceRowId}|${m.column}`;
				if (seen.has(key)) continue;
				seen.add(key);
				refs.push({ sourceRowId: m.sourceRowId, column: m.column });
			}
			const texts = await provider.batchGetMarkerText(refs);
			for (const m of slice) {
				const cellText = texts.get(`${m.sourceRowId}|${m.column}`);
				if (cellText == null) continue;
				const text = ('from' in m && 'to' in m)
					? cellText.substring(m.from, m.to)
					: cellText;
				this.markerTextCache.set(m.id, text);
				added += 1;
			}
		}
		return added;
	}

	/** Drop all preview cache entries for markers in a file. Called on unload. */
	clearMarkerTextCacheForFile(fileId: string): void {
		for (const m of this.getMarkersForFile(fileId)) {
			this.markerTextCache.delete(m.id);
		}
	}

	/** Test/diagnostics — peek the cache size. */
	getMarkerTextCacheSize(): number {
		return this.markerTextCache.size;
	}

	/**
	 * Pra parear com markdown/pdf/audio/video, label preferred is the cell excerpt
	 * (segment: substring `from..to`; row: célula inteira). Coordenada `Row X · Column`
	 * fica como fallback quando o cell text não está disponível (rowDataCache miss
	 * em eager, markerTextCache miss em lazy antes do populate).
	 */
	getMarkerLabel(marker: CsvMarker): string {
		const text = this.getMarkerText(marker);
		if (text != null) {
			const trimmed = text.trim();
			if (trimmed.length > 0) {
				return trimmed.length > 60 ? trimmed.slice(0, 60) + '…' : trimmed;
			}
		}
		const isSegment = 'from' in marker;
		return `Row ${marker.sourceRowId + 1} · ${marker.column}${isSegment ? ' (seg)' : ''}`;
	}

	clearAllMarkers(): void {
		this.segmentMarkers = [];
		this.rowMarkers = [];
		this.markerTextCache.clear();
		this.notify();
	}

	deleteSegmentMarkersForCell(file: string, sourceRowId: number, column: string): void {
		const matches = this.segmentMarkers.filter(
			m => m.fileId === file && m.sourceRowId === sourceRowId && m.column === column,
		);
		for (const m of matches) this.markerTextCache.delete(m.id);
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
		if (segIdx >= 0) {
			const removed = this.segmentMarkers[segIdx]!;
			this.segmentMarkers.splice(segIdx, 1);
			this.markerTextCache.delete(id);
			this.emitMarkerMutation({
				fileId: removed.fileId, markerId: id,
				prevCodeIds: removed.codes.map(c => c.codeId), nextCodeIds: [],
				codeIds: removed.codes.map(c => c.codeId), marker: undefined,
			});
			return true;
		}
		const rowIdx = this.rowMarkers.findIndex(m => m.id === id);
		if (rowIdx >= 0) {
			const removed = this.rowMarkers[rowIdx]!;
			this.rowMarkers.splice(rowIdx, 1);
			this.markerTextCache.delete(id);
			this.emitMarkerMutation({
				fileId: removed.fileId, markerId: id,
				prevCodeIds: removed.codes.map(c => c.codeId), nextCodeIds: [],
				codeIds: removed.codes.map(c => c.codeId), marker: undefined,
			});
			return true;
		}
		return false;
	}

	removeAllMarkersForFile(fileId: string): number {
		const beforeSeg = this.segmentMarkers.length;
		const beforeRow = this.rowMarkers.length;
		// Drop cache entries before filtering — getMarkersForFile after the splice would return [].
		this.clearMarkerTextCacheForFile(fileId);
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

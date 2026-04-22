import type { PdfMarker, PdfShapeMarker, NormalizedShapeCoords } from './pdfCodingTypes';
import type { CodeDefinitionRegistry } from '../core/codeDefinitionRegistry';
import type { DataManager } from '../core/dataManager';
import type { CodeDefinition, CodeApplication } from '../core/types';
import { hasCode, addCodeApplication, removeCodeApplication, normalizeCodeApplications } from '../core/codeApplicationHelpers';

// ── Undo types ──
interface UndoEntry {
	type: 'addCode' | 'removeCode' | 'removeAllCodes' | 'resizeMarker';
	markerId: string;
	data: PdfMarker;
}

const MAX_UNDO = 50;

// ── PdfCodingModel ──
type ChangeListener = () => void;
type HoverListener = (markerId: string | null, codeName: string | null) => void;

export class PdfCodingModel {
	readonly registry: CodeDefinitionRegistry;
	readonly dataManager: DataManager;
	private markers: PdfMarker[] = [];
	private shapes: PdfShapeMarker[] = [];
	private undoStack: UndoEntry[] = [];
	private suppressUndo = false;
	private listeners = new Set<ChangeListener>();
	private hoverListeners = new Set<HoverListener>();
	private hoverMarkerId: string | null = null;
	private hoverCodeName: string | null = null;
	private _hoveredMarkerIds: string[] = [];

	constructor(dataManager: DataManager, registry: CodeDefinitionRegistry) {
		this.dataManager = dataManager;
		this.registry = registry;
	}

	get settings() {
		return this.dataManager.section('pdf').settings;
	}

	// ── Persistence ──

	load(): void {
		const section = this.dataManager.section('pdf');
		let mutated = false;

		this.markers = section.markers;
		for (const m of this.markers) {
			const result = normalizeCodeApplications(m.codes, this.registry);
			if (result.changed) {
				m.codes = result.normalized;
				mutated = true;
			}
		}

		this.shapes = section.shapes;
		for (const s of this.shapes) {
			const result = normalizeCodeApplications(s.codes, this.registry);
			if (result.changed) {
				s.codes = result.normalized;
				mutated = true;
			}
		}

		if (mutated) this.save();
	}

	save(): void {
		this.dataManager.setSection('pdf', {
			markers: this.markers,
			shapes: this.shapes,
		});
	}

	/** Clear all in-memory markers and shapes. Called by Clear All Markers. */
	clearAll(): void {
		this.markers = [];
		this.shapes = [];
		this.undoStack = [];
		this.notify();
	}

	notify(): void {
		this.save();
		for (const fn of this.listeners) fn();
	}

	onChange(fn: ChangeListener): void {
		this.listeners.add(fn);
	}

	offChange(fn: ChangeListener): void {
		this.listeners.delete(fn);
	}

	// ── Hover state (bidirectional highlight ↔ sidebar) ──

	setHoverState(markerId: string | null, codeName: string | null, hoveredIds?: string[]): void {
		const newIds = hoveredIds ?? (markerId ? [markerId] : []);
		if (this.hoverMarkerId === markerId && this.hoverCodeName === codeName
			&& this._hoveredMarkerIds.length === newIds.length) return;
		this.hoverMarkerId = markerId;
		this.hoverCodeName = codeName;
		this._hoveredMarkerIds = newIds;
		for (const fn of this.hoverListeners) fn(markerId, codeName);
	}

	getHoverMarkerId(): string | null { return this.hoverMarkerId; }
	getHoverMarkerIds(): string[] { return this._hoveredMarkerIds; }

	onHoverChange(fn: HoverListener): void {
		this.hoverListeners.add(fn);
	}

	offHoverChange(fn: HoverListener): void {
		this.hoverListeners.delete(fn);
	}

	// ── File rename tracking ──

	migrateFilePath(oldPath: string, newPath: string): void {
		let changed = false;
		for (const marker of this.markers) {
			if (marker.fileId === oldPath) {
				marker.fileId = newPath;
				changed = true;
			}
		}
		for (const shape of this.shapes) {
			if (shape.fileId === oldPath) {
				shape.fileId = newPath;
				changed = true;
			}
		}
		if (changed) {
			this.save();
			for (const fn of this.listeners) fn();
		}
	}

	// ── Marker operations ──

	/** Find an existing marker without creating one (for read-only checks). */
	findExistingMarker(file: string, page: number, beginIndex: number, beginOffset: number, endIndex: number, endOffset: number): PdfMarker | undefined {
		return this.markers.find(m =>
			m.fileId === file && m.page === page &&
			m.beginIndex === beginIndex && m.beginOffset === beginOffset &&
			m.endIndex === endIndex && m.endOffset === endOffset
		);
	}

	findOrCreateMarker(file: string, page: number, beginIndex: number, beginOffset: number, endIndex: number, endOffset: number, text: string): PdfMarker {
		const existing = this.findExistingMarker(file, page, beginIndex, beginOffset, endIndex, endOffset);
		if (existing) return existing;

		const marker: PdfMarker = {
			id: this.generateId(),
			fileId: file, page,
			beginIndex, beginOffset,
			endIndex, endOffset,
			text,
			codes: [],
			createdAt: Date.now(),
			updatedAt: Date.now(),
		};
		this.markers.push(marker);
		return marker;
	}

	getMarkersForPage(file: string, page: number): PdfMarker[] {
		return this.markers.filter(m => m.fileId === file && m.page === page);
	}

	getMarkersForFile(file: string): PdfMarker[] {
		return this.markers.filter(m => m.fileId === file);
	}

	// ── Code assignment ──

	addCodeToMarker(markerId: string, codeId: string): void {
		const marker = this.findMarkerById(markerId);
		if (!marker) return;
		if (!hasCode(marker.codes, codeId)) {
			this.pushUndo({ type: 'addCode', markerId, data: { ...marker, codes: [...marker.codes] } });
			marker.codes = addCodeApplication(marker.codes, codeId);
			marker.updatedAt = Date.now();
			this.notify();
		}
	}

	removeCodeFromMarker(markerId: string, codeId: string, keepIfEmpty = false): void {
		const marker = this.findMarkerById(markerId);
		if (!marker) return;

		this.pushUndo({ type: 'removeCode', markerId, data: { ...marker, codes: [...marker.codes] } });

		marker.codes = removeCodeApplication(marker.codes, codeId);
		marker.updatedAt = Date.now();

		if (marker.codes.length === 0 && !keepIfEmpty) {
			this.removeMarker(markerId, true);
		}
		this.notify();
	}

	/** Remove all codes from a marker as a single undoable operation. */
	removeAllCodesFromMarker(markerId: string): void {
		const marker = this.findMarkerById(markerId);
		if (!marker || marker.codes.length === 0) return;

		this.pushUndo({ type: 'removeAllCodes', markerId, data: { ...marker, codes: [...marker.codes] } });

		// Direct removal — single notify instead of N
		this.removeMarker(markerId, true);
		this.notify();
	}

	// ── Range update (drag resize) ──

	updateMarkerRange(markerId: string, changes: Partial<Pick<PdfMarker,
		'beginIndex' | 'beginOffset' | 'endIndex' | 'endOffset' | 'text'>>): void {
		const marker = this.findMarkerById(markerId);
		if (!marker) return;
		this.pushUndo({ type: 'resizeMarker', markerId, data: { ...marker, codes: [...marker.codes] } });
		Object.assign(marker, changes);
		marker.updatedAt = Date.now();
		this.notify();
	}

	/**
	 * Update marker range without triggering notify (no save, no listener callbacks).
	 * Used during drag for flicker-free preview — final commit via updateMarkerRange().
	 */
	updateMarkerRangeSilent(markerId: string, changes: Partial<Pick<PdfMarker,
		'beginIndex' | 'beginOffset' | 'endIndex' | 'endOffset' | 'text'>>): void {
		const marker = this.findMarkerById(markerId);
		if (!marker) return;
		Object.assign(marker, changes);
		marker.updatedAt = Date.now();
	}

	// ── Undo ──

	/** Filter codes against current registry — removes codeIds that were deleted since snapshot. */
	private reconcileCodes(codes: CodeApplication[]): CodeApplication[] {
		return codes.filter(c => this.registry.getById(c.codeId) !== undefined);
	}

	undo(): boolean {
		const entry = this.undoStack.pop();
		if (!entry) return false;

		switch (entry.type) {
			case 'addCode': {
				const marker = this.findMarkerById(entry.markerId);
				if (marker) {
					marker.codes = this.reconcileCodes(entry.data.codes);
					marker.updatedAt = Date.now();
				}
				break;
			}
			case 'removeCode':
			case 'removeAllCodes': {
				const reconciledCodes = this.reconcileCodes(entry.data.codes);
				if (reconciledCodes.length === 0) break; // All codes were deleted — nothing to restore
				let marker = this.findMarkerById(entry.markerId);
				if (!marker) {
					// Marker was deleted — restore it with reconciled codes
					this.markers.push({ ...entry.data, codes: reconciledCodes });
				} else {
					marker.codes = reconciledCodes;
					marker.updatedAt = Date.now();
				}
				break;
			}
			case 'resizeMarker': {
				const marker = this.findMarkerById(entry.markerId);
				if (marker) {
					marker.beginIndex = entry.data.beginIndex;
					marker.beginOffset = entry.data.beginOffset;
					marker.endIndex = entry.data.endIndex;
					marker.endOffset = entry.data.endOffset;
					marker.text = entry.data.text;
					marker.updatedAt = Date.now();
				}
				break;
			}
		}

		this.notify();
		return true;
	}

	private pushUndo(entry: UndoEntry): void {
		if (this.suppressUndo) return;
		this.undoStack.push(entry);
		if (this.undoStack.length > MAX_UNDO) {
			this.undoStack.shift();
		}
	}

	// ── Lookup helpers ──

	findMarkerById(id: string): PdfMarker | undefined {
		return this.markers.find(m => m.id === id);
	}

	getAllMarkers(): PdfMarker[] {
		return [...this.markers];
	}

	getAllCodes(): CodeDefinition[] {
		return this.registry.getAll();
	}

	getMarkerText(marker: PdfMarker): string {
		return marker.text;
	}

	getMarkerLabel(marker: PdfMarker): string {
		return `Page ${marker.page}`;
	}

	// ── Shape operations ──

	createShape(file: string, page: number, coords: NormalizedShapeCoords): PdfShapeMarker {
		const shape: PdfShapeMarker = {
			id: this.generateId(),
			fileId: file,
			page,
			shape: coords.type,
			coords,
			codes: [],
			createdAt: Date.now(),
			updatedAt: Date.now(),
		};
		this.shapes.push(shape);
		this.notify();
		return shape;
	}

	updateShapeCoords(shapeId: string, coords: NormalizedShapeCoords): void {
		const shape = this.findShapeById(shapeId);
		if (!shape) return;
		shape.coords = coords;
		shape.shape = coords.type;
		shape.updatedAt = Date.now();
		this.notify();
	}

	deleteShape(shapeId: string): void {
		this.shapes = this.shapes.filter(s => s.id !== shapeId);
		this.notify();
	}

	getShapesForPage(file: string, page: number): PdfShapeMarker[] {
		return this.shapes.filter(s => s.fileId === file && s.page === page);
	}

	getShapesForFile(file: string): PdfShapeMarker[] {
		return this.shapes.filter(s => s.fileId === file);
	}

	getAllShapes(): PdfShapeMarker[] {
		return [...this.shapes];
	}

	findShapeById(id: string): PdfShapeMarker | undefined {
		return this.shapes.find(s => s.id === id);
	}

	addCodeToShape(shapeId: string, codeId: string): void {
		const shape = this.findShapeById(shapeId);
		if (!shape) return;
		if (!hasCode(shape.codes, codeId)) {
			shape.codes = addCodeApplication(shape.codes, codeId);
			shape.updatedAt = Date.now();
			this.notify();
		}
	}

	removeCodeFromShape(shapeId: string, codeId: string, keepIfEmpty = false): void {
		const shape = this.findShapeById(shapeId);
		if (!shape) return;
		shape.codes = removeCodeApplication(shape.codes, codeId);
		shape.updatedAt = Date.now();
		if (shape.codes.length === 0 && !keepIfEmpty) {
			this.deleteShape(shapeId);
			return;
		}
		this.notify();
	}

	removeAllCodesFromShape(shapeId: string): void {
		const shape = this.findShapeById(shapeId);
		if (!shape || shape.codes.length === 0) return;
		shape.codes = [];
		shape.updatedAt = Date.now();
		this.deleteShape(shapeId);
	}

	getShapeLabel(shape: PdfShapeMarker): string {
		const shapeNames: Record<string, string> = { rect: 'Rectangle', ellipse: 'Ellipse', polygon: 'Polygon' };
		return `${shapeNames[shape.shape] || shape.shape} — Page ${shape.page}`;
	}

	removeMarker(id: string, silent = false): boolean {
		const before = this.markers.length;
		this.markers = this.markers.filter(m => m.id !== id);
		const removed = this.markers.length < before;
		if (removed && !silent) this.notify();
		return removed;
	}

	// ── Private ──

	private generateId(): string {
		return Date.now().toString(36) + Math.random().toString(36).substring(2);
	}
}

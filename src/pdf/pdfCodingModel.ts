import type { PdfMarker, PdfShapeMarker, NormalizedShapeCoords } from './pdfCodingTypes';
import type { CodeDefinitionRegistry } from '../core/codeDefinitionRegistry';
import type { DataManager } from '../core/dataManager';
import type { CodeDefinition } from '../core/types';

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
	private dataManager: DataManager;
	private markers: PdfMarker[] = [];
	private shapes: PdfShapeMarker[] = [];
	private undoStack: UndoEntry[] = [];
	private suppressUndo = false;
	private listeners: ChangeListener[] = [];
	private hoverListeners: HoverListener[] = [];
	private hoverMarkerId: string | null = null;
	private hoverCodeName: string | null = null;

	constructor(dataManager: DataManager, registry: CodeDefinitionRegistry) {
		this.dataManager = dataManager;
		this.registry = registry;
	}

	// ── Persistence ──

	load(): void {
		const section = this.dataManager.section('pdf');
		if (section.markers) this.markers = section.markers;
		if (section.shapes) this.shapes = section.shapes;
	}

	save(): void {
		this.dataManager.setSection('pdf', {
			markers: this.markers,
			shapes: this.shapes,
		});
	}

	notify(): void {
		this.save();
		for (const fn of this.listeners) fn();
	}

	onChange(fn: ChangeListener): void {
		this.listeners.push(fn);
	}

	offChange(fn: ChangeListener): void {
		this.listeners = this.listeners.filter(l => l !== fn);
	}

	// ── Hover state (bidirectional highlight ↔ sidebar) ──

	setHoverState(markerId: string | null, codeName: string | null): void {
		if (this.hoverMarkerId === markerId && this.hoverCodeName === codeName) return;
		this.hoverMarkerId = markerId;
		this.hoverCodeName = codeName;
		for (const fn of this.hoverListeners) fn(markerId, codeName);
	}

	getHoverMarkerId(): string | null { return this.hoverMarkerId; }

	onHoverChange(fn: HoverListener): void {
		this.hoverListeners.push(fn);
	}

	offHoverChange(fn: HoverListener): void {
		this.hoverListeners = this.hoverListeners.filter(l => l !== fn);
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

	addCodeToMarker(markerId: string, codeName: string): void {
		this.registry.create(codeName);

		const marker = this.findMarkerById(markerId);
		if (!marker) return;
		if (!marker.codes.includes(codeName)) {
			this.pushUndo({ type: 'addCode', markerId, data: { ...marker, codes: [...marker.codes] } });
			marker.codes.push(codeName);
			marker.updatedAt = Date.now();
			this.notify();
		}
	}

	removeCodeFromMarker(markerId: string, codeName: string, keepIfEmpty = false): void {
		const marker = this.findMarkerById(markerId);
		if (!marker) return;

		this.pushUndo({ type: 'removeCode', markerId, data: { ...marker, codes: [...marker.codes] } });

		marker.codes = marker.codes.filter(c => c !== codeName);
		marker.updatedAt = Date.now();

		if (marker.codes.length === 0 && !keepIfEmpty) {
			this.deleteMarker(markerId);
		}
		this.notify();
	}

	/** Remove all codes from a marker as a single undoable operation. */
	removeAllCodesFromMarker(markerId: string): void {
		const marker = this.findMarkerById(markerId);
		if (!marker || marker.codes.length === 0) return;

		this.pushUndo({ type: 'removeAllCodes', markerId, data: { ...marker, codes: [...marker.codes] } });

		// Suppress individual undo entries from removeCodeFromMarker
		this.suppressUndo = true;
		for (const code of [...marker.codes]) {
			this.removeCodeFromMarker(markerId, code);
		}
		this.suppressUndo = false;
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

	undo(): boolean {
		const entry = this.undoStack.pop();
		if (!entry) return false;

		switch (entry.type) {
			case 'addCode': {
				const marker = this.findMarkerById(entry.markerId);
				if (marker) {
					marker.codes = entry.data.codes;
					marker.updatedAt = Date.now();
				}
				break;
			}
			case 'removeCode':
			case 'removeAllCodes': {
				let marker = this.findMarkerById(entry.markerId);
				if (!marker) {
					// Marker was deleted — restore it
					this.markers.push({ ...entry.data });
				} else {
					marker.codes = entry.data.codes;
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

	addCodeToShape(shapeId: string, codeName: string): void {
		this.registry.create(codeName);
		const shape = this.findShapeById(shapeId);
		if (!shape) return;
		if (!shape.codes.includes(codeName)) {
			shape.codes.push(codeName);
			shape.updatedAt = Date.now();
			this.notify();
		}
	}

	removeCodeFromShape(shapeId: string, codeName: string, keepIfEmpty = false): void {
		const shape = this.findShapeById(shapeId);
		if (!shape) return;
		shape.codes = shape.codes.filter(c => c !== codeName);
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

	// ── Private ──

	private deleteMarker(id: string): void {
		this.markers = this.markers.filter(m => m.id !== id);
	}

	private generateId(): string {
		return Date.now().toString(36) + Math.random().toString(36).substring(2);
	}
}

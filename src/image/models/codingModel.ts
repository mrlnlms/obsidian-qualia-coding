/**
 * ImageCodingModel — CRUD for ImageMarkers + persistence via DataManager.
 */

import type { DataManager } from '../../core/dataManager';
import type { CodeDefinitionRegistry } from '../../core/codeDefinitionRegistry';
import type { ImageMarker, RegionShape, NormalizedCoords } from './codingTypes';

export type ChangeListener = () => void;

export class ImageCodingModel {
	readonly registry: CodeDefinitionRegistry;
	private dataManager: DataManager;
	private listeners: ChangeListener[] = [];

	// Hover state (bidirectional: sidebar ↔ canvas)
	private hoveredMarkerId: string | null = null;
	private hoveredCodeName: string | null = null;
	private hoverListeners: Set<(markerId: string | null, codeName: string | null) => void> = new Set();

	constructor(dataManager: DataManager, registry: CodeDefinitionRegistry) {
		this.dataManager = dataManager;
		this.registry = registry;
	}

	private get markers(): ImageMarker[] {
		return this.dataManager.section('image').markers;
	}

	private set markers(value: ImageMarker[]) {
		const section = this.dataManager.section('image');
		section.markers = value;
	}

	get settings() {
		return this.dataManager.section('image').settings;
	}

	// ─── Per-file view state (zoom/pan) ───

	getFileViewState(fileId: string): { zoom: number; panX: number; panY: number } | undefined {
		const states = this.settings.fileStates;
		if (!states) return undefined;
		return states[fileId];
	}

	saveFileViewState(fileId: string, zoom: number, panX: number, panY: number): void {
		if (!this.settings.fileStates) this.settings.fileStates = {};
		this.settings.fileStates[fileId] = { zoom, panX, panY };
		this.dataManager.markDirty();
	}

	// ─── Listeners ───

	onChange(fn: ChangeListener): void {
		this.listeners.push(fn);
	}

	offChange(fn: ChangeListener): void {
		this.listeners = this.listeners.filter((l) => l !== fn);
	}

	notify(): void {
		this.dataManager.markDirty();
		for (const fn of this.listeners) fn();
	}

	// ─── Marker CRUD ───

	getMarkersForFile(fileId: string): ImageMarker[] {
		return this.markers.filter((m) => m.fileId === fileId);
	}

	getAllMarkers(): ImageMarker[] {
		return [...this.markers];
	}

	getAllFileIds(): string[] {
		const ids = new Set<string>();
		for (const m of this.markers) ids.add(m.fileId);
		return [...ids];
	}

	findMarkerById(id: string): ImageMarker | undefined {
		return this.markers.find((m) => m.id === id);
	}

	createMarker(
		fileId: string,
		shape: RegionShape,
		coords: NormalizedCoords,
	): ImageMarker {
		const marker: ImageMarker = {
			id: this.generateId(),
			fileId,
			shape,
			coords,
			codes: [],
			createdAt: Date.now(),
			updatedAt: Date.now(),
		};
		this.markers.push(marker);
		this.notify();
		return marker;
	}

	updateMarkerCoords(id: string, coords: NormalizedCoords): boolean {
		const marker = this.findMarkerById(id);
		if (!marker) return false;
		marker.coords = coords;
		marker.updatedAt = Date.now();
		this.notify();
		return true;
	}

	removeMarker(id: string): boolean {
		const idx = this.markers.findIndex((m) => m.id === id);
		if (idx < 0) return false;
		this.markers.splice(idx, 1);
		this.notify();
		return true;
	}

	// ─── Code assignment ───

	addCodeToMarker(markerId: string, codeName: string): boolean {
		const marker = this.findMarkerById(markerId);
		if (!marker) return false;

		this.registry.create(codeName);

		if (!marker.codes.includes(codeName)) {
			marker.codes.push(codeName);
			marker.updatedAt = Date.now();
			this.notify();
		}
		return true;
	}

	removeCodeFromMarker(markerId: string, codeName: string, keepIfEmpty = false): boolean {
		const marker = this.findMarkerById(markerId);
		if (!marker) return false;

		const idx = marker.codes.indexOf(codeName);
		if (idx < 0) return false;

		marker.codes.splice(idx, 1);
		marker.updatedAt = Date.now();

		if (marker.codes.length === 0 && !keepIfEmpty) {
			this.removeMarker(markerId);
		} else {
			this.notify();
		}
		return true;
	}

	getCodesForMarker(markerId: string): string[] {
		const marker = this.findMarkerById(markerId);
		return marker ? [...marker.codes] : [];
	}

	// ─── Hover state ───

	setHoverState(markerId: string | null, codeName: string | null): void {
		this.hoveredMarkerId = markerId;
		this.hoveredCodeName = codeName;
		for (const fn of this.hoverListeners) fn(markerId, codeName);
	}

	getHoverMarkerId(): string | null {
		return this.hoveredMarkerId;
	}

	onHoverChange(fn: (markerId: string | null, codeName: string | null) => void): void {
		this.hoverListeners.add(fn);
	}

	offHoverChange(fn: (markerId: string | null, codeName: string | null) => void): void {
		this.hoverListeners.delete(fn);
	}

	// ─── File rename ───

	migrateFilePath(oldPath: string, newPath: string): void {
		let changed = false;
		for (const m of this.markers) {
			if (m.fileId === oldPath) {
				m.fileId = newPath;
				changed = true;
			}
		}
		if (changed) this.notify();
	}

	// ─── Helpers ───

	getMarkerLabel(marker: ImageMarker): string {
		switch (marker.shape) {
			case 'rect': return 'Rectangle';
			case 'ellipse': return 'Ellipse';
			case 'polygon': return 'Polygon';
			default: return 'Region';
		}
	}

	saveMarkers(): void {
		this.dataManager.markDirty();
	}

	private generateId(): string {
		return Date.now().toString(36) + Math.random().toString(36).substring(2);
	}
}

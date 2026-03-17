/**
 * MediaCodingModel — generic base class for time-based media engines (Audio + Video).
 * Subclasses only need to call super() with their section name and default settings.
 */

import type { DataManager } from '../core/dataManager';
import type { MediaMarker, MediaFile, BaseMediaSettings } from './mediaTypes';
import type { CodeDefinitionRegistry } from '../core/codeDefinitionRegistry';
import type { CodeDefinition } from '../core/types';
import { formatTime } from './formatTime';

const TOLERANCE = 0.01;

export class MediaCodingModel<
	M extends MediaMarker = MediaMarker,
	F extends MediaFile<M> = MediaFile<M>,
	S extends BaseMediaSettings = BaseMediaSettings,
> {
	private dm: DataManager;
	private sectionName: string;
	registry: CodeDefinitionRegistry;
	files: F[] = [];
	settings: S;

	private changeListeners: Set<() => void> = new Set();
	private hoverListeners: Set<() => void> = new Set();
	private saveTimer: ReturnType<typeof setTimeout> | null = null;

	private hoveredMarkerId: string | null = null;
	private hoveredCodeName: string | null = null;

	constructor(dm: DataManager, registry: CodeDefinitionRegistry, sectionName: string, defaultSettings: S) {
		this.dm = dm;
		this.registry = registry;
		this.sectionName = sectionName;
		this.settings = { ...defaultSettings };

		const section = dm.section(sectionName);
		this.files = (section.files as F[]) ?? [];
		this.settings = { ...defaultSettings, ...(section.settings as Partial<S>) };

		// Migration: backfill fields for markers created before they existed
		for (const f of this.files) {
			for (const m of f.markers) {
				if (!m.updatedAt) m.updatedAt = m.createdAt ?? Date.now();
				if (!m.fileId) m.fileId = f.path;
			}
		}
	}

	// ── Persistence ──

	save(): void {
		this.dm.setSection(this.sectionName, {
			files: this.files,
			settings: this.settings,
		});
	}

	scheduleSave(): void {
		if (this.saveTimer) clearTimeout(this.saveTimer);
		this.saveTimer = setTimeout(() => this.save(), 500);
	}

	notify(): void {
		this.scheduleSave();
		for (const fn of this.changeListeners) fn();
	}

	notifyChange(): void {
		for (const fn of this.changeListeners) fn();
	}

	// ── Change events ──

	onChange(fn: () => void): void {
		this.changeListeners.add(fn);
	}

	offChange(fn: () => void): void {
		this.changeListeners.delete(fn);
	}

	// ── Hover state ──

	setHoverState(markerId: string | null, codeName: string | null): void {
		this.hoveredMarkerId = markerId;
		this.hoveredCodeName = codeName;
		for (const fn of this.hoverListeners) fn();
	}

	getHoverMarkerId(): string | null {
		return this.hoveredMarkerId;
	}

	getHoverCodeName(): string | null {
		return this.hoveredCodeName;
	}

	onHoverChange(fn: () => void): void {
		this.hoverListeners.add(fn);
	}

	offHoverChange(fn: () => void): void {
		this.hoverListeners.delete(fn);
	}

	// ── Marker CRUD ──

	findExistingMarker(filePath: string, from: number, to: number): M | undefined {
		const file = this.files.find((f) => f.path === filePath);
		if (!file) return undefined;
		return file.markers.find(
			(m) => Math.abs(m.from - from) < TOLERANCE && Math.abs(m.to - to) < TOLERANCE,
		);
	}

	findOrCreateMarker(filePath: string, from: number, to: number): M {
		const existing = this.findExistingMarker(filePath, from, to);
		if (existing) return existing;

		const now = Date.now();
		const marker = {
			id: this.generateId(),
			fileId: filePath,
			from,
			to,
			codes: [],
			createdAt: now,
			updatedAt: now,
		} as unknown as M;

		const file = this.getOrCreateFile(filePath);
		file.markers.push(marker);
		return marker;
	}

	findMarkerById(id: string): M | undefined {
		for (const f of this.files) {
			const m = f.markers.find((m) => m.id === id);
			if (m) return m;
		}
		return undefined;
	}

	getMarkersForFile(filePath: string): M[] {
		const file = this.files.find((f) => f.path === filePath);
		return file ? file.markers : [];
	}

	getAllMarkers(): M[] {
		const result: M[] = [];
		for (const f of this.files) {
			result.push(...f.markers);
		}
		return result;
	}

	getAllFileIds(): string[] {
		return this.files.filter(f => f.markers.length > 0).map(f => f.path);
	}

	updateMarkerBounds(markerId: string, from: number, to: number): void {
		const marker = this.findMarkerById(markerId);
		if (!marker) return;
		marker.from = from;
		marker.to = to;
		marker.updatedAt = Date.now();
		this.notify();
	}

	removeMarker(markerId: string): boolean {
		for (const f of this.files) {
			const idx = f.markers.findIndex((m) => m.id === markerId);
			if (idx >= 0) {
				f.markers.splice(idx, 1);
				this.notify();
				return true;
			}
		}
		return false;
	}

	// ── Code assignment ──

	addCodeToMarker(markerId: string, codeName: string): void {
		const marker = this.findMarkerById(markerId);
		if (!marker) return;
		if (marker.codes.includes(codeName)) return;

		if (!this.registry.getByName(codeName)) {
			this.registry.create(codeName);
		}

		marker.codes.push(codeName);
		marker.updatedAt = Date.now();
		this.notify();
	}

	removeCodeFromMarker(markerId: string, codeName: string, keepIfEmpty?: boolean): void {
		const marker = this.findMarkerById(markerId);
		if (!marker) return;

		const idx = marker.codes.indexOf(codeName);
		if (idx < 0) return;
		marker.codes.splice(idx, 1);

		if (!keepIfEmpty && marker.codes.length === 0) {
			this.removeMarker(markerId);
			return;
		}

		marker.updatedAt = Date.now();
		this.notify();
	}

	getAllCodes(): CodeDefinition[] {
		return this.registry.getAll();
	}

	// ── View helpers ──

	getMarkerLabel(marker: M): string {
		return formatTime(marker.from) + ' – ' + formatTime(marker.to);
	}

	getMarkerText(_marker: M): string | null {
		return null;
	}

	getFileForMarker(markerId: string): string | null {
		for (const f of this.files) {
			if (f.markers.some((m) => m.id === markerId)) {
				return f.path;
			}
		}
		return null;
	}

	// ── File operations ──

	getOrCreateFile(filePath: string): F {
		let file = this.files.find((f) => f.path === filePath);
		if (!file) {
			file = { path: filePath, markers: [] } as unknown as F;
			this.files.push(file);
		}
		return file;
	}

	migrateFilePath(oldPath: string, newPath: string): void {
		const file = this.files.find((f) => f.path === oldPath);
		if (file) {
			file.path = newPath;
			for (const m of file.markers) {
				m.fileId = newPath;
			}
			this.notify();
		}
	}

	saveMarkers(): void {
		this.save();
	}

	private generateId(): string {
		return Date.now().toString(36) + Math.random().toString(36).substring(2);
	}
}

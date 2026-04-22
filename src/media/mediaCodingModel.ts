/**
 * MediaCodingModel — generic base class for time-based media engines (Audio + Video).
 * Subclasses only need to call super() with their section name and default settings.
 */

import type { DataManager } from '../core/dataManager';
import type { MediaMarker, MediaFile, BaseMediaSettings } from './mediaTypes';
import type { CodeDefinitionRegistry } from '../core/codeDefinitionRegistry';
import type { CodeApplication, CodeDefinition, QualiaData } from '../core/types';
import { hasCode, addCodeApplication, removeCodeApplication, normalizeCodeApplications } from '../core/codeApplicationHelpers';
import { formatTime } from './formatTime';

const TOLERANCE = 0.01;

export class MediaCodingModel<
	M extends MediaMarker = MediaMarker,
	F extends MediaFile<M> = MediaFile<M>,
	S extends BaseMediaSettings = BaseMediaSettings,
> {
	readonly dm: DataManager;
	private sectionName: string;
	registry: CodeDefinitionRegistry;
	files: F[] = [];
	settings: S;

	private changeListeners: Set<() => void> = new Set();
	private hoverListeners: Set<() => void> = new Set();

	private hoveredMarkerId: string | null = null;
	private hoveredCodeName: string | null = null;
	private _hoveredMarkerIds: string[] = [];

	constructor(dm: DataManager, registry: CodeDefinitionRegistry, sectionName: string, defaultSettings: S) {
		this.dm = dm;
		this.registry = registry;
		this.sectionName = sectionName;
		this.settings = { ...defaultSettings };

		const section = dm.section(sectionName);
		this.files = (section.files as F[]) ?? [];
		this.settings = { ...defaultSettings, ...(section.settings as Partial<S>) };

		// Migration: backfill fields for markers created before they existed
		let mutated = false;
		for (const f of this.files) {
			for (const m of f.markers) {
				if (!m.updatedAt) { m.updatedAt = m.createdAt ?? Date.now(); mutated = true; }
				if (!m.fileId) { m.fileId = f.path; mutated = true; }

				const result = normalizeCodeApplications(m.codes, this.registry);
				if (result.changed) {
					m.codes = result.normalized;
					mutated = true;
				}
			}
		}
		if (mutated) this.save();
	}

	// ── Persistence ──

	save(): void {
		this.dm.setSection(this.sectionName, {
			files: this.files,
			settings: this.settings,
		});
	}

	/** Clear all in-memory files/markers. Called by Clear All Markers. */
	clearAll(): void {
		this.files = [];
		this.notify();
	}

	notify(): void {
		this.save();
		for (const fn of this.changeListeners) fn();
	}

	notifyChange(): void {
		for (const fn of this.changeListeners) fn();
	}

	/** Reload file/marker state from DataManager and notify listeners. Used after bulk imports. */
	reload(): void {
		const section = this.dm.section(this.sectionName);
		this.files = (section.files as F[]) ?? [];
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

	setHoverState(markerId: string | null, codeName: string | null, hoveredIds?: string[]): void {
		const newIds = hoveredIds ?? (markerId ? [markerId] : []);
		if (this.hoveredMarkerId === markerId && this.hoveredCodeName === codeName
			&& this._hoveredMarkerIds.length === newIds.length) return;
		this.hoveredMarkerId = markerId;
		this.hoveredCodeName = codeName;
		this._hoveredMarkerIds = newIds;
		for (const fn of this.hoverListeners) fn();
	}

	getHoverMarkerId(): string | null {
		return this.hoveredMarkerId;
	}

	getHoverCodeName(): string | null {
		return this.hoveredCodeName;
	}

	getHoverMarkerIds(): string[] {
		return this._hoveredMarkerIds;
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
		} as MediaMarker as M;

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
		for (let i = 0; i < this.files.length; i++) {
			const f = this.files[i]!;
			const idx = f.markers.findIndex((m) => m.id === markerId);
			if (idx >= 0) {
				f.markers.splice(idx, 1);
				if (f.markers.length === 0) this.files.splice(i, 1);
				this.notify();
				return true;
			}
		}
		return false;
	}

	// ── Code assignment ──

	addCodeToMarker(markerId: string, codeId: string): void {
		const marker = this.findMarkerById(markerId);
		if (!marker) return;
		if (hasCode(marker.codes, codeId)) return;

		marker.codes = addCodeApplication(marker.codes, codeId);
		marker.updatedAt = Date.now();
		this.notify();
	}

	removeCodeFromMarker(markerId: string, codeId: string, keepIfEmpty?: boolean): void {
		const marker = this.findMarkerById(markerId);
		if (!marker) return;

		if (!hasCode(marker.codes, codeId)) return;
		marker.codes = removeCodeApplication(marker.codes, codeId);

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
			file = { path: filePath, markers: [] } as MediaFile<M> as F;
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
			// Migrate per-file view state (zoom, lastPosition)
			const states = this.settings.fileStates;
			if (states[oldPath]) {
				states[newPath] = states[oldPath];
				delete states[oldPath];
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

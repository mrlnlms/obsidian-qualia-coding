import type { DataManager } from '../core/dataManager';
import type { VideoMarker, VideoFile, VideoSettings } from './videoCodingTypes';
import { DEFAULT_VIDEO_SETTINGS } from './videoCodingTypes';
import type { CodeDefinitionRegistry } from '../core/codeDefinitionRegistry';
import type { CodeDefinition } from '../core/types';
import { formatTime } from '../media/formatTime';

const TOLERANCE = 0.01;

export class VideoCodingModel {
	private dm: DataManager;
	registry: CodeDefinitionRegistry;
	files: VideoFile[] = [];
	settings: VideoSettings = { ...DEFAULT_VIDEO_SETTINGS };

	private changeListeners: Set<() => void> = new Set();
	private hoverListeners: Set<() => void> = new Set();
	private saveTimer: ReturnType<typeof setTimeout> | null = null;

	private hoveredMarkerId: string | null = null;
	private hoveredCodeName: string | null = null;

	constructor(dm: DataManager, registry: CodeDefinitionRegistry) {
		this.dm = dm;
		this.registry = registry;

		const section = dm.section('video');
		this.files = section.files ?? [];
		this.settings = { ...DEFAULT_VIDEO_SETTINGS, ...(section.settings as Partial<VideoSettings>) };

		// Migration: backfill updatedAt for markers created before this field existed
		for (const af of this.files) {
			for (const m of af.markers) {
				if (!m.updatedAt) m.updatedAt = m.createdAt ?? Date.now();
			}
		}
	}

	// ── Persistence ──

	save(): void {
		this.dm.setSection('video', {
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

	findExistingMarker(filePath: string, from: number, to: number): VideoMarker | undefined {
		const vf = this.files.find((f) => f.path === filePath);
		if (!vf) return undefined;
		return vf.markers.find(
			(m) => Math.abs(m.from - from) < TOLERANCE && Math.abs(m.to - to) < TOLERANCE,
		);
	}

	findOrCreateMarker(filePath: string, from: number, to: number): VideoMarker {
		const existing = this.findExistingMarker(filePath, from, to);
		if (existing) return existing;

		const now = Date.now();
		const marker: VideoMarker = {
			id: this.generateId(),
			from,
			to,
			codes: [],
			createdAt: now,
			updatedAt: now,
		};

		const vf = this.getOrCreateVideoFile(filePath);
		vf.markers.push(marker);
		return marker;
	}

	findMarkerById(id: string): VideoMarker | undefined {
		for (const vf of this.files) {
			const m = vf.markers.find((m) => m.id === id);
			if (m) return m;
		}
		return undefined;
	}

	getMarkersForFile(filePath: string): VideoMarker[] {
		const vf = this.files.find((f) => f.path === filePath);
		return vf ? vf.markers : [];
	}

	getAllMarkers(): VideoMarker[] {
		const result: VideoMarker[] = [];
		for (const vf of this.files) {
			result.push(...vf.markers);
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
		for (const vf of this.files) {
			const idx = vf.markers.findIndex((m) => m.id === markerId);
			if (idx >= 0) {
				vf.markers.splice(idx, 1);
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

	getMarkerLabel(marker: VideoMarker): string {
		return formatTime(marker.from) + ' – ' + formatTime(marker.to);
	}

	getMarkerText(_marker: VideoMarker): string | null {
		return null;
	}

	getFileForMarker(markerId: string): string | null {
		for (const vf of this.files) {
			if (vf.markers.some((m) => m.id === markerId)) {
				return vf.path;
			}
		}
		return null;
	}

	// ── File operations ──

	getOrCreateVideoFile(filePath: string): VideoFile {
		let vf = this.files.find((f) => f.path === filePath);
		if (!vf) {
			vf = { path: filePath, markers: [] };
			this.files.push(vf);
		}
		return vf;
	}

	migrateFilePath(oldPath: string, newPath: string): void {
		const vf = this.files.find((f) => f.path === oldPath);
		if (vf) {
			vf.path = newPath;
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

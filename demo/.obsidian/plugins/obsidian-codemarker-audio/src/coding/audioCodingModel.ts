import type { Plugin } from 'obsidian';
import type { AudioMarker, AudioFile, AudioPluginData, AudioSettings } from './audioCodingTypes';
import { DEFAULT_AUDIO_SETTINGS } from './audioCodingTypes';
import { CodeDefinitionRegistry, type CodeDefinition } from './codeDefinitionRegistry';
import { loadSharedRegistry, saveSharedRegistry } from './sharedRegistry';
import { formatTime } from '../utils/formatTime';

const TOLERANCE = 0.01;

export class AudioCodingModel {
	private plugin: Plugin;
	files: AudioFile[] = [];
	registry: CodeDefinitionRegistry = new CodeDefinitionRegistry();
	settings: AudioSettings = { ...DEFAULT_AUDIO_SETTINGS };

	private changeListeners: Set<() => void> = new Set();
	private hoverListeners: Set<() => void> = new Set();
	private saveTimer: ReturnType<typeof setTimeout> | null = null;

	private hoveredMarkerId: string | null = null;
	private hoveredCodeName: string | null = null;

	constructor(plugin: Plugin) {
		this.plugin = plugin;
	}

	// ── Persistence ──

	async load(): Promise<void> {
		const raw = await this.plugin.loadData();
		if (raw) {
			this.files = raw.files ?? [];
			this.registry = raw.codeDefinitions
				? CodeDefinitionRegistry.fromJSON(raw.codeDefinitions)
				: new CodeDefinitionRegistry();
			this.settings = { ...DEFAULT_AUDIO_SETTINGS, ...raw.settings };
		}
		await this.syncSharedRegistry();
	}

	async save(): Promise<void> {
		const existing = (await this.plugin.loadData()) ?? {};
		const data: AudioPluginData = {
			...existing,
			files: this.files,
			codeDefinitions: this.registry.toJSON(),
			settings: this.settings,
		};
		await this.plugin.saveData(data);
		await this.syncSharedRegistry();
	}

	scheduleSave(): void {
		if (this.saveTimer) clearTimeout(this.saveTimer);
		this.saveTimer = setTimeout(() => this.save(), 500);
	}

	notify(): void {
		this.scheduleSave();
		for (const fn of this.changeListeners) fn();
	}

	/** Fire change listeners without scheduling a save (used when save is managed separately). */
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

	findExistingMarker(filePath: string, from: number, to: number): AudioMarker | undefined {
		const af = this.files.find((f) => f.path === filePath);
		if (!af) return undefined;
		return af.markers.find(
			(m) => Math.abs(m.from - from) < TOLERANCE && Math.abs(m.to - to) < TOLERANCE,
		);
	}

	findOrCreateMarker(filePath: string, from: number, to: number): AudioMarker {
		const existing = this.findExistingMarker(filePath, from, to);
		if (existing) return existing;

		const marker: AudioMarker = {
			id: this.generateId(),
			from,
			to,
			codes: [],
			createdAt: Date.now(),
		};

		const af = this.getOrCreateAudioFile(filePath);
		af.markers.push(marker);
		return marker;
	}

	findMarkerById(id: string): AudioMarker | undefined {
		for (const af of this.files) {
			const m = af.markers.find((m) => m.id === id);
			if (m) return m;
		}
		return undefined;
	}

	getMarkersForFile(filePath: string): AudioMarker[] {
		const af = this.files.find((f) => f.path === filePath);
		return af ? af.markers : [];
	}

	getAllMarkers(): AudioMarker[] {
		const result: AudioMarker[] = [];
		for (const af of this.files) {
			result.push(...af.markers);
		}
		return result;
	}

	updateMarkerBounds(markerId: string, from: number, to: number): void {
		const marker = this.findMarkerById(markerId);
		if (!marker) return;
		marker.from = from;
		marker.to = to;
		this.notify();
	}

	removeMarker(markerId: string): void {
		for (const af of this.files) {
			const idx = af.markers.findIndex((m) => m.id === markerId);
			if (idx >= 0) {
				af.markers.splice(idx, 1);
				this.notify();
				return;
			}
		}
	}

	// ── Code assignment ──

	addCodeToMarker(markerId: string, codeName: string): void {
		const marker = this.findMarkerById(markerId);
		if (!marker) return;
		if (marker.codes.includes(codeName)) return;

		// Auto-create CodeDefinition if new
		if (!this.registry.getByName(codeName)) {
			this.registry.create(codeName);
		}

		marker.codes.push(codeName);
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

		this.notify();
	}

	getAllCodes(): CodeDefinition[] {
		return this.registry.getAll();
	}

	// ── View helpers ──

	getMarkerLabel(marker: AudioMarker): string {
		return formatTime(marker.from) + ' – ' + formatTime(marker.to);
	}

	getMarkerText(_marker: AudioMarker): string | null {
		return null;
	}

	getFileForMarker(markerId: string): string | null {
		for (const af of this.files) {
			if (af.markers.some((m) => m.id === markerId)) {
				return af.path;
			}
		}
		return null;
	}

	// ── File operations ──

	getOrCreateAudioFile(filePath: string): AudioFile {
		let af = this.files.find((f) => f.path === filePath);
		if (!af) {
			af = { path: filePath, markers: [] };
			this.files.push(af);
		}
		return af;
	}

	migrateFilePath(oldPath: string, newPath: string): void {
		const af = this.files.find((f) => f.path === oldPath);
		if (af) {
			af.path = newPath;
			this.notify();
		}
	}

	// ── Shared registry sync ──

	private async syncSharedRegistry(): Promise<void> {
		const vault = this.plugin.app.vault;
		const shared = await loadSharedRegistry(vault);
		if (shared) {
			// Import from shared → local
			for (const id in shared.definitions) {
				const def = shared.definitions[id];
				this.registry.importDefinition(def);
			}
			this.registry.syncPaletteIndex(shared.nextPaletteIndex);
		}

		// Export local → shared
		const local = this.registry.toJSON();
		const merged: Record<string, CodeDefinition> = {};

		// Start with shared
		if (shared) {
			for (const id in shared.definitions) {
				merged[id] = shared.definitions[id];
			}
		}

		// Merge local (local wins if updatedAt is more recent)
		for (const id in local.definitions) {
			const localDef = local.definitions[id];
			const sharedDef = merged[id];
			if (!sharedDef || localDef.updatedAt >= sharedDef.updatedAt) {
				merged[id] = localDef;
			}
		}

		const nextIdx = Math.max(
			local.nextPaletteIndex,
			shared?.nextPaletteIndex ?? 0,
		);

		await saveSharedRegistry(vault, { definitions: merged, nextPaletteIndex: nextIdx });
	}

	private generateId(): string {
		return Date.now().toString(36) + Math.random().toString(36).substring(2);
	}
}

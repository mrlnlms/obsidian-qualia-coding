import type { Plugin } from 'obsidian';
import type { QualiaData, BaseMarker, MarkerType } from './types';
import { createDefaultData } from './types';
import { migrateLegacyMemos, migrateMarkerMemo } from './memoMigration';

export class DataManager {
	private data: QualiaData;
	private plugin: Plugin;
	private saveTimer: number | null = null;
	private saving = false;
	private dirtyAfterSave = false;

	constructor(plugin: Plugin) {
		this.plugin = plugin;
		this.data = createDefaultData();
	}

	async load(): Promise<void> {
		const raw = await this.plugin.loadData();
		const defaults = createDefaultData();
		if (raw) {
			for (const key of Object.keys(defaults) as Array<keyof QualiaData>) {
				if (raw[key] === undefined) raw[key] = defaults[key];
			}
			// Deep merge settings with defaults for ALL engines (handles new/nested keys added later)
			raw.markdown.settings = deepMerge(defaults.markdown.settings, raw.markdown.settings);
			raw.image.settings = deepMerge(defaults.image.settings, raw.image.settings);
			raw.audio.settings = deepMerge(defaults.audio.settings, raw.audio.settings);
			raw.video.settings = deepMerge(defaults.video.settings, raw.video.settings);
			raw.pdf.settings = deepMerge(defaults.pdf.settings, raw.pdf.settings);
			raw.general = deepMerge(defaults.general, raw.general);
			this.data = raw as QualiaData;
			// Migrate legacy `memo: string` → MemoRecord (registry + groups + relations)
			migrateLegacyMemos(this.data);
			// Migrate marker memos across all engines
			this.migrateMarkerMemos();
		} else {
			this.data = defaults;
		}
	}

	private migrateMarkerMemos(): void {
		for (const fileMarkers of Object.values(this.data.markdown.markers ?? {})) {
			for (const m of fileMarkers) migrateMarkerMemo(m);
		}
		for (const m of this.data.pdf.markers ?? []) migrateMarkerMemo(m);
		for (const s of this.data.pdf.shapes ?? []) migrateMarkerMemo(s);
		for (const m of this.data.image.markers ?? []) migrateMarkerMemo(m);
		for (const m of this.data.csv.segmentMarkers ?? []) migrateMarkerMemo(m);
		for (const m of this.data.csv.rowMarkers ?? []) migrateMarkerMemo(m);
		for (const f of this.data.audio.files ?? []) {
			for (const m of f.markers) migrateMarkerMemo(m);
		}
		for (const f of this.data.video.files ?? []) {
			for (const m of f.markers) migrateMarkerMemo(m);
		}
	}

	// Typed overload: literal keys return exact type (e.g. section('pdf') → PdfData)
	section<K extends keyof QualiaData>(key: K): QualiaData[K];
	// Dynamic key fallback: MediaCodingModel passes sectionName as keyof QualiaData
	// but TypeScript can't narrow the union, so the implementation returns any.
	section(key: string): Record<string, any>;
	section(key: string): any {
		return this.data[key as keyof QualiaData];
	}

	/** Returns reference ao QualiaData persistido. Usado por componentes que precisam read+write transparente. */
	getDataRef(): QualiaData {
		return this.data;
	}

	setSection<K extends keyof QualiaData>(key: K, value: QualiaData[K]): void;
	setSection(key: string, value: Record<string, any>): void;
	setSection(key: string, value: any): void {
		(this.data as Record<string, any>)[key] = value;
		this.markDirty();
	}

	markDirty(): void {
		if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
		this.saveTimer = window.setTimeout(() => {
			this.saveTimer = null;
			void this.flush();
		}, 500);
	}

	private flushRetries = 0;

	async flush(): Promise<void> {
		if (this.saving) { this.dirtyAfterSave = true; return; }
		this.saving = true;
		try {
			if (this.saveTimer !== null) { window.clearTimeout(this.saveTimer); this.saveTimer = null; }
			await this.plugin.saveData(this.data);
			this.flushRetries = 0;
		} catch (e) {
			console.error('QualiaCoding: flush failed', e);
			this.flushRetries++;
			if (this.flushRetries >= 3) {
				console.error('QualiaCoding: flush failed 3 times, giving up');
				this.flushRetries = 0;
				this.saving = false;
				return;
			}
			// Retry after backoff
			this.saving = false;
			this.saveTimer = window.setTimeout(() => {
				this.saveTimer = null;
				void this.flush();
			}, 1000 * this.flushRetries);
			return;
		} finally {
			this.saving = false;
			if (this.dirtyAfterSave) { this.dirtyAfterSave = false; await this.flush(); }
		}
	}

	getAll(): Readonly<QualiaData> { return this.data; }

	/**
	 * Locate a marker by id across the engine's data shape. Returns a live reference;
	 * mutate in place and call `markDirty()` to persist. Used by Memo View and other
	 * surfaces that need centralized marker access without a leaf open.
	 */
	findMarker(engineType: MarkerType, markerId: string): BaseMarker | null {
		// NOTA: engine-specific markers (SegmentMarker, PdfMarker, ImageMarker, AudioMarker, etc.)
		// têm o shape estrutural de BaseMarker mas não declaram explicitamente `markerType`.
		// Cast via `unknown` necessário pra retornar referência viva pra mutação in-place.
		const d = this.data;
		const cast = (m: unknown): BaseMarker => m as BaseMarker;
		if (engineType === 'markdown') {
			for (const fileId of Object.keys(d.markdown.markers)) {
				const found = d.markdown.markers[fileId]!.find((m) => m.id === markerId);
				if (found) return cast(found);
			}
			return null;
		}
		if (engineType === 'csv') {
			const s = d.csv.segmentMarkers.find((m) => m.id === markerId);
			if (s) return cast(s);
			const r = d.csv.rowMarkers.find((m) => m.id === markerId);
			return r ? cast(r) : null;
		}
		if (engineType === 'image') {
			const m = d.image.markers.find((m) => m.id === markerId);
			return m ? cast(m) : null;
		}
		if (engineType === 'pdf') {
			const m = d.pdf.markers.find((m) => m.id === markerId);
			return m ? cast(m) : null;
		}
		if (engineType === 'audio' || engineType === 'video') {
			const collection = engineType === 'audio' ? d.audio.files : d.video.files;
			for (const f of collection) {
				const m = (f.markers as Array<{ id: string }>).find((mk) => mk.id === markerId);
				if (m) return cast(m);
			}
			return null;
		}
		return null;
	}

	/** Clear all markers and code definitions from all engines. Preserves per-engine settings. */
	async clearAllSections(): Promise<void> {
		this.data.registry = { definitions: {}, nextPaletteIndex: 0, folders: {}, folderOrder: [], rootOrder: [], groups: {}, groupOrder: [], nextGroupPaletteIndex: 0 };
		this.data.smartCodes = { definitions: {}, order: [], nextPaletteIndex: 0 };
		this.data.markdown = { markers: {}, settings: this.data.markdown.settings };
		this.data.csv = { segmentMarkers: [], rowMarkers: [], settings: this.data.csv.settings };
		this.data.image = { markers: [], settings: this.data.image.settings };
		this.data.pdf = { markers: [], shapes: [], settings: this.data.pdf.settings };
		this.data.audio = { files: [], settings: this.data.audio.settings };
		this.data.video = { files: [], settings: this.data.video.settings };
		this.data.caseVariables = { values: {}, types: {} };
		await this.flush();
	}
}

/** Recursively merge defaults into persisted data. Persisted values win. */
function deepMerge<T>(defaults: T, persisted: Partial<T> | undefined): T {
	if (!persisted) return { ...defaults };
	const result = { ...defaults } as any;
	for (const key of Object.keys(persisted as object)) {
		const val = (persisted as any)[key];
		const def = (defaults as any)[key];
		if (val !== null && typeof val === 'object' && !Array.isArray(val)
			&& def !== null && typeof def === 'object' && !Array.isArray(def)) {
			result[key] = deepMerge(def, val);
		} else if (val !== undefined) {
			result[key] = val;
		}
	}
	return result as T;
}

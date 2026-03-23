import type { Plugin } from 'obsidian';
import type { QualiaData } from './types';
import { createDefaultData } from './types';

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
			this.data = raw as QualiaData;
		} else {
			this.data = defaults;
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

	/** Clear all markers and code definitions from all engines. Preserves per-engine settings. */
	async clearAllSections(): Promise<void> {
		this.data.registry = { definitions: {}, nextPaletteIndex: 0, folders: {}, rootOrder: [] };
		this.data.markdown = { markers: {}, settings: this.data.markdown.settings };
		this.data.csv = { segmentMarkers: [], rowMarkers: [] };
		this.data.image = { markers: [], settings: this.data.image.settings };
		this.data.pdf = { markers: [], shapes: [] };
		this.data.audio = { files: [], settings: this.data.audio.settings };
		this.data.video = { files: [], settings: this.data.video.settings };
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

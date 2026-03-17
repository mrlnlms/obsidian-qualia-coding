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
			// Merge nested settings with defaults (handles new keys added later)
			raw.markdown.settings = { ...defaults.markdown.settings, ...(raw.markdown.settings ?? {}) };
			this.data = raw as QualiaData;
		} else {
			this.data = defaults;
		}
	}

	section<K extends keyof QualiaData>(key: K): QualiaData[K];
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

	async flush(): Promise<void> {
		if (this.saving) { this.dirtyAfterSave = true; return; }
		this.saving = true;
		try {
			if (this.saveTimer !== null) { window.clearTimeout(this.saveTimer); this.saveTimer = null; }
			await this.plugin.saveData(this.data);
		} finally {
			this.saving = false;
			if (this.dirtyAfterSave) { this.dirtyAfterSave = false; await this.flush(); }
		}
	}

	getAll(): Readonly<QualiaData> { return this.data; }

	/** Clear all markers and code definitions from all engines. Preserves per-engine settings. */
	async clearAllSections(): Promise<void> {
		this.data.registry = { definitions: {}, nextPaletteIndex: 0 };
		this.data.markdown = { markers: {}, settings: this.data.markdown.settings };
		this.data.csv = { segmentMarkers: [], rowMarkers: [] };
		this.data.image = { markers: [], settings: this.data.image.settings };
		this.data.pdf = { markers: [], shapes: [] };
		this.data.audio = { files: [], settings: this.data.audio.settings };
		this.data.video = { files: [], settings: this.data.video.settings };
		await this.flush();
	}
}

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
				if (raw[key] === undefined) (raw as any)[key] = defaults[key];
			}
			// Merge nested settings with defaults (handles new keys added later)
			raw.markdown.settings = { ...defaults.markdown.settings, ...(raw.markdown.settings ?? {}) };
			this.data = raw as QualiaData;

			// D21: Normalize registry from 3 legacy formats
			this.migrateRegistries(raw);
			// D22: Strip legacy codeDescriptions → migrate to registry
			this.migrateLegacyDescriptions(raw);
		} else {
			this.data = defaults;
		}
	}

	/**
	 * D21: Normalize per-engine registries from 3 legacy formats into unified `registry`.
	 * - v2: `data.markdown.codeDefinitions` (flat Record) + `data.markdown.nextPaletteIndex` (number)
	 * - CSV/Image/PDF: `data.<engine>.codeDefinitions` (flat Record) + `data.<engine>.nextPaletteIndex` (number)
	 * - Audio/Video: `data.<engine>.codeDefinitions` (nested { definitions, nextPaletteIndex })
	 * Merges by `updatedAt` (newest wins). Writes result to `this.data.registry`.
	 * Deletes per-engine copies after migration. One-time normalization.
	 */
	private migrateRegistries(raw: any): void {
		const sources: Array<{ defs: Record<string, any>; paletteIndex: number; cleanupKeys: string[] }> = [];

		// Format 1: v2/CSV/Image/PDF — flat codeDefinitions + nextPaletteIndex at engine level
		for (const engine of ['markdown', 'csv', 'image', 'pdf'] as const) {
			const section = raw[engine];
			if (section?.codeDefinitions && typeof section.codeDefinitions === 'object' && !section.codeDefinitions.definitions) {
				sources.push({
					defs: section.codeDefinitions,
					paletteIndex: typeof section.nextPaletteIndex === 'number' ? section.nextPaletteIndex : 0,
					cleanupKeys: [`${engine}.codeDefinitions`, `${engine}.nextPaletteIndex`],
				});
			}
		}

		// Format 2: Audio/Video — nested { definitions, nextPaletteIndex } under codeDefinitions
		for (const engine of ['audio', 'video'] as const) {
			const section = raw[engine];
			if (section?.codeDefinitions?.definitions) {
				sources.push({
					defs: section.codeDefinitions.definitions,
					paletteIndex: typeof section.codeDefinitions.nextPaletteIndex === 'number' ? section.codeDefinitions.nextPaletteIndex : 0,
					cleanupKeys: [`${engine}.codeDefinitions`],
				});
			}
		}

		if (sources.length === 0) return;

		// Merge into unified registry by updatedAt (newest wins)
		const unified = this.data.registry.definitions;
		let maxPaletteIndex = this.data.registry.nextPaletteIndex;

		for (const source of sources) {
			for (const [id, def] of Object.entries(source.defs)) {
				const existing = unified[id];
				if (!existing || (def.updatedAt && (!existing.updatedAt || def.updatedAt > existing.updatedAt))) {
					unified[id] = def;
				}
			}
			if (source.paletteIndex > maxPaletteIndex) {
				maxPaletteIndex = source.paletteIndex;
			}
		}

		this.data.registry.nextPaletteIndex = maxPaletteIndex;

		// Delete per-engine copies
		for (const source of sources) {
			for (const keyPath of source.cleanupKeys) {
				const [engine, key] = keyPath.split('.') as [string, string];
				if (raw[engine]) delete raw[engine][key];
			}
		}
	}

	/**
	 * D22: Migrate legacy `codeDescriptions` map from v2 markdown data
	 * into `registry.definitions[].description`.
	 */
	private migrateLegacyDescriptions(raw: any): void {
		if (!(raw as any).markdown?.codeDescriptions) return;
		const descs = (raw as any).markdown.codeDescriptions as Record<string, string>;
		for (const [name, desc] of Object.entries(descs)) {
			// Find definition by name
			for (const def of Object.values(this.data.registry.definitions)) {
				if ((def as any).name === name && !(def as any).description) {
					(def as any).description = desc;
				}
			}
		}
		delete (raw as any).markdown.codeDescriptions;
	}

	section<K extends keyof QualiaData>(key: K): QualiaData[K] {
		return this.data[key];
	}

	setSection<K extends keyof QualiaData>(key: K, value: QualiaData[K]): void {
		this.data[key] = value;
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

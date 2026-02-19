import type { Plugin } from 'obsidian';
import type { PdfMarker, PdfCodingData } from './pdfCodingTypes';
import { loadSharedRegistry, saveSharedRegistry, type RegistryData } from './sharedRegistry';

// ── Color Palette (12 categorical colors, light/dark safe) ──
const DEFAULT_PALETTE: string[] = [
	'#6200EE', '#03DAC6', '#CF6679', '#FF9800', '#4CAF50', '#2196F3',
	'#F44336', '#FFEB3B', '#9C27B0', '#00BCD4', '#8BC34A', '#FF5722',
];

// ── CodeDefinition (same as codemarker-v2) ──
export interface CodeDefinition {
	id: string;
	name: string;
	color: string;
	description?: string;
	createdAt: number;
	updatedAt: number;
}

export class CodeDefinitionRegistry {
	private definitions: Map<string, CodeDefinition> = new Map();
	private nameIndex: Map<string, string> = new Map();
	private nextPaletteIndex: number = 0;

	getById(id: string): CodeDefinition | undefined { return this.definitions.get(id); }

	getByName(name: string): CodeDefinition | undefined {
		const id = this.nameIndex.get(name);
		return id ? this.definitions.get(id) : undefined;
	}

	getAll(): CodeDefinition[] {
		return Array.from(this.definitions.values()).sort((a, b) => a.name.localeCompare(b.name));
	}

	create(name: string, color?: string, description?: string): CodeDefinition {
		const existing = this.getByName(name);
		if (existing) return existing;

		const def: CodeDefinition = {
			id: this.generateId(),
			name,
			color: color || this.consumeNextPaletteColor(),
			description: description || undefined,
			createdAt: Date.now(),
			updatedAt: Date.now(),
		};
		this.definitions.set(def.id, def);
		this.nameIndex.set(def.name, def.id);
		return def;
	}

	update(id: string, changes: Partial<Pick<CodeDefinition, 'name' | 'color' | 'description'>>): boolean {
		const def = this.definitions.get(id);
		if (!def) return false;
		if (changes.name !== undefined && changes.name !== def.name) {
			this.nameIndex.delete(def.name);
			def.name = changes.name;
			this.nameIndex.set(def.name, def.id);
		}
		if (changes.color !== undefined) def.color = changes.color;
		if (changes.description !== undefined) def.description = changes.description || undefined;
		def.updatedAt = Date.now();
		return true;
	}

	delete(id: string): boolean {
		const def = this.definitions.get(id);
		if (!def) return false;
		this.nameIndex.delete(def.name);
		this.definitions.delete(id);
		return true;
	}

	importDefinition(def: CodeDefinition): void {
		if (this.definitions.has(def.id)) return;
		if (this.nameIndex.has(def.name)) return;
		this.definitions.set(def.id, { ...def });
		this.nameIndex.set(def.name, def.id);
	}

	syncPaletteIndex(sharedIdx: number): void {
		if (sharedIdx > this.nextPaletteIndex) {
			this.nextPaletteIndex = sharedIdx;
		}
	}

	peekNextPaletteColor(): string {
		return DEFAULT_PALETTE[this.nextPaletteIndex % DEFAULT_PALETTE.length]!;
	}

	private consumeNextPaletteColor(): string {
		const color = DEFAULT_PALETTE[this.nextPaletteIndex % DEFAULT_PALETTE.length]!;
		this.nextPaletteIndex++;
		return color;
	}

	getColorForCodes(codeNames: string[]): string | null {
		for (const name of codeNames) {
			const def = this.getByName(name);
			if (def) return def.color;
		}
		return null;
	}

	toJSON() {
		const definitions: Record<string, CodeDefinition> = {};
		for (const [id, def] of this.definitions.entries()) definitions[id] = def;
		return { definitions, nextPaletteIndex: this.nextPaletteIndex };
	}

	static fromJSON(data: any): CodeDefinitionRegistry {
		const registry = new CodeDefinitionRegistry();
		if (data?.definitions) {
			for (const id in data.definitions) {
				const def = data.definitions[id] as CodeDefinition;
				registry.definitions.set(id, def);
				registry.nameIndex.set(def.name, def.id);
			}
		}
		if (typeof data?.nextPaletteIndex === 'number') registry.nextPaletteIndex = data.nextPaletteIndex;
		return registry;
	}

	private generateId(): string {
		return Date.now().toString(36) + Math.random().toString(36).substring(2);
	}
}

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
	plugin: Plugin;
	readonly registry: CodeDefinitionRegistry;
	private markers: PdfMarker[] = [];
	private undoStack: UndoEntry[] = [];
	private suppressUndo = false;
	private listeners: ChangeListener[] = [];
	private hoverListeners: HoverListener[] = [];
	private hoverMarkerId: string | null = null;
	private hoverCodeName: string | null = null;
	private saveTimeout: number | null = null;

	constructor(plugin: Plugin) {
		this.plugin = plugin;
		this.registry = new CodeDefinitionRegistry();
	}

	// ── Persistence ──

	async load(): Promise<void> {
		const raw = await this.plugin.loadData();
		if (!raw) return;
		const data = raw as Partial<PdfCodingData>;
		if (data.markers) this.markers = data.markers;
		if (data.registry) {
			const loaded = CodeDefinitionRegistry.fromJSON(data.registry);
			Object.assign(this.registry, loaded);
		}

		await this.syncSharedRegistry();

		console.log(`[CodeMarker PDF] Loaded: ${this.markers.length} markers, ${this.registry.getAll().length} codes`);
	}

	async save(): Promise<void> {
		const existing = (await this.plugin.loadData()) ?? {};
		existing.markers = this.markers;
		existing.registry = this.registry.toJSON();
		await this.plugin.saveData(existing);

		await this.syncSharedRegistry();
	}

	private async syncSharedRegistry(): Promise<void> {
		try {
			const vault = (this.plugin.app as any).vault;
			const shared = await loadSharedRegistry(vault);

			if (shared) {
				for (const id in shared.definitions) {
					const sharedDef = shared.definitions[id];
					if (!sharedDef) continue;
					const localByName = this.registry.getByName(sharedDef.name);
					if (!localByName) {
						this.registry.importDefinition(sharedDef);
					} else if (sharedDef.updatedAt > localByName.updatedAt) {
						this.registry.update(localByName.id, {
							color: sharedDef.color,
							description: sharedDef.description,
						});
					}
				}
				this.registry.syncPaletteIndex(shared.nextPaletteIndex ?? 0);
			}

			const registryJSON = this.registry.toJSON();
			const outData: RegistryData = {
				definitions: registryJSON.definitions,
				nextPaletteIndex: registryJSON.nextPaletteIndex,
			};
			await saveSharedRegistry(vault, outData);
		} catch (e) {
			console.warn('[CodeMarker PDF] Shared registry sync failed:', e);
		}
	}

	private scheduleSave(): void {
		if (this.saveTimeout) window.clearTimeout(this.saveTimeout);
		this.saveTimeout = window.setTimeout(() => this.save(), 500);
	}

	private notify(): void {
		this.scheduleSave();
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
			if (marker.file === oldPath) {
				marker.file = newPath;
				changed = true;
			}
		}
		if (changed) {
			this.scheduleSave();
			for (const fn of this.listeners) fn();
		}
	}

	// ── Marker operations ──

	/** Find an existing marker without creating one (for read-only checks). */
	findExistingMarker(file: string, page: number, beginIndex: number, beginOffset: number, endIndex: number, endOffset: number): PdfMarker | undefined {
		return this.markers.find(m =>
			m.file === file && m.page === page &&
			m.beginIndex === beginIndex && m.beginOffset === beginOffset &&
			m.endIndex === endIndex && m.endOffset === endOffset
		);
	}

	findOrCreateMarker(file: string, page: number, beginIndex: number, beginOffset: number, endIndex: number, endOffset: number, text: string): PdfMarker {
		const existing = this.findExistingMarker(file, page, beginIndex, beginOffset, endIndex, endOffset);
		if (existing) return existing;

		const marker: PdfMarker = {
			id: this.generateId(),
			file, page,
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
		return this.markers.filter(m => m.file === file && m.page === page);
	}

	getMarkersForFile(file: string): PdfMarker[] {
		return this.markers.filter(m => m.file === file);
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

	// ── Private ──

	private deleteMarker(id: string): void {
		this.markers = this.markers.filter(m => m.id !== id);
	}

	private generateId(): string {
		return Date.now().toString(36) + Math.random().toString(36).substring(2);
	}
}

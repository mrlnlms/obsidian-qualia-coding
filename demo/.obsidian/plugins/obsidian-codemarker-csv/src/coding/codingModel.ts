import type { Plugin } from "obsidian";
import type { SegmentMarker, RowMarker, CodingData, CodingSnapshot } from "./codingTypes";
import { loadSharedRegistry, saveSharedRegistry, type RegistryData } from "./sharedRegistry";

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

  /** Import a definition from shared registry (preserves original id) */
  importDefinition(def: CodeDefinition): void {
    if (this.definitions.has(def.id)) return;
    if (this.nameIndex.has(def.name)) return;
    this.definitions.set(def.id, { ...def });
    this.nameIndex.set(def.name, def.id);
  }

  /** Sync palette index to be at least `sharedIdx` */
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

// ── CodingModel ──
type ChangeListener = () => void;

export type CsvMarker = SegmentMarker | RowMarker;

export class CodingModel {
  plugin: Plugin;
  readonly registry: CodeDefinitionRegistry;
  private segmentMarkers: SegmentMarker[] = [];
  private rowMarkers: RowMarker[] = [];
  private listeners: ChangeListener[] = [];
  private saveTimeout: number | null = null;

  /** Cache of row data per file — populated by CsvCodingView on load, cleared on unload */
  rowDataCache: Map<string, Record<string, string>[]> = new Map();

  constructor(plugin: Plugin) {
    this.plugin = plugin;
    this.registry = new CodeDefinitionRegistry();
  }

  // ── Persistence ──

  async load(): Promise<void> {
    const raw = await this.plugin.loadData();
    if (!raw) return;
    const data = raw as Partial<CodingData>;
    if (data.segmentMarkers) this.segmentMarkers = data.segmentMarkers;
    if (data.rowMarkers) this.rowMarkers = data.rowMarkers;
    if (data.registry) {
      const loaded = CodeDefinitionRegistry.fromJSON(data.registry);
      Object.assign(this.registry, loaded);
    }

    // Merge with shared registry
    await this.syncSharedRegistry();

    console.log(`[CodeMarker CSV] Loaded: ${this.segmentMarkers.length} segments, ${this.rowMarkers.length} rows, ${this.registry.getAll().length} codes`);
  }

  async save(): Promise<void> {
    // Preserve existing data (e.g. settings) and merge coding data
    const existing = (await this.plugin.loadData()) ?? {};
    existing.segmentMarkers = this.segmentMarkers;
    existing.rowMarkers = this.rowMarkers;
    existing.registry = this.registry.toJSON();
    await this.plugin.saveData(existing);

    // Save to shared registry
    await this.syncSharedRegistry();
  }

  private async syncSharedRegistry(): Promise<void> {
    try {
      const vault = (this.plugin.app as any).vault;
      const shared = await loadSharedRegistry(vault);

      if (shared) {
        // Import definitions from shared that we don't have locally
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

      // Write back merged state
      const registryJSON = this.registry.toJSON();
      const outData: RegistryData = {
        definitions: registryJSON.definitions,
        nextPaletteIndex: registryJSON.nextPaletteIndex,
      };
      await saveSharedRegistry(vault, outData);
    } catch (e) {
      console.warn('[CodeMarker CSV] Shared registry sync failed:', e);
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

  // ── Row Markers ──

  getRowMarkersForCell(file: string, row: number, column: string): RowMarker[] {
    return this.rowMarkers.filter(m => m.file === file && m.row === row && m.column === column);
  }

  findOrCreateRowMarker(file: string, row: number, column: string): RowMarker {
    const existing = this.rowMarkers.find(m => m.file === file && m.row === row && m.column === column);
    if (existing) return existing;
    const marker: RowMarker = {
      id: this.generateId(),
      file, row, column,
      codes: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.rowMarkers.push(marker);
    return marker;
  }

  // ── Segment Markers ──

  getSegmentMarkersForCell(file: string, row: number, column: string): SegmentMarker[] {
    return this.segmentMarkers.filter(m => m.file === file && m.row === row && m.column === column);
  }

  findOrCreateSegmentMarker(snapshot: CodingSnapshot): SegmentMarker {
    const existing = this.segmentMarkers.find(m =>
      m.file === snapshot.file && m.row === snapshot.row && m.column === snapshot.column &&
      m.from === snapshot.from && m.to === snapshot.to
    );
    if (existing) return existing;
    const marker: SegmentMarker = {
      id: this.generateId(),
      file: snapshot.file,
      row: snapshot.row,
      column: snapshot.column,
      from: snapshot.from,
      to: snapshot.to,
      codes: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.segmentMarkers.push(marker);
    return marker;
  }

  // ── Code assignment (works for both marker types) ──

  addCodeToMarker(markerId: string, codeName: string): void {
    // Ensure code definition exists
    this.registry.create(codeName);

    const marker = this.findMarkerById(markerId);
    if (!marker) return;
    if (!marker.codes.includes(codeName)) {
      marker.codes.push(codeName);
      marker.updatedAt = Date.now();
      this.notify();
    }
  }

  removeCodeFromMarker(markerId: string, codeName: string, keepIfEmpty = false): void {
    const marker = this.findMarkerById(markerId);
    if (!marker) return;
    marker.codes = marker.codes.filter(c => c !== codeName);
    marker.updatedAt = Date.now();

    if (marker.codes.length === 0 && !keepIfEmpty) {
      this.deleteMarker(markerId);
    }
    this.notify();
  }

  // ── Lookup helpers ──

  findMarkerById(id: string): CsvMarker | undefined {
    return this.segmentMarkers.find(m => m.id === id) || this.rowMarkers.find(m => m.id === id);
  }

  /** Get unique code names for a cell (across all markers of given type) */
  getCodesForCell(file: string, row: number, column: string, type: "segment" | "row"): string[] {
    const markers = type === "segment"
      ? this.getSegmentMarkersForCell(file, row, column)
      : this.getRowMarkersForCell(file, row, column);
    const codes = new Set<string>();
    for (const m of markers) for (const c of m.codes) codes.add(c);
    return Array.from(codes);
  }

  getAllCodes(): CodeDefinition[] {
    return this.registry.getAll();
  }

  /** Get all markers (segments + rows) as a flat array */
  getAllMarkers(): CsvMarker[] {
    return [...this.segmentMarkers, ...this.rowMarkers];
  }

  /** Get text content for a marker from rowDataCache */
  getMarkerText(marker: CsvMarker): string | null {
    const rows = this.rowDataCache.get(marker.file);
    if (!rows || !rows[marker.row]) return null;
    const cellText = rows[marker.row][marker.column] ?? null;
    if (!cellText) return null;

    // For segment markers, extract the substring
    if ('from' in marker && 'to' in marker) {
      return cellText.substring(marker.from, marker.to);
    }
    return cellText;
  }

  /** Get a human-readable label for a marker (e.g. "Row 3 · colA") */
  getMarkerLabel(marker: CsvMarker): string {
    const isSegment = 'from' in marker;
    return `Row ${marker.row + 1} · ${marker.column}${isSegment ? ' (seg)' : ''}`;
  }

  /** Clear all markers (segments + rows) */
  clearAllMarkers(): void {
    this.segmentMarkers = [];
    this.rowMarkers = [];
    this.notify();
  }

  // ── Private ──

  private deleteMarker(id: string): void {
    this.segmentMarkers = this.segmentMarkers.filter(m => m.id !== id);
    this.rowMarkers = this.rowMarkers.filter(m => m.id !== id);
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  }
}

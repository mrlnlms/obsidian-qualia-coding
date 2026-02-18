/**
 * CodingModel — manages markers (row-level and segment-level) and
 * code definitions for the CSV coding plugin.
 */

import type CsvViewerPlugin from '../main';
import { CodeDefinitionRegistry } from './codeDefinitionRegistry';
import { loadSharedRegistry, saveSharedRegistry, mergeRegistries } from './sharedRegistry';

export interface RowMarker {
	id: string;
	file: string;
	row: number;
	column: string;
	codes: string[];
	createdAt: number;
	updatedAt: number;
}

export interface SegmentMarker {
	id: string;
	file: string;
	row: number;
	column: string;
	from: number;
	to: number;
	codes: string[];
	createdAt: number;
	updatedAt: number;
}

export type CsvMarker = RowMarker | SegmentMarker;

export function isSegmentMarker(m: CsvMarker): m is SegmentMarker {
	return 'from' in m;
}

export class CodingModel {
	plugin: CsvViewerPlugin;
	registry: CodeDefinitionRegistry = new CodeDefinitionRegistry();
	rowMarkers: RowMarker[] = [];
	segmentMarkers: SegmentMarker[] = [];
	rowDataCache: Map<string, Record<string, string>[]> = new Map();

	constructor(plugin: CsvViewerPlugin) {
		this.plugin = plugin;
	}

	// ── Persistence ──────────────────────────────────────────

	async load(): Promise<void> {
		const data = await this.plugin.loadData();
		if (data) {
			if (data.rowMarkers) this.rowMarkers = data.rowMarkers;
			if (data.segmentMarkers) this.segmentMarkers = data.segmentMarkers;

			if (data.codeDefinitions) {
				this.registry = CodeDefinitionRegistry.fromJSON({
					definitions: data.codeDefinitions,
					nextPaletteIndex: data.nextPaletteIndex ?? 0,
				});
			}
		}

		// Merge with shared registry
		const vault = this.plugin.app.vault;
		const shared = await loadSharedRegistry(vault);
		if (shared) {
			mergeRegistries(this.registry, shared);
		}
		await saveSharedRegistry(vault, this.registry.toJSON());
	}

	async save(): Promise<void> {
		const registryData = this.registry.toJSON();
		const data = (await this.plugin.loadData()) || {};

		data.rowMarkers = this.rowMarkers;
		data.segmentMarkers = this.segmentMarkers;
		data.codeDefinitions = registryData.definitions;
		data.nextPaletteIndex = registryData.nextPaletteIndex;

		await this.plugin.saveData(data);
		await saveSharedRegistry(this.plugin.app.vault, registryData);
		this.plugin.app.workspace.trigger('codemarker-csv:model-changed');
	}

	// ── Row Data Cache ───────────────────────────────────────

	setRowData(file: string, data: Record<string, string>[]): void {
		this.rowDataCache.set(file, data);
	}

	clearRowData(file: string): void {
		this.rowDataCache.delete(file);
	}

	// ── Marker CRUD ──────────────────────────────────────────

	addRowMarker(file: string, row: number, column: string, codeName: string, color?: string): RowMarker {
		if (!this.registry.getByName(codeName)) {
			this.registry.create(codeName, color);
		}

		// Check existing row marker for same cell
		const existing = this.rowMarkers.find(
			m => m.file === file && m.row === row && m.column === column
		);
		if (existing) {
			if (!existing.codes.includes(codeName)) {
				existing.codes.push(codeName);
				existing.updatedAt = Date.now();
			}
			this.save();
			return existing;
		}

		const marker: RowMarker = {
			id: this.generateId(),
			file, row, column,
			codes: [codeName],
			createdAt: Date.now(),
			updatedAt: Date.now(),
		};
		this.rowMarkers.push(marker);
		this.save();
		return marker;
	}

	addSegmentMarker(file: string, row: number, column: string, from: number, to: number, codeName: string, color?: string): SegmentMarker {
		if (!this.registry.getByName(codeName)) {
			this.registry.create(codeName, color);
		}

		const existing = this.segmentMarkers.find(
			m => m.file === file && m.row === row && m.column === column && m.from === from && m.to === to
		);
		if (existing) {
			if (!existing.codes.includes(codeName)) {
				existing.codes.push(codeName);
				existing.updatedAt = Date.now();
			}
			this.save();
			return existing;
		}

		const marker: SegmentMarker = {
			id: this.generateId(),
			file, row, column, from, to,
			codes: [codeName],
			createdAt: Date.now(),
			updatedAt: Date.now(),
		};
		this.segmentMarkers.push(marker);
		this.save();
		return marker;
	}

	removeCodeFromMarker(markerId: string, codeName: string): boolean {
		const marker = this.findMarkerById(markerId);
		if (!marker) return false;

		const idx = marker.codes.indexOf(codeName);
		if (idx < 0) return false;

		marker.codes.splice(idx, 1);
		marker.updatedAt = Date.now();

		if (marker.codes.length === 0) {
			this.removeMarker(markerId);
		} else {
			this.save();
		}
		return true;
	}

	removeMarker(markerId: string): boolean {
		let idx = this.rowMarkers.findIndex(m => m.id === markerId);
		if (idx >= 0) {
			this.rowMarkers.splice(idx, 1);
			this.save();
			return true;
		}
		idx = this.segmentMarkers.findIndex(m => m.id === markerId);
		if (idx >= 0) {
			this.segmentMarkers.splice(idx, 1);
			this.save();
			return true;
		}
		return false;
	}

	// ── Queries ──────────────────────────────────────────────

	findMarkerById(markerId: string): CsvMarker | null {
		return this.rowMarkers.find(m => m.id === markerId)
			?? this.segmentMarkers.find(m => m.id === markerId)
			?? null;
	}

	getAllMarkers(): CsvMarker[] {
		return [...this.rowMarkers, ...this.segmentMarkers];
	}

	getMarkersForFile(file: string): CsvMarker[] {
		return this.getAllMarkers().filter(m => m.file === file);
	}

	getAllFileIds(): string[] {
		const files = new Set<string>();
		for (const m of this.getAllMarkers()) files.add(m.file);
		return Array.from(files);
	}

	getMarkerText(marker: CsvMarker): string | null {
		const rows = this.rowDataCache.get(marker.file);
		if (!rows || !rows[marker.row]) return null;
		// Strip coding suffix to get the source column name
		const sourceCol = marker.column
			.replace(/_cod-seg$/, '')
			.replace(/_cod-frow$/, '');
		const cellText = rows[marker.row][sourceCol] ?? '';
		if (isSegmentMarker(marker)) {
			return cellText.substring(marker.from, marker.to);
		}
		return cellText;
	}

	getMarkerLabel(marker: CsvMarker): string {
		if (isSegmentMarker(marker)) {
			return `Row ${marker.row} \u00b7 ${marker.column} [${marker.from}:${marker.to}]`;
		}
		return `Row ${marker.row} \u00b7 ${marker.column}`;
	}

	/**
	 * Get all markers for a specific cell (row + column) in a file.
	 * Returns RowMarkers that match exactly and SegmentMarkers within that cell.
	 */
	getMarkersForCell(file: string, row: number, column: string): CsvMarker[] {
		const result: CsvMarker[] = [];
		for (const m of this.rowMarkers) {
			if (m.file === file && m.row === row && m.column === column) result.push(m);
		}
		for (const m of this.segmentMarkers) {
			if (m.file === file && m.row === row && m.column === column) result.push(m);
		}
		return result;
	}

	/**
	 * Collect all unique code names attached to markers in a cell.
	 * Returns { codeName, markerId, color } tuples for chip rendering.
	 */
	getCodesForCell(file: string, row: number, column: string): { codeName: string; markerId: string; color: string }[] {
		const markers = this.getMarkersForCell(file, row, column);
		const seen = new Set<string>();
		const result: { codeName: string; markerId: string; color: string }[] = [];
		for (const m of markers) {
			for (const code of m.codes) {
				if (!seen.has(code)) {
					seen.add(code);
					const def = this.registry.getByName(code);
					result.push({ codeName: code, markerId: m.id, color: def?.color ?? '#888' });
				}
			}
		}
		return result;
	}

	// ── Internal ─────────────────────────────────────────────

	private generateId(): string {
		return Date.now().toString(36) + Math.random().toString(36).substring(2);
	}
}

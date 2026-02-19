/**
 * ImageCodingModel — CRUD for ImageMarkers + persistence via plugin data.json.
 * Follows the same patterns as CodingModel in codemarker-csv.
 */

import type { Plugin } from 'obsidian';
import { CodeDefinitionRegistry } from './codeDefinitionRegistry';
import type { CodeDefinition } from './codeDefinitionRegistry';
import { loadSharedRegistry, saveSharedRegistry } from './sharedRegistry';
import type { ImageMarker, ImageCodingData, RegionShape, NormalizedCoords } from './imageCodingTypes';

export type ChangeListener = () => void;

export class ImageCodingModel {
	plugin: Plugin;
	readonly registry: CodeDefinitionRegistry;
	private markers: ImageMarker[] = [];
	private listeners: ChangeListener[] = [];
	private saveTimeout: number | null = null;

	constructor(plugin: Plugin) {
		this.plugin = plugin;
		this.registry = new CodeDefinitionRegistry();
	}

	// ─── Lifecycle ───

	async load(): Promise<void> {
		const data = (await this.plugin.loadData()) as Partial<ImageCodingData> | null;

		if (data?.markers) {
			this.markers = data.markers;
		}
		if (data?.registry) {
			(this as any).registry = CodeDefinitionRegistry.fromJSON(data.registry);
		}

		await this.syncSharedRegistry();
	}

	async save(): Promise<void> {
		const existing = (await this.plugin.loadData()) || {};
		const data: ImageCodingData = {
			...existing,
			markers: this.markers,
			registry: this.registry.toJSON(),
		};
		await this.plugin.saveData(data);
		await this.syncSharedRegistry();
	}

	private scheduleSave(): void {
		if (this.saveTimeout !== null) {
			window.clearTimeout(this.saveTimeout);
		}
		this.saveTimeout = window.setTimeout(() => {
			this.saveTimeout = null;
			this.save();
		}, 500);
	}

	private async syncSharedRegistry(): Promise<void> {
		const vault = this.plugin.app.vault;
		const shared = await loadSharedRegistry(vault);
		const local = this.registry;

		if (shared) {
			// Import shared defs not in local
			for (const id in shared.definitions) {
				const sharedDef = shared.definitions[id];
				const localDef = local.getByName(sharedDef.name);
				if (!localDef) {
					local.importDefinition(sharedDef);
				} else if (sharedDef.updatedAt > localDef.updatedAt) {
					local.update(localDef.id, {
						color: sharedDef.color,
						description: sharedDef.description,
					});
				}
			}
			local.syncPaletteIndex(shared.nextPaletteIndex);
		}

		// Write merged back
		await saveSharedRegistry(vault, local.toJSON());
	}

	// ─── Listeners ───

	onChange(fn: ChangeListener): void {
		this.listeners.push(fn);
	}

	offChange(fn: ChangeListener): void {
		this.listeners = this.listeners.filter((l) => l !== fn);
	}

	private notify(): void {
		this.scheduleSave();
		for (const fn of this.listeners) fn();
	}

	// ─── Marker CRUD ───

	getMarkersForFile(file: string): ImageMarker[] {
		return this.markers.filter((m) => m.file === file);
	}

	getAllMarkers(): ImageMarker[] {
		return [...this.markers];
	}

	findMarkerById(id: string): ImageMarker | undefined {
		return this.markers.find((m) => m.id === id);
	}

	createMarker(
		file: string,
		shape: RegionShape,
		coords: NormalizedCoords
	): ImageMarker {
		const marker: ImageMarker = {
			id: this.generateId(),
			file,
			shape,
			coords,
			codes: [],
			createdAt: Date.now(),
			updatedAt: Date.now(),
		};
		this.markers.push(marker);
		this.notify();
		return marker;
	}

	updateMarkerCoords(id: string, coords: NormalizedCoords): boolean {
		const marker = this.findMarkerById(id);
		if (!marker) return false;
		marker.coords = coords;
		marker.updatedAt = Date.now();
		this.notify();
		return true;
	}

	deleteMarker(id: string): boolean {
		const idx = this.markers.findIndex((m) => m.id === id);
		if (idx < 0) return false;
		this.markers.splice(idx, 1);
		this.notify();
		return true;
	}

	// ─── Code assignment ───

	addCodeToMarker(markerId: string, codeName: string): boolean {
		const marker = this.findMarkerById(markerId);
		if (!marker) return false;

		// Ensure code definition exists
		this.registry.create(codeName);

		if (!marker.codes.includes(codeName)) {
			marker.codes.push(codeName);
			marker.updatedAt = Date.now();
			this.notify();
		}
		return true;
	}

	removeCodeFromMarker(markerId: string, codeName: string, keepIfEmpty = false): boolean {
		const marker = this.findMarkerById(markerId);
		if (!marker) return false;

		const idx = marker.codes.indexOf(codeName);
		if (idx < 0) return false;

		marker.codes.splice(idx, 1);
		marker.updatedAt = Date.now();

		if (marker.codes.length === 0 && !keepIfEmpty) {
			this.deleteMarker(markerId);
		} else {
			this.notify();
		}
		return true;
	}

	getCodesForMarker(markerId: string): string[] {
		const marker = this.findMarkerById(markerId);
		return marker ? [...marker.codes] : [];
	}

	// ─── Internal ───

	private generateId(): string {
		return Date.now().toString(36) + Math.random().toString(36).substring(2);
	}
}

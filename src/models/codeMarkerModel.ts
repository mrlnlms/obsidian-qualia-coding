import { Editor, MarkdownView } from 'obsidian';
import CodeMarkerPlugin from '../main';
import { CodeMarkerSettings } from './settings';
import { CodeItem, SelectionSnapshot } from '../menu/menuTypes';
import { getViewForFile as getViewForFileLookup } from '../cm6/utils/viewLookupUtils';
import { CodeDefinitionRegistry } from './codeDefinitionRegistry';

export interface Marker {
	id: string;
	fileId: string;
	range: {
		from: { line: number; ch: number; };
		to: { line: number; ch: number; };
	};
	color: string;
	codes: string[];
	createdAt: number;
	updatedAt: number;
}

export class CodeMarkerModel {
	private markers: Map<string, Marker[]> = new Map();
	private codeDescriptions: Record<string, string> = {};
	readonly registry: CodeDefinitionRegistry = new CodeDefinitionRegistry();
	plugin: CodeMarkerPlugin;

	constructor(plugin: CodeMarkerPlugin) {
		this.plugin = plugin;
	}

	async loadMarkers() {
		const data = await this.plugin.loadData();
		if (data) {
			if (data.markers) {
				for (const fileId in data.markers) {
					const fileMarkers: Marker[] = data.markers[fileId].map((m: any) => {
						// Migration: convert old `code: string` to `codes: string[]`
						if ('code' in m && !('codes' in m)) {
							const codes = m.code ? [m.code] : [];
							const { code, ...rest } = m;
							return { ...rest, codes };
						}
						return m;
					});
					this.markers.set(fileId, fileMarkers);
				}

				// Update all open views
				const leaves = this.plugin.app.workspace.getLeavesOfType('markdown');
				for (const leaf of leaves) {
					const view = leaf.view;
					if (view instanceof MarkdownView && view.file) {
						this.updateMarkersForFile(view.file.path);
					}
				}
			}
			if (data.codeDescriptions) {
				this.codeDescriptions = data.codeDescriptions;
			}

			// Load or migrate CodeDefinition Registry
			if (data.codeDefinitions) {
				// Registry already exists — deserialize
				const loaded = CodeDefinitionRegistry.fromJSON({
					definitions: data.codeDefinitions,
					nextPaletteIndex: data.nextPaletteIndex ?? 0
				});
				// Replace the default empty registry
				(this as any).registry = loaded;
			} else {
				// Migration: extract codes from existing markers → create definitions
				this.migrateCodeDefinitions();
			}
		}
	}

	/**
	 * One-time migration: create CodeDefinitions from existing markers.
	 * Takes color from the first marker that uses each code,
	 * and description from codeDescriptions if available.
	 */
	private migrateCodeDefinitions() {
		const seenCodes = new Set<string>();

		for (const [, markers] of this.markers.entries()) {
			for (const marker of markers) {
				for (const codeName of marker.codes) {
					if (!seenCodes.has(codeName)) {
						seenCodes.add(codeName);
						const description = this.codeDescriptions[codeName];
						this.registry.create(codeName, marker.color, description);
					}
				}
			}
		}

		if (seenCodes.size > 0) {
			this.saveMarkers();
		}
	}

	createMarker(editor: Editor, view: MarkdownView): Marker | null {
		if (!view.file) return null;

		const selectedText = editor.getSelection();
		if (!selectedText?.trim()) return null;

		const anchor = editor.getCursor('anchor');
		const head = editor.getCursor('head');

		const from = this.isPositionBefore(anchor, head) ? anchor : head;
		const to = this.isPositionBefore(anchor, head) ? head : anchor;

		const marker: Marker = {
			id: this.generateId(),
			fileId: view.file.path,
			range: { from, to },
			color: this.plugin.settings.defaultColor,
			codes: [],
			createdAt: Date.now(),
			updatedAt: Date.now()
		};

		this.addMarkerToFile(view.file.path, marker);
		this.saveMarkers();

		return marker;
	}

	/**
	 * Find an existing marker that exactly matches a selection range, or create a new one.
	 */
	findOrCreateMarkerAtSelection(snapshot: SelectionSnapshot): Marker {
		const existing = this.findMarkerAtExactRange(snapshot);
		if (existing) return existing;

		// No exact match — create new marker
		const targetView = this.getViewForFile(snapshot.fileId);

		if (targetView?.editor) {
			// @ts-ignore
			const fromPos = targetView.editor.offsetToPos(snapshot.from);
			// @ts-ignore
			const toPos = targetView.editor.offsetToPos(snapshot.to);

			const marker: Marker = {
				id: this.generateId(),
				fileId: snapshot.fileId,
				range: { from: fromPos, to: toPos },
				color: this.plugin.settings.defaultColor,
				codes: [],
				createdAt: Date.now(),
				updatedAt: Date.now()
			};

			this.addMarkerToFile(snapshot.fileId, marker);
			this.saveMarkers();
			return marker;
		}

		// Fallback: create marker without position conversion
		const marker: Marker = {
			id: this.generateId(),
			fileId: snapshot.fileId,
			range: {
				from: { line: 0, ch: snapshot.from },
				to: { line: 0, ch: snapshot.to }
			},
			color: this.plugin.settings.defaultColor,
			codes: [],
			createdAt: Date.now(),
			updatedAt: Date.now()
		};

		this.addMarkerToFile(snapshot.fileId, marker);
		this.saveMarkers();
		return marker;
	}

	/**
	 * Find an existing marker that exactly matches a selection range (no creation).
	 */
	findMarkerAtExactRange(snapshot: SelectionSnapshot): Marker | null {
		const fileMarkers = this.getMarkersForFile(snapshot.fileId);
		const targetView = this.getViewForFile(snapshot.fileId);

		if (targetView?.editor) {
			for (const marker of fileMarkers) {
				try {
					// @ts-ignore
					const startOffset = targetView.editor.posToOffset(marker.range.from);
					// @ts-ignore
					const endOffset = targetView.editor.posToOffset(marker.range.to);
					if (startOffset === snapshot.from && endOffset === snapshot.to) {
						return marker;
					}
				} catch {
					continue;
				}
			}
		}
		return null;
	}

	/**
	 * Get all markers that overlap with a given range in a file.
	 */
	getMarkersInRange(fileId: string, from: number, to: number): Marker[] {
		const markers = this.getMarkersForFile(fileId);
		const targetView = this.getViewForFile(fileId);
		if (!targetView?.editor) return [];

		const result: Marker[] = [];
		for (const marker of markers) {
			try {
				// @ts-ignore
				const startOffset = targetView.editor.posToOffset(marker.range.from);
				// @ts-ignore
				const endOffset = targetView.editor.posToOffset(marker.range.to);
				// Check overlap
				if (startOffset <= to && endOffset >= from) {
					result.push(marker);
				}
			} catch {
				continue;
			}
		}
		return result;
	}

	/**
	 * Get all unique codes from the registry.
	 */
	getAllCodes(): CodeItem[] {
		return this.registry.getAll().map(def => ({
			name: def.name,
			color: def.color,
			createdAt: def.createdAt
		}));
	}

	/**
	 * Add a code to a marker's codes array.
	 * Ensures a CodeDefinition exists in the registry (auto-creates if missing).
	 */
	addCodeToMarker(markerId: string, codeName: string, color?: string): boolean {
		const marker = this.getMarkerById(markerId);
		if (!marker) return false;

		// Ensure code definition exists in registry
		if (!this.registry.getByName(codeName)) {
			this.registry.create(codeName, color);
		}

		if (!marker.codes.includes(codeName)) {
			marker.codes.push(codeName);
			marker.updatedAt = Date.now();
			if (color) marker.color = color;
			this.saveMarkers();
			this.updateMarkersForFile(marker.fileId);
			return true;
		}
		return false;
	}

	/**
	 * Remove a code from a marker. If no codes remain, remove the marker entirely
	 * unless keepIfEmpty is true (used to defer deletion while a menu is open).
	 */
	removeCodeFromMarker(markerId: string, codeName: string, keepIfEmpty = false): boolean {
		const marker = this.getMarkerById(markerId);
		if (!marker) return false;

		const idx = marker.codes.indexOf(codeName);
		if (idx >= 0) {
			marker.codes.splice(idx, 1);
			marker.updatedAt = Date.now();

			if (marker.codes.length === 0 && !keepIfEmpty) {
				this.removeMarker(markerId);
			} else {
				this.saveMarkers();
				this.updateMarkersForFile(marker.fileId);
			}
			return true;
		}
		return false;
	}

	/**
	 * Remove a marker if it has no codes left. Used for deferred cleanup.
	 */
	cleanupEmptyMarker(markerId: string): boolean {
		const marker = this.getMarkerById(markerId);
		if (marker && marker.codes.length === 0) {
			return this.removeMarker(markerId);
		}
		return false;
	}

	/**
	 * Remove all codes from a marker (removes the marker entirely).
	 */
	removeAllCodesFromMarker(markerId: string): boolean {
		const marker = this.getMarkerById(markerId);
		if (!marker) return false;

		return this.removeMarker(markerId);
	}

	private generateId(): string {
		return Date.now().toString(36) + Math.random().toString(36).substring(2);
	}

	private addMarkerToFile(fileId: string, marker: Marker) {
		if (!this.markers.has(fileId)) {
			this.markers.set(fileId, []);
		}
		const fileMarkers = this.markers.get(fileId);
		if (fileMarkers) {
			fileMarkers.push(marker);
		}
	}

	async saveMarkers() {
		const data = (await this.plugin.loadData()) || {};
		const markersObj: Record<string, Marker[]> = {};

		this.markers.forEach((markers, fileId) => {
			markersObj[fileId] = markers;
		});

		data.markers = markersObj;
		data.codeDescriptions = this.codeDescriptions;

		// Persist registry
		const registryData = this.registry.toJSON();
		data.codeDefinitions = registryData.definitions;
		data.nextPaletteIndex = registryData.nextPaletteIndex;

		await this.plugin.saveData(data);
	}

	posToOffset(pos: {line: number, ch: number}, fileId?: string): number | null {
		try {
			const view = fileId ? this.getViewForFile(fileId) : this.getActiveView();
			if (!view?.editor) return null;
			// @ts-ignore
			return view.editor.posToOffset(pos);
		} catch (e) {
			console.error("CodeMarker: Error converting position to offset", e);
			return null;
		}
	}

	offsetToPos(offset: number, fileId?: string): {line: number, ch: number} | null {
		try {
			const view = fileId ? this.getViewForFile(fileId) : this.getActiveView();
			if (!view?.editor) return null;
			// @ts-ignore
			return view.editor.offsetToPos(offset);
		} catch (e) {
			console.error("CodeMarker: Error converting offset to position", e);
			return null;
		}
	}

	updateMarkersForFile(fileId: string) {
		const leaves = this.plugin.app.workspace.getLeavesOfType('markdown');

		for (const leaf of leaves) {
			const view = leaf.view;
			if (view instanceof MarkdownView && view.file?.path === fileId) {
				// @ts-ignore
				const editorView = view.editor?.cm;

				if (editorView && this.plugin.updateFileMarkersEffect) {
					editorView.dispatch({
						effects: this.plugin.updateFileMarkersEffect.of({ fileId })
					});
				}
			}
		}
	}

	getMarkerById(markerId: string): Marker | null {
		for (const [, markers] of this.markers.entries()) {
			const marker = markers.find(m => m.id === markerId);
			if (marker) return marker;
		}
		return null;
	}

	getMarkersForFile(fileId: string): Marker[] {
		return this.markers.get(fileId) || [];
	}

	updateMarker(marker: Marker) {
		if (!marker) return;

		const fileMarkers = this.markers.get(marker.fileId);
		if (!fileMarkers) return;

		const index = fileMarkers.findIndex(m => m.id === marker.id);
		if (index >= 0) {
			fileMarkers[index] = marker;
			this.saveMarkers();
		}
	}

	removeMarker(markerId: string): boolean {
		for (const [fileId, markers] of this.markers.entries()) {
			const index = markers.findIndex(m => m.id === markerId);
			if (index >= 0) {
				markers.splice(index, 1);
				this.saveMarkers();
				this.updateMarkersForFile(fileId);
				return true;
			}
		}
		return false;
	}

	getActiveView(): MarkdownView | null {
		return this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
	}

	getViewForFile(fileId: string): MarkdownView | null {
		return getViewForFileLookup(fileId, this.plugin.app);
	}

	getAllViewsForFile(fileId: string): MarkdownView[] {
		const leaves = this.plugin.app.workspace.getLeavesOfType('markdown');
		const views: MarkdownView[] = [];
		for (const leaf of leaves) {
			const view = leaf.view;
			if (view instanceof MarkdownView && view.file?.path === fileId) {
				views.push(view);
			}
		}
		return views;
	}

	isPositionBefore(pos1: {line: number, ch: number}, pos2: {line: number, ch: number}): boolean {
		if (pos1.line < pos2.line) return true;
		if (pos1.line > pos2.line) return false;
		return pos1.ch <= pos2.ch;
	}

	isPositionAfter(pos1: {line: number, ch: number}, pos2: {line: number, ch: number}): boolean {
		if (pos1.line > pos2.line) return true;
		if (pos1.line < pos2.line) return false;
		return pos1.ch >= pos2.ch;
	}

	clearAllMarkers() {
		this.markers.clear();
		this.plugin.saveData({ markers: {} });

		const leaves = this.plugin.app.workspace.getLeavesOfType('markdown');
		for (const leaf of leaves) {
			const view = leaf.view;
			if (view instanceof MarkdownView && view.file) {
				this.updateMarkersForFile(view.file.path);
			}
		}
	}

	getSettings(): CodeMarkerSettings {
		return this.plugin.settings;
	}

	setCodeDescription(codeName: string, description: string) {
		// Write to registry
		const def = this.registry.getByName(codeName);
		if (def) {
			this.registry.update(def.id, { description: description.trim() || undefined });
		}
		// Also update legacy field for backward compat
		if (description.trim()) {
			this.codeDescriptions[codeName] = description;
		} else {
			delete this.codeDescriptions[codeName];
		}
		this.saveMarkers();
	}

	getCodeDescription(codeName: string): string {
		const def = this.registry.getByName(codeName);
		return def?.description ?? this.codeDescriptions[codeName] ?? '';
	}
}

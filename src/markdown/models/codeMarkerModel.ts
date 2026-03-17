import { MarkdownView } from 'obsidian';
import { EditorView } from '@codemirror/view';
import type QualiaCodingPlugin from '../../main';
import { CodeMarkerSettings, DEFAULT_SETTINGS } from './settings';
import { CodeItem, SelectionSnapshot } from '../menu/menuTypes';
import { getViewForFile as getViewForFileLookup } from '../cm6/utils/viewLookupUtils';
import { CodeDefinitionRegistry } from '../../core/codeDefinitionRegistry';
import { setFileIdEffect } from '../cm6/markerStateField';

export interface Marker {
	id: string;
	fileId: string;
	range: {
		from: { line: number; ch: number; };
		to: { line: number; ch: number; };
	};
	color: string;
	colorOverride?: string;
	codes: string[];
	text?: string;
	memo?: string;
	createdAt: number;
	updatedAt: number;
}

export class CodeMarkerModel {
	private markers: Map<string, Marker[]> = new Map();
	registry: CodeDefinitionRegistry;
	plugin: QualiaCodingPlugin;
	private _saveDirty = false;
	private _saveTimer: ReturnType<typeof setTimeout> | null = null;
	private _changeListeners: Set<() => void> = new Set();
	private _hoverListeners: Set<() => void> = new Set();
	private _hoveredMarkerId: string | null = null;
	private _hoveredMarkerIds: string[] = [];
	private _hoveredCodeName: string | null = null;
	private standaloneEditors = new Map<string, EditorView>();

	constructor(plugin: QualiaCodingPlugin, registry: CodeDefinitionRegistry) {
		this.plugin = plugin;
		this.registry = registry;
	}

	/**
	 * Load markers from DataManager (synchronous read — data already loaded).
	 */
	loadMarkers() {
		const markdownData = this.plugin.dataManager.section('markdown');
		const rawMarkers = markdownData.markers;

		if (rawMarkers) {
			for (const fileId in rawMarkers) {
				const fileMarkers: Marker[] = rawMarkers[fileId]!.map((m) => {
					// Migration: convert old `code: string` to `codes: string[]`
					// Legacy data may have { code: "X" } instead of { codes: ["X"] }
					const legacy = m as unknown as Record<string, unknown>;
					if ('code' in legacy && !('codes' in legacy)) {
						const codes = legacy.code ? [legacy.code as string] : [];
						const { code: _, ...rest } = legacy;
						return { ...rest, codes } as unknown as Marker;
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
	}

	findOrCreateMarkerAtSelection(snapshot: SelectionSnapshot): Marker {
		const existing = this.findMarkerAtExactRange(snapshot);
		if (existing) return existing;

		const targetView = this.getViewForFile(snapshot.fileId);

		if (targetView?.editor) {
			const fromPos = targetView.editor.offsetToPos(snapshot.from);
			const toPos = targetView.editor.offsetToPos(snapshot.to);

			const marker: Marker = {
				id: this.generateId(),
				fileId: snapshot.fileId,
				range: { from: fromPos, to: toPos },
				color: this.getSettings().defaultColor,
				codes: [],
				text: snapshot.text,
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
			color: this.getSettings().defaultColor,
			codes: [],
			text: snapshot.text,
			createdAt: Date.now(),
			updatedAt: Date.now()
		};

		this.addMarkerToFile(snapshot.fileId, marker);
		this.saveMarkers();
		return marker;
	}

	findMarkerAtExactRange(snapshot: SelectionSnapshot): Marker | null {
		const fileMarkers = this.getMarkersForFile(snapshot.fileId);
		const targetView = this.getViewForFile(snapshot.fileId);

		if (targetView?.editor) {
			for (const marker of fileMarkers) {
				try {
					const startOffset = targetView.editor.posToOffset(marker.range.from);
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

	getMarkersInRange(fileId: string, from: number, to: number): Marker[] {
		const markers = this.getMarkersForFile(fileId);
		const targetView = this.getViewForFile(fileId);
		if (!targetView?.editor) return [];

		const result: Marker[] = [];
		for (const marker of markers) {
			try {
				const startOffset = targetView.editor.posToOffset(marker.range.from);
				const endOffset = targetView.editor.posToOffset(marker.range.to);
				if (startOffset <= to && endOffset >= from) {
					result.push(marker);
				}
			} catch {
				continue;
			}
		}
		return result;
	}

	getAllCodes(): CodeItem[] {
		return this.registry.getAll().map(def => ({
			name: def.name,
			color: def.color,
			createdAt: def.createdAt
		}));
	}

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

	cleanupEmptyMarker(markerId: string): boolean {
		const marker = this.getMarkerById(markerId);
		if (marker && marker.codes.length === 0) {
			return this.removeMarker(markerId);
		}
		return false;
	}

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

	/**
	 * Persist markers + registry via DataManager.
	 */
	saveMarkers() {
		const markersObj: Record<string, Marker[]> = {};
		this.markers.forEach((markers, fileId) => {
			// Skip virtual fileIds (csv: segment editors) — they are transient
			if (fileId.startsWith('csv:')) return;
			markersObj[fileId] = markers;
		});

		// Write markers to DataManager markdown section (preserve settings)
		const currentSettings = this.plugin.dataManager.section('markdown').settings;
		this.plugin.dataManager.setSection('markdown', { markers: markersObj, settings: currentSettings });

		// Write registry to DataManager registry section
		this.plugin.dataManager.setSection('registry', this.registry.toJSON());

		this._notifyChange();
	}

	/**
	 * Mark that marker positions have changed in-memory and need saving.
	 * Debounces to 2s to avoid writing data.json on every keystroke.
	 */
	markDirtyForSave() {
		this._saveDirty = true;
		if (this._saveTimer) clearTimeout(this._saveTimer);
		this._saveTimer = setTimeout(() => {
			this._saveTimer = null;
			if (this._saveDirty) {
				this._saveDirty = false;
				this.saveMarkers();
			}
		}, 2000);
	}

	flushPendingSave() {
		if (this._saveTimer) {
			clearTimeout(this._saveTimer);
			this._saveTimer = null;
		}
		if (this._saveDirty) {
			this._saveDirty = false;
			this.saveMarkers();
		}
	}

	// ─── File rename tracking ────────────────────────────

	migrateFilePath(oldPath: string, newPath: string): void {
		const markers = this.markers.get(oldPath);
		if (!markers) return;
		this.markers.delete(oldPath);
		for (const m of markers) m.fileId = newPath;
		this.markers.set(newPath, markers);
		this.markDirtyForSave();
		this._notifyChange();

		// Update CM6 state: the editor still has fileId=oldPath cached.
		// Dispatch setFileIdEffect to re-key + updateFileMarkersEffect to rebuild decorations.
		const leaves = this.plugin.app.workspace.getLeavesOfType('markdown');
		for (const leaf of leaves) {
			const view = leaf.view;
			if (view instanceof MarkdownView && view.file?.path === newPath) {
				const editorView = view.editor?.cm as EditorView | undefined;
				if (editorView && this.plugin.updateFileMarkersEffect) {
					editorView.dispatch({
						effects: [
							setFileIdEffect.of({ fileId: newPath }),
							this.plugin.updateFileMarkersEffect.of({ fileId: newPath }),
						]
					});
				}
			}
		}
	}

	// ─── Change listeners (for sidebar auto-refresh) ───────

	onChange(fn: () => void): void { this._changeListeners.add(fn); }
	offChange(fn: () => void): void { this._changeListeners.delete(fn); }
	private _notifyChange(): void { for (const fn of this._changeListeners) fn(); }

	// ─── Hover state (bidirectional: sidebar ↔ editor) ──────

	setHoverState(markerId: string | null, codeName: string | null, hoveredIds?: string[]): void {
		const newIds = hoveredIds ?? (markerId ? [markerId] : []);
		if (this._hoveredMarkerId === markerId && this._hoveredCodeName === codeName
			&& this._hoveredMarkerIds.length === newIds.length) return;
		this._hoveredMarkerId = markerId;
		this._hoveredMarkerIds = newIds;
		this._hoveredCodeName = codeName;
		for (const fn of this._hoverListeners) fn();
	}

	getHoverMarkerId(): string | null { return this._hoveredMarkerId; }
	getHoverMarkerIds(): string[] { return this._hoveredMarkerIds; }
	getHoverCodeName(): string | null { return this._hoveredCodeName; }

	onHoverChange(fn: () => void): void { this._hoverListeners.add(fn); }
	offHoverChange(fn: () => void): void { this._hoverListeners.delete(fn); }

	posToOffset(pos: { line: number; ch: number }, fileId?: string): number | null {
		try {
			const view = fileId ? this.getViewForFile(fileId) : this.getActiveView();
			if (!view?.editor) return null;
			return view.editor.posToOffset(pos);
		} catch (e) {
			console.error("QualiaCoding: Error converting position to offset", e);
			return null;
		}
	}

	offsetToPos(offset: number, fileId?: string): { line: number; ch: number } | null {
		try {
			const view = fileId ? this.getViewForFile(fileId) : this.getActiveView();
			if (!view?.editor) return null;
			return view.editor.offsetToPos(offset);
		} catch (e) {
			console.error("QualiaCoding: Error converting offset to position", e);
			return null;
		}
	}

	updateMarkersForFile(fileId: string) {
		// Check standalone editors first (e.g. CSV segment editors)
		const standalone = this.standaloneEditors.get(fileId);
		if (standalone && this.plugin.updateFileMarkersEffect) {
			standalone.dispatch({
				effects: this.plugin.updateFileMarkersEffect.of({ fileId })
			});
			return;
		}

		const leaves = this.plugin.app.workspace.getLeavesOfType('markdown');

		for (const leaf of leaves) {
			const view = leaf.view;
			if (view instanceof MarkdownView && view.file?.path === fileId) {
				const editorView = view.editor?.cm;

				if (editorView && this.plugin.updateFileMarkersEffect) {
					editorView.dispatch({
						effects: this.plugin.updateFileMarkersEffect.of({ fileId })
					});
				}
			}
		}
	}

	updateDecorations(fileId: string) {
		this.updateMarkersForFile(fileId);
	}

	getMarkerById(markerId: string): Marker | null {
		for (const [, markers] of this.markers.entries()) {
			const marker = markers.find(m => m.id === markerId);
			if (marker) return marker;
		}
		return null;
	}

	getAllMarkers(): Marker[] {
		const all: Marker[] = [];
		for (const [fileId, markers] of this.markers.entries()) {
			if (fileId.startsWith('csv:')) continue;
			all.push(...markers);
		}
		return all;
	}

	getAllFileIds(): string[] {
		return Array.from(this.markers.keys()).filter(id => !id.startsWith('csv:'));
	}

	getMarkersForFile(fileId: string): Marker[] {
		return this.markers.get(fileId) || [];
	}

	updateMarkerFields(markerId: string, fields: { memo?: string; colorOverride?: string }): void {
		const marker = this.getMarkerById(markerId);
		if (!marker) return;
		if ('memo' in fields) marker.memo = fields.memo;
		if ('colorOverride' in fields) marker.colorOverride = fields.colorOverride;
		marker.updatedAt = Date.now();
		this.saveMarkers();
		this.updateMarkersForFile(marker.fileId);
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

	isPositionBefore(pos1: { line: number; ch: number }, pos2: { line: number; ch: number }): boolean {
		if (pos1.line < pos2.line) return true;
		if (pos1.line > pos2.line) return false;
		return pos1.ch <= pos2.ch;
	}

	isPositionAfter(pos1: { line: number; ch: number }, pos2: { line: number; ch: number }): boolean {
		if (pos1.line > pos2.line) return true;
		if (pos1.line < pos2.line) return false;
		return pos1.ch >= pos2.ch;
	}

	clearAllMarkers() {
		this.markers.clear();
		const currentSettings = this.plugin.dataManager.section('markdown').settings;
		this.plugin.dataManager.setSection('markdown', { markers: {}, settings: currentSettings });
		this._notifyChange();

		const leaves = this.plugin.app.workspace.getLeavesOfType('markdown');
		for (const leaf of leaves) {
			const view = leaf.view;
			if (view instanceof MarkdownView && view.file) {
				this.updateMarkersForFile(view.file.path);
			}
		}
	}

	getAutoRevealOnSegmentClick(): boolean {
		return this.getSettings().autoRevealOnSegmentClick;
	}

	getSettings(): CodeMarkerSettings {
		return this.plugin.dataManager.section('markdown').settings;
	}

	updateSettings(partial: Partial<CodeMarkerSettings>): void {
		const section = this.plugin.dataManager.section('markdown');
		section.settings = { ...section.settings, ...partial };
		this.plugin.dataManager.markDirty();
	}

	deleteCode(codeName: string) {
		const def = this.registry.getByName(codeName);
		if (!def) return;

		// Remove code from all markers; delete markers left with no codes
		const allMarkers = this.getAllMarkers();
		const affectedFiles = new Set<string>();
		for (const marker of allMarkers) {
			const idx = marker.codes.indexOf(codeName);
			if (idx < 0) continue;
			marker.codes.splice(idx, 1);
			affectedFiles.add(marker.fileId);
			if (marker.codes.length === 0) {
				this.removeMarker(marker.id);
			}
		}

		this.registry.delete(def.id);
		this.saveMarkers();

		for (const fileId of affectedFiles) {
			this.updateMarkersForFile(fileId);
		}
	}

	setCodeDescription(codeName: string, description: string) {
		const def = this.registry.getByName(codeName);
		if (def) {
			this.registry.update(def.id, { description: description.trim() || undefined });
		}
		this.saveMarkers();
	}

	getCodeDescription(codeName: string): string {
		const def = this.registry.getByName(codeName);
		return def?.description ?? '';
	}

	// ─── Standalone editor support (CSV segment editors) ─────

	/** Add a pre-built marker directly (no save, no position conversion). */
	addMarkerDirect(fileId: string, marker: Marker): void {
		this.addMarkerToFile(fileId, marker);
	}

	/** Clear all markers for a virtual fileId (e.g. csv:...). */
	clearMarkersForFile(fileId: string): void {
		this.markers.delete(fileId);
	}

	/** Register a standalone CM6 EditorView under a virtual fileId. */
	registerStandaloneEditor(fileId: string, editorView: EditorView): void {
		this.standaloneEditors.set(fileId, editorView);
	}

	/** Unregister a standalone CM6 EditorView. */
	unregisterStandaloneEditor(fileId: string): void {
		this.standaloneEditors.delete(fileId);
	}
}

import { FileView, TFile, WorkspaceLeaf } from 'obsidian';
import type QualiaCodingPlugin from '../../main';
import type { ImageCodingModel } from '../imageCodingModel';
import {
	type FabricCanvasState,
	setupFabricCanvas,
	teardownFabricCanvas,
} from '../canvas/fabricCanvas';
import { type RegionDrawingState, setupRegionDrawing } from '../canvas/regionDrawing';
import { type ZoomPanCleanup, setupZoomPanControls } from '../canvas/zoomPanControls';
import { type ToolbarState, createToolbar } from '../imageToolbar';
import { RegionManager } from '../canvas/regionManager';
import { CodingMenu } from '../imageCodingMenu';
import { RegionLabels } from '../regionLabels';
import { type RegionHighlightState, setupRegionHighlight } from '../regionHighlight';
import { IMAGE_CODING_VIEW_TYPE } from '../../core/mediaViewTypes';
import { visibilityEventBus } from '../../core/visibilityEventBus';

export { IMAGE_CODING_VIEW_TYPE };

export const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'avif', 'svg']);

export class ImageCodingView extends FileView {
	private plugin: QualiaCodingPlugin;
	private model: ImageCodingModel;
	private fabricState: FabricCanvasState | null = null;
	private zoomPanCleanup: ZoomPanCleanup | null = null;
	private toolbarState: ToolbarState | null = null;
	private drawingState: RegionDrawingState | null = null;
	private regionManager: RegionManager | null = null;
	private codingMenu: CodingMenu | null = null;
	private regionLabels: RegionLabels | null = null;
	private regionHighlight: RegionHighlightState | null = null;
	private clearAllHandler: (() => void) | null = null;
	private unsubscribeVisibility?: () => void;
	private readyResolve: (() => void) | null = null;
	private readyPromise = new Promise<void>(resolve => { this.readyResolve = resolve; });
	private loadGeneration = 0;
	private selectionClearedRafId: number | null = null;
	private lastMouseScreen: { x: number; y: number } | null = null;
	private modelChangeRafId: number | null = null;
	private modelChangeListener: (() => void) | null = null;
	private registryChangeListener: (() => void) | null = null;

	/** Resolves when onLoadFile completes and canvas is ready. */
	waitUntilReady(): Promise<void> { return this.readyPromise; }

	constructor(leaf: WorkspaceLeaf, plugin: QualiaCodingPlugin, model: ImageCodingModel) {
		super(leaf);
		this.plugin = plugin;
		this.model = model;
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', (leaf) => {
				if (leaf === this.leaf) {
					this.contentEl.focus();
				}
			})
		);
	}

	getViewType(): string {
		return IMAGE_CODING_VIEW_TYPE;
	}

	getDisplayText(): string {
		return this.file?.basename ?? 'Image Coding';
	}

	getIcon(): string {
		return 'image';
	}

	canAcceptExtension(ext: string): boolean {
		return IMAGE_EXTENSIONS.has(ext.toLowerCase());
	}

	async onLoadFile(file: TFile): Promise<void> {
		this.cleanup();
		this.readyPromise = new Promise<void>(resolve => { this.readyResolve = resolve; });
		const thisGeneration = ++this.loadGeneration;
		this.leaf.updateHeader?.();

		const { contentEl } = this;
		contentEl.tabIndex = -1;
		contentEl.empty();
		contentEl.addClass('codemarker-image-view');

		const container = contentEl.createDiv({ cls: 'codemarker-canvas-container' });
		const imageUrl = this.app.vault.getResourcePath(file);

		try {
			const fabricState = await setupFabricCanvas(container, imageUrl);
			// Stale load — a newer onLoadFile or cleanup was called while we awaited
			if (thisGeneration !== this.loadGeneration) {
				teardownFabricCanvas(fabricState);
				return;
			}
			this.fabricState = fabricState;
			const canvas = this.fabricState.canvas;

			// Region manager
			this.regionManager = new RegionManager(this.fabricState, this.model);
			this.regionManager.restoreMarkers(file.path);

			// Labels
			this.regionLabels = new RegionLabels(canvas, this.model, this.regionManager);
			this.regionLabels.rebuildAll(file.path);

			// Hover highlight (bidirectional: canvas ↔ sidebar)
			this.regionHighlight = setupRegionHighlight(this.fabricState, this.regionManager, this.model);

			// Coding menu
			this.codingMenu = new CodingMenu(this.app, this.model, {
				onCodesChanged: (markerId) => {
					this.regionManager?.refreshStyle(markerId);
					this.regionLabels?.updateLabel(markerId);
				},
				onRegionDeleted: (markerId) => {
					const shape = this.regionManager?.getShapeForMarker(markerId);
					if (shape) {
						this.regionLabels?.removeLabel(markerId);
						this.regionHighlight?.cleanupForShape(shape);
						this.regionManager?.deleteShape(shape);
						canvas.discardActiveObject();
					}
				},
			});

			// Region drawing
			this.drawingState = setupRegionDrawing(this.fabricState, {
				onShapeCreated: (shape, mousePos) => {
					const marker = this.regionManager?.registerShape(shape, file.path);
					if (marker) {
						this.openMenuForMarker(marker.id, true, mousePos);
					}
				},
				onShapeDeleted: (shape) => {
					const markerId = this.regionManager?.getMarkerIdForShape(shape);
					if (markerId) this.regionLabels?.removeLabel(markerId);
					this.regionHighlight?.cleanupForShape(shape);
					this.regionManager?.deleteShape(shape);
				},
				onShapeModified: (shape) => {
					this.regionManager?.syncShapeToModel(shape);
					const markerId = this.regionManager?.getMarkerIdForShape(shape);
					if (markerId) this.regionLabels?.refreshForMarker(markerId);
				},
			});

			// Selection → open coding menu.
			// `cleared` is coalesced in rAF: if `created`/`updated` arrive in the same tick
			// (transient deselect when switching shapes), the pending close is cancelled —
			// avoids menu flash on multi-select handoff.
			canvas.on('selection:created', (opt: any) => {
				this.cancelScheduledMenuClose();
				this.onSelectionChange(opt);
			});
			canvas.on('selection:updated', (opt: any) => {
				this.cancelScheduledMenuClose();
				this.onSelectionChange(opt);
			});
			canvas.on('selection:cleared', () => this.scheduleMenuClose());
			// Track pointer for selection-driven popover positioning (no MouseEvent on
			// programmatic setActiveObject — fallback to bbox in openMenuForMarker).
			canvas.on('mouse:down', (opt: any) => {
				const e = opt.e as MouseEvent | undefined;
				if (e) this.lastMouseScreen = { x: e.clientX, y: e.clientY };
			});

			// Toolbar
			const saveView = () => {
				if (this.fabricState) {
					const c = this.fabricState.canvas;
					const vt = c.viewportTransform;
					this.model.saveFileViewState(file.path, c.getZoom(), vt[4], vt[5]);
				}
				this.regionLabels?.refreshAll();
			};
			this.toolbarState = createToolbar(contentEl, this.fabricState, {
				onDelete: () => this.deleteActiveShapes(),
				onViewChanged: saveView,
			});

			// Delete/Backspace removes the selected shape(s) when no input is focused.
			// Registered on document because Fabric's upperCanvasEl steals keyboard focus
			// from contentEl when the user clicks a shape — keydown never bubbles up.
			// The activeLeaf gate prevents interference with other open views.
			this.registerDomEvent(document, 'keydown', (evt: KeyboardEvent) => {
				if (evt.key !== 'Delete' && evt.key !== 'Backspace') return;
				if (this.app.workspace.activeLeaf !== this.leaf) return;
				if (this.codingMenu?.isOpen()) return;
				const t = evt.target as HTMLElement | null;
				if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
				if (!this.fabricState) return;
				if (this.fabricState.canvas.getActiveObjects().length === 0) return;
				evt.preventDefault();
				evt.stopPropagation();
				this.deleteActiveShapes();
			});
			contentEl.insertBefore(this.toolbarState.el, container);

			this.toolbarState.onModeChange = (mode) => {
				this.codingMenu?.close();
				this.drawingState?.setMode(mode);
			};

			// Zoom/pan controls (with per-file state persistence)
			this.zoomPanCleanup = setupZoomPanControls(this.fabricState, {
				onViewChanged: saveView,
			}, contentEl);

			// Restore saved view state (zoom/pan) if available
			const savedView = this.model.getFileViewState(file.path);
			if (savedView) {
				const c = this.fabricState.canvas;
				c.setZoom(savedView.zoom);
				const vt = c.viewportTransform;
				vt[4] = savedView.panX;
				vt[5] = savedView.panY;
				c.requestRenderAll();
			}
			this.readyResolve?.();

			// Subscribe to visibility changes
			this.unsubscribeVisibility = visibilityEventBus.subscribe((ids) => this.refreshVisibility(ids));

			// External mutations on the active markers (e.g. colorOverride set via
			// Marker Detail in the sidebar) only fire `model.onChange` — they don't
			// pass through the popover's onCodesChanged callback. Subscribe here so
			// the canvas re-blends shape + label colors when fields change remotely.
			// rAF coalesce avoids repaint floods when several mutations land in one tick.
			this.modelChangeListener = () => this.scheduleCanvasRefresh();
			this.model.onChange(this.modelChangeListener);

			// Code-level mutations (color, name, delete, merge) live on the shared
			// registry, not on the engine model — they don't fire model.onChange.
			// `qualia:registry-changed` is the canonical signal (Code Explorer
			// listens to the same one). Reuse scheduleCanvasRefresh: refreshAllStyles
			// re-reads code colors via getColorForCodeIds, updateLabel re-reads names.
			// Per §37: re-render coarse OK for UI (only MarkerMutationEvent is reserved
			// for cache reactivity).
			this.registryChangeListener = () => this.scheduleCanvasRefresh();
			document.addEventListener('qualia:registry-changed', this.registryChangeListener);

			// Listen for Clear All — wipe canvas regions so they don't persist visually
			this.clearAllHandler = () => {
				this.cleanup();
				this.contentEl.empty();
				this.contentEl.createDiv({ cls: 'codemarker-image-error', text: 'All markers cleared. Reopen file to continue.' });
			};
			document.addEventListener('qualia:clear-all', this.clearAllHandler);
		} catch (e) {
			container.createDiv({
				cls: 'codemarker-image-error',
				text: 'Failed to load image: ' + (e as Error).message,
			});
			this.readyResolve?.();
		}
	}

	private scheduleCanvasRefresh(): void {
		if (this.modelChangeRafId !== null) return;
		this.modelChangeRafId = requestAnimationFrame(() => {
			this.modelChangeRafId = null;
			if (!this.regionManager) return;
			this.regionManager.refreshAllStyles();
			if (this.regionLabels) {
				for (const markerId of this.regionManager.getActiveMarkerIds()) {
					this.regionLabels.updateLabel(markerId);
				}
			}
		});
	}

	private scheduleMenuClose(): void {
		if (this.selectionClearedRafId !== null) return;
		this.selectionClearedRafId = requestAnimationFrame(() => {
			this.selectionClearedRafId = null;
			this.codingMenu?.close();
		});
	}

	private cancelScheduledMenuClose(): void {
		if (this.selectionClearedRafId !== null) {
			cancelAnimationFrame(this.selectionClearedRafId);
			this.selectionClearedRafId = null;
		}
	}

	private deleteActiveShapes(): void {
		if (!this.fabricState || !this.regionManager) return;
		const canvas = this.fabricState.canvas;
		const active = canvas.getActiveObjects();
		if (active.length === 0) return;
		active.forEach((obj) => {
			const mid = this.regionManager!.getMarkerIdForShape(obj);
			if (mid) this.regionLabels?.removeLabel(mid);
			this.regionHighlight?.cleanupForShape(obj);
			this.regionManager!.deleteShape(obj);
		});
		canvas.discardActiveObject();
	}

	private onSelectionChange(opt: any): void {
		const selected = opt.selected;
		if (!selected || selected.length !== 1) {
			this.codingMenu?.close();
			return;
		}
		const shape = selected[0];
		const markerId = this.regionManager?.getMarkerIdForShape(shape);
		if (markerId) {
			const e = opt.e as MouseEvent | undefined;
			const mousePos = e ? { x: e.clientX, y: e.clientY } : (this.lastMouseScreen ?? undefined);
			this.openMenuForMarker(markerId, false, mousePos);
		}
	}

	private openMenuForMarker(
		markerId: string,
		isNew = false,
		mousePos?: { x: number; y: number },
	): void {
		if (!this.regionManager || !this.fabricState) return;

		const shape = this.regionManager.getShapeForMarker(markerId);
		if (!shape) return;

		let rawX: number;
		let rawY: number;
		if (mousePos) {
			// Anchor at the actual cursor — matches CM6/markdown popover UX.
			rawX = mousePos.x;
			rawY = mousePos.y + 8;
		} else {
			// Programmatic selection (no MouseEvent) — fall back to bottom-center of shape.
			// getBoundingRect() is canvas-relative; add canvas offset in the document.
			const bound = shape.getBoundingRect();
			const canvasRect = this.fabricState.canvas.upperCanvasEl.getBoundingClientRect();
			rawX = canvasRect.left + bound.left + bound.width / 2;
			rawY = canvasRect.top + bound.top + bound.height + 8;
		}
		// Clamp to viewport so menu doesn't open offscreen when click is at edge.
		const ESTIMATED_MENU_W = 280;
		const ESTIMATED_MENU_H = 320;
		const x = Math.max(8, Math.min(rawX, window.innerWidth - ESTIMATED_MENU_W));
		const y = Math.max(8, Math.min(rawY, window.innerHeight - ESTIMATED_MENU_H));

		this.codingMenu?.open(markerId, x, y, isNew);
	}

	highlightRegion(markerId: string): void {
		this.regionHighlight?.highlightMarker(markerId);
		this.openMenuForMarker(markerId);
	}

	private refreshVisibility(affectedCodeIds: Set<string>): void {
		if (!this.fabricState || !this.regionManager) return;
		const fileId = this.file?.path ?? '';
		if (!fileId) return;
		const registry = this.model.registry;
		const canvas = this.fabricState.canvas;

		canvas.getObjects().forEach((obj: any) => {
			const markerId = this.regionManager!.getMarkerIdForShape(obj);
			if (!markerId) return;
			const marker = this.model.findMarkerById(markerId);
			if (!marker) return;
			if (!marker.codes.some((app: any) => affectedCodeIds.has(app.codeId))) return;
			const anyVisible = marker.codes.some((app: any) =>
				registry.isCodeVisibleInFile(app.codeId, fileId)
			);
			obj.visible = anyVisible;
			obj.dirty = true;
			this.regionLabels?.setLabelVisible(markerId, anyVisible);
			// Re-blend stroke/fill so a toggled-off code no longer contributes to the shape color.
			if (anyVisible) this.regionManager!.refreshStyle(markerId);
		});
		canvas.requestRenderAll();
	}

	private cleanup(): void {
		// Invalidate any pending async onLoadFile
		this.loadGeneration++;
		this.cancelScheduledMenuClose();
		if (this.modelChangeRafId !== null) {
			cancelAnimationFrame(this.modelChangeRafId);
			this.modelChangeRafId = null;
		}
		if (this.modelChangeListener) {
			this.model.offChange(this.modelChangeListener);
			this.modelChangeListener = null;
		}
		if (this.registryChangeListener) {
			document.removeEventListener('qualia:registry-changed', this.registryChangeListener);
			this.registryChangeListener = null;
		}
		this.unsubscribeVisibility?.();
		this.unsubscribeVisibility = undefined;
		if (this.clearAllHandler) {
			document.removeEventListener('qualia:clear-all', this.clearAllHandler);
			this.clearAllHandler = null;
		}
		this.codingMenu?.destroy();
		this.codingMenu = null;
		this.regionHighlight?.destroy();
		this.regionHighlight = null;
		this.regionLabels?.destroy();
		this.regionLabels = null;
		this.drawingState?.destroy();
		this.drawingState = null;
		this.regionManager?.clear();
		this.regionManager = null;
		this.zoomPanCleanup?.destroy();
		this.zoomPanCleanup = null;
		this.toolbarState?.destroy();
		this.toolbarState = null;
		teardownFabricCanvas(this.fabricState);
		this.fabricState = null;
	}

	async onUnloadFile(_file: TFile): Promise<void> {
		this.cleanup();
	}
}

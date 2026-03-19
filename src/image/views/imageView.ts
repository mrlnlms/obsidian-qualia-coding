import { ItemView, TFile, WorkspaceLeaf } from 'obsidian';
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

export const IMAGE_CODING_VIEW_TYPE = 'qualia-image-coding';

export class ImageCodingView extends ItemView {
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
	private currentFile: TFile | null = null;
	private clearAllHandler: (() => void) | null = null;
	private readyResolve: (() => void) | null = null;
	private readyPromise = new Promise<void>(resolve => { this.readyResolve = resolve; });

	/** Resolves when loadImage completes and canvas is ready. */
	waitUntilReady(): Promise<void> { return this.readyPromise; }

	constructor(leaf: WorkspaceLeaf, plugin: QualiaCodingPlugin, model: ImageCodingModel) {
		super(leaf);
		this.plugin = plugin;
		this.model = model;
	}

	getViewType(): string {
		return IMAGE_CODING_VIEW_TYPE;
	}

	getDisplayText(): string {
		return this.currentFile?.basename ?? 'Image Coding';
	}

	getIcon(): string {
		return 'image';
	}

	async setState(state: unknown, result: any): Promise<void> {
		const s = state as Record<string, unknown>;
		const filePath = s?.file as string | undefined;
		if (filePath) {
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (file instanceof TFile) {
				await this.loadImage(file);
			}
		}
		await super.setState(state, result);
	}

	getState(): Record<string, unknown> {
		return { file: this.currentFile?.path ?? '' };
	}

	async loadImage(file: TFile): Promise<void> {
		this.cleanup();
		this.readyPromise = new Promise<void>(resolve => { this.readyResolve = resolve; });
		this.currentFile = file;
		this.leaf.updateHeader?.();

		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('codemarker-image-view');

		const container = contentEl.createDiv({ cls: 'codemarker-canvas-container' });
		const imageUrl = this.app.vault.getResourcePath(file);

		try {
			this.fabricState = await setupFabricCanvas(container, imageUrl);
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
						this.regionManager?.deleteShape(shape);
						canvas.discardActiveObject();
					}
				},
			});

			// Region drawing
			this.drawingState = setupRegionDrawing(this.fabricState, {
				onShapeCreated: (shape) => {
					const marker = this.regionManager?.registerShape(shape, file.path);
					if (marker) {
						this.openMenuForMarker(marker.id);
					}
				},
				onShapeDeleted: (shape) => {
					const markerId = this.regionManager?.getMarkerIdForShape(shape);
					if (markerId) this.regionLabels?.removeLabel(markerId);
					this.regionManager?.deleteShape(shape);
				},
				onShapeModified: (shape) => {
					this.regionManager?.syncShapeToModel(shape);
					const markerId = this.regionManager?.getMarkerIdForShape(shape);
					if (markerId) this.regionLabels?.refreshForMarker(markerId);
				},
			});

			// Selection → open coding menu
			canvas.on('selection:created', (opt: any) => this.onSelectionChange(opt));
			canvas.on('selection:updated', (opt: any) => this.onSelectionChange(opt));
			canvas.on('selection:cleared', () => this.codingMenu?.close());

			// Toolbar
			const saveView = () => {
				if (this.currentFile && this.fabricState) {
					const c = this.fabricState.canvas;
					const vt = c.viewportTransform;
					this.model.saveFileViewState(this.currentFile.path, c.getZoom(), vt[4], vt[5]);
				}
			};
			this.toolbarState = createToolbar(contentEl, this.fabricState, {
				onDelete: () => {
					const active = canvas.getActiveObjects();
					if (active.length > 0) {
						active.forEach((obj) => {
							const mid = this.regionManager?.getMarkerIdForShape(obj);
							if (mid) this.regionLabels?.removeLabel(mid);
							this.regionManager?.deleteShape(obj);
						});
						canvas.discardActiveObject();
					}
				},
				onViewChanged: saveView,
			});
			contentEl.insertBefore(this.toolbarState.el, container);

			this.toolbarState.onModeChange = (mode) => {
				this.codingMenu?.close();
				this.drawingState?.setMode(mode);
			};

			// Zoom/pan controls (with per-file state persistence)
			this.zoomPanCleanup = setupZoomPanControls(this.fabricState, {
				onViewChanged: saveView,
			});

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
		}
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
			this.openMenuForMarker(markerId);
		}
	}

	private openMenuForMarker(markerId: string): void {
		if (!this.regionManager || !this.fabricState) return;

		const shape = this.regionManager.getShapeForMarker(markerId);
		if (!shape) return;

		const bound = shape.getBoundingRect();
		const x = bound.left + bound.width / 2;
		const y = bound.top + bound.height + 8;

		this.codingMenu?.open(markerId, x, y);
	}

	highlightRegion(markerId: string): void {
		this.regionHighlight?.highlightMarker(markerId);
		this.openMenuForMarker(markerId);
	}

	private cleanup(): void {
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

	async onClose(): Promise<void> {
		this.cleanup();
		this.currentFile = null;
	}
}

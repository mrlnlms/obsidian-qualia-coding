import { Plugin, MarkdownView, Notice, Editor, Menu, TFile } from 'obsidian';
import { CodeMarkerSettings, DEFAULT_SETTINGS } from './models/settings';
import { CodeMarkerModel } from './models/codeMarkerModel';
import { CodeMarkerSettingTab } from './views/settingsTab';
import { createMarkerStateField, updateFileMarkersEffect, setSelectionPreviewEffect } from './cm6/markerStateField';
import { createMarkerViewPlugin, SELECTION_EVENT, SelectionEventDetail } from './cm6/markerViewPlugin';
import { createSelectionMenuField } from './cm6/selectionMenuField';
import { MenuController } from './menu/menuController';
import { openObsidianMenu } from './menu/obsidianMenu';
import { createHoverMenuExtension } from './cm6/hoverMenuExtension';
import { createMarginPanelExtension } from './cm6/marginPanelExtension';
import { CodeFormModal } from './menu/codeFormModal';
import { addCodeWithDetailsAction } from './menu/menuActions';
import { UnifiedCodeDetailView, UNIFIED_DETAIL_VIEW_TYPE } from './views/unifiedCodeDetailView';
import { CodeExplorerView, CODE_EXPLORER_VIEW_TYPE } from './views/codeExplorerView';

export default class CodeMarkerPlugin extends Plugin {
	settings: CodeMarkerSettings;
	model: CodeMarkerModel;
	menuController: MenuController;
	updateFileMarkersEffect = updateFileMarkersEffect;
	private ribbonIconEl: HTMLElement | null = null;

	async onload() {
		console.log('[CodeMarker v2] v32 loaded — Dead code removal + hover sync fix + dead state perf');
		await this.loadSettings();

		// Initialize data model
		this.model = new CodeMarkerModel(this);
		await this.model.loadMarkers();

		// Initialize menu controller
		this.menuController = new MenuController(this.model);

		// Register CM6 editor extensions
		this.registerEditorExtension([
			createMarkerStateField(this.model),
			createMarkerViewPlugin(this.model),
			createSelectionMenuField(this.model),
			createHoverMenuExtension(this.model),
			createMarginPanelExtension(this.model)
		]);

		// Register views
		this.registerView(UNIFIED_DETAIL_VIEW_TYPE, (leaf) => {
			const view = new UnifiedCodeDetailView(leaf, this.model);
			// Resolve CSV model at runtime if the CSV plugin is loaded
			const csvPlugin = (this.app as any).plugins?.plugins?.['obsidian-csv-viewer'];
			if (csvPlugin?.model) {
				view.setCsvModel(csvPlugin.model);
			}
			return view;
		});
		this.registerView(CODE_EXPLORER_VIEW_TYPE, (leaf) => new CodeExplorerView(leaf, this.model));

		// Settings tab
		this.addSettingTab(new CodeMarkerSettingTab(this.app, this));

		// --- Trigger 1: Selection (mouseup) ---
		this.registerDomEvent(document, SELECTION_EVENT as any, (evt: CustomEvent<SelectionEventDetail>) => {
			if (!this.settings.showMenuOnSelection) return;
			const detail = evt.detail;
			if (!detail) return;

			this.menuController.openMenu(
				detail.editorView,
				{
					from: detail.from,
					to: detail.to,
					text: detail.text,
					fileId: detail.fileId,
				},
				{ x: detail.mouseX, y: detail.mouseY }
			);
		});

		// --- Trigger 2: Right-click (editor-menu) ---
		this.registerEvent(
			this.app.workspace.on('editor-menu', (menu, editor, view) => {
				if (!this.settings.showMenuOnRightClick) return;
				if (!(view instanceof MarkdownView) || !view.file) return;

				const selectedText = editor.getSelection();
				if (!selectedText?.trim()) return;

				menu.addSeparator();
				menu.addItem((item) => {
					item.setTitle('Code Options')
						.setIcon('tag')
						.onClick(() => {
							const anchor = editor.getCursor('anchor');
							const head = editor.getCursor('head');

							// @ts-ignore
							const fromOffset = editor.posToOffset(
								this.model.isPositionBefore(anchor, head) ? anchor : head
							);
							// @ts-ignore
							const toOffset = editor.posToOffset(
								this.model.isPositionBefore(anchor, head) ? head : anchor
							);

							// @ts-ignore
							const editorView = editor.cm;
							if (!editorView) return;

							openObsidianMenu(
								this.model,
								{
									from: fromOffset,
									to: toOffset,
									text: selectedText,
									fileId: view.file!.path,
								},
								editorView,
								{ x: (item as any).dom.getBoundingClientRect().right, y: (item as any).dom.getBoundingClientRect().top }
							);
						});
				});
			})
		);

		// --- Trigger 3: File menu ---
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				if (!(file instanceof TFile)) return;
				if (!this.settings.showMenuOnRightClick) return;

				const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (!activeView || activeView.file?.path !== file.path) return;

				const editor = activeView.editor;
				const selectedText = editor.getSelection();
				if (!selectedText?.trim()) return;

				menu.addSeparator();
				menu.addItem((item) => {
					item.setTitle('Code Options')
						.setIcon('tag')
						.onClick(() => {
							const anchor = editor.getCursor('anchor');
							const head = editor.getCursor('head');

							// @ts-ignore
							const fromOffset = editor.posToOffset(
								this.model.isPositionBefore(anchor, head) ? anchor : head
							);
							// @ts-ignore
							const toOffset = editor.posToOffset(
								this.model.isPositionBefore(anchor, head) ? head : anchor
							);

							// @ts-ignore
							const editorView = editor.cm;
							if (!editorView) return;

							openObsidianMenu(
								this.model,
								{
									from: fromOffset,
									to: toOffset,
									text: selectedText,
									fileId: file.path,
								},
								editorView,
								{ x: (item as any).dom.getBoundingClientRect().right, y: (item as any).dom.getBoundingClientRect().top }
							);
						});
				});
			})
		);

		// --- Trigger 4: Ribbon button ---
		if (this.settings.showRibbonButton) {
			this.ribbonIconEl = this.addRibbonIcon('tag', 'Code Selection', () => {
				const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (!activeView?.file) {
					new Notice('Open a markdown file first');
					return;
				}

				const editor = activeView.editor;
				const selectedText = editor.getSelection();
				if (!selectedText?.trim()) {
					new Notice('Select text first');
					return;
				}

				const anchor = editor.getCursor('anchor');
				const head = editor.getCursor('head');

				// @ts-ignore
				const fromOffset = editor.posToOffset(
					this.model.isPositionBefore(anchor, head) ? anchor : head
				);
				// @ts-ignore
				const toOffset = editor.posToOffset(
					this.model.isPositionBefore(anchor, head) ? head : anchor
				);

				// @ts-ignore
				const editorView = editor.cm;
				if (!editorView) return;

				this.menuController.openMenu(
					editorView,
					{
						from: fromOffset,
						to: toOffset,
						text: selectedText,
						fileId: activeView.file.path,
					},
					{ x: window.innerWidth / 2, y: window.innerHeight / 3 }
				);
			});
		}

		// --- Trigger 5: Commands ---
		this.addCommand({
			id: 'create-code-marker',
			name: 'Create marker from selection',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				const marker = this.model.createMarker(editor, view);
				if (marker) {
					if (view.file) {
						this.model.updateMarkersForFile(view.file.path);
					}
					new Notice('Marker created!');
				} else {
					new Notice('Select text first');
				}
			}
		});

		this.addCommand({
			id: 'open-coding-menu',
			name: 'Open coding menu',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				if (!view.file) return;

				const selectedText = editor.getSelection();
				if (!selectedText?.trim()) {
					new Notice('Select text first');
					return;
				}

				const anchor = editor.getCursor('anchor');
				const head = editor.getCursor('head');

				// @ts-ignore
				const fromOffset = editor.posToOffset(
					this.model.isPositionBefore(anchor, head) ? anchor : head
				);
				// @ts-ignore
				const toOffset = editor.posToOffset(
					this.model.isPositionBefore(anchor, head) ? head : anchor
				);

				// @ts-ignore
				const editorView = editor.cm;
				if (!editorView) return;

				const snapshot = {
					from: fromOffset,
					to: toOffset,
					text: selectedText,
					fileId: view.file!.path,
				};

				// Close any existing tooltip before opening the modal
				this.menuController.closeMenu(editorView);

				// Show selection preview while modal is open
				editorView.dispatch({
					effects: setSelectionPreviewEffect.of({ from: snapshot.from, to: snapshot.to })
				});

				new CodeFormModal(
					this.app,
					this.settings.defaultColor,
					(name, color, description) => {
						addCodeWithDetailsAction(this.model, snapshot, name, color, description);
					},
					() => {
						// Reopen tooltip menu (save or cancel)
						this.menuController.openMenu(
							editorView,
							snapshot,
							{ x: window.innerWidth / 2, y: window.innerHeight / 3 }
						);
					}
				).open();
			}
		});

		this.addCommand({
			id: 'open-code-explorer',
			name: 'Open Code Explorer',
			callback: () => this.activateCodeExplorer()
		});

		this.addCommand({
			id: 'reset-code-markers',
			name: 'Reset all markers',
			callback: () => {
				this.model.clearAllMarkers();
				new Notice('All markers cleared!');
			}
		});

		console.log('CodeMarker v2: Loaded');
	}

	onunload() {
		this.model.flushPendingSave();
		this.app.workspace.detachLeavesOfType(UNIFIED_DETAIL_VIEW_TYPE);
		this.app.workspace.detachLeavesOfType(CODE_EXPLORER_VIEW_TYPE);
		console.log('CodeMarker v2: Unloaded');
	}

	async activateCodeExplorer() {
		const leaves = this.app.workspace.getLeavesOfType(CODE_EXPLORER_VIEW_TYPE);
		const existing = leaves[0];
		if (existing) {
			this.app.workspace.revealLeaf(existing);
			return;
		}
		const leaf = this.app.workspace.getRightLeaf(false);
		if (leaf) {
			await leaf.setViewState({ type: CODE_EXPLORER_VIEW_TYPE, active: true });
			this.app.workspace.revealLeaf(leaf);
		}
	}

	async revealCodeExplorer(): Promise<void> {
		const leaves = this.app.workspace.getLeavesOfType(UNIFIED_DETAIL_VIEW_TYPE);
		const existing = leaves[0];
		if (existing) {
			const view = existing.view as UnifiedCodeDetailView;
			view.showList();
			this.app.workspace.revealLeaf(existing);
		} else {
			const leaf = this.app.workspace.getRightLeaf(false);
			if (leaf) {
				await leaf.setViewState({ type: UNIFIED_DETAIL_VIEW_TYPE, active: true });
				this.app.workspace.revealLeaf(leaf);
			}
		}
	}

	async revealCodeDetailPanel(markerId: string, codeName: string): Promise<void> {
		const leaves = this.app.workspace.getLeavesOfType(UNIFIED_DETAIL_VIEW_TYPE);
		const existing = leaves[0];
		if (existing) {
			const view = existing.view as UnifiedCodeDetailView;
			view.setContext(markerId, codeName);
			this.app.workspace.revealLeaf(existing);
		} else {
			const leaf = this.app.workspace.getRightLeaf(false);
			if (leaf) {
				await leaf.setViewState({ type: UNIFIED_DETAIL_VIEW_TYPE, active: true });
				const view = leaf.view as UnifiedCodeDetailView;
				view.setContext(markerId, codeName);
				this.app.workspace.revealLeaf(leaf);
			}
		}
	}

	async loadSettings() {
		const data = (await this.loadData()) || {};
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
	}

	async saveSettings() {
		const data = (await this.loadData()) || {};
		Object.assign(data, this.settings);
		await this.saveData(data);
	}
}

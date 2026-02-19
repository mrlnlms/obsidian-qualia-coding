import { Plugin, MarkdownView, Notice, Editor, Menu, TFile } from 'obsidian';

// ── Markdown/CM6 imports (EXACT copy from codemarker-v2) ──
import { CodeMarkerSettings, DEFAULT_SETTINGS } from './models/settings';
import { CodeMarkerModel } from './models/codeMarkerModel';
import { CodeMarkerSettingTab } from './views/codemarkerSettingsTab';
import { createMarkerStateField, updateFileMarkersEffect, setSelectionPreviewEffect } from './cm6/markerStateField';
import { createMarkerViewPlugin, SELECTION_EVENT, SelectionEventDetail } from './cm6/markerViewPlugin';
import { createSelectionMenuField } from './cm6/selectionMenuField';
import { MenuController } from './menu/menuController';
import { openObsidianMenu } from './menu/obsidianMenu';
import { createHoverMenuExtension } from './cm6/hoverMenuExtension';
import { createMarginPanelExtension } from './cm6/marginPanelExtension';
import { CodeFormModal } from './menu/codeFormModal';
import { addCodeWithDetailsAction } from './menu/menuActions';
import { CodeExplorerView, CODE_EXPLORER_VIEW_TYPE } from './views/codeExplorerView';
import { UnifiedCodeDetailView, UNIFIED_DETAIL_VIEW_TYPE } from './views/unifiedCodeDetailView';

// ── CSV-specific imports ──
import { CsvCodingView, CSV_CODING_VIEW_TYPE } from './csvCodingView';
import { CodingModel } from './coding/codingModel';
import { CsvCodeFormModal } from './coding/codeFormModal';
import { CsvCodeExplorerView, CSV_CODE_EXPLORER_VIEW_TYPE } from './views/csvCodeExplorerView';

export default class CodeMarkerPlugin extends Plugin {
	// ── Markdown/CM6 (exact copy from v2) ──
	settings: CodeMarkerSettings;
	model: CodeMarkerModel;
	menuController: MenuController;
	updateFileMarkersEffect = updateFileMarkersEffect;
	private ribbonIconEl: HTMLElement | null = null;

	// ── CSV ──
	csvModel!: CodingModel;

	async onload() {
		console.log('[obsidian-codemarker-csv] v33.2 loaded — CM6 inline editor + extensions reuse + margin fix');
		await this.loadSettings();

		// ═══════════════════════════════════════════
		// PART 1: Markdown/CM6 system (exact copy from codemarker-v2)
		// ═══════════════════════════════════════════

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

		// Register markdown views
		this.registerView(CODE_EXPLORER_VIEW_TYPE, (leaf) => new CodeExplorerView(leaf, this.model));

		// Clean up legacy view types from workspace cache
		this.app.workspace.detachLeavesOfType('codemarker-code-detail');
		this.app.workspace.detachLeavesOfType('codemarker-csv-detail');

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

		// --- Trigger 5: Commands (markdown) ---
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

		// ═══════════════════════════════════════════
		// PART 2: CSV system (additions)
		// ═══════════════════════════════════════════

		// CSV model
		this.csvModel = new CodingModel(this);
		await this.csvModel.load();

		// CSV file view
		this.registerView(CSV_CODING_VIEW_TYPE, (leaf) => new CsvCodingView(leaf, this));
		this.registerExtensions(['csv'], CSV_CODING_VIEW_TYPE);

		// Unified detail panel (markdown + CSV in one leaf)
		this.registerView(UNIFIED_DETAIL_VIEW_TYPE, (leaf) => new UnifiedCodeDetailView(leaf, this.model, this.csvModel));

		// CSV explorer tree (separate)
		this.registerView(CSV_CODE_EXPLORER_VIEW_TYPE, (leaf) => new CsvCodeExplorerView(leaf, this.csvModel));

		// CSV commands
		this.addCommand({
			id: 'open-csv-code-explorer',
			name: 'Open CSV Code Explorer',
			callback: () => this.activateCsvCodeExplorer(),
		});

		this.addCommand({
			id: 'open-csv-code-list',
			name: 'Open CSV Code List',
			callback: () => this.revealCsvCodeExplorer(),
		});

		this.addCommand({
			id: 'create-new-csv-code',
			name: 'Create new CSV code',
			callback: () => {
				const nextColor = this.csvModel.registry.peekNextPaletteColor();
				new CsvCodeFormModal(this.app, nextColor, (name, color, description) => {
					this.csvModel.registry.create(name, color, description);
					this.csvModel.save();
					new Notice(`Code "${name}" created`);
				}).open();
			},
		});

		this.addCommand({
			id: 'reset-csv-markers',
			name: 'Reset all CSV markers',
			callback: () => {
				this.csvModel.clearAllMarkers();
				new Notice('All CSV markers cleared!');
			},
		});

		// CSV ribbon icon
		this.addRibbonIcon('tags', 'CSV Code Explorer', () => {
			this.activateCsvCodeExplorer();
		});

		console.log('CodeMarker CSV: Loaded');
	}

	onunload() {
		this.csvModel.save();
		this.app.workspace.detachLeavesOfType(UNIFIED_DETAIL_VIEW_TYPE);
		this.app.workspace.detachLeavesOfType(CODE_EXPLORER_VIEW_TYPE);
		this.app.workspace.detachLeavesOfType(CSV_CODE_EXPLORER_VIEW_TYPE);
		console.log('CodeMarker CSV: Unloaded');
	}

	// ═══════════════════════════════════════════
	// Markdown view management (exact copy from v2)
	// ═══════════════════════════════════════════

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

	// ═══════════════════════════════════════════
	// CSV view management
	// ═══════════════════════════════════════════

	async activateCsvCodeExplorer() {
		const leaves = this.app.workspace.getLeavesOfType(CSV_CODE_EXPLORER_VIEW_TYPE);
		const existing = leaves[0];
		if (existing) {
			this.app.workspace.revealLeaf(existing);
			return;
		}
		const leaf = this.app.workspace.getRightLeaf(false);
		if (leaf) {
			await leaf.setViewState({ type: CSV_CODE_EXPLORER_VIEW_TYPE, active: true });
			this.app.workspace.revealLeaf(leaf);
		}
	}

	async revealCsvCodeExplorer(): Promise<void> {
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

	async revealCsvCodeDetailPanel(markerId: string, codeName: string): Promise<void> {
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

	// ═══════════════════════════════════════════
	// Settings persistence
	// ═══════════════════════════════════════════

	async loadSettings() {
		const data = (await this.loadData()) || {};
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);

		// If settings look default, try importing from codemarker-v2
		if (!data.menuMode) {
			try {
				const v2Path = this.app.vault.configDir + '/plugins/obsidian-codemarker-v2/data.json';
				if (await this.app.vault.adapter.exists(v2Path)) {
					const v2Raw = await this.app.vault.adapter.read(v2Path);
					const v2Data = JSON.parse(v2Raw);
					this.settings = Object.assign({}, DEFAULT_SETTINGS, v2Data, data);
				}
			} catch { /* ignore */ }
		}
	}

	async saveSettings() {
		const data = (await this.loadData()) || {};
		Object.assign(data, this.settings);
		await this.saveData(data);
	}
}

import { Editor, MarkdownView, Menu, Notice, Plugin, TFile } from 'obsidian';
import { createEditorMenu, createFileMenu, resetMenu } from './src/obsidian_ui_menus/obsidian_menus';
import { SampleSettingTab } from './src/SampleSettingTab';

interface MyPluginSettings {
	mySetting: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	mySetting: 'default'
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;
	currentMenu: Menu | null = null;
	selectionTriggeredMenu: boolean = false;
	contextMenuOpened: boolean = false;

	async onload() {
		console.log('[qualitative-coding-plugin] v3 loaded -- Refactor: imports modulares, moxs-qda (broken stubs)');
		await this.loadSettings();

		// Add icons to ribbon
		this.ribbonAndCommands();

		this.addSettingTab(new SampleSettingTab(this.app, this));

		// Add to editor menu (right-click menu inside a note)
		this.registerEvent(this.app.workspace.on('editor-menu', (menu, editor) => {
			createEditorMenu(menu, editor, this);
		}));

		// Add to file menu (right-click menu on a file)
		this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => {
			if (file instanceof TFile) {
				//this.createFileMenu(menu, file);
				createFileMenu(menu, file, this);
			}
		}));

		this.addMouseUpEvent();
		this.addContextMenuEvent();

		//function 
	}
	ribbonAndCommands(): void {
		this.addRibbonIcon('plus', 'Add New Code', () => this.addNewCode());
		this.addRibbonIcon('check', 'Add Existing Code', () => this.addExistingCode());
		this.addRibbonIcon('trash', 'Remove Code', () => this.removeCode());
		this.addRibbonIcon('x', 'Remove All Codes', () => this.removeAllCodes());

		// Add commands to command palette
		this.addCommand({
			id: 'add-new-code',
			name: 'Add New Code',
			callback: () => this.addNewCode()
		});

		this.addCommand({
			id: 'add-existing-code',
			name: 'Add Existing Code',
			callback: () => this.addExistingCode()
		});

		this.addCommand({
			id: 'remove-code',
			name: 'Remove Code',
			callback: () => this.removeCode()
		});

		this.addCommand({
			id: 'remove-all-codes',
			name: 'Remove All Codes',
			callback: () => this.removeAllCodes()
		});
	}
	addMouseUpEvent() {
		this.registerDomEvent(document, 'mouseup', (evt: MouseEvent) => {
			const activeLeaf = this.app.workspace.activeLeaf;
			if (!(activeLeaf?.view instanceof MarkdownView)) {
				return;
			}

			const editor = activeLeaf.view.editor;
			if (!editor.hasFocus()) {
				return;
			}
			
			if (this.currentMenu) {
				//this.resetMenu();
				resetMenu(this);
				this.contextMenuOpened = false;
				return;
			}
			
			if (evt.button === 2) { // Right-click
				if (this.currentMenu) {
					//this.resetMenu();
					resetMenu(this);
				}
				this.contextMenuOpened = true;
				return;
			}

			if (this.contextMenuOpened) {
				this.contextMenuOpened = false;
				return;
			}

			this.handleTextSelection(editor, evt);
		});
	}

	addContextMenuEvent() {
		this.registerDomEvent(document, 'contextmenu', () => {
			const activeLeaf = this.app.workspace.activeLeaf;
			if (!(activeLeaf?.view instanceof MarkdownView)) {
				return;
			}
			this.contextMenuOpened = true;
		});
	}

	handleTextSelection(editor: Editor, evt: MouseEvent) {
		const selectedText = editor.getSelection();
		if (selectedText && !this.selectionTriggeredMenu) {
			this.selectionTriggeredMenu = true;
			new Notice('Text selected: ' + selectedText);

			if (this.currentMenu) {
				this.currentMenu.hide();
			}

			const submenu = new Menu();
			submenu.addItem((item) => {
				item.setTitle('Add New Code')
					.setIcon('plus')
					.onClick(() => {
						this.addNewCode();
						//this.resetMenu();
						resetMenu(this);
					});
			});
			submenu.addItem((item) => {
				item.setTitle('Add Existing Code')
					.setIcon('check')
					.onClick(() => {
						this.addExistingCode();
						//this.resetMenu();
						resetMenu(this);
					});
			});
			submenu.addItem((item) => {
				item.setTitle('Remove Code')
					.setIcon('trash')
					.onClick(() => {
						this.removeCode();
						//this.resetMenu();
						resetMenu(this);
					});
			});
			submenu.addItem((item) => {
				item.setTitle('Remove All Codes')
					.setIcon('x')
					.onClick(() => {
						this.removeAllCodes();
						//this.resetMenu();
						resetMenu(this);
					});
			});

			submenu.onHide(() => {
				this.selectionTriggeredMenu = false;
			});

			submenu.showAtPosition({ x: evt.pageX, y: evt.pageY });
			this.currentMenu = submenu;
		}
	}

	resetMenu() {
		if (this.currentMenu) {
			this.currentMenu.hide();
			this.currentMenu = null;
		}
		this.selectionTriggeredMenu = false;
		this.contextMenuOpened = false;
	}

	onunload() {
		new Notice('Plugin unloaded');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	addNewCode() {
		new Notice('Add New Code');
		//this.resetMenu();
		resetMenu(this);
	}

	addExistingCode() {
		new Notice('Add Existing Code');
		//this.resetMenu();
		resetMenu(this);
	}

	removeCode() {
		new Notice('Remove Code');
		//this.resetMenu();
		resetMenu(this);
	}

	removeAllCodes() {
		new Notice('Remove All Codes');
		//this.resetMenu();
		resetMenu(this);
	}
}


import { Editor, MarkdownView, Menu, Notice, Plugin, TFile } from 'obsidian';
import { createEditorMenu, createFileMenu, resetMenu } from './src/DisplayMenus';
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
	codingMenuOpened: boolean = false;

	async onload() {
		await this.loadSettings();

		// Add icons to ribbon
		this.ribbonAndCommands();

		this.addSettingTab(new SampleSettingTab(this.app, this));

		// Add to editor menu (right-click menu inside a note)
		this.registerEvent(this.app.workspace.on('editor-menu', (menu, editor) => {
			createEditorMenu(menu, editor, this);
		}));

		// Add to file menu (right-click menu on a file)
		this.registerEvent(this.app.workspace.on('file-menu', async (menu, file) => {
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
	
	/* addMouseUpEvent() {
		this.registerDomEvent(document, 'mouseup', (evt: MouseEvent) => {
			//this.codingMenuOpened = false;
			const activeLeaf = this.app.workspace.activeLeaf;
			if (!(activeLeaf?.view instanceof MarkdownView)) {
				return;
			}

			
			const editor = activeLeaf.view.editor;
			if (this.currentMenu) {
				//this.resetMenu();
				//resetMenu(this);
				//this.handleTextSelection(editor, evt);
				if (!this.codingMenuOpened) {
					this.codingMenuOpened = true;
					console.log('this.currentMenu && this.contextMenuOpened')
					
					//this.handleTextSelection(editor, evt);
					
					return;
				} else {
					this.codingMenuOpened = false;
					console.log('this.currentMenu && this.codingMenuOpened -= true')
					this.handleTextSelection(editor, evt);
					resetMenu(this);
					return;
				} 
				
				//this.contextMenuOpened = false;
				//this.codingMenuOpened = true;
				this.codingMenuOpened = false;
				console.log('this.currentMenu')
				//resetMenu(this);
				return;
			}
			
			if (!editor.hasFocus()) {
				console.log('!editor.hasFocus()')
				this.codingMenuOpened = false;
				return;
			}
			if (evt.button === 2) { // Right-click
				if (this.currentMenu) {
					//this.resetMenu();
					resetMenu(this);
					console.log('evt.button === 2 & this.currentMenu')
				}
				this.contextMenuOpened = true;
				this.codingMenuOpened = false;
				console.log('evt.button === 2')
				return;
			}

			if (this.contextMenuOpened) {
				console.log('this.contextMenuOpened')
				this.contextMenuOpened = false;
				if (!this.codingMenuOpened) {
					console.log('> !this.codingMenuOpened')
					this.codingMenuOpened = true;
					return;
				}else {
					console.log('>> this.codingMenuOpened')
					//this.codingMenuOpened = false;
					return;
				}
				return;
			}
			console.log('handleTextSelection')
			this.handleTextSelection(editor, evt);
		});
	}
*/
	addContextMenuEvent() {
		this.registerDomEvent(document, 'contextmenu', () => {
			const activeLeaf = this.app.workspace.activeLeaf;
			if (!(activeLeaf?.view instanceof MarkdownView)) {
				return;
			}
			this.contextMenuOpened = true;
		});
	} 
	/* addMouseUpEvent() {
    this.registerDomEvent(document, 'mouseup', (evt: MouseEvent) => {
        const activeLeaf = this.app.workspace.activeLeaf;
        if (!(activeLeaf?.view instanceof MarkdownView)) {
            return;
        }

        const editor = activeLeaf.view.editor;
		const selectedText = editor.getSelection();

        if (!editor.hasFocus()) {
            console.log('!editor.hasFocus()');
            this.codingMenuOpened = false;
            return;
        }

        if (evt.button === 2) { // Clique direito
            if (this.currentMenu) {
                resetMenu(this);
                console.log('Clique direito com currentMenu');
            }
            this.contextMenuOpened = true;
            this.codingMenuOpened = false;
            console.log('Evento de clique direito');
            return;
        }
		
        if (this.contextMenuOpened) {
            console.log('O menu de contexto estava aberto');
            this.contextMenuOpened = false;
            if (this.codingMenuOpened) {
                this.codingMenuOpened = false;
                return;
            }
            console.log('O menu de codificação já está aberto');
            return;
        }

        if (this.currentMenu) {
            if (!this.codingMenuOpened) {
                this.codingMenuOpened = true;
                console.log('Menu de codificação aberto');
				this.handleTextSelection(editor, evt);
                return;
            } else {
                this.codingMenuOpened = false;
                resetMenu(this);
                console.log('O menu de codificação foi fechado, tratando seleção de texto');
                return;
            }
        }

        console.log('Tratando seleção de texto por padrão');
        this.handleTextSelection(editor, evt);
    });
} */
	addMouseUpEvent() {
		const activeLeaf = this.app.workspace.activeLeaf;
		if (!(activeLeaf?.view instanceof MarkdownView)) {
			console.log('1 -- addMouseUpEvent()');
			return;
		}
		this.registerDomEvent(document, 'mouseup', (evt: MouseEvent) => {
			console.log("1 -- registerDomEvent")
			
			/*
			const activeLeaf = this.app.workspace.activeLeaf;
			if (!(activeLeaf?.view instanceof MarkdownView)) {
				console.log('2) !(activeLeaf?.view instanceof MarkdownView)');
				return;
			}
	
			const editor = activeLeaf.view.editor;

			if (!editor.hasFocus()) {
				console.log('3) !editor.hasFocus()');
				this.codingMenuOpened = false;
				return;
			}

			if (evt.button === 2) { // Clique direito
				if (this.currentMenu) {
					resetMenu(this);
					console.log('Clique direito com currentMenu');
				}
				resetMenu(this);
				this.contextMenuOpened = true;
				this.codingMenuOpened = false;
				console.log('Evento de clique direito');
				
				return;

			}
			const selectedText = editor.getSelection();
			if (selectedText && this.codingMenuOpened) {
				this.codingMenuOpened = true;
				resetMenu(this);
				console.log("TEXTO SELECIONADO: "+selectedText)
			}
	
			if (this.currentMenu && this.codingMenuOpened) {
				this.codingMenuOpened = false;
				//this.handleTextSelection(editor, evt);
				resetMenu(this);
				console.log('Fechando menu de codificação e tratando seleção de texto');
				return;
			}
	
			if (this.currentMenu && !this.codingMenuOpened) {
				this.codingMenuOpened = false;
				this.handleTextSelection(editor, evt);
				console.log('Abrindo menu de codificação');
				return;
			}
	
			// Se nenhum menu estiver aberto, tratamos a seleção de texto por padrão
			console.log('Tratando seleção de texto por padrão');
			this.handleTextSelection(editor, evt);
			*/
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
		this.codingMenuOpened = false;
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


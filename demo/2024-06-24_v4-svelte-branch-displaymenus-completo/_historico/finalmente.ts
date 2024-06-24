import { Editor, MarkdownView, Menu, Notice, Plugin, TFile } from 'obsidian';
import { createEditorMenu, createFileMenu, resetMenu } from './src/DisplayMenus';

export default class MyPlugin extends Plugin {
	currentMenu: Menu | null = null;
	selectionTriggeredMenu: boolean = false;
	contextMenuOpened: boolean = false;
	codingMenuOpened: boolean = false;

	async onload() {
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
		this.addContextMenuEvent();
		await this.addMouseUpEvent();
		
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

	async addMouseUpEvent() {
		this.registerDomEvent(document, 'mouseup', async (evt: MouseEvent) => {

		// Corrige o problema de multiplos cliques do usuário
			if(!this.selectionTriggeredMenu){
				resetMenu(this);
			}
			
	//Se o clique for fora do editor: File-Menu (lateral); Ribbon Buttons; 
			const activeLeaf = this.app.workspace.activeLeaf;
			if (!(activeLeaf?.view instanceof MarkdownView)) {
				//console.log('1.1 -- addMouseUpEvent()');
				return;
			}
			
	// Condições de interação que caem aqui: Clique no `file-menu`, `tab-file` (onde fica o nome dos arquivos + close();) e sideMenu();) // corrige o problema de exibir a opção fora do editor
			const editor = activeLeaf.view.editor;
			if (!editor.hasFocus()) {

				//this.codingMenuOpened = false;
				return;
			}
		
	// Clique right // configura as vars para corrigir o problema de exibição do menu após clicar em opções do menu-editor.
			if (evt.button === 2) {
				this.selectionTriggeredMenu = true; // é como se fose um jeito de enganar o sistema e funcionar, não exibindo o menu após clicar em alguma opção
				this.contextMenuOpened = true;
				this.codingMenuOpened = false;
				return;

			}
		
	
	// Este caso funciona muito bem para quando estamos usando as funções do file-menu, não disparando nenhum evento de mouseup em opções do menu de contexto.
			if(this.contextMenuOpened){

				//console.log("Menu de contexto Está aberto e por isso não acontecerá nada")
				// talves essa parte do código possa ser deletada. Até onde entendi nenhuma condição cai aqui.
				resetMenu(this);
				this.contextMenuOpened = false;
				this.codingMenuOpened = true; // Neste caso precisa ser true para não exibir de novo após o menu de contexto ser clicado por alguma opção.
				return;
			}
		
	// Validação para não exibir quando for textos null e Empty;
			const selectedText = editor.getSelection();
			 if (selectedText === ' '){
				//console.log("selectedText === NADA")
				this.contextMenuOpened = false;
				this.codingMenuOpened = false;
				return
			}
	
	// Validação para saber se os menus estão abertos e exibir o modal;
			if(!this.codingMenuOpened && !this.contextMenuOpened){
				
				console.log("this.selectionTriggeredMenu:: "+ this.selectionTriggeredMenu)
				await this.handleTextSelection(editor, evt);
				console.log("this.selectionTriggeredMenu:: "+ this.selectionTriggeredMenu)

				//return;
			} else if(this.codingMenuOpened){
	// Este caso funciona para quando o sistema exibe o menu contextual do editor e file. codingMenuOpened só chega aqui true quando passa pelo menu do obsidian;
				
				//console.log(" Menu do plugin Está aberto e por isso não acontecerá nada")
				resetMenu(this);
				this.codingMenuOpened = false;
				return;
			}
			console.log("****************") //Nada acontece + funções funcionando nos menus **
		});
	}

	async handleTextSelection(editor: Editor, evt: MouseEvent) {
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
		//this.selectionTriggeredMenu = true;
		//this.codingMenuOpened = true;
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


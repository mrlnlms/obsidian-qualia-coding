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
		await this.addMouseUpEvent();
		this.addContextMenuEvent();
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
	
	/**
	 * 
	 * Agora vai!
	 */

	async addMouseUpEvent() {

		console.log("1 --- "+ this.contextMenuOpened, this.codingMenuOpened);

		this.registerDomEvent(document, 'mouseup', async (evt: MouseEvent) => {
			
			console.log("-------- registerDomEvent --------")
			
			const activeLeaf = this.app.workspace.activeLeaf;
			if (!(activeLeaf?.view instanceof MarkdownView)) {

				//Se o clique for fora do editor: File-Menu (lateral); Ribbon Buttons; 
				console.log('1.1 -- addMouseUpEvent()');
				return;
			}
			
			const editor = activeLeaf.view.editor;


			console.log("2 --- "+ this.contextMenuOpened, this.codingMenuOpened);

			// Condições de interação que caem aqui: Clique no `file-menu`, `tab-file` (onde fica o nome dos arquivos + close();) e sideMenu();)
			if (!editor.hasFocus()) {
				
				console.log('2 -- !editor.hasFocus()');

				console.log("[codingMenuOpened]: "+this.codingMenuOpened)
				this.codingMenuOpened = false;
				console.log("[codingMenuOpened]: "+this.codingMenuOpened)
				console.log("3 --- "+ this.contextMenuOpened, this.codingMenuOpened);
				return;
			}

			if (evt.button === 2) { // Clique right

				console.log('3 -- Clique direito');

			//	if (this.currentMenu) {
			//		resetMenu(this);
			//		console.log('4 -- Meu currentMenu');
				//}
				//resetMenu(this);
				
				console.log("[contextMenuOpened]: "+this.contextMenuOpened)
				this.contextMenuOpened = true;
				console.log("[contextMenuOpened]: "+this.contextMenuOpened)
				
				console.log("----");
				
				console.log("[codingMenuOpened]: "+this.codingMenuOpened)
				this.codingMenuOpened = false;
				console.log("[codingMenuOpened]: "+this.codingMenuOpened)
				//console.log('Evento de clique direito');
				
				return;

			}
			//console.log("**** FIM *****")
			console.log("3 --- "+ this.contextMenuOpened, this.codingMenuOpened);
			if(this.contextMenuOpened){
				// Este caso funciona muito bem para quando estamos usando as funções do file-menu.
				console.log("Menu de contexto Está aberto e por isso não acontecerá nada")
				
				//
				resetMenu(this);
				this.contextMenuOpened = false;
				this.codingMenuOpened = true; // Neste caso precisa ser true para não exibir de novo após o menu de contexto ser clicado por alguma opção.
				return;
			}
			
			/*			
			if (this.currentMenu && this.codingMenuOpened) {
				this.codingMenuOpened = false;
				this.handleTextSelection(editor, evt);
				resetMenu(this);
				console.log('Fechando menu de codificação e tratando seleção de texto');
				return;
			}*/

			 /* if(this.codingMenuOpened){
				// Este caso funciona muito bem para quando estamos usando as funções do file-menu.
				console.log("Menu do plugin Está aberto e por isso não acontecerá nada")
				
				resetMenu(this);
				this.codingMenuOpened = false;
				return;
			}  */
			const selectedText = editor.getSelection();
			 if (selectedText === ' '){
				console.log("selectedText === NADA")
				this.contextMenuOpened = false;
				this.codingMenuOpened = false;
				return
			}
			/*	if(!this.codingMenuOpened){
					console.log("Menu de codificação NÃO está aberto")
					this.codingMenuOpened = true;
					this.handleTextSelection(editor, evt);
					return;
				}
			*/
			if(!this.codingMenuOpened && !this.contextMenuOpened){
				//resetMenu(this);
				console.log("SEM CODE SEM MODAL ABERTOS PODE ABRIR")
				//this.codingMenuOpened = true;
				
				console.log("this.selectionTriggeredMenu:: "+ this.selectionTriggeredMenu)
				await this.handleTextSelection(editor, evt);
				console.log("this.selectionTriggeredMenu:: "+ this.selectionTriggeredMenu)
				if(!this.selectionTriggeredMenu){
					resetMenu(this);
				}
				
				console.log("this.selectionTriggeredMenu:: "+ this.selectionTriggeredMenu)
				
				/* if(!this.selectionTriggeredMenu){
					this.selectionTriggeredMenu = true;
				 }*/

				
					console.log("Menu de codificação NÃO está aberto")

				
			} else if(this.codingMenuOpened){
				// Este caso funciona muito bem para quando estamos usando as funções do file-menu.
				console.log(" Menu do plugin Está aberto e por isso não acontecerá nada")
				
				resetMenu(this);
				this.codingMenuOpened = false;
				return;
			}
			console.log("** FIM **") //Nada acontece + funções funcionando nos menus **
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
	addContextMenuEvent() {
		this.registerDomEvent(document, 'contextmenu', () => {
			const activeLeaf = this.app.workspace.activeLeaf;
			if (!(activeLeaf?.view instanceof MarkdownView)) {
				return;
			}
			this.contextMenuOpened = true;
		});
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


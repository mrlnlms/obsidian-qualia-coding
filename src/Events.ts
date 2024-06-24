// # ./src/Events.ts

import { Menu, Editor, TFile, Notice, MarkdownView } from 'obsidian';
import MyPlugin from '../main';
import { createEditorMenu, createFileMenu, resetMenu, createEditorCodingMenu, toggleExample } from './DisplayMenus';
import { loadCodeData, reapplyStyles } from './CodingModals';
import { addExistingCode, addNewCode, removeAllCodes, removeCode } from './Coding';


export function createRegisterEvents(plugin: MyPlugin): void {
    
    // Add a editor menu options;
    plugin.registerEvent(plugin.app.workspace.on('editor-menu', (menu, editor) => {
        createEditorMenu(menu, plugin);
		//createObsidianPluginMenus(menu, plugin)
    }));

    // Add to file menu (right-click menu on a file)
    plugin.registerEvent(plugin.app.workspace.on('file-menu', async (menu, file) => {
        if (file instanceof TFile) {
            createFileMenu(menu, file, plugin);
			//createObsidianPluginMenus(menu, plugin)
        }
    }));

    // Register Editor Context Menu Event
    plugin.registerDomEvent(document, 'contextmenu', (evt: MouseEvent) => {
        const activeLeaf = plugin.app.workspace.activeLeaf;
        if (!(activeLeaf?.view instanceof MarkdownView)) {
            return;
        }
        plugin.contextMenuOpened = true;
    });

	

	/*
	* Ao abrir um arquivo, carrega os dados codificados e atualiza realplicando os estilos
	* no workspace como um todo, mantendo o css por baixo dos panos e exibivel após o usuário fechar a app;
	*/
	plugin.registerEvent(this.app.workspace.on('file-open', () => {
		loadCodeData();
		reapplyStyles(); // Reapply styles when a file is opened
	}));

	// Cria um novo conteúdo carregado no DOM referente ao CSS novo incluido.
	plugin.registerDomEvent(document, 'DOMContentLoaded', () => {
		const link = document.createElement('link');
		link.rel = 'stylesheet';
		link.href = 'styles.css';
		document.head.appendChild(link);
		reapplyStyles(); // Reapply styles when the document is loaded
	});

    addMouseUpEvent(plugin);
	
}

/**
 * 
 * @param plugin recebe o this de root para verificar onde o usuário está clicando.
 * Serve para toda validação antes da exibição do menu contextual exibido após a seleção 
 * de um determinado texto no Editor, que faz exibir ao lado do mouse a caixa de opções;
 */
function addMouseUpEvent(plugin: MyPlugin): void {
	plugin.registerDomEvent(document, 'mouseup', async (evt: MouseEvent) => {

		// Aqui é onde o código roda legal para o menu funcionar.	
		if (!plugin.selectionTriggeredMenu) {
			console.log("padrão")
			resetMenu(plugin);
		}// else {
		//	plugin.selectionTriggeredMenu = false;
		//}
/* 
			if ((evt.target as HTMLElement).closest('.menu-item-toggle')) {
            	if (!plugin.codingMenuOpened) {
					new Notice("Entrouuu")
					this.selectionTriggeredMenu = true; // é como se fose um jeito de enganar o sistema e funcionar, não exibindo o menu após clicar em alguma opção
					this.contextMenuOpened = false;
					this.codingMenuOpened = true;
					return;
				}
			}

			 */
		
		// Tentando fazer funcionar o menu quando adicionado um novo item.
			

		// Corrige o problema de multiplos cliques do usuário
			//if(!plugin.selectionTriggeredMenu){ // no lugar de plugin, seria `this`.
			// Corrige o problema de múltiplos cliques do usuário
			//if (!plugin.menuStayOpen) {
				//resetMenu(plugin);
				//plugin.menuStayOpen = false;
				//resetMenu(plugin);
				//return;
			//} 
			//if (!plugin.selectionTriggeredMenu) {
			 	//if (plugin.menuStayOpen) {
					//resetMenu(plugin);
					//plugin.menuStayOpen = false;
					//return;
				//}
				//resetMenu(plugin);
			//}
			//}
			
			
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
			resetMenu(plugin);
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
			
			//console.log("1 - this.selectionTriggeredMenu:: "+ plugin.selectionTriggeredMenu)

			// script correto abaixo!!!
			await createEditorCodingMenu(editor, evt, plugin);
			//createCustomMenu(evt, plugin)
			
			
			//console.log("2 - this.selectionTriggeredMenu:: "+ plugin.selectionTriggeredMenu)

			//return;
		} else if(this.codingMenuOpened){
		// Este caso funciona para quando o sistema exibe o menu contextual do editor e file. codingMenuOpened só chega aqui true quando passa pelo menu do obsidian;
					
			//console.log(" Menu do plugin Está aberto e por isso não acontecerá nada")
			resetMenu(plugin);
			this.codingMenuOpened = false;
			return;
		}
			//console.log("**************") //Nada acontece + funções funcionando nos menus **
	}
    );
}
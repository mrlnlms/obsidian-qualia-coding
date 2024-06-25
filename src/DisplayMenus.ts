// # ./src/DisplayMenus.ts

import { Menu, Editor, TFile, Notice, MenuItem } from 'obsidian';
import MyPlugin from '../main';
import { addNewCode,addExistingCode,removeCode,removeAllCodes } from './Coding';
/*
* Melhorias:
* - Edição dos ícones e labels;
* - Tentar criar os menus dinâmicamente, facilitando a adição e remoção de opções do plugin;
* 
*/ 

export function createCodingsMenu(plugin: MyPlugin){
	createRibbonButtons(plugin);
	createCommands(plugin);
	console.log(plugin.menuOptions);
}

function createRibbonButtons(plugin: MyPlugin): void {
	/* 
	plugin.addRibbonIcon('plus', 'Add New Code', () => addNewCode(plugin));
	plugin.addRibbonIcon('check', 'Add Existing Code', () => addExistingCode(plugin));
	plugin.addRibbonIcon('trash', 'Remove Code', () => removeCode(plugin));
	plugin.addRibbonIcon('x', 'Remove All Codes', () => removeAllCodes(plugin));
	 */
	// Criando os botões ribbon usando map
	Object.values(plugin.menuOptions).forEach(option => {
		plugin.addRibbonIcon(option.icon, option.title, () => option.action(plugin));
	});

}

function createCommands(plugin: MyPlugin): void {

	// Add commands to command palette
	/* plugin.addCommand({
		id: 'add-new-code',
		name: 'Add New Code',
		//callback: () => this.addNewCode()
		callback: () => addNewCode(plugin)
	});

	plugin.addCommand({
		id: 'add-existing-code',
		name: 'Add Existing Code',
		//callback: () => this.addExistingCode()
		callback: () => addExistingCode(plugin)
	});

	plugin.addCommand({
		id: 'remove-code',
		name: 'Remove Code',
		//callback: () => this.removeCode()
		callback: () => removeCode(plugin)
	});

	plugin.addCommand({
		id: 'remove-all-codes',
		name: 'Remove All Codes',
		//callback: () => this.removeAllCodes()
		callback: () => removeAllCodes(plugin)
	});
	*/
	Object.values(plugin.menuOptions).forEach(option => {
		plugin.addCommand({
			id: option.title.toLowerCase().replace(/ /g, '-'),
			name: option.title,
			callback: () => option.action(plugin)
		});
	});
}


/**
 * Essas funções abaixo são chamadas por meio dos Eventos Registrados no arquivo `Events.ts`. 
 * Elas criam os menus no editor ou no file-menu dinamicamente, ou seja, após o clique do usuário
 * em determinadas áreas da aplicação, citadas acima.
 **/


/*
* Cria o menu no menu contextual lateral superior direito (ao lado do título). 
* Esta opção insere o mesmo menu contextual (click-right) no menu de arquivos;
* 
* * Melhorias:
* - Criar nova função `files-menu` e add ou remover codes que estão nos arquivos selecionados
* -- Talvez seja uma feature mais avançada que possa abrir pelo code e então remover dos arquivos
* 
*/
/*export function createFileMenu(menu: Menu, file: TFile, plugin: MyPlugin): void {
	menu.addSeparator();

	menu.addItem((item) => {
		item.setTitle('Code Options')
			.setIcon('dice');

		const submenu = item.setSubmenu();

		submenu.addItem((subItem) => {
			subItem.setTitle('Add New Code')
				.setIcon('plus')
				.onClick(() => addNewCode(plugin));
		});
		submenu.addItem((subItem) => {
			subItem.setTitle('Add Existing Code')
				.setIcon('check')
				.onClick(() => addExistingCode(plugin));
		});
		submenu.addItem((subItem) => {
			subItem.setTitle('Remove Code!')
				.setIcon('trash')
				.onClick(() => removeCode(plugin));
		});
		submenu.addItem((subItem) => {
			subItem.setTitle('Remove All Codes')
				.setIcon('x')
				.onClick(() => removeAllCodes(plugin));
		});
	});
		
}*/
export function createFileMenu(menu: Menu, file: TFile, plugin: MyPlugin): void {
	menu.addSeparator();

	menu.addItem((item) => {
		item.setTitle('Code Options')
			.setIcon('dice');

		const submenu = item.setSubmenu();
		Object.values(plugin.menuOptions).forEach(option => {
			submenu.addItem((subItem) => {
				subItem.setTitle(option.title)
					.setIcon(option.icon)
					.onClick(() => option.action(plugin));
			});
		});
	});
}


/*
* Cria o menu contextual (click-right) no Editor com as opções do plugin;
*
*/
/*export async function createEditorMenu(menu: Menu, editor: Editor, plugin: MyPlugin): Promise<void> {
	menu.addSeparator();

	menu.addItem((item) => {
		item.setTitle('Code Options')
			.setIcon('dice');

		const submenu = item.setSubmenu();

		submenu.addItem((subItem) => {
			subItem.setTitle('Add New Code')
				.setIcon('plus')
				.onClick(() => addNewCode(plugin));
		});
		submenu.addItem((subItem) => {
			subItem.setTitle('Add Existing Code')
				.setIcon('check')
				.onClick(() => addExistingCode(plugin));
		});
		submenu.addItem((subItem) => {
			subItem.setTitle('Remove Code!')
				.setIcon('trash')
				.onClick(() => removeCode(plugin));
		});
		submenu.addItem((subItem) => {
			subItem.setTitle('Remove All Codes')
				.setIcon('x')
				.onClick(() => removeAllCodes(plugin));
		});
	});
}*/

export function createEditorMenu(menu: Menu, file: TFile, plugin: MyPlugin): void {
	menu.addSeparator();

	menu.addItem((item) => {
		item.setTitle('Code Options')
			.setIcon('dice');

		const submenu = item.setSubmenu();
		Object.values(plugin.menuOptions).forEach(option => {
			submenu.addItem((subItem) => {
				subItem.setTitle(option.title)
					.setIcon(option.icon)
					.onClick(() => option.action(plugin));
			});
		});
	});
}

/**
 * Constrói a exibição do menu contextual do plugin
 * que exibe as opções do plugin durante a seleção de trechos de texto
 */
/*export async function createEditorCodingMenu(editor: Editor, evt: MouseEvent, plugin: MyPlugin) { 
	
	const selectedText = editor.getSelection();
	if (selectedText && !plugin.selectionTriggeredMenu) {
		plugin.selectionTriggeredMenu = true;
		
		//new Notice('Text selected: ' + selectedText);

		if (plugin.currentMenu) {
			plugin.currentMenu.hide();
		}

		const submenu = new Menu();
		submenu.addItem((item) => {
			item.setTitle('Add New Code')
				.setIcon('plus')
				.onClick(() => {
					addNewCode(plugin);
					resetMenu(plugin);
				});
		});
		submenu.addItem((item) => {
			item.setTitle('Add Existing Code')
				.setIcon('check')
				.onClick(() => {
					addExistingCode(plugin);
					resetMenu(plugin);
				});
		});
		submenu.addItem((item) => {
			item.setTitle('Remove Code')
				.setIcon('trash')
				.onClick(() => {
					removeCode(plugin);
					resetMenu(plugin);
				});
		});
		submenu.addItem((item) => {
			item.setTitle('Remove All Codes')
				.setIcon('x')
				.onClick(() => {
					removeAllCodes(plugin);
					resetMenu(plugin);
				});
		});

		submenu.onHide(() => {
			plugin.selectionTriggeredMenu = false;
		});

		submenu.showAtPosition({ x: evt.pageX, y: evt.pageY });
		plugin.currentMenu = submenu;
	}
}
*/
export async function createEditorCodingMenu(editor: Editor, evt: MouseEvent, plugin: MyPlugin) { 
	const selectedText = editor.getSelection();
	if (selectedText && !plugin.selectionTriggeredMenu) {
		plugin.selectionTriggeredMenu = true;
		
		if (plugin.currentMenu) {
			plugin.currentMenu.hide();
		}

		const submenu = new Menu();
		Object.values(plugin.menuOptions).forEach(option => {
			submenu.addItem((item) => {
				item.setTitle(option.title)
					.setIcon(option.icon)
					.onClick(() => {
						option.action(plugin);
						resetMenu(plugin);
					});
			});
		});

		submenu.onHide(() => {
			plugin.selectionTriggeredMenu = false;
		});

		submenu.showAtPosition({ x: evt.pageX, y: evt.pageY });
		plugin.currentMenu = submenu;
	}
}

/*
* Remove o menu contextual do plugin em diversos cenários, gerenciado pelos eventos;
*
*/
export function resetMenu(plugin: MyPlugin) {

	if (plugin.currentMenu) {
		plugin.currentMenu.hide();
		plugin.currentMenu = null;
	}
	plugin.selectionTriggeredMenu = false;
	plugin.contextMenuOpened = false;
}

import { Menu, Editor, TFile, Notice } from 'obsidian';
import MyPlugin from '../main';

/** Cria o menu contextual (click-right) no Editor com as opcoes do plugin */
export function createEditorMenu(menu: Menu, editor: Editor, plugin: MyPlugin): void {
	menu.addItem((item) => {
		item.setTitle('Add New Code')
			.setIcon('plus')
			.onClick(() => {
				new Notice('Add New Code');
				resetMenu(plugin);
			});
	});
	menu.addItem((item) => {
		item.setTitle('Add Existing Code')
			.setIcon('check')
			.onClick(() => {
				new Notice('Add Existing Code');
				resetMenu(plugin);
			});
	});
	menu.addItem((item) => {
		item.setTitle('Remove Code')
			.setIcon('trash')
			.onClick(() => {
				new Notice('Remove Code');
				resetMenu(plugin);
			});
	});
	menu.addItem((item) => {
		item.setTitle('Remove All Codes')
			.setIcon('x')
			.onClick(() => {
				new Notice('Remove All Codes');
				resetMenu(plugin);
			});
	});
}

/** Cria o menu no file-menu (right-click em arquivo) */
export function createFileMenu(menu: Menu, file: TFile, plugin: MyPlugin): void {
	menu.addItem((item) => {
		item.setTitle('Add New Code')
			.setIcon('plus')
			.onClick(() => {
				new Notice('Add New Code');
				resetMenu(plugin);
			});
	});
	menu.addItem((item) => {
		item.setTitle('Add Existing Code')
			.setIcon('check')
			.onClick(() => {
				new Notice('Add Existing Code');
				resetMenu(plugin);
			});
	});
	menu.addItem((item) => {
		item.setTitle('Remove Code')
			.setIcon('trash')
			.onClick(() => {
				new Notice('Remove Code');
				resetMenu(plugin);
			});
	});
	menu.addItem((item) => {
		item.setTitle('Remove All Codes')
			.setIcon('x')
			.onClick(() => {
				new Notice('Remove All Codes');
				resetMenu(plugin);
			});
	});
}

/** Reset do menu — limpa estado do plugin */
export function resetMenu(plugin: MyPlugin): void {
	if (plugin.currentMenu) {
		plugin.currentMenu.hide();
		plugin.currentMenu = null;
	}
	plugin.selectionTriggeredMenu = false;
	plugin.contextMenuOpened = false;
	plugin.codingMenuOpened = false;
}

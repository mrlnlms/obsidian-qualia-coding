import { Editor, MarkdownView, Menu, Notice, Plugin, TFile } from 'obsidian';
import { createCodingsMenu, toggleExample } from './src/DisplayMenus';
import { createRegisterEvents } from 'src/Events';
import { reapplyStyles } from 'src/CodingModals';
import { addExistingCode, addNewCode, removeAllCodes, removeCode } from 'src/Coding';

export interface MenuOption {
	title: string;
	icon: string;
	action: (plugin: MyPlugin) => void;
	isToggle?: boolean;
    isEnabled?: boolean;
	isTextField?: boolean;
}

export default class MyPlugin extends Plugin {
	// See more icon options here:
	//https://forum.obsidian.md/uploads/default/original/3X/8/b/8be3c937905f08c5e0c532228d904e6cb425ab58.png
	
	currentMenu: Menu | null = null;
	menuOptions: MenuOption[] = [
		{ title: '', icon: 'tag', action: (plugin) => {}, isTextField: true }, // Nova opção de campo de texto
		{ title: 'Toggle Example', icon: 'switch', action: (plugin) => toggleExample(plugin), isToggle: true, isEnabled: false },
		{ title: 'Add New Code', icon: 'plus-with-circle', action: (plugin) => addNewCode(plugin) },
		{ title: 'Add Existing Code', icon: 'tag', action: (plugin) => addExistingCode(plugin) },
		{ title: 'Remove Code', icon: 'trash', action: (plugin) => removeCode(plugin) },
		{ title: 'Remove All Codes', icon: 'minus-with-circle', action: (plugin) => removeAllCodes(plugin) }
		
		
	];
	selectionTriggeredMenu: boolean = false;
	contextMenuOpened: boolean = false;
	codingMenuOpened: boolean = false;
	menuStayOpen: boolean = false;
	removeAll: boolean = false;

	toggleQueue: boolean = false; // open queue = true; close queue = false (default state, if queue = true doesn't execute some functions)
	
	async onload() {
		console.log('[menu-editors] v5 loaded -- DisplayMenus completo: menus DOM, coding modals, reapplyStyles');
		createRegisterEvents(this);
		createCodingsMenu(this);
		
	}

	onunload() {
		new Notice('Plugin unloaded');
	}
}

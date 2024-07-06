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
	isTextField?: boolean;
	isEnabled?: boolean;
}

export default class MyPlugin extends Plugin {

	currentMenu: Menu | null = null;
	menuOptions: MenuOption[] = [
		{ title: 'Add New Code', icon: 'plus', action: (plugin) => addNewCode(plugin) },
		{ title: 'Add Existing Code', icon: 'check', action: (plugin) => addExistingCode(plugin) },
		{ title: 'Remove Code', icon: 'trash', action: (plugin) => removeCode(plugin) },
		{ title: 'Remove All Codes', icon: 'x', action: (plugin) => removeAllCodes(plugin) },
		{ title: 'Toggle Example', icon: 'toggle-left', action: (plugin) => toggleExample(plugin), isToggle: true, isEnabled: false },
		{ title: 'New Item', icon: 'pencil', action: () => {}, isTextField: true }
	];
	selectionTriggeredMenu: boolean = false;
	contextMenuOpened: boolean = false;

	async onload() {
		console.log('[menu-editors] v9 loaded -- Clique milestone: click post create item funcionando');
		createRegisterEvents(this);
		createCodingsMenu(this);
	}

	onunload() {
		new Notice('Plugin unloaded');
	}
}

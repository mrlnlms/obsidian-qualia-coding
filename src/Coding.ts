import { Menu, Editor, TFile, Notice, MarkdownView } from 'obsidian';
import MyPlugin from '../main';
import { resetMenu } from './DisplayMenus';
import { ApplyCodeModal, RemoveCodeModal, cleanAllCodes , getActiveEditor} from './CodingModals';


export function addNewCode(plugin: MyPlugin) {
	//new Notice('Add New Code');
	const editor = getActiveEditor();
	if (editor) {
		new ApplyCodeModal(plugin.app, editor).open();
	}
	resetMenu(this);
}

export function addExistingCode(plugin: MyPlugin) {
	new Notice('Add Existing Code');
	resetMenu(this);
}

export function removeCode(plugin: MyPlugin) {
	new Notice('Remove Code');
	const editor = getActiveEditor();
	if (editor) {
		new RemoveCodeModal(plugin.app, editor).open();
	}
	resetMenu(this);
}

export function removeAllCodes(plugin: MyPlugin) {
	new Notice('Remove Code');
	const editor = getActiveEditor();
	if (editor) {
		cleanAllCodes(editor);
	}
	resetMenu(this);
}
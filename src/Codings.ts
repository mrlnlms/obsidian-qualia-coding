import { ApplyCodeModal, RemoveCodeModal, cleanAllCodes, getActiveEditor, loadCodeData, reapplyStyles } from './CodingModals';
import { CodingMenuManager } from './backup/DisplayMenu';
import MyPlugin from '../main';
import { Notice } from 'obsidian';

export function addNewCode(plugin: MyPlugin) {
    const editor = getActiveEditor();
    if (editor) {
        new ApplyCodeModal(plugin.app, editor).open();
    }
    CodingMenuManager.resetMenu(this);
}

export function addExistingCode(plugin: MyPlugin) {
    new Notice('Add Existing Code');
	CodingMenuManager.resetMenu(this);
}

export function removeCode(plugin: MyPlugin) {
	const editor = getActiveEditor();
	if (editor) {
		new RemoveCodeModal(plugin.app, editor).open();
	}
	CodingMenuManager.resetMenu(this);
}

export function removeAllCodes(plugin: MyPlugin) {
	const editor = getActiveEditor();
	if (editor) {
		cleanAllCodes(editor);
	}
	CodingMenuManager.resetMenu(this);
}
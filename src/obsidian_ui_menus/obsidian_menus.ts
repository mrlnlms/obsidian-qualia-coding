// Stub: obsidian_menus — v3 refactor (broken import target)
// These functions were imported by main.ts but the original module was not preserved.
// Stubs created to allow build.

import { Editor, Menu, TFile } from 'obsidian';

export function createEditorMenu(menu: Menu, editor: Editor, plugin: any): void {
	// stub — original implementation not preserved
	menu.addItem((item) => {
		item.setTitle('QDA: Apply Code')
			.setIcon('highlight')
			.onClick(() => {
				// no-op stub
			});
	});
}

export function createFileMenu(menu: Menu, file: TFile, plugin: any): void {
	// stub — original implementation not preserved
	menu.addItem((item) => {
		item.setTitle('QDA: File Action')
			.setIcon('file-text')
			.onClick(() => {
				// no-op stub
			});
	});
}

export function resetMenu(plugin: any): void {
	// stub — original implementation not preserved
	if (plugin.currentMenu) {
		plugin.currentMenu.hide();
		plugin.currentMenu = null;
	}
	plugin.selectionTriggeredMenu = false;
	plugin.contextMenuOpened = false;
}

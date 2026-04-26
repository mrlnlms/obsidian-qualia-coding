/**
 * codebookContextMenu — Right-click context menu for codebook tree rows.
 *
 * Uses Obsidian Menu API. Called from BaseCodeDetailView when
 * onCodeRightClick fires from the tree renderer.
 */

import { Menu } from 'obsidian';
import type { CodeDefinitionRegistry } from './codeDefinitionRegistry';

export interface ContextMenuCallbacks {
	showCodeDetail(codeId: string): void;
	openMergeModal(codeId: string): void;
	promptRename(codeId: string): void;
	promptAddChild(parentId: string): void;
	promptMoveTo(codeId: string, folderId: string | undefined): void;
	promptDelete(codeId: string): void;
	promptColor(codeId: string): void;
	promptDescription(codeId: string): void;
	setParent(codeId: string, parentId: string | undefined): void;
	promptAddToGroup(codeId: string): void;
}

export function showCodeContextMenu(
	event: MouseEvent,
	codeId: string,
	registry: CodeDefinitionRegistry,
	callbacks: ContextMenuCallbacks,
): void {
	const def = registry.getById(codeId);
	if (!def) return;

	const menu = new Menu();

	menu.addItem(item =>
		item.setTitle('Rename').setIcon('pencil').onClick(() => callbacks.promptRename(codeId)),
	);
	menu.addItem(item =>
		item.setTitle('Add child code').setIcon('plus').onClick(() => callbacks.promptAddChild(codeId)),
	);

	menu.addSeparator();

	// TODO(nested folders): listar nested folders com path; getRootFolders só mostra raiz.
	const folders = registry.getRootFolders();
	const SUBMENU_THRESHOLD = 5;
	if (folders.length === 0) {
		menu.addItem(item =>
			item.setTitle('Move to folder...')
				.setIcon('folder-input')
				.setDisabled(true),
		);
	} else if (folders.length > SUBMENU_THRESHOLD) {
		menu.addItem(item => {
			item.setTitle('Move to folder...').setIcon('folder-input');
			const submenu = item.setSubmenu();
			for (const folder of folders) {
				submenu.addItem(sub =>
					sub.setTitle(folder.name)
						.setIcon('folder')
						.setChecked(def.folder === folder.id)
						.onClick(() => callbacks.promptMoveTo(codeId, folder.id)),
				);
			}
			if (def.folder) {
				submenu.addSeparator();
				submenu.addItem(sub =>
					sub.setTitle('Remove from folder')
						.setIcon('folder-minus')
						.onClick(() => callbacks.promptMoveTo(codeId, undefined)),
				);
			}
		});
	} else {
		for (const folder of folders) {
			menu.addItem(item =>
				item.setTitle(`Move to ${folder.name}`)
					.setIcon('folder')
					.setChecked(def.folder === folder.id)
					.onClick(() => callbacks.promptMoveTo(codeId, folder.id)),
			);
		}
		if (def.folder) {
			menu.addItem(item =>
				item.setTitle('Remove from folder')
					.setIcon('folder-minus')
					.onClick(() => callbacks.promptMoveTo(codeId, undefined)),
			);
		}
	}
	if (def.parentId) {
		menu.addItem(item =>
			item.setTitle('Promote to top-level').setIcon('arrow-up-to-line').onClick(() => callbacks.setParent(codeId, undefined)),
		);
	}

	menu.addSeparator();

	menu.addItem(item =>
		item.setTitle('Merge with...').setIcon('merge').onClick(() => callbacks.openMergeModal(codeId)),
	);
	menu.addItem(item =>
		item.setTitle('Add to group...').setIcon('tag').onClick(() => callbacks.promptAddToGroup(codeId)),
	);

	menu.addSeparator();

	menu.addItem(item =>
		item.setTitle('Change color').setIcon('palette').onClick(() => callbacks.promptColor(codeId)),
	);
	menu.addItem(item =>
		item.setTitle('Edit description').setIcon('file-text').onClick(() => callbacks.promptDescription(codeId)),
	);
	menu.addItem(item =>
		item.setTitle('Set magnitude...').setIcon('gauge').onClick(() => callbacks.showCodeDetail(codeId)),
	);

	menu.addSeparator();

	menu.addItem(item =>
		item.setTitle('Delete').setIcon('trash-2').onClick(() => callbacks.promptDelete(codeId)),
	);

	menu.showAtMouseEvent(event);
}

export interface FolderContextMenuCallbacks {
	promptCreateSubfolder(parentFolderId: string): void;
	promptRenameFolder(folderId: string): void;
	promptDeleteFolder(folderId: string): void;
}

export function showFolderContextMenu(
	event: MouseEvent,
	folderId: string,
	registry: CodeDefinitionRegistry,
	callbacks: FolderContextMenuCallbacks,
): void {
	const folder = registry.getFolderById(folderId);
	if (!folder) return;

	const menu = new Menu();

	menu.addItem(item =>
		item.setTitle('New subfolder').setIcon('folder-plus').onClick(() => callbacks.promptCreateSubfolder(folder.id)),
	);
	menu.addItem(item =>
		item.setTitle('Rename').setIcon('pencil').onClick(() => callbacks.promptRenameFolder(folderId)),
	);

	menu.addSeparator();

	menu.addItem(item =>
		item.setTitle('Delete folder').setIcon('trash-2').onClick(() => callbacks.promptDeleteFolder(folderId)),
	);

	menu.showAtMouseEvent(event);
}

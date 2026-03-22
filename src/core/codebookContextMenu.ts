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
	promptMoveTo(codeId: string): void;
	promptDelete(codeId: string): void;
	promptColor(codeId: string): void;
	promptDescription(codeId: string): void;
	setParent(codeId: string, parentId: string | undefined): void;
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

	menu.addItem(item =>
		item.setTitle('Move to...').setIcon('folder-input').onClick(() => callbacks.promptMoveTo(codeId)),
	);
	if (def.parentId) {
		menu.addItem(item =>
			item.setTitle('Promote to top-level').setIcon('arrow-up-to-line').onClick(() => callbacks.setParent(codeId, undefined)),
		);
	}

	menu.addSeparator();

	menu.addItem(item =>
		item.setTitle('Merge with...').setIcon('merge').onClick(() => callbacks.openMergeModal(codeId)),
	);

	menu.addSeparator();

	menu.addItem(item =>
		item.setTitle('Change color').setIcon('palette').onClick(() => callbacks.promptColor(codeId)),
	);
	menu.addItem(item =>
		item.setTitle('Edit description').setIcon('file-text').onClick(() => callbacks.promptDescription(codeId)),
	);

	menu.addSeparator();

	menu.addItem(item =>
		item.setTitle('Delete').setIcon('trash-2').onClick(() => callbacks.promptDelete(codeId)),
	);

	menu.showAtMouseEvent(event);
}

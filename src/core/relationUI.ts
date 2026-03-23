import { setIcon } from 'obsidian';
import type { CodeDefinitionRegistry } from './codeDefinitionRegistry';
import type { CodeRelation } from './types';

interface FocusCallbacks {
	suspendRefresh(): void;
	resumeRefresh(): void;
}

/**
 * Shared "add relation" row used by detailCodeRenderer and detailMarkerRenderer.
 * Renders: label input (with datalist autocomplete) + target input + direction toggle + add button.
 */
export function renderAddRelationRow(
	parent: HTMLElement,
	owner: { relations?: CodeRelation[] },
	registry: CodeDefinitionRegistry,
	allLabels: string[],
	onSave: () => void,
	callbacks: FocusCallbacks,
): void {
	const addRow = parent.createDiv({ cls: 'codemarker-detail-relation-add' });

	// Datalist for label autocomplete
	const labelListId = `relation-labels-${Date.now()}`;
	const datalist = addRow.createEl('datalist', { attr: { id: labelListId } });
	for (const label of allLabels) {
		datalist.createEl('option', { attr: { value: label } });
	}

	const labelInput = addRow.createEl('input', {
		cls: 'codemarker-detail-relation-input',
		attr: { type: 'text', placeholder: 'Label...', list: labelListId },
	});

	// Datalist for target code autocomplete
	const targetListId = `relation-targets-${Date.now()}`;
	const targetDatalist = addRow.createEl('datalist', { attr: { id: targetListId } });
	for (const def of registry.getAll()) {
		targetDatalist.createEl('option', { attr: { value: def.name } });
	}

	const targetInput = addRow.createEl('input', {
		cls: 'codemarker-detail-relation-input',
		attr: { type: 'text', placeholder: 'Target code...', list: targetListId },
	});

	const dirToggle = addRow.createEl('button', { cls: 'codemarker-detail-relation-dir-btn' });
	let directed = true;
	const updateDirIcon = () => {
		dirToggle.empty();
		setIcon(dirToggle, directed ? 'arrow-right' : 'minus');
		dirToggle.title = directed ? 'Directed (click to toggle)' : 'Symmetric (click to toggle)';
	};
	updateDirIcon();
	dirToggle.addEventListener('click', (e) => {
		e.stopPropagation();
		directed = !directed;
		updateDirIcon();
	});

	const addBtn = addRow.createEl('button', { text: 'Add', cls: 'codemarker-detail-relation-add-btn' });
	addBtn.addEventListener('click', () => {
		const label = labelInput.value.trim();
		const targetName = targetInput.value.trim();
		if (!label || !targetName) return;

		let targetDef = registry.getByName(targetName);
		if (!targetDef) {
			targetDef = registry.create(targetName, registry.peekNextPaletteColor());
		}

		if (!owner.relations) owner.relations = [];
		const dup = owner.relations.some(r => r.label === label && r.target === targetDef!.id && r.directed === directed);
		if (dup) return;

		owner.relations.push({ label, target: targetDef.id, directed });
		labelInput.value = '';
		targetInput.value = '';
		onSave();
	});

	for (const inp of [labelInput, targetInput]) {
		inp.addEventListener('focus', () => callbacks.suspendRefresh());
		inp.addEventListener('blur', () => callbacks.resumeRefresh());
		inp.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') { e.preventDefault(); addBtn.click(); }
			e.stopPropagation();
		});
	}
}

import { AbstractInputSuggest, App, prepareFuzzySearch, setIcon } from 'obsidian';
import type { CodeDefinitionRegistry } from './codeDefinitionRegistry';
import type { CodeRelation } from './types';

interface FocusCallbacks {
	suspendRefresh(): void;
	resumeRefresh(): void;
}

/**
 * Inline fuzzy autocomplete over a list of strings. Free-text is preserved —
 * picking a suggestion just fills the input, it does not lock to the list.
 */
class StringFuzzySuggest extends AbstractInputSuggest<string> {
	constructor(app: App, inputEl: HTMLInputElement, private getItems: () => string[]) {
		super(app, inputEl);
	}

	protected getSuggestions(query: string): string[] {
		const items = this.getItems();
		if (!query) return items.slice(0, this.limit);
		const fuzzy = prepareFuzzySearch(query);
		const scored: Array<{ item: string; score: number }> = [];
		for (const item of items) {
			const match = fuzzy(item);
			if (match) scored.push({ item, score: match.score });
		}
		scored.sort((a, b) => b.score - a.score);
		return scored.map(s => s.item);
	}

	renderSuggestion(value: string, el: HTMLElement): void {
		el.setText(value);
	}

	selectSuggestion(value: string): void {
		this.setValue(value);
		this.close();
	}
}

/**
 * Shared "add relation" row used by detailCodeRenderer and detailMarkerRenderer.
 * Renders: label input (fuzzy autocomplete) + target input (fuzzy autocomplete) + direction toggle + add button.
 */
export function renderAddRelationRow(
	parent: HTMLElement,
	owner: { relations?: CodeRelation[] },
	registry: CodeDefinitionRegistry,
	allLabels: string[],
	onSave: () => void,
	callbacks: FocusCallbacks,
	app: App,
): void {
	const addRow = parent.createDiv({ cls: 'codemarker-detail-relation-add' });

	const labelInput = addRow.createEl('input', {
		cls: 'codemarker-detail-relation-input',
		attr: { type: 'text', placeholder: 'Label...' },
	});
	new StringFuzzySuggest(app, labelInput, () => allLabels);

	const targetInput = addRow.createEl('input', {
		cls: 'codemarker-detail-relation-input',
		attr: { type: 'text', placeholder: 'Target code...' },
	});
	new StringFuzzySuggest(app, targetInput, () => registry.getAll().map(d => d.name));

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
			// Skip if suggester already handled Enter (selected a suggestion).
			if (e.key === 'Enter' && !e.defaultPrevented) { e.preventDefault(); addBtn.click(); }
			e.stopPropagation();
		});
	}
}

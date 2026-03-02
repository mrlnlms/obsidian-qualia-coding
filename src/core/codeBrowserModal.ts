import { App, Modal, SearchComponent } from 'obsidian';
import type { CodeDefinition } from './types';
import type { CodeDefinitionRegistry } from './codeDefinitionRegistry';

/**
 * Modal that lists all code definitions for browsing / selection.
 * Includes a search filter. Calls `onSelect(codeName)` when user picks a code.
 */
export class CodeBrowserModal extends Modal {
	private registry: CodeDefinitionRegistry;
	private onSelect: (codeName: string) => void;
	private onDismiss?: () => void;
	private searchQuery = '';
	private listEl: HTMLElement | null = null;

	constructor(
		app: App,
		registry: CodeDefinitionRegistry,
		onSelect: (codeName: string) => void,
		onDismiss?: () => void
	) {
		super(app);
		this.registry = registry;
		this.onSelect = onSelect;
		this.onDismiss = onDismiss;
	}

	onOpen() {
		this.modalEl.addClass('codemarker-code-browser');
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h3', { text: 'All Codes' });

		// Search
		const searchWrap = contentEl.createDiv('codemarker-code-browser-search');
		new SearchComponent(searchWrap)
			.setPlaceholder('Filter codes...')
			.onChange((value: string) => {
				this.searchQuery = value;
				this.renderList();
			});

		// List container
		this.listEl = contentEl.createDiv('codemarker-code-browser-list');
		this.renderList();
	}

	private renderList() {
		if (!this.listEl) return;
		this.listEl.empty();

		const allCodes = this.registry.getAll();
		const q = this.searchQuery.toLowerCase();
		const filtered = q
			? allCodes.filter(def => def.name.toLowerCase().includes(q))
			: allCodes;

		if (filtered.length === 0) {
			this.listEl.createEl('p', {
				text: q ? 'No codes match the filter.' : 'No codes yet.',
				cls: 'codemarker-code-browser-empty',
			});
			return;
		}

		for (const def of filtered) {
			const row = this.listEl.createDiv('codemarker-code-browser-row');

			const swatch = row.createSpan('codemarker-code-browser-swatch');
			swatch.style.backgroundColor = def.color;

			const name = row.createSpan('codemarker-code-browser-name');
			name.textContent = def.name;

			if (def.description) {
				const desc = row.createSpan('codemarker-code-browser-desc');
				desc.textContent = def.description;
			}

			row.addEventListener('click', () => {
				this.onSelect(def.name);
				this.close();
			});
		}
	}

	onClose() {
		this.contentEl.empty();
		this.onDismiss?.();
	}
}

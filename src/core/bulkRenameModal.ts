/**
 * BulkRenameModal — adiciona prefix/suffix em N códigos selecionados.
 *
 * UX simples decidida 2026-04-28: 2 campos ("Add before" + "Add after") + preview
 * dos primeiros nomes antes/depois + apply em lote. Sem regex, sem find/replace.
 */

import { App, Modal, Setting, TextComponent } from 'obsidian';

export interface BulkRenameOptions {
	app: App;
	currentNames: string[];
	onSubmit(prefix: string, suffix: string): void;
}

const PREVIEW_LIMIT = 5;

export class BulkRenameModal extends Modal {
	private opts: BulkRenameOptions;
	private prefix = '';
	private suffix = '';
	private previewEl: HTMLElement | null = null;

	constructor(opts: BulkRenameOptions) {
		super(opts.app);
		this.opts = opts;
	}

	onOpen() {
		this.modalEl.addClass('codemarker-dialog');
		this.modalEl.addClass('codemarker-bulk-rename');
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h3', { text: `Bulk rename ${this.opts.currentNames.length} codes` });

		let prefixInput: TextComponent;
		let suffixInput: TextComponent;

		new Setting(contentEl)
			.setName('Add before')
			.setDesc('Prepended to every selected code name')
			.addText(t => {
				prefixInput = t;
				t.setPlaceholder('e.g. "Wellbeing > "')
					.onChange(v => { this.prefix = v; this.renderPreview(); });
				t.inputEl.addEventListener('keydown', (e) => {
					if (e.key === 'Enter') { e.preventDefault(); this.submit(); }
				});
			});

		new Setting(contentEl)
			.setName('Add after')
			.setDesc('Appended to every selected code name')
			.addText(t => {
				suffixInput = t;
				t.setPlaceholder('e.g. " (revised)"')
					.onChange(v => { this.suffix = v; this.renderPreview(); });
				t.inputEl.addEventListener('keydown', (e) => {
					if (e.key === 'Enter') { e.preventDefault(); this.submit(); }
				});
			});

		this.previewEl = contentEl.createDiv({ cls: 'codemarker-bulk-rename-preview' });
		this.renderPreview();

		const actionsEl = contentEl.createDiv('cm-form-actions');
		actionsEl.createEl('button', { text: 'Cancel' })
			.addEventListener('click', () => this.close());
		actionsEl.createEl('button', { text: 'Apply', cls: 'mod-cta' })
			.addEventListener('click', () => this.submit());

		setTimeout(() => prefixInput!.inputEl.focus(), 50);
	}

	private renderPreview(): void {
		if (!this.previewEl) return;
		this.previewEl.empty();
		if (!this.prefix && !this.suffix) {
			this.previewEl.createEl('p', { text: 'Type a prefix or suffix to see the preview.', cls: 'is-placeholder' });
			return;
		}
		this.previewEl.createEl('p', { text: 'Preview:', cls: 'codemarker-bulk-rename-preview-label' });
		const list = this.previewEl.createEl('ul', { cls: 'codemarker-bulk-rename-preview-list' });
		const visible = this.opts.currentNames.slice(0, PREVIEW_LIMIT);
		for (const oldName of visible) {
			const newName = `${this.prefix}${oldName}${this.suffix}`;
			const li = list.createEl('li');
			li.createSpan({ cls: 'codemarker-bulk-rename-old', text: oldName });
			li.createSpan({ cls: 'codemarker-bulk-rename-arrow', text: ' → ' });
			li.createSpan({ cls: 'codemarker-bulk-rename-new', text: newName });
		}
		if (this.opts.currentNames.length > PREVIEW_LIMIT) {
			this.previewEl.createEl('p', {
				cls: 'codemarker-bulk-rename-more',
				text: `…and ${this.opts.currentNames.length - PREVIEW_LIMIT} more.`,
			});
		}
	}

	private submit(): void {
		if (!this.prefix && !this.suffix) {
			this.close();
			return;
		}
		this.opts.onSubmit(this.prefix, this.suffix);
		this.close();
	}

	onClose() {
		this.contentEl.empty();
	}
}

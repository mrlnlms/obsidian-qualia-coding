/**
 * PromptModal / ConfirmModal — native dialog replacements.
 *
 * Replace browser-native prompt()/confirm() with Obsidian Modals to integrate
 * with theme, keyboard handling, and visual consistency.
 */

import { App, Modal, Setting, TextComponent } from 'obsidian';

export interface PromptOptions {
	app: App;
	title: string;
	initialValue?: string;
	placeholder?: string;
	confirmLabel?: string;
	onSubmit: (value: string) => void;
}

export class PromptModal extends Modal {
	private value: string;
	private opts: PromptOptions;

	constructor(opts: PromptOptions) {
		super(opts.app);
		this.opts = opts;
		this.value = opts.initialValue ?? '';
	}

	onOpen() {
		this.modalEl.addClass('codemarker-dialog');
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h3', { text: this.opts.title });

		let input: TextComponent;
		new Setting(contentEl)
			.addText(t => {
				input = t;
				t.setValue(this.value)
					.setPlaceholder(this.opts.placeholder ?? '')
					.onChange(v => { this.value = v; });
				t.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						this.submit();
					}
				});
			});

		const actionsEl = contentEl.createDiv('cm-form-actions');
		actionsEl.createEl('button', { text: 'Cancel' })
			.addEventListener('click', () => this.close());
		actionsEl.createEl('button', { text: this.opts.confirmLabel ?? 'OK', cls: 'mod-cta' })
			.addEventListener('click', () => this.submit());

		setTimeout(() => {
			input!.inputEl.focus();
			input!.inputEl.select();
		}, 50);
	}

	private submit() {
		const trimmed = this.value.trim();
		if (!trimmed) return;
		this.opts.onSubmit(trimmed);
		this.close();
	}

	onClose() {
		this.contentEl.empty();
	}
}

export interface ConfirmOptions {
	app: App;
	title: string;
	message: string;
	confirmLabel?: string;
	destructive?: boolean;
	onConfirm: () => void;
}

export class ConfirmModal extends Modal {
	private opts: ConfirmOptions;

	constructor(opts: ConfirmOptions) {
		super(opts.app);
		this.opts = opts;
	}

	onOpen() {
		this.modalEl.addClass('codemarker-dialog');
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h3', { text: this.opts.title });
		contentEl.createEl('p', { text: this.opts.message, cls: 'codemarker-dialog-message' });

		const actionsEl = contentEl.createDiv('cm-form-actions');
		actionsEl.createEl('button', { text: 'Cancel' })
			.addEventListener('click', () => this.close());

		const confirmCls = this.opts.destructive ? 'mod-warning' : 'mod-cta';
		const confirmBtn = actionsEl.createEl('button', {
			text: this.opts.confirmLabel ?? 'Confirm',
			cls: confirmCls,
		});
		confirmBtn.addEventListener('click', () => {
			this.opts.onConfirm();
			this.close();
		});

		setTimeout(() => confirmBtn.focus(), 50);
	}

	onClose() {
		this.contentEl.empty();
	}
}

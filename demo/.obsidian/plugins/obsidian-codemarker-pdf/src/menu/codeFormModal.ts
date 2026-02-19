import { Modal, App, Setting } from 'obsidian';
import type { CodeDefinitionRegistry } from '../coding/pdfCodingModel';

/**
 * Modal for creating/editing a code definition.
 */
export class CodeFormModal extends Modal {
	private registry: CodeDefinitionRegistry;
	private onSave: (name: string, color: string, description: string) => void;
	private initialName: string;
	private initialColor: string;
	private initialDescription: string;

	constructor(
		app: App,
		registry: CodeDefinitionRegistry,
		onSave: (name: string, color: string, description: string) => void,
		initial?: { name?: string; color?: string; description?: string },
	) {
		super(app);
		this.registry = registry;
		this.onSave = onSave;
		this.initialName = initial?.name ?? '';
		this.initialColor = initial?.color ?? registry.peekNextPaletteColor();
		this.initialDescription = initial?.description ?? '';
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.addClass('codemarker-code-form');
		contentEl.createEl('h3', { text: this.initialName ? 'Edit Code' : 'New Code' });

		let nameVal = this.initialName;
		let colorVal = this.initialColor;
		let descVal = this.initialDescription;

		new Setting(contentEl)
			.setName('Name')
			.addText((text) => {
				text.setValue(nameVal).onChange((v) => (nameVal = v));
				text.inputEl.focus();
			});

		new Setting(contentEl)
			.setName('Color')
			.addColorPicker((picker) => {
				picker.setValue(colorVal).onChange((v) => (colorVal = v));
			});

		new Setting(contentEl)
			.setName('Description')
			.addTextArea((area) => {
				area.setValue(descVal).onChange((v) => (descVal = v));
				area.inputEl.rows = 3;
			});

		const actions = contentEl.createDiv({ cls: 'cm-form-actions' });

		const cancelBtn = actions.createEl('button', { text: 'Cancel' });
		cancelBtn.addEventListener('click', () => this.close());

		const saveBtn = actions.createEl('button', { text: 'Save', cls: 'mod-cta' });
		saveBtn.addEventListener('click', () => {
			const name = nameVal.trim();
			if (!name) return;
			this.onSave(name, colorVal, descVal.trim());
			this.close();
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}

import { App, Modal, Setting, TextComponent } from 'obsidian';

export class CsvCodeFormModal extends Modal {
	private codeName: string;
	private codeColor: string;
	private codeDescription = '';
	private onSave: (name: string, color: string, description: string) => void;

	constructor(
		app: App,
		defaultName: string,
		defaultColor: string,
		onSave: (name: string, color: string, description: string) => void
	) {
		super(app);
		this.codeName = defaultName;
		this.codeColor = defaultColor;
		this.onSave = onSave;
	}

	onOpen() {
		this.modalEl.addClass('codemarker-code-form');
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h3', { text: 'New Code' });

		let nameInput: TextComponent;

		new Setting(contentEl)
			.setName('Name')
			.addText(text => {
				nameInput = text;
				text.setValue(this.codeName)
					.setPlaceholder('Code name')
					.onChange(value => { this.codeName = value; });
				text.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						this.save();
					}
				});
			});

		new Setting(contentEl)
			.setName('Color')
			.addColorPicker(picker => picker
				.setValue(this.codeColor)
				.onChange(value => { this.codeColor = value; })
			);

		new Setting(contentEl)
			.setName('Description')
			.addTextArea(area => {
				area.setPlaceholder('Optional description...');
				area.onChange(value => { this.codeDescription = value; });
				area.inputEl.rows = 3;
			});

		const actionsEl = contentEl.createDiv('cm-form-actions');
		const cancelBtn = actionsEl.createEl('button', { text: 'Cancel' });
		cancelBtn.addEventListener('click', () => this.close());

		const saveBtn = actionsEl.createEl('button', { text: 'Save', cls: 'mod-cta' });
		saveBtn.addEventListener('click', () => this.save());

		setTimeout(() => nameInput!.inputEl.focus(), 50);
	}

	private save() {
		const name = this.codeName.trim();
		if (!name) return;
		this.onSave(name, this.codeColor, this.codeDescription.trim());
		this.close();
	}

	onClose() {
		this.contentEl.empty();
	}
}

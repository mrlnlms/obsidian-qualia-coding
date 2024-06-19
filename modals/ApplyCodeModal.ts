import { App, Modal, Editor } from 'obsidian';

export class ApplyCodeModal extends Modal {
	editor: Editor;
	code: string;

	constructor(app: App, editor: Editor) {
		super(app);
		this.editor = editor;
		this.code = ""; // Inicialize a propriedade code
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: 'Apply Code' });

		const codeInput = contentEl.createEl('input', { type: 'text', placeholder: 'Enter code' }) as HTMLInputElement;
		const colorInput = contentEl.createEl('input', { type: 'color', value: '#ffff00' }) as HTMLInputElement;
		const applyButton = contentEl.createEl('button', { text: 'Apply' });

		applyButton.onclick = () => {
			this.code = codeInput.value.trim();
			const color = colorInput.value;
			if (this.code) {
				this.applyCodeToSelection(this.code, color);
			}
			this.close();
		};
	}

	applyCodeToSelection(code: string, color: string) {
		const selection = this.editor.getSelection();
		const codedText = `<span class="coded-text ${this.sanitizeCodeName(code)}" data-code="${code}">${selection}</span>`;
		this.editor.replaceSelection(codedText);
		this.saveCodeData(this.editor.getDoc().getValue());
		this.addDynamicStyle(code, color);
		this.storeStyle(code, color); // Store the style in localStorage
	}

	saveCodeData(content: string) {
		const filePath = this.app.workspace.getActiveFile()?.path;
		if (filePath) {
			const codeData = { path: filePath, content: content };
			localStorage.setItem('codeData', JSON.stringify(codeData));
		}
	}

	addDynamicStyle(code: string, color: string) {
		const styleId = `style-${this.sanitizeCodeName(code)}`;
		let style = document.getElementById(styleId);

		if (!style) {
			style = document.createElement('style');
			style.id = styleId;
			//style.type = 'text/css';
			document.head.appendChild(style);
		}

		style.innerHTML = `.coded-text.${this.sanitizeCodeName(code)} { background-color: ${color}; }`;
	}

	storeStyle(code: string, color: string) {
		const styles = JSON.parse(localStorage.getItem('dynamicStyles') || '{}');
		styles[code] = color;
		localStorage.setItem('dynamicStyles', JSON.stringify(styles));
	}

	sanitizeCodeName(code: string): string {
		return code.replace(/[^a-z0-9]/gi, '-').toLowerCase();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
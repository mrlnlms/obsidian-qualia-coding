import { App, Modal, Editor } from 'obsidian';

export class RemoveCodeModal extends Modal {
	editor: Editor;

	constructor(app: App, editor: Editor) {
		super(app);
		this.editor = editor;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: 'Remove Code' });

		const removeButton = contentEl.createEl('button', { text: 'Remove' });

		removeButton.onclick = () => {
			this.removeCodeFromSelection();
			this.close();
		};
	}

	removeCodeFromSelection() {
		const selection = this.editor.getSelection();
		const cleanedText = selection.replace(/<span\b[^>]*?\bclass="[^"]*\bcoded-text\b[^"]*"[^>]*?>(.*?)<\/span>/gis, '$1');
		this.editor.replaceSelection(cleanedText);
		this.saveCodeData(this.editor.getDoc().getValue());

		// Remover o estilo dinâmico (opcional)
		this.removeDynamicStyle(cleanedText);
	}

	saveCodeData(content: string) {
		const filePath = this.app.workspace.getActiveFile()?.path;
		if (filePath) {
			const codeData = { path: filePath, content: content };
			localStorage.setItem('codeData', JSON.stringify(codeData));
		}
	}

	removeDynamicStyle(code: string) {
		const styleId = `style-${this.sanitizeCodeName(code)}`;
		const style = document.getElementById(styleId);
		if (style) {
			style.remove();
		}
	}

	sanitizeCodeName(code: string): string {
		return code.replace(/[^a-z0-9]/gi, '-').toLowerCase();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
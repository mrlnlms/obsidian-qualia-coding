// # ./src/CodingModals.ts

import { App, Modal, Notice, Plugin, PluginSettingTab, Setting, Editor, MarkdownView, TFile, Menu, MenuItem } from 'obsidian';

// Modal para Aplicação de Código
export class ApplyCodeModal extends Modal {
	editor: Editor;
	code: string;

	constructor(app: App, editor: Editor) {
		super(app);
		this.editor = editor;
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
		const codedText = `<span class="coded-text ${sanitizeCodeName(code)}" data-code="${code}">${selection}</span>`;
		this.editor.replaceSelection(codedText);
		//this.saveCodeData(this.editor.getDoc().getValue());
		saveCodeData(this.editor.getDoc().getValue());
		//new Notice(this.editor.getDoc().getValue());
		addDynamicStyle(code, color);
		storeStyle(code, color); // Store the style in localStorage
	}
	/*
	saveCodeData(content: string) {
		new Notice("saveCodeData")
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
			document.head.appendChild(style);
		}

		style.innerHTML = `.coded-text.${this.sanitizeCodeName(code)} { background-color: ${color}; }`;
	}
*/
	/* sanitizeCodeName(code: string): string {
		return code.replace(/[^a-z0-9]/gi, '-').toLowerCase();
	} */

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
	/* getActiveEditor(): Editor | null {
		const activeLeaf = this.app.workspace.activeLeaf;
		if (activeLeaf) {
			const view = activeLeaf.view as MarkdownView;
			return view.editor;
		}
		return null;
	} */
}

// Modal para Remoção de Código
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
		//console.log(tremoveAll)
		const selection = this.editor.getSelection();
		const cleanedText = selection.replace(/<span\b[^>]*?\bclass="[^"]*\bcoded-text\b[^"]*"[^>]*?>(.*?)<\/span>/gis, '$1');
		this.editor.replaceSelection(cleanedText);
		//this.saveCodeData(this.editor.getDoc().getValue());
		saveCodeData(this.editor.getDoc().getValue());

		// Remover o estilo dinâmico (opcional)
		this.removeDynamicStyle(cleanedText);
	}

	/* saveCodeData(content: string) {
		const filePath = this.app.workspace.getActiveFile()?.path;
		if (filePath) {
			const codeData = { path: filePath, content: content };
			localStorage.setItem('codeData', JSON.stringify(codeData));
		}
	} */

	removeDynamicStyle(code: string) {
		const styleId = `style-${sanitizeCodeName(code)}`;
		const style = document.getElementById(styleId);
		if (style) {
			style.remove();
		}
	}

	/* sanitizeCodeName(code: string): string {
		return code.replace(/[^a-z0-9]/gi, '-').toLowerCase();
	} */

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

//Modal para Remoção de Todos os Códigos
export function cleanAllCodes(editor: Editor) {
    const content = editor.getValue();
    const cleanedContent = content.replace(/<span\b[^>]*?\bclass="[^"]*\bcoded-text\b[^"]*"[^>]*?>(.*?)<\/span>/gis, '$1');
    editor.setValue(cleanedContent);
    localStorage.removeItem('dynamicStyles');
}

export function getActiveEditor(): Editor | null {
	const activeLeaf = this.app.workspace.activeLeaf;
	if (activeLeaf) {
		const view = activeLeaf.view;
		if (view instanceof MarkdownView) {
			return view.editor;
		}
	}
	return null;
}

export function saveCodeData(content: string) {
    const filePath = app.workspace.getActiveFile()?.path;
    if (filePath) {
        const codeData = { path: filePath, content: content };
        localStorage.setItem('codeData', JSON.stringify(codeData));
    }
}

export function loadCodeData() {
	//new Notice("AEE")
	const filePath = this.app.workspace.getActiveFile()?.path;
	const codeData = localStorage.getItem('codeData');
	if (filePath && codeData) {
		const parsedCodeData = JSON.parse(codeData);
		//new Notice("AEE 000")
		if (parsedCodeData.path === filePath) {
			//new Notice("AEE 111")
			const activeFile = this.app.workspace.getActiveFile();
			if (activeFile) {
				//new Notice("AEE222")
				this.app.vault.modify(activeFile, parsedCodeData.content);
				//new Notice("AEE33333")
				//new Notice(parsedCodeData.content)
				//console.log(codeData)
			}
		}
	}
}

export function reapplyStyles() {
    const styles = JSON.parse(localStorage.getItem('dynamicStyles') || '{}') as Record<string, string>;
    for (const [code, color] of Object.entries(styles)) {
        addDynamicStyle(code, color);
    }
}

export function addDynamicStyle(code: string, color: string) {
    const styleId = `style-${sanitizeCodeName(code)}`;
    let style = document.getElementById(styleId);

    if (!style) {
        style = document.createElement('style');
        style.id = styleId;
        document.head.appendChild(style);
    }

    style.innerHTML = `.coded-text.${sanitizeCodeName(code)} { background-color: ${color}; }`;
}

export function storeStyle(code: string, color: string) {
	const styles = JSON.parse(localStorage.getItem('dynamicStyles') || '{}');
	styles[code] = color;
	localStorage.setItem('dynamicStyles', JSON.stringify(styles));
}

export function sanitizeCodeName(code: string): string {
	return code.replace(/[^a-z0-9]/gi, '-').toLowerCase();
}
import { App, Modal, Notice, Plugin, PluginSettingTab, Setting, Editor, MarkdownView, TFile, Menu, MenuItem } from 'obsidian';

// Modal para Aplicação de Código
class ApplyCodeModal extends Modal {
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
		const codedText = `<span class="coded-text ${this.sanitizeCodeName(code)}" data-code="${code}" data-color="${color}">${selection}</span>`;
		this.editor.replaceSelection(codedText);
		this.saveCodeData(this.editor.getDoc().getValue());
		this.addDynamicStyle(code, color);
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

	sanitizeCodeName(code: string): string {
		return code.replace(/[^a-z0-9]/gi, '-').toLowerCase();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

// Modal para Remoção de Código
class RemoveCodeModal extends Modal {
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

// Tooltip para Exibir Informações do Código
class CodeTooltip {
	element: HTMLElement;
	constructor() {
		this.element = document.createElement('div');
		this.element.className = 'code-tooltip';
		this.element.innerHTML = `
			<div class="tooltip-content">
				<span class="color-circle"></span>
				<span class="code-name"></span>
				<button class="remove-code">x</button>
			</div>
		`;
		document.body.appendChild(this.element);

		const removeButton = this.element.querySelector('.remove-code');
		if (removeButton) {
			removeButton.addEventListener('click', () => {
				this.removeCode();
			});
		}
	}

	show(target: HTMLElement, code: string, color: string) {
		const rect = target.getBoundingClientRect();
		this.element.style.top = `${rect.top - 30}px`;
		this.element.style.left = `${rect.left}px`;

		const colorCircle = this.element.querySelector('.color-circle');
		if (colorCircle) {
			(colorCircle as HTMLElement).style.backgroundColor = color;
		}

		const codeNameElement = this.element.querySelector('.code-name');
		if (codeNameElement) {
			codeNameElement.textContent = code;
		}

		this.element.style.display = 'block';
	}

	hide() {
		this.element.style.display = 'none';
	}

	removeCode() {
		const selection = window.getSelection();
		if (selection && selection.rangeCount > 0) {
			const range = selection.getRangeAt(0);
			const span = range.commonAncestorContainer.parentElement;
			if (span && span.classList.contains('coded-text')) {
				const cleanedText = span.innerHTML;
				span.outerHTML = cleanedText;
			}
		}
		this.hide();
	}
}

// Plugin Principal
export default class QualitativeCodingPlugin extends Plugin {
	tooltip: CodeTooltip;

	async onload() {
		console.log('[qualitative-coding-plugin] v1 loaded — ApplyCodeModal + highlight com cor');

		this.tooltip = new CodeTooltip();

		this.addCommand({
			id: 'apply-code',
			name: 'Apply Code to Selected Text',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				new ApplyCodeModal(this.app, editor).open();
			}
		});

		this.addCommand({
			id: 'remove-code',
			name: 'Remove Code from Selected Text',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				new RemoveCodeModal(this.app, editor).open();
			}
		});

		this.addRibbonIcon('sun', 'Apply Code', (evt: MouseEvent) => {
			const editor = this.getActiveEditor();
			if (editor) {
				new ApplyCodeModal(this.app, editor).open();
			}
		});

		this.addRibbonIcon('cross', 'Remove Code', (evt: MouseEvent) => {
			const editor = this.getActiveEditor();
			if (editor) {
				new RemoveCodeModal(this.app, editor).open();
			}
		});

		this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => {
			this.addContextMenuItems(menu);
		}));

		this.registerDomEvent(document, 'DOMContentLoaded', () => {
			const link = document.createElement('link');
			link.rel = 'stylesheet';
			link.href = 'styles.css';
			document.head.appendChild(link);
		});

		this.registerDomEvent(document, 'mouseover', (evt: MouseEvent) => {
			const target = evt.target as HTMLElement;
			if (target && target.classList.contains('coded-text')) {
				const code = target.getAttribute('data-code');
				const color = target.getAttribute('data-color');
				if (code && color) {
					this.tooltip.show(target, code, color);
				}
			}
		});

		this.registerDomEvent(document, 'mouseout', (evt: MouseEvent) => {
			const target = evt.target as HTMLElement;
			if (target && target.classList.contains('coded-text')) {
				this.tooltip.hide();
			}
		});

		this.registerEvent(this.app.workspace.on('file-open', () => {
			this.loadCodeData();
		}));
	}

	onunload() {
		console.log('Unloading qualitative coding plugin');
	}

	getActiveEditor(): Editor | null {
		const activeLeaf = this.app.workspace.activeLeaf;
		if (activeLeaf) {
			const view = activeLeaf.view as MarkdownView;
			return view.editor;
		}
		return null;
	}

	addContextMenuItems(menu: Menu) {
		menu.addSeparator();
		menu.addItem((item: MenuItem) => {
			item.setTitle("Qualitative Coding").setIcon("pencil");
		});
		menu.addItem((item: MenuItem) => {
			item.setTitle("Apply Code")
				.setIcon("highlight")
				.onClick(() => {
					const editor = this.getActiveEditor();
					if (editor) {
						new ApplyCodeModal(this.app, editor).open();
					}
				});
		});
		menu.addItem((item: MenuItem) => {
			item.setTitle("Remove Code")
				.setIcon("cross")
				.onClick(() => {
					const editor = this.getActiveEditor();
					if (editor) {
						new RemoveCodeModal(this.app, editor).open();
					}
				});
		});
		menu.addSeparator();
		}

		loadCodeData() {
			const filePath = this.app.workspace.getActiveFile()?.path;
			const codeData = localStorage.getItem('codeData');
			if (filePath && codeData) {
				const parsedCodeData = JSON.parse(codeData);
				if (parsedCodeData.path === filePath) {
					const activeFile = this.app.workspace.getActiveFile();
					if (activeFile) {
						this.app.vault.modify(activeFile, parsedCodeData.content);
					}
				}
			}
		}
}

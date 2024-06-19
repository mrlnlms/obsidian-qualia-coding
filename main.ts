import { Plugin, MenuItem, Menu, MarkdownView, Editor } from 'obsidian';
import { ApplyCodeModal } from './modals/ApplyCodeModal';
import { RemoveCodeModal } from './modals/RemoveCodeModal';
import { CodeTooltip } from './tooltip/CodeTooltip';

export default class QualitativeCodingPlugin extends Plugin {
	tooltip: CodeTooltip;

	async onload() {
		console.log('[qualitative-coding-plugin] v2 loaded -- Modular: modals/, tooltip/, types/');

		this.tooltip = new CodeTooltip();

		this.addCommand({
			id: 'apply-code',
			name: 'Apply Code to Selected Text',
			editorCallback: (editor, view) => {
				new ApplyCodeModal(this.app, editor).open();
			}
		});

		this.addCommand({
			id: 'remove-code',
			name: 'Remove Code from Selected Text',
			editorCallback: (editor, view) => {
				new RemoveCodeModal(this.app, editor).open();
			}
		});

		this.addCommand({
			id: 'clean-all-codes',
			name: 'Clean All Codes from Document',
			callback: () => {
				const editor = this.getActiveEditor();
				if (editor) {
					this.cleanAllCodes(editor);
				}
			}
		});

		this.addRibbonIcon('sun', 'Apply Code', (evt) => {
			const editor = this.getActiveEditor();
			if (editor) {
				new ApplyCodeModal(this.app, editor).open();
			}
		});

		this.addRibbonIcon('cross', 'Remove Code', (evt) => {
			const editor = this.getActiveEditor();
			if (editor) {
				new RemoveCodeModal(this.app, editor).open();
			}
		});

		this.addRibbonIcon('trash', 'Clean All Codes', (evt) => {
			const editor = this.getActiveEditor();
			if (editor) {
				this.cleanAllCodes(editor);
			}
		});

		//this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => {
		this.registerEvent(this.app.workspace.on('editor-menu', (menu, file) => {
			this.addContextMenuItems(menu);
		}));

		this.registerDomEvent(document, 'DOMContentLoaded', () => {
			const link = document.createElement('link');
			link.rel = 'stylesheet';
			link.href = 'styles.css';
			document.head.appendChild(link);
			this.reapplyStyles(); // Reapply styles when the document is loaded
		});

		this.registerDomEvent(document, 'mouseover', (evt) => {
			const target = evt.target as HTMLElement;
			if (target && target.classList.contains('coded-text')) {
				const code = target.getAttribute('data-code');
				if (code) { // Adicionando verificação para garantir que 'code' não seja null
					const styles = JSON.parse(localStorage.getItem('dynamicStyles') || '{}');
					const color = styles[code] || '#ffff00';
					this.tooltip.show(target, code, color);
				}
			}
		});

		this.registerDomEvent(document, 'mouseout', (evt) => {
			const target = evt.target as HTMLElement;
			if (target && target.classList.contains('coded-text')) {
				this.tooltip.hide();
			}
		});

		this.registerEvent(this.app.workspace.on('file-open', () => {
			this.loadCodeData();
			this.reapplyStyles(); // Reapply styles when a file is opened
		}));
	}

	onunload() {
		console.log('Unloading qualitative coding plugin');
	}

	getActiveEditor(): Editor | null {
		const activeLeaf = this.app.workspace.activeLeaf;
		if (activeLeaf) {
			const view = activeLeaf.view;
			if (view instanceof MarkdownView) {
				return view.editor;
			}
		}
		return null;
	}

	addContextMenuItems(menu: Menu) {
		menu.addSeparator();
		menu.addItem((item: MenuItem) => {
			//item.setTitle("Qualitative Coding").setIcon("pencil");
			item.setSection("Qualitative Coding").setTitle("Qualitative Coding").setIcon("pencil");
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
		menu.addItem((item: MenuItem) => {
			item.setTitle("Clean All Codes")
				.setIcon("trash")
				.onClick(() => {
					const editor = this.getActiveEditor();
					if (editor) {
						this.cleanAllCodes(editor);
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

	reapplyStyles() {
		const styles = JSON.parse(localStorage.getItem('dynamicStyles') || '{}') as Record<string, string>;
		for (const [code, color] of Object.entries(styles)) {
			this.addDynamicStyle(code, color);
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

	cleanAllCodes(editor: Editor) {
		const content = editor.getValue();
		const cleanedContent = content.replace(/<span\b[^>]*?\bclass="[^"]*\bcoded-text\b[^"]*"[^>]*?>(.*?)<\/span>/gis, '$1');
		editor.setValue(cleanedContent);
		// Optionally remove the dynamic styles from localStorage
		localStorage.removeItem('dynamicStyles');
	}
}
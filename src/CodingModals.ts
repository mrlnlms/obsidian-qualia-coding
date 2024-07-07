import { App, Modal, Editor, MarkdownView } from 'obsidian';
import MyPlugin from 'main';

export class ApplyCodeModal extends Modal {
    plugin: MyPlugin;
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
        const codedText = `<span class="coded-text ${ApplyCodeModal.sanitizeCodeName(code)}" data-code="${code}">${selection}</span>`;
        this.editor.replaceSelection(codedText);
        //this.plugin.onEditorChange(this.editor);
        ApplyCodeModal.saveCodeData(this.editor.getDoc().getValue());
        ApplyCodeModal.addDynamicStyle(code, color);
        ApplyCodeModal.storeStyle(code, color);
    }

    static saveCodeData(content: string) {
        const filePath = app.workspace.getActiveFile()?.path;
        if (filePath) {
            const codeData = { path: filePath, content: content };
            localStorage.setItem('codeData', JSON.stringify(codeData));
        }
    }

    static addDynamicStyle(code: string, color: string) {
        const styleId = `style-${ApplyCodeModal.sanitizeCodeName(code)}`;
        let style = document.getElementById(styleId);

        if (!style) {
            style = document.createElement('style');
            style.id = styleId;
            document.head.appendChild(style);
        }

        style.innerHTML = `.coded-text.${ApplyCodeModal.sanitizeCodeName(code)} { background-color: ${color}; }`;
    }

    static storeStyle(code: string, color: string) {
        const styles = JSON.parse(localStorage.getItem('dynamicStyles') || '{}');
        styles[code] = color;
        localStorage.setItem('dynamicStyles', JSON.stringify(styles));
    }

    static sanitizeCodeName(code: string): string {
        return code.replace(/[^a-z0-9]/gi, '-').toLowerCase();
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

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
        const cleanedText = selection.replace(/<span\b[^>]*?\bclass="[^"]*\bcoded-text\b[^"]*"[^>]*?>([\s\S]*?)<\/span>/g, '$1');
        this.editor.replaceSelection(cleanedText);
        ApplyCodeModal.saveCodeData(this.editor.getDoc().getValue());
        this.removeDynamicStyle(cleanedText);
    }

    removeDynamicStyle(code: string) {
        const styleId = `style-${ApplyCodeModal.sanitizeCodeName(code)}`;
        const style = document.getElementById(styleId);
        if (style) {
            style.remove();
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

export function cleanAllCodes(editor: Editor) {
    const content = editor.getValue();
    const cleanedContent = content.replace(/<span\b[^>]*?\bclass="[^"]*\bcoded-text\b[^"]*"[^>]*?>([\s\S]*?)<\/span>/g, '$1');
    editor.setValue(cleanedContent);
    localStorage.removeItem('dynamicStyles');
}

export function cleanAllSpecificCodes(editor: Editor) {
    const content = editor.getValue();
    // Expressão regular para encontrar as tags <span> padronizadas e extrair o conteúdo interno
    const cleanedContent = content.replace(/<span class="coded-text aa" data-code="aa"[^>]*>([\s\S]*?)<\/span>/g, '$1');
    editor.setValue(cleanedContent);
}

export function getActiveLeaf(): Editor | null {
    const activeLeaf = app.workspace.activeLeaf;
    if (activeLeaf) {
        const view = activeLeaf.view;
        if (view instanceof MarkdownView) {
            return view.editor;
        }
    }
    return null;
}

export function getActiveEditor(): Editor | null {
    const activeLeaf = app.workspace.activeLeaf;
    if (activeLeaf) {
        const view = activeLeaf.view;
        if (view instanceof MarkdownView) {
            return view.editor;
        }
    }
    return null;
}

export function loadCodeData() {
    const filePath = app.workspace.getActiveFile()?.path;
    const codeData = localStorage.getItem('codeData');
    if (filePath && codeData) {
        const parsedCodeData = JSON.parse(codeData);
        if (parsedCodeData.path === filePath) {
            const activeFile = app.workspace.getActiveFile();
            if (activeFile) {
                app.vault.modify(activeFile, parsedCodeData.content);
            }
        }
    }
}

export function reapplyStyles() {
    const styles = JSON.parse(localStorage.getItem('dynamicStyles') || '{}') as Record<string, string>;
    for (const [code, color] of Object.entries(styles)) {
        ApplyCodeModal.addDynamicStyle(code, color);
    }
}
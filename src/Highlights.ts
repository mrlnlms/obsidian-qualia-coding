import { App, Modal, Editor, Notice } from 'obsidian';
import MyPlugin from 'main';
import { customMenus } from './customMenus';
import { FindAndReplace } from './FindAndReplace';

export class Highlight extends Modal {
    plugin: MyPlugin;
    editor: Editor;
    code: string;
    mySelection: string;

    constructor(app: App, editor: Editor, selection: string) {
        super(app);
        this.editor = editor;
        this.mySelection = selection;
    }

    onOpen() {
        this.apply("aa", "#FFCC00", this.mySelection);
    }

    apply(code: string, color: string, selection: string) {
        const codedText = `<span class="coded-text ${Highlight.sanitizeCodeName(code)}" data-code="${code}">${selection}</span>`;
        this.editor.replaceSelection(codedText);
        Highlight.addDynamicStyle(code, color);
    }

    remove(plugin: MyPlugin, evt: Event) {
        new Notice("AGORA")
        new Notice(this.mySelection)
        //const selection = this.editor.getSelection();
        const mySelectionHTML = `<span class="coded-text aa" data-code="aa">${this.mySelection}</span>`;
        new Notice(mySelectionHTML)
        //this.exampleUsage(this.editor)
        //const content = editor.getValue();
        
        const regex = /<span class="coded-text aa" data-code="aa"[^>]*>([\s\S]*?)<\/span>/g;
        const selections = customMenus.removeHtmlTags(this.editor, regex, this.mySelection, mySelectionHTML, evt);
        if(plugin.codingMenuOpened){
            console.log("CODING ABERTO")
        } else{
            console.log("CODING NAO ABERTO")
        }
        //console.log(selections)
    }

    static sanitizeCodeName(code: string): string {
        return code.replace(/[^a-z0-9]/gi, '-').toLowerCase();
    }

    static addDynamicStyle(code: string, color: string) {
        const styleId = `style-${Highlight.sanitizeCodeName(code)}`;
        let style = document.getElementById(styleId);

        if (!style) {
            style = document.createElement('style');
            style.id = styleId;
            document.head.appendChild(style);
        }

        style.innerHTML = `.coded-text.${Highlight.sanitizeCodeName(code)} { background-color: ${color}; }`;
    }

    removeDynamicStyle(code: string) {
        const styleId = `style-${Highlight.sanitizeCodeName(code)}`;
        const style = document.getElementById(styleId);
        if (style) {
            style.remove();
        }
    }

    static saveCodeData(content: string) {
        const filePath = app.workspace.getActiveFile()?.path;
        if (filePath) {
            const codeData = { path: filePath, content: content };
            localStorage.setItem('codeData', JSON.stringify(codeData));
        }
    }
}
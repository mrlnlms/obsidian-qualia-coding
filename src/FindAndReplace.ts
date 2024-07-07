import { App, Plugin, PluginSettingTab, Setting, MarkdownView, Editor } from 'obsidian';
import * as CodeMirror from "codemirror";
import MyPlugin from 'main';


interface SelectionRange {
	start: { line: number; ch: number };
	end: { line: number; ch: number };
}

export class FindAndReplace {
    
    plugin: MyPlugin;
    static app: any;
    editor: Editor;
    code: string;
    mySelection: string;

    constructor(app: App, editor: Editor, selection: string) {
        //super(app);
        this.editor = editor;
        this.mySelection = selection;
    }

	async onload() {

		/* this.addCommand({
			id: 'find-and-replace-in-selection',
			name: 'Find and replace in selection',
			callback: () => this.findAndReplace()
		}); */
	}

	findAndReplace(): void {
		let editor = this.getEditor();
		if (editor) {
			let selectedText = this.getSelectedText(editor);

			/* if (this.settings.findText && this.settings.findText != "") {
				selectedText = selectedText.split(this.settings.findText).join(this.settings.replace);
			}

			if (this.settings.findRegexp && this.settings.findRegexp != "") {
				var re = new RegExp(this.settings.findRegexp, this.settings.regexpFlags);
				selectedText = selectedText.replace(re, this.settings.replace);
			} */

			editor.replaceSelection(selectedText);
		}
	}

	getEditor(): CodeMirror.Editor {
        const view = app.workspace.getActiveViewOfType(MarkdownSourceView);
        if (view){
            //const editor = ;
            //view.
		    return  view.editor;
        };
        
        //return app.workspace.getActiveViewOfType(MarkdownView)?.sourceMode.cmEditor;
        //return app.workspace.getActiveFile
	}

	getSelectedText(editor: CodeMirror.Editor): string {
		if (!editor.somethingSelected())
			this.selectLineUnderCursor(editor);

		return editor.getSelection();
	}

	selectLineUnderCursor(editor: CodeMirror.Editor) {
		let selection = this.getLineUnderCursor(editor);
		editor.getDoc().setSelection(selection.start, selection.end);
	}

	getLineUnderCursor(editor: CodeMirror.Editor): SelectionRange {
		let fromCh, toCh: number;
		let cursor = editor.getCursor();

		fromCh = 0;
		toCh = editor.getLine(cursor.line).length;

		return {
			start: { line: cursor.line, ch: fromCh },
			end: { line: cursor.line, ch: toCh },
		};
	}
}
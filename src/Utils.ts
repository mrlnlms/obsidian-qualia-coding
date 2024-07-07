import { App, Menu, Editor, TFile, ToggleComponent, TextComponent, MenuItem, Notice, MarkdownView } from 'obsidian';
import MyPlugin, { MenuOption } from '../main';
import { CodingMenuManager } from './backup/DisplayMenu';

export class Utils {
    
    plugin: MyPlugin;
    static app: any;

    constructor(plugin: MyPlugin) {
        this.plugin = plugin;
    }

    static async activeFileEditor(evt: MouseEvent, plugin: MyPlugin) {
        
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;
        const editor = view.editor;
        await CodingMenuManager.createEditorCodingMenu(editor, evt, plugin);

        const lineNumber = editor.getCursor().line;


    }
}



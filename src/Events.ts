import { App, Editor, Menu, TFile, MarkdownView, Notice } from 'obsidian';
import MyPlugin from '../main';
import { getActiveEditor, getActiveLeaf, loadCodeData, reapplyStyles } from './CodingModals';
import { customMenus } from './customMenus';
import * as CodeMirror from 'codemirror';
//import { codingManagement } from './Codings';

export class EventManager {
    plugin: MyPlugin;

    constructor(plugin: MyPlugin) {
        this.plugin = plugin;
    }

    registerEvents(): void {

        this.customMenuEventsManagement(this.plugin);
        this.codingEventsManagement(this.plugin);
    }

    customMenuEventsManagement(plugin: MyPlugin){
        //antigo mouseup
        this.plugin.registerDomEvent(document, 'click', async (evt: MouseEvent) => { 
            
            //await customMenus.showCustomMenu(evt, plugin);
            await customMenus.showCustomMenu(evt, plugin);
            const markdownView = plugin.app.workspace.getActiveViewOfType(MarkdownView);
				
				if (!markdownView) return;

				console.log('click', evt);
				const editor = markdownView.editor;

                const start = editor.getCursor("from");
				const end = editor.getCursor("to");
				const cursor = editor.getCursor();
				console.log('start', start);
				console.log('end', end);

                // Acessa a instância CodeMirror diretamente
                // @ts-ignore: Ignore TypeScript errors for accessing private properties
                const cmEditor = editor.cm as CodeMirror.Editor;
                if (cmEditor) {
                    console.log(cmEditor.getLine)
                    console.log(cmEditor.hasFocus);
					if(!cmEditor.hasFocus){
                        console.log("SAIU do FOCO!!!")
                        console.log(editor.getCursor())
                        evt.stopPropagation();
                    	evt.preventDefault();
                        //cmEditor.focus();
                        console.log(editor.getCursor())
                        //editor.setCursor(start);
                        console.log(cmEditor);
                    } else {
                        console.log("VOLTOU para FOCO?")
                        //evt.stopPropagation();
                    	//evt.preventDefault();
                    }
                }
                
        });
    }

    codingEventsManagement(plugin: MyPlugin){
        plugin.registerEvent(plugin.app.workspace.on('file-open', () => {
            loadCodeData();
            reapplyStyles();
        }));
    
        plugin.registerDomEvent(document, 'DOMContentLoaded', () => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = 'styles.css';
            document.head.appendChild(link);
            reapplyStyles();
        });
        
    }
}

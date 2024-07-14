import { App, Editor, MarkdownView, Modal, Notice, Plugin, MarkdownPostProcessorContext } from 'obsidian';
import * as CodeMirror from 'codemirror';
import {
    DEFAULT_SETTINGS,
    MyPluginSettings,
    SampleSettingTab} from "settings/settings";
// Remember to rename these classes and interfaces!

/* interface MyPluginSettings {
	mySetting: string;
} */

/* const DEFAULT_SETTINGS: MyPluginSettings = {
	mySetting: 'default'
} */
interface EditorPosition {
    line: number;
    ch: number;
}
export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;
	marlon: EditorPosition;


	async onload() {
		console.log('[Editor Playground] v11 loaded -- CM5 experiments + Popper.js + Settings suggesters');
		await this.loadSettings();




		



		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin); [qse]
		// Using this function will automatically remove the event listener when this plugin is disabled.
		/* 
		this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
			
			const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
				
				if (!markdownView) return;

				console.log('click', evt);
				const editor = markdownView.editor;
				const start = editor.getCursor("from");
				const end = editor.getCursor("to");
				const cursor = editor.getCursor();
				console.log('start', start)
				console.log('end', end)

				if(start.line === end.line && start.ch === end.ch){
					console.log("POINT")
					console.log(editor.getCursor())
					editor.setCursor(cursor);
					console.log(editor.getCursor())
					let marlon = this.getClickPosition(evt);
					console.log("***********")
					console.log(marlon)
				}else{
					console.log("There is text selected.");
				}
				
               // Acessa a instância CodeMirror diretamente
                // @ts-ignore: Ignore TypeScript errors for accessing private properties
                const cmEditor = editor.cm as CodeMirror.Editor;
                if (cmEditor) {
					//const clickPosition = CustomMenus.getClickPosition(editor, evt);
					//console.log(cmEditor.getLine()));
					console.log(cmEditor.hasFocus);
					if(!cmEditor.hasFocus){
						console.log("SAIU")
						cmEditor.focus();
						evt.stopPropagation();
                    	evt.preventDefault();
						console.log(cmEditor.hasFocus);
						console.log("VOLTOU?")
						console.log(editor.getCursor());
						//editor.setCursor(1110)
						
						
						//this.marlon.ch = 0;
						//this.marlon.line = 0;
						//editor.setSelection({anchor:line:0, ch:0,head:line:0, ch:0});
					} else {
						console.log("OK")
						
					}

				}
				

		});
 */
		this.registerMarkdownPostProcessor((element: HTMLElement, context: MarkdownPostProcessorContext) => {
            console.log(">>>>>>>>>>>>>>")
			const codedTextElements = element.querySelectorAll('coded-text');
            codedTextElements.forEach((el: HTMLElement) => {
				console.log(">>>>>>>>>>>>>>")
                el.addEventListener('click', () => this.handleCodedTextClick(el));
            });
        });
		this.registerEvent(this.app.workspace.on('layout-change', () => {
			new Notice("layout-change")
		}));
		
		this.registerEvent(this.app.workspace.on('active-leaf-change', () => {
			new Notice("active-leaf-change'")
            const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (markdownView) {
                const editor = markdownView.editor;
               // Acessa a instância CodeMirror diretamente
                // @ts-ignore: Ignore TypeScript errors for accessing private properties
                const cmEditor = editor.cm as CodeMirror.Editor;
                if (cmEditor) {
					//console.error("CodeMirror instance not found.");
					console.log(cmEditor)
					
					//const pos = cmEditor.coordsChar({ left, top });
        			//return { line: pos.line, ch: pos.ch };
                	/* cmEditor.on('cursorActivity', () => {
                    	const cursor = editor.getCursor();
                    	console.log(`Cursor position: Line ${cursor.line}, Column ${cursor.ch}`);
                	}); */
				} else {
                    console.error("CodeMirror instance not found.");
                }
            }
        }));

		this.registerEvent(this.app.workspace.on('editor-change', (editor: Editor) => {
			const cursor = editor.getCursor();
			console.log(`Cursor position: Line ${cursor.line}, Column ${cursor.ch}`);
		}));
		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
		
				// This adds a settings tab so the user can configure various aspects of the plugin
			this.addSettingTab(new SampleSettingTab(this));

	}
	
	
	async save_settings(): Promise<void> {
        
		await this.saveData(this.settings);
    }


	getClickPosition(evt: MouseEvent): EditorPosition | null {
		const { clientX, clientY } = evt;
		const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (markdownView) {
			const editor = markdownView.editor;
			// @ts-ignore: Ignore TypeScript errors for accessing private properties
            const cm = (editor as any).cm as CodeMirror.Editor;
			
			if (cm) {
                //const pos = cm.coordsChar({ left: clientX, top: clientY });
                //return { line: pos.line, ch: pos.ch };
            } else {
                console.error("CodeMirror instance not found.");
            }
		}
		return null;
	}
	handleCodedTextClick(el: HTMLElement) {
        const code = el.getAttribute('data-code');
        if (code) {
            console.log(`Clicked on element with code: ${code}`);
            // Execute your specific function here
            this.performActionBasedOnCode(code);
        }
    }

    performActionBasedOnCode(code: string) {
        // Define your specific function here
        new Notice(`Action performed for code: ${code}`);
    }

    registerEditorListener() {
        this.app.workspace.on('active-leaf-change', () => {
            const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (markdownView) {
                const editor = markdownView.editor;
                // @ts-ignore: Ignore TypeScript errors for accessing private properties
                const cm = editor.cm as any; // Acesse a instância CodeMirror diretamente
                if (cm) {
                    cm.on('cursorActivity', () => {
                        const cursor = editor.getCursor();
                        console.log(`Cursor position: Line ${cursor.line}, Column ${cursor.ch}`);
                    });
                } else {
                    console.error("CodeMirror instance not found.");
                }
            }
        });
    }
	/* getClickPosition(editor: Editor, event: MouseEvent): EditorPosition {
        const { left, top } = event;
        const cm = (editor as any).cm; // Obtendo a instância do CodeMirror
        const pos = cm.coordsChar({ left, top });
        return { line: pos.line, ch: pos.ch };
    } */
	onunload() {

	}

	
	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	
}

class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.setText('Woah!');
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}
/* 
class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Setting #1')
			.setDesc('It\'s a secret')
			.addText(text => text
				.setPlaceholder('Enter your secret')
				.setValue(this.plugin.settings.mySetting)
				.onChange(async (value) => {
					this.plugin.settings.mySetting = value;
					await this.plugin.saveSettings();
				}));
	}
}
 */
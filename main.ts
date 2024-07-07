import { Editor, MarkdownView, Menu, Notice, Plugin, TFile } from 'obsidian';
import { CodingMenuManager } from './src/backup/DisplayMenu';
import { StandardMenus } from 'src/standardMenus';
import { EventManager } from './src/Events';
import { addExistingCode, addNewCode, removeAllCodes, removeCode } from './src/Codings';
import { toggleExample } from 'src/Comps';
import { customMenus } from 'src/customMenus';

export interface MenuOption {
    title: string;
    icon: string;
    action: (plugin: MyPlugin) => void;
    isToggle?: boolean;
    isEnabled?: boolean;
    isTextField?: boolean;
}

export default class MyPlugin extends Plugin {
    currentMenu: Menu | null = null;
    
    menuInput: MenuOption[] = [
        { title: '', icon: 'tag', action: (plugin) => {}, isTextField: true }
    ];
    menuCodes: MenuOption[] = [];
    
    menuOptions: MenuOption[] = [
       //{ title: 'Toggle Example', icon: 'switch', action: (plugin) => toggleExample(plugin), isToggle: true, isEnabled: false },
       { title: 'Add New Code', icon: 'plus-with-circle', action: (plugin) => addNewCode(plugin) },
       { title: 'Add Existing Code', icon: 'tag', action: (plugin) => addExistingCode(plugin) },
       { title: 'Remove Code', icon: 'trash', action: (plugin) => removeCode(plugin) },
       { title: 'Remove All Codes', icon: 'minus-with-circle', action: (plugin) => removeAllCodes(plugin) }
    ];

    get menuCodesReduced(): MenuOption[] {
        return this.menuCodes.slice(0, 5);
    }
    get myCustomMenu(): MenuOption[] {
        return [
            ...this.menuInput,
            ...this.menuCodesReduced,
            ...this.menuOptions
        ];
    }

    // Definindo propriedades faltantes
    contextMenuOpened: boolean = false;
    selectionTriggeredMenu: boolean = false;
    codingMenuOpened: boolean = false;
    menuStayOpen: boolean = false; // Adicionado

    stdMenuManager: StandardMenus;
    menuManager: CodingMenuManager;
    eventManager: EventManager;
    plugin: MenuOption;

    
    async onload() {
        console.log('[Marlon QDA] v10 loaded -- MQDA: MenuOption, CodingMenuManager, EventManager, FindAndReplace');
        //this.menuManager = new CodingMenuManager(this);
        this.stdMenuManager = new StandardMenus(this);
        this.eventManager = new EventManager(this);
        this.stdMenuManager.createMenus();
        this.eventManager.registerEvents();
        
        //this.app.workspace.on('editor-change', this.onEditorChange.bind(this));
         // Adicionar listener global para hover
         /* document.addEventListener('mouseover', (event: MouseEvent) => {
            console.log("11")
            const target = event.target as HTMLElement;
            if (target && target.classList.contains('coded-text')) {
                console.log("22")
                customMenus.showCustomMenu(event, this);
            } else {
                if(!this.codingMenuOpened){
                    customMenus.resetMenu(this);
                }
                
            }
        });
         */
        
        new Notice("MOSx-QDA loaded!!")
    }

    onunload() {
        CodingMenuManager.cleanupCallbacks.forEach(callback => callback());
        new Notice('MOSx-QDA unloaded!');
    }
    onEditorChange(editor: Editor) {
        const codedTextElements = document.querySelectorAll('.coded-text');
        codedTextElements.forEach(span => {
            this.addHoverListeners(span as HTMLSpanElement);
            console.log(span)
        });
    }

    addHoverListeners(span: HTMLSpanElement) {
        // Check if the listeners are already added
        if (!span.classList.contains('hover-listeners-added')) {
            span.addEventListener('mouseover', (event) => {
                customMenus.showCustomMenu(event as MouseEvent, this);
            });

            span.addEventListener('mouseout', () => {
                // You can add any logic you want for mouseout, e.g., hiding a button or other UI elements
            });

            // Mark the span to indicate listeners have been added
            span.classList.add('hover-listeners-added');
        }
    }
}
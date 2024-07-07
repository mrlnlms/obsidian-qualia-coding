import { Menu, Editor, TFile, ToggleComponent, TextComponent, MenuItem, Notice } from 'obsidian';
import MyPlugin, { MenuOption } from '../../main';

export class CodingMenuManager {
    plugin: MyPlugin;
    static handleEnterKey: ((evt: KeyboardEvent) => void) | null = null;
    static lastMouseEvent: MouseEvent | null = null;
    static cleanupCallbacks: (() => void)[] = [];
    static focusCallbacks: (() => void)[] = [];

    constructor(plugin: MyPlugin) {
        this.plugin = plugin;
    }
    
    static async createEditorCodingMenu(editor: Editor, evt: MouseEvent, plugin: MyPlugin) {


            const submenu = new Menu();
            const selectedText = editor.getSelection();

            const myCustomMenu = plugin.menuOptions;

            Object.values(myCustomMenu).forEach(option => {
                if (option.isToggle) {
                    submenu.addItem((item) => {
                        const toggleComponent = new ToggleComponent((item as any).dom);
                        toggleComponent.setValue(option.isEnabled ?? false);
                        toggleComponent.onChange((value) => {
                            option.isEnabled = value;
                            option.action(plugin);
                        });
                        item.setTitle(option.title)
                            .setIcon(option.icon);
                        (item as any).dom.classList.add('menu-item-toggle');

                        (item as any).dom.addEventListener('click', (evt: MouseEvent) => {
                            evt.stopPropagation();
                            const currentValue = toggleComponent.getValue();
                            toggleComponent.setValue(!currentValue);
                        });
                    });
                } else if (option.isTextField) {
                    submenu.addItem((item) => {
                        const textComponent = new TextComponent((item as any).dom);
                        textComponent.setPlaceholder('Enter text...');
                        textComponent.onChange((value) => {
                            option.action(plugin);
                        });
                        item.setTitle(option.title)
                            .setIcon(option.icon);
                        (item as any).dom.classList.add('menu-item-textfield');

                        (item as any).dom.addEventListener('click', (evt: MouseEvent) => {
                            evt.stopPropagation();
                            evt.preventDefault();
                            textComponent.inputEl.focus();
                        });

                        /* const handleEnterKey = (evt: KeyboardEvent) => {
                            if (evt.key === 'Enter') {
                                evt.stopPropagation();
                                evt.preventDefault();
                                
                                //plugin.codingMenuOpened = false;

                                if (CodingMenuManager.lastMouseEvent) {
                                    CodingMenuManager.addItemToEditorCodingMenu(textComponent.inputEl.value, plugin, editor, submenu, CodingMenuManager.lastMouseEvent);
                                }


                                textComponent.inputEl.value = '';
                                textComponent.inputEl.focus();
                                window.removeEventListener('keydown', handleEnterKey, false);
                            }
                        }; */
                        const handleEnterKey = (evt: KeyboardEvent) => {
                            if (evt.key === 'Enter') {
                                evt.stopPropagation();
                                evt.preventDefault();

                                if (CodingMenuManager.lastMouseEvent) {
                                    this.cleanupCallbacks.forEach(callback => callback());
                                    CodingMenuManager.addItemToEditorCodingMenu(textComponent.inputEl.value, plugin, editor, submenu, CodingMenuManager.lastMouseEvent);
                                }
                            }
                        };

                        this.cleanupCallbacks.push(() => {
                            window.removeEventListener('keydown', handleEnterKey, true);
                        });
                        this.focusCallbacks.push(() => {
                            textComponent.inputEl.focus();
                        });
                        
                        window.addEventListener('keydown', handleEnterKey, true);
                        //textComponent.inputEl.focus();
                        
                    });
                } else {
                    submenu.addItem((item) => {
                        item.setTitle(option.title)
                            .setIcon(option.icon)
                            .onClick(() => {
                                option.action(plugin);
                                CodingMenuManager.resetMenu(plugin); // Fechar menu para itens não-toggle
                            });
                    });
                }
            });

            submenu.onHide(async () => {
                plugin.codingMenuOpened = false;
                plugin.menuStayOpen = true;    
                this.resetMenu(plugin);
                //console.log("saiu")
            });
            
            plugin.codingMenuOpened = true;
            
            submenu.showAtPosition({ x: evt.pageX, y: evt.pageY });
            this.focusCallbacks.forEach(callback => callback());
            this.focusCallbacks = [];
            CodingMenuManager.lastMouseEvent = evt;
            
            plugin.currentMenu = submenu;
    }

    static addItemToEditorCodingMenu(value: string, plugin: MyPlugin, editor: Editor, submenu: Menu, originalEvent: MouseEvent) {
        
        if (value.trim() !== '') {
            const newOption = {
                title: value,
                icon: 'tag',
                action: (plugin: MyPlugin) => {
                    new Notice(`Toggle ${value} executed`);
                },
                isToggle: true,
                isEnabled: true
            };
            plugin.menuOptions.push(newOption);
            //myCustomMenu.push(newOption);
            submenu.hide();
            this.createEditorCodingMenu(editor, originalEvent, plugin);
            plugin.codingMenuOpened = true;
        }
    }

    static async resetMenu(plugin: MyPlugin, hideMenu: boolean = true) {

        if (plugin.currentMenu) {
            plugin.currentMenu.hide();
            this.destroyMenu(plugin.currentMenu);
            plugin.currentMenu = null;
        }
        
        plugin.codingMenuOpened = false;
        plugin.menuStayOpen = false; // Adicionado
    }

    static destroyMenu(menu: Menu) {
        if (menu && (menu as any).dom) {
            const menuDom = (menu as any).dom;
            if (menuDom.parentNode) {
                menuDom.parentNode.removeChild(menuDom);
            }
        }
    }
}
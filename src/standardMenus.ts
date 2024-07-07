import { Menu, Editor, TFile, ToggleComponent, TextComponent, MenuItem, Notice, MarkdownView } from 'obsidian';
import MyPlugin, { MenuOption } from '../main';

export class StandardMenus {
    plugin: MyPlugin;

    constructor(plugin: MyPlugin) {
        this.plugin = plugin;
    }
    createMenus() {
        this.createRibbonButtons();
        this.createCommands();
        this.createEditorMenu();
        this.createFileMenu();
    }

    
    private createRibbonButtons(): void {
        Object.values(this.plugin.menuOptions).forEach(option => {
            //if (option.title !== '') {
                this.plugin.addRibbonIcon(option.icon, option.title, () => option.action(this.plugin));
            //}
        });
    }

    private createCommands(): void {
        Object.values(this.plugin.menuOptions).forEach(option => {
                this.plugin.addCommand({
                    id: option.title.toLowerCase().replace(/ /g, '-'),
                    name: option.title,
                    callback: () => option.action(this.plugin)
                });
        });
    }

    private createEditorMenu(): void {
        this.plugin.registerEvent(this.plugin.app.workspace.on('editor-menu', (menu, editor) => {
            StandardMenus.createDefaultObsidianMenus(menu, this.plugin);
        }));
    }

    private createFileMenu(): void {
        this.plugin.registerEvent(this.plugin.app.workspace.on('file-menu', async (menu, file) => {
            if (file instanceof TFile) {
                StandardMenus.createDefaultObsidianMenus(menu, this.plugin);
            }
        }));
        
        // esta função só existe por conta do mouseup event. Verificar se pode remover, ela identifica que clicou no menu.
        this.plugin.registerDomEvent(document, 'contextmenu', (evt: MouseEvent) => {
            const activeLeaf = this.plugin.app.workspace.activeLeaf;
            if (!(activeLeaf?.view instanceof MarkdownView)) {
                return;
            }
            this.plugin.contextMenuOpened = true;
        });
    }
    static createDefaultObsidianMenus(menu: Menu, plugin: MyPlugin) {
        menu.addSeparator();
        const submenu = new Menu(); // Create a new submenu
        Object.values(plugin.menuOptions).forEach(option => {
            submenu.addItem((subItem) => {
                subItem.setTitle(option.title).setIcon(option.icon).onClick(() => option.action(plugin));
            });
        });

        menu.addItem((item) => {
            item.setTitle('Code Options').setIcon('dice').onClick(() => submenu.showAtPosition({ x: (item as any).dom.getBoundingClientRect().right, y: (item as any).dom.getBoundingClientRect().top }));
        });
    }
}
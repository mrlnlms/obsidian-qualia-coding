declare module "obsidian" {
    interface Menu {
        dom: HTMLElement;
        items: MenuItem[];
        onMouseOver: (evt: MouseEvent) => void;
        addSubMenu(item: MenuItem, submenu: Menu): void;
    }

    interface MenuItem {
        callback: () => void;
        dom: HTMLElement;
        setSubmenu: (submenu: Menu) => void;
        disabled: boolean;
        setWarning: (warning: boolean) => void;
    }
}
export {};
import { type Menu, type MenuItem } from 'obsidian';

declare module 'obsidian' {
	interface MenuItem {
		setSubmenu: () => Menu;
	}
}

export {};
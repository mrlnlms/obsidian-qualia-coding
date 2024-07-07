
import { Notice } from 'obsidian';
import MyPlugin from '../main';

export function toggleExample(plugin: MyPlugin) {
    const toggleOption = plugin.menuOptions.find(option => option.title === 'Toggle Example');
    if (toggleOption) {
        new Notice(`Toggle is now ${toggleOption.isEnabled ? 'enabled' : 'disabled'}`);
    }
}
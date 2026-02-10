import { Plugin, MarkdownView, Notice } from 'obsidian';
import { CodeMarkerSettings, DEFAULT_SETTINGS } from './models/settings';
import { CodeMarkerSettingTab } from './views/settingsTab';

export default class CodeMarkerPlugin extends Plugin {
	settings: CodeMarkerSettings;

	async onload() {
		console.log('[CodeMarker v2] v23 loaded -- Scaffold from sample-plugin');
		await this.loadSettings();

		this.addSettingTab(new CodeMarkerSettingTab(this.app, this));
	}

	onunload() {
		console.log('CodeMarker v2: Unloaded');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

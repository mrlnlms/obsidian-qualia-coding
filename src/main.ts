import { Plugin, MarkdownView, Notice, Editor } from 'obsidian';
import { CodeMarkerSettings, DEFAULT_SETTINGS } from './models/settings';
import { CodeMarkerModel } from './models/codeMarkerModel';
import { CodeMarkerSettingTab } from './views/settingsTab';
import { createMarkerStateField, updateFileMarkersEffect } from './cm6/markerStateField';
import { createMarkerViewPlugin } from './cm6/markerViewPlugin';

export default class CodeMarkerPlugin extends Plugin {
	settings: CodeMarkerSettings;
	model: CodeMarkerModel;
	updateFileMarkersEffect = updateFileMarkersEffect;

	async onload() {
		console.log('[CodeMarker v2] v24 loaded -- Port CM6 engine from obsidian-codemarker');
		await this.loadSettings();

		// Initialize data model
		this.model = new CodeMarkerModel(this);
		await this.model.loadMarkers();

		// Register CM6 editor extensions
		this.registerEditorExtension([
			createMarkerStateField(this.model),
			createMarkerViewPlugin(this.model)
		]);

		// Settings tab
		this.addSettingTab(new CodeMarkerSettingTab(this.app, this));

		// Commands
		this.addCommand({
			id: 'create-code-marker',
			name: 'Create marker from selection',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				const marker = this.model.createMarker(editor, view);
				if (marker) {
					if (view.file) {
						this.model.updateMarkersForFile(view.file.path);
					}
					new Notice('Marker created!');
				} else {
					new Notice('Select text first');
				}
			}
		});

		this.addCommand({
			id: 'reset-code-markers',
			name: 'Reset all markers',
			callback: () => {
				this.model.clearAllMarkers();
				new Notice('All markers cleared!');
			}
		});

		console.log('CodeMarker v2: Loaded');
	}

	onunload() {
		console.log('CodeMarker v2: Unloaded');
	}

	async loadSettings() {
		const data = (await this.loadData()) || {};
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
	}

	async saveSettings() {
		const data = (await this.loadData()) || {};
		Object.assign(data, this.settings);
		await this.saveData(data);
	}
}

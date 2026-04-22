import { App, PluginSettingTab, Setting } from 'obsidian';
import type QualiaCodingPlugin from '../main';
import { ExportModal } from '../export/exportModal';

export class QualiaSettingTab extends PluginSettingTab {
	plugin: QualiaCodingPlugin;

	constructor(app: App, plugin: QualiaCodingPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		const settings = this.plugin.dataManager.section('markdown').settings;
		const save = () => this.plugin.dataManager.markDirty();
		const refreshDecorations = () => {
			const model = this.plugin.markdownModel;
			if (!model) return;
			for (const fileId of model.getAllFileIds()) {
				model.updateMarkersForFile(fileId);
			}
		};

		// ── General ────────────────────────────────────────────
		containerEl.createEl('h2', { text: 'General' });

		const generalSettings = this.plugin.dataManager.section('general');

		new Setting(containerEl)
			.setName('Show magnitude in popover')
			.setDesc('Show magnitude picker section in the coding popover for codes with magnitude configured')
			.addToggle(toggle => toggle
				.setValue(generalSettings.showMagnitudeInPopover)
				.onChange((value) => {
					generalSettings.showMagnitudeInPopover = value;
					save();
				}));

		new Setting(containerEl)
			.setName('Show relations in popover')
			.setDesc('Show relations section in the coding popover for adding segment-level relations')
			.addToggle(toggle => toggle
				.setValue(generalSettings.showRelationsInPopover)
				.onChange((value) => {
					generalSettings.showRelationsInPopover = value;
					save();
				}));

		// ── Markdown ────────────────────────────────────────────
		containerEl.createEl('h2', { text: 'Markdown' });

		new Setting(containerEl)
			.setName('Default color')
			.setDesc('Default highlight color for new markers')
			.addColorPicker(color => color
				.setValue(settings.defaultColor)
				.onChange((value) => {
					settings.defaultColor = value;
					save();
				}));

		new Setting(containerEl)
			.setName('Marker opacity')
			.setDesc('Transparency of the marker highlight (0.1–0.5)')
			.addSlider(slider => slider
				.setLimits(0.1, 0.5, 0.05)
				.setValue(settings.markerOpacity)
				.setDynamicTooltip()
				.onChange((value) => {
					settings.markerOpacity = value;
					save();
					refreshDecorations();
				}));

		new Setting(containerEl)
			.setName('Show handles on hover')
			.setDesc('Only show drag handles when hovering over a marker')
			.addToggle(toggle => toggle
				.setValue(settings.showHandlesOnHover)
				.onChange((value) => {
					settings.showHandlesOnHover = value;
					save();
					refreshDecorations();
				}));

		containerEl.createEl('h3', { text: 'Menus' });

		new Setting(containerEl)
			.setName('Show menu on text selection')
			.setDesc('Automatically show the coding menu when you select text')
			.addToggle(toggle => toggle
				.setValue(settings.showMenuOnSelection)
				.onChange((value) => {
					settings.showMenuOnSelection = value;
					save();
				}));

		new Setting(containerEl)
			.setName('Show in right-click menu')
			.setDesc('Add code options to the editor right-click context menu')
			.addToggle(toggle => toggle
				.setValue(settings.showMenuOnRightClick)
				.onChange((value) => {
					settings.showMenuOnRightClick = value;
					save();
				}));

		new Setting(containerEl)
			.setName('Show ribbon button')
			.setDesc('Show a "Code Selection" button in the left ribbon')
			.addToggle(toggle => toggle
				.setValue(settings.showRibbonButton)
				.onChange((value) => {
					settings.showRibbonButton = value;
					save();
				}));

		// ── Media ──────────────────────────────────────────────
		containerEl.createEl('h2', { text: 'Media' });
		containerEl.createEl('p', {
			text: 'When enabled, files open in the plugin\'s Coding View instead of the native Obsidian viewer. When disabled, files open in the native viewer (no coding features active).',
			cls: 'setting-item-description',
		});

		const imageSettings = this.plugin.dataManager.section('image').settings;
		const audioSettings = this.plugin.dataManager.section('audio').settings;
		const videoSettings = this.plugin.dataManager.section('video').settings;
		const pdfSettings = this.plugin.dataManager.section('pdf').settings;

		new Setting(containerEl)
			.setName('Open images in coding view')
			.setDesc('PNG, JPG, WebP, SVG, etc.')
			.addToggle(toggle => toggle
				.setValue(imageSettings.autoOpen)
				.onChange((value) => {
					imageSettings.autoOpen = value;
					save();
				}));

		new Setting(containerEl)
			.setName('Open audio in coding view')
			.setDesc('MP3, WAV, OGG, M4A, etc.')
			.addToggle(toggle => toggle
				.setValue(audioSettings.autoOpen)
				.onChange((value) => {
					audioSettings.autoOpen = value;
					save();
				}));

		new Setting(containerEl)
			.setName('Open video in coding view')
			.setDesc('MP4, WebM, MKV, MOV, etc.')
			.addToggle(toggle => toggle
				.setValue(videoSettings.autoOpen)
				.onChange((value) => {
					videoSettings.autoOpen = value;
					save();
				}));

		new Setting(containerEl)
			.setName('Enable coding on PDF files')
			.setDesc('Adds highlight/shape/selection-to-code overlay on the native PDF viewer. When off, PDF opens as a regular Obsidian PDF (no plugin decoration).')
			.addToggle(toggle => toggle
				.setValue(pdfSettings.autoOpen)
				.onChange((value) => {
					pdfSettings.autoOpen = value;
					save();
				}));

		// ── Export ──────────────────────────────────────────────
		containerEl.createEl('h2', { text: 'Export' });

		new Setting(containerEl)
			.setName('Export project (QDPX)')
			.setDesc('Export codes, segments, and sources as a REFI-QDA project')
			.addButton(btn => btn
				.setButtonText('Export QDPX')
				.onClick(() => {
					new ExportModal(this.app, this.plugin.dataManager, this.plugin.sharedRegistry, 'qdpx', this.plugin.manifest.version, this.plugin.caseVariablesRegistry).open();
				}));

		new Setting(containerEl)
			.setName('Export codebook (QDC)')
			.setDesc('Export only the code definitions and hierarchy')
			.addButton(btn => btn
				.setButtonText('Export QDC')
				.onClick(() => {
					new ExportModal(this.app, this.plugin.dataManager, this.plugin.sharedRegistry, 'qdc', this.plugin.manifest.version, this.plugin.caseVariablesRegistry).open();
				}));
	}
}

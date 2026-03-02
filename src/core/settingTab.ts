import { App, PluginSettingTab, Setting } from 'obsidian';
import type QualiaCodingPlugin from '../main';

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

		// ── Image ──────────────────────────────────────────────
		containerEl.createEl('h2', { text: 'Image' });

		const imageSettings = this.plugin.dataManager.section('image').settings;

		new Setting(containerEl)
			.setName('Auto-open images')
			.setDesc('Open images in the coding view instead of the default viewer')
			.addToggle(toggle => toggle
				.setValue(imageSettings.autoOpenImages)
				.onChange((value) => {
					imageSettings.autoOpenImages = value;
					save();
				}));

		// ── Sidebar ─────────────────────────────────────────────
		containerEl.createEl('h2', { text: 'Sidebar' });

		new Setting(containerEl)
			.setName('Auto-reveal on segment click')
			.setDesc('Navigate to the marker in the document when clicking a segment in the sidebar')
			.addToggle(toggle => toggle
				.setValue(settings.autoRevealOnSegmentClick)
				.onChange((value) => {
					settings.autoRevealOnSegmentClick = value;
					save();
				}));
	}
}

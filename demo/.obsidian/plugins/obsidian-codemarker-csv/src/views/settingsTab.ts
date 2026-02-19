import { App, PluginSettingTab, Setting } from 'obsidian';
import type CsvCodingPlugin from '../main';

export class CsvCodingSettingTab extends PluginSettingTab {
	plugin: CsvCodingPlugin;

	constructor(app: App, plugin: CsvCodingPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'CodeMarker CSV Settings' });

		new Setting(containerEl)
			.setName('Default color')
			.setDesc('Default highlight color for new markers')
			.addColorPicker(color => color
				.setValue(this.plugin.settings.defaultColor)
				.onChange(async (value) => {
					this.plugin.settings.defaultColor = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Marker opacity')
			.setDesc('Transparency of the marker highlight (0.1 - 0.5)')
			.addSlider(slider => slider
				.setLimits(0.1, 0.5, 0.05)
				.setValue(this.plugin.settings.markerOpacity)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.markerOpacity = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Show handles on hover')
			.setDesc('Only show drag handles when hovering over a marker')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showHandlesOnHover)
				.onChange(async (value) => {
					this.plugin.settings.showHandlesOnHover = value;
					await this.plugin.saveSettings();
				}));

		containerEl.createEl('h3', { text: 'Floating Menu' });

		new Setting(containerEl)
			.setName('Menu implementation')
			.setDesc('Obsidian Native uses the standard menu (may briefly lose selection highlight). CM6 Tooltip keeps selection active.')
			.addDropdown(dropdown => dropdown
				.addOption('obsidian-native', 'Obsidian Native Menu')
				.addOption('cm6-tooltip', 'CM6 Tooltip Menu')
				.addOption('cm6-native-tooltip', 'CM6 Tooltip + Native Components')
				.setValue(this.plugin.settings.menuMode)
				.onChange(async (value) => {
					this.plugin.settings.menuMode = value as 'obsidian-native' | 'cm6-tooltip' | 'cm6-native-tooltip';
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Show menu on text selection')
			.setDesc('Automatically show the coding menu when you select text')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showMenuOnSelection)
				.onChange(async (value) => {
					this.plugin.settings.showMenuOnSelection = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Show in right-click menu')
			.setDesc('Add code options to the editor right-click context menu')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showMenuOnRightClick)
				.onChange(async (value) => {
					this.plugin.settings.showMenuOnRightClick = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Show ribbon button')
			.setDesc('Show a "Code Selection" button in the left ribbon')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showRibbonButton)
				.onChange(async (value) => {
					this.plugin.settings.showRibbonButton = value;
					await this.plugin.saveSettings();
				}));
	}
}

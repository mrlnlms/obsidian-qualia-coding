import { PluginSettingTab, App, Setting } from "obsidian";
import type CodeMarkerAudioPlugin from "../main";

export class AudioSettingTab extends PluginSettingTab {
	private plugin: CodeMarkerAudioPlugin;

	constructor(app: App, plugin: CodeMarkerAudioPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl("h2", { text: "CodeMarker Audio" });

		const settings = this.plugin.model.settings;

		new Setting(containerEl)
			.setName("Default zoom")
			.setDesc("Initial zoom level for new audio files (pixels per second, 10–200).")
			.addSlider((slider) =>
				slider
					.setLimits(10, 200, 5)
					.setValue(settings.defaultZoom)
					.setDynamicTooltip()
					.onChange(async (value) => {
						settings.defaultZoom = value;
						this.plugin.model.scheduleSave();
					})
			);

		new Setting(containerEl)
			.setName("Region opacity")
			.setDesc("Opacity of coded regions on the waveform (0 = transparent, 1 = opaque).")
			.addSlider((slider) =>
				slider
					.setLimits(0, 1, 0.05)
					.setValue(settings.regionOpacity)
					.setDynamicTooltip()
					.onChange(async (value) => {
						settings.regionOpacity = value;
						this.plugin.model.scheduleSave();
						this.plugin.model.notifyChange();
					})
			);

		new Setting(containerEl)
			.setName("Show labels on regions")
			.setDesc("Display code name labels inside waveform regions.")
			.addToggle((toggle) =>
				toggle
					.setValue(settings.showLabelsOnRegions)
					.onChange(async (value) => {
						settings.showLabelsOnRegions = value;
						this.plugin.model.scheduleSave();
						this.plugin.model.notifyChange();
					})
			);
	}
}

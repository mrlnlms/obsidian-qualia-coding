import { App, PluginSettingTab, Setting } from 'obsidian';
import type CodeMarkerImagePlugin from '../main';

export class ImageSettingTab extends PluginSettingTab {
	private plugin: CodeMarkerImagePlugin;

	constructor(app: App, plugin: CodeMarkerImagePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'CodeMarker Image' });

		new Setting(containerEl)
			.setName('Auto-open images')
			.setDesc('Automatically open image files in the CodeMarker Image coding view instead of the default Obsidian viewer.')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.model.settings.autoOpenImages)
					.onChange(async (value) => {
						this.plugin.model.settings.autoOpenImages = value;
						await this.plugin.model.save();
					})
			);
	}
}

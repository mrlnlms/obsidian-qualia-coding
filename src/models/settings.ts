import { App, PluginSettingTab, Setting } from 'obsidian';
import CodeMarkerPlugin from '../../main';

export interface CodeMarkerSettings {
  defaultColor: string;
  showHandlesOnHover: boolean;
  handleSize: number;
}

export const DEFAULT_SETTINGS: CodeMarkerSettings = {
  defaultColor: '#6200EE', // Roxo padrão
  showHandlesOnHover: true,
  handleSize: 12
};

export class CodeMarkerSettingTab extends PluginSettingTab {
  plugin: CodeMarkerPlugin;

  constructor(app: App, plugin: CodeMarkerPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();

    containerEl.createEl('h2', { text: 'Configurações do CodeMarker' });

    new Setting(containerEl)
      .setName('Cor padrão')
      .setDesc('A cor padrão para novas marcações')
      .addColorPicker(color => color
        .setValue(this.plugin.settings.defaultColor)
        .onChange(async (value) => {
          this.plugin.settings.defaultColor = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Mostrar alças ao passar o mouse')
      .setDesc('Mostra as alças de arraste apenas quando passar o mouse sobre a marcação')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.showHandlesOnHover)
        .onChange(async (value) => {
          this.plugin.settings.showHandlesOnHover = value;
          await this.plugin.saveSettings();
        }));
        
    new Setting(containerEl)
      .setName('Tamanho das alças')
      .setDesc('Ajusta o tamanho das alças de arraste (recarregue o plugin para aplicar)')
      .addSlider(slider => slider
        .setLimits(8, 20, 1)
        .setValue(this.plugin.settings.handleSize)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.handleSize = value;
          await this.plugin.saveSettings();
        }));
  }
}
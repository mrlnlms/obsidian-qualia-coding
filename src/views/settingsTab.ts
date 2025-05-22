import { App, PluginSettingTab, Setting } from 'obsidian';
import CodeMarkerPlugin from '../../main';

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
      .setName('Exibir no modo de visualização')
      .setDesc('Mostrar marcações no modo de visualização (preview)')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.displayInPreviewMode)
        .onChange(async (value) => {
          this.plugin.settings.displayInPreviewMode = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Armazenar marcações no frontmatter')
      .setDesc('Armazenar marcações no frontmatter YAML do documento')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.storeMarkersInFrontmatter)
        .onChange(async (value) => {
          this.plugin.settings.storeMarkersInFrontmatter = value;
          await this.plugin.saveSettings();
        }));

    // Adicione após as outras configurações
    new Setting(containerEl)
      .setName('Opacidade da marcação')
      .setDesc('Controle o nível de transparência das marcações (valor menor = mais transparente)')
      .addSlider(slider => slider
        .setLimits(0.1, 0.5, 0.05)
        .setValue(this.plugin.settings.markerOpacity)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.markerOpacity = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Exibir alças apenas ao passar o mouse')
      .setDesc('Quando ativado, as alças de marcação só serão exibidas ao passar o mouse sobre a marcação')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.showHandlesOnHover)
        .onChange(async (value) => {
          this.plugin.settings.showHandlesOnHover = value;
          await this.plugin.saveSettings();
          // Atualizar todas as marcações existentes
          const activeFile = this.app.workspace.getActiveFile();
          if (activeFile) {
            this.plugin.model.updateMarkersForFile(activeFile.path);
          }
        }));

    new Setting(containerEl)
      .setName('Cores de marca-texto')
      .setDesc('Escolha entre cores de marca-texto predefinidas')
      .addDropdown(dropdown => dropdown
        .addOption('#FFFF00', 'Amarelo')
        .addOption('#90EE90', 'Verde claro')
        .addOption('#ADD8E6', 'Azul claro')
        .addOption('#FFA07A', 'Salmão')
        .addOption('#D8BFD8', 'Lilás')
        .setValue(this.plugin.settings.defaultColor)
        .onChange(async (value) => {
          this.plugin.settings.defaultColor = value;
          await this.plugin.saveSettings();
        }));
  }
}
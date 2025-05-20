import { Plugin, Editor, MarkdownView, Notice } from 'obsidian';
import { StateEffectType } from "@codemirror/state";
import { CodeMarkerSettings, DEFAULT_SETTINGS } from './src/models/settings';
import { CodeMarkerSettingTab } from './src/views/settingsTab';
import { CodeMarkerModel } from './src/models/codeMarkerModel';
import { createMarkerStateField, updateFileMarkersEffect } from './src/cm6/markerStateField';
import { createMarkerViewPlugin } from './src/cm6/markerViewPlugin';

export default class CodeMarkerPlugin extends Plugin {
  settings: CodeMarkerSettings;
  model: CodeMarkerModel;
  // Mudamos o tipo para StateEffectType apenas
  updateFileMarkersEffect: StateEffectType<{fileId: string}>;

  async onload() {
    await this.loadSettings();
    
    // Inicializar o modelo de dados
    this.model = new CodeMarkerModel(this);
    
    // Disponibilizar o efeito para o modelo
    this.updateFileMarkersEffect = updateFileMarkersEffect;
    
    await this.model.loadMarkers();

    // Comando para criar uma nova marcação
    this.addCommand({
      id: 'create-code-marker',
      name: 'Criar uma nova marcação de código',
      editorCallback: (editor: Editor, view: MarkdownView) => {
        const selection = editor.getSelection();
        if (selection.length > 0) {
          const marker = this.model.createMarker(editor, view);
          if (marker && marker.fileId) {
            // Atualizar as decorações
            this.model.updateMarkersForFile(marker.fileId);
            new Notice('Marcação criada!');
          }
        } else {
          new Notice('Selecione algum texto primeiro!');
        }
      }
    });
    
    // Comando para resetar todas as marcações manualmente
    this.addCommand({
      id: 'reset-code-markers',
      name: 'Resetar todas as marcações salvas',
      callback: () => {
        this.model.clearAllMarkers();
        new Notice('Todas as marcações foram resetadas.');
      }
    });
    
    // Criar as extensões do editor
    const markerStateField = createMarkerStateField(this.model);
    const markerViewPlugin = createMarkerViewPlugin(this.model);
    
    // Registrar as extensões do editor
    this.registerEditorExtension([
      markerStateField,
      markerViewPlugin
    ]);
    
    // Registrar evento para atualizar marcações quando um arquivo é aberto
    this.registerEvent(
      this.app.workspace.on('file-open', (file) => {
        if (file) {
          this.model.updateMarkersForFile(file.path);
        }
      })
    );
    
    // Adicionar a tab de configurações
    this.addSettingTab(new CodeMarkerSettingTab(this.app, this));

    console.log('[CodeMarker] v18 loaded -- TAG v0.2.0: CM6 funcionando perfeitamente');
  }

  onunload() {
    console.log('Descarregando plugin CodeMarker');
    // Não precisamos limpar manualmente as marcações ao descarregar
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
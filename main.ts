import { Plugin, Editor, MarkdownView, Notice } from 'obsidian';
import { CodeMarkerSettings, DEFAULT_SETTINGS } from './src/models/settings';
import { CodeMarkerSettingTab } from './src/views/settingsTab';
import { CodeMarkerModel } from './src/models/codeMarkerModel';
import { ResizeHandles } from './src/views/resizeHandles';


export default class CodeMarkerPlugin extends Plugin {
  settings: CodeMarkerSettings;
  model: CodeMarkerModel;
  resizeHandles: ResizeHandles;


  async onload() {
    await this.loadSettings();
    
    // Carregar marcações salvas anteriormente // Inicializar o modelo de dados
    this.model = new CodeMarkerModel(this);
    
    // Inicializar as alças de redimensionamento
    this.resizeHandles = new ResizeHandles(this.model);
    await this.model.loadMarkers();

    // Comando para criar uma nova marcação
    this.addCommand({
      id: 'create-code-marker',
      name: 'Criar uma nova marcação de código',
      editorCallback: (editor: Editor, view: MarkdownView) => {
        const selection = editor.getSelection();
        if (selection.length > 0) {
          const marker = this.model.createMarker(editor, view);
          if (marker) {
            // Aplicar a decoração visual
            this.model.applyMarkerDecoration(marker, view);
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
    
    // Registrar a extensão do editor para as decorações
    this.registerEditorExtension([this.model.getEditorExtension()]);
    
    // Registrar evento para atualizar marcações quando um arquivo é aberto
    this.registerEvent(
      this.app.workspace.on('file-open', (file) => {
        if (file) {
          this.model.updateMarkersForFile(file.path);
        }
      })
    );
    
  // Registrar evento para esconder alças quando a visualização ativa muda
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', () => {
        this.resizeHandles.hideHandles();
      })
    );
    
    // Registrar evento para esconder alças quando o layout muda
    this.registerEvent(
      this.app.workspace.on('layout-change', () => {
        this.resizeHandles.hideHandles();
      })
    );
    // Adicionar a tab de configurações
    this.addSettingTab(new CodeMarkerSettingTab(this.app, this));

    

    console.log('[CodeMarker] v16 loaded -- Marcacoes estilizadas, hover OK, reset codigos');
  }

  onunload() {
    console.log('Descarregando plugin CodeMarker');

    // 🔄 Limpa as marcações salvas ao descarregar o plugin
    if (this.model) {
      this.model.clearAllMarkers();
    }

    if (this.resizeHandles) {
      this.resizeHandles.cleanup();
    }
  }


  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
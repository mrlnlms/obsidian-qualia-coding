import { Plugin, Editor, MarkdownView, Notice } from 'obsidian';
import { CodeMarkerSettings, DEFAULT_SETTINGS } from './src/models/settings';
import { CodeMarkerSettingTab } from './src/views/settingsTab';
import { CodeMarkerModel } from './src/models/codeMarkerModel';
import { ResizeHandles } from './src/views/resizeHandles';

export default class CodeMarkerPlugin extends Plugin {
  settings: CodeMarkerSettings;
  model: CodeMarkerModel;
  resizeHandles: ResizeHandles; // Nova propriedade


  async onload() {
    await this.loadSettings();
    
    // Inicializar o modelo de dados
    this.model = new CodeMarkerModel(this);
    this.resizeHandles = new ResizeHandles(this.model);

    
    // Carregar marcações salvas anteriormente
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

    console.log('[CodeMarker] v14 loaded -- CodeMarker CM6 inicial: highlight + handles (erro interacao)');
  }

  onunload() {
    console.log('Descarregando plugin CodeMarker');
    
    // Garantir que todas as alças sejam removidas
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
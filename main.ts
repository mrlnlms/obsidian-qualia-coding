import { Plugin, MarkdownView, Notice } from 'obsidian';
import { StateEffectType } from "@codemirror/state";
import { CodeMarkerSettings, DEFAULT_SETTINGS } from './src/models/settings';
import { CodeMarkerSettingTab } from './src/views/settingsTab';
import { CodeMarkerModel } from './src/models/codeMarkerModel';
import { createMarkerStateField, updateFileMarkersEffect } from './src/cm6/markerStateField';
import { createMarkerViewPlugin } from './src/cm6/markerViewPlugin';


export default class CodeMarkerPlugin extends Plugin {
  settings: CodeMarkerSettings;
  model: CodeMarkerModel;
  updateFileMarkersEffect: StateEffectType<{fileId: string}>;

  async onload() {
    console.log('[CodeMarker] v22 loaded -- Quase final — falta corrigir intersecoes');
    
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
      callback: () => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) {
          new Notice('Nenhum arquivo Markdown ativo.');
          return;
        }
    
        const editor = view.editor;
        if (!editor) {
          new Notice('Editor não encontrado.');
          return;
        }
    
        // ✅ MELHORADO: Usar listSelections() e verificar se há seleção válida
        const selections = editor.listSelections();
        if (!selections || selections.length === 0) {
          new Notice('Nenhuma seleção encontrada!');
          return;
        }
    
        const selection = selections[0]; // Pegar a primeira seleção
        
        // Verificar se há realmente uma seleção (anchor diferente de head)
        if (selection.anchor.line === selection.head.line && 
            selection.anchor.ch === selection.head.ch) {
          new Notice('Selecione algum texto primeiro!');
          return;
        }
    
        // Verificar se a seleção tem conteúdo
        const selectedText = editor.getRange(selection.anchor, selection.head);
        if (!selectedText || selectedText.trim().length === 0) {
          new Notice('A seleção está vazia. Selecione algum texto primeiro!');
          return;
        }
    
        console.log('🎯 Criando marcação:', {
          selectedText: selectedText.substring(0, 50),
          selection,
          fileId: view.file?.path
        });
    
        const marker = this.model.createMarker(editor, view);
        if (marker && marker.fileId) {
          // ✅ IMPORTANTE: Aguardar um frame antes de atualizar as marcações
          setTimeout(() => {
            this.model.updateMarkersForFile(marker.fileId);
            new Notice(`Marcação criada! Texto: "${selectedText.length > 50 ? selectedText.substring(0, 50) + '...' : selectedText}"`);
          }, 100);
        } else {
          new Notice('Não foi possível criar a marcação.');
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
    
    // 🔍 NOVO: Comando para debug de instâncias
    this.addCommand({
      id: 'debug-code-marker-instances',
      name: '[DEBUG] Listar instâncias ativas do CodeMarker',
      callback: () => {
        this.model.debugListActiveInstances();
        new Notice('Veja o console para detalhes das instâncias ativas.');
      }
    });
    
    // 🔥 ARQUITETURA SEPARADA: Registrar StateField + ViewPlugin
    this.registerEditorExtension([
      createMarkerStateField(this.model),  // ← Decorações e estado
      createMarkerViewPlugin(this.model)   // ← Eventos e identificação
    ]);
    
    console.log('✅ Extensões do editor registradas (StateField + ViewPlugin)');
    
    // 🔍 MELHORADO: Registrar eventos para sincronização entre instâncias
    
    // Evento quando um arquivo é aberto
    this.registerEvent(
      this.app.workspace.on('file-open', (file) => {
        if (file) {
          console.log('📂 Arquivo aberto:', file.path);
          // Delay para garantir que o editor esteja pronto
          setTimeout(() => {
            this.model.updateMarkersForFile(file.path);
          }, 150);
        }
      })
    );
    
    // Evento quando o layout muda (troca de aba, split, etc)
    this.registerEvent(
      this.app.workspace.on('layout-change', () => {
        console.log('📐 Layout mudou');
        // Pequeno delay e então atualizar todas as views ativas
        setTimeout(() => {
          const leaves = this.app.workspace.getLeavesOfType('markdown');
          for (const leaf of leaves) {
            const view = leaf.view;
            if (view instanceof MarkdownView && view.file) {
              this.model.updateMarkersForFile(view.file.path);
            }
          }
        }, 100);
      })
    );
    
    // Evento quando a view ativa muda
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', (leaf) => {
        const view = leaf?.view;
        if (view instanceof MarkdownView && view.file) {
          console.log('🍃 Folha ativa mudou:', view.file.path);
          // Delay para garantir que o editor esteja completamente carregado
          setTimeout(() => {
            this.model.updateMarkersForFile(view.file.path);
          }, 200);
        }
      })
    );
    
    // Adicionar a tab de configurações
    this.addSettingTab(new CodeMarkerSettingTab(this.app, this));

    console.log('✅ CodeMarker: Plugin carregado');
    
    // 🔍 MELHORADO: Aplicar marcações iniciais para TODOS os arquivos abertos
    setTimeout(() => {
      console.log('🚀 Aplicando marcações iniciais...');
      const leaves = this.app.workspace.getLeavesOfType('markdown');
      
      const uniqueFiles = new Set<string>();
      for (const leaf of leaves) {
        const view = leaf.view;
        if (view instanceof MarkdownView && view.file) {
          uniqueFiles.add(view.file.path);
        }
      }
      
      console.log(`📚 Arquivos únicos encontrados: ${uniqueFiles.size}`);
      for (const filePath of uniqueFiles) {
        console.log(`🔄 Aplicando marcações para: ${filePath}`);
        this.model.updateMarkersForFile(filePath);
      }
    }, 500);
  }

  onunload() {
    console.log('🗑️ Descarregando plugin CodeMarker');
    // O CodeMirror automaticamente limpa as extensões registradas
    // Não precisamos limpar manualmente as marcações
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    console.log('⚙️ Configurações carregadas:', this.settings);
  }

  async saveSettings() {
    await this.saveData(this.settings);
    console.log('💾 Configurações salvas');
    
    // 🔍 NOVO: Ao salvar configurações, atualizar todas as instâncias
    setTimeout(() => {
      const leaves = this.app.workspace.getLeavesOfType('markdown');
      const uniqueFiles = new Set<string>();
      
      for (const leaf of leaves) {
        const view = leaf.view;
        if (view instanceof MarkdownView && view.file) {
          uniqueFiles.add(view.file.path);
        }
      }
      
      for (const filePath of uniqueFiles) {
        this.model.updateMarkersForFile(filePath);
      }
    }, 100);
  }
}
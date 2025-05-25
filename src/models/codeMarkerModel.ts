import { Editor, MarkdownView } from 'obsidian';
import CodeMarkerPlugin from '../../main';
import { CodeMarkerSettings } from './settings';

export interface Marker {
  id: string;
  fileId: string;
  range: {
    from: { line: number; ch: number; };
    to: { line: number; ch: number; };
  };
  color: string;
  code: string;
  createdAt: number;
  updatedAt: number;
}

export class CodeMarkerModel {
  private markers: Map<string, Marker[]> = new Map();
  plugin: CodeMarkerPlugin;
  
  constructor(plugin: CodeMarkerPlugin) {
    this.plugin = plugin;
  }
  
  async loadMarkers() {
    const data = await this.plugin.loadData();
    if (data && data.markers) {
      // Carregar marcações do armazenamento
      for (const fileId in data.markers) {
        this.markers.set(fileId, data.markers[fileId]);
      }
      
      // 🔍 MELHORADO: Atualizar visualização para TODOS os arquivos abertos
      const leaves = this.plugin.app.workspace.getLeavesOfType('markdown');
      for (const leaf of leaves) {
        const view = leaf.view;
        if (view instanceof MarkdownView && view.file) {
          this.updateMarkersForFile(view.file.path);
        }
      }
    }
  }
  
  createMarker(editor: Editor, view: MarkdownView): Marker | null {
    if (!view.file) return null;
    
    // ✅ API Obsidian para seleção inicial
    const selectedText = editor.getSelection();
    if (!selectedText?.trim()) return null;
  
    // ✅ API Obsidian para posições
    const anchor = editor.getCursor('anchor');
    const head = editor.getCursor('head');
  
    // Normalizar ordem
    const from = this.isPositionBefore(anchor, head) ? anchor : head;
    const to = this.isPositionBefore(anchor, head) ? head : anchor;
  
    const marker: Marker = {
      id: this.generateId(),
      fileId: view.file.path,
      range: { from, to },
      color: this.plugin.settings.defaultColor,
      code: '',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    this.addMarkerToFile(view.file.path, marker);
    this.saveMarkers();
    
    return marker;
  }
  
  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  }
  
  private addMarkerToFile(fileId: string, marker: Marker) {
    if (!this.markers.has(fileId)) {
      this.markers.set(fileId, []);
    }
    
    const fileMarkers = this.markers.get(fileId);
    if (fileMarkers) {
      fileMarkers.push(marker);
    }
  }
  
  saveMarkers() {
    const data: Record<string, Marker[]> = {};
    
    this.markers.forEach((markers, fileId) => {
      data[fileId] = markers;
    });
    
    this.plugin.saveData({ markers: data });
  }
  
  // 🔍 MELHORADO: Converter posição usando view específica
  posToOffset(pos: {line: number, ch: number}, fileId?: string): number | null {
    try {
      const view = fileId ? this.getViewForFile(fileId) : this.getActiveView();
      if (!view?.editor) return null;
      
      // @ts-ignore - Acessando propriedades internas do editor
      return view.editor.posToOffset(pos);
    } catch (e) {
      console.error("CodeMarker: Erro ao converter posição para offset", e);
      return null;
    }
  }
  
  // 🔍 MELHORADO: Converter offset usando view específica
  offsetToPos(offset: number, fileId?: string): {line: number, ch: number} | null {
    try {
      const view = fileId ? this.getViewForFile(fileId) : this.getActiveView();
      if (!view?.editor) return null;
      
      // @ts-ignore - Acessando propriedades internas do editor
      return view.editor.offsetToPos(offset);
    } catch (e) {
      console.error("CodeMarker: Erro ao converter offset para posição", e);
      return null;
    }
  }
  
  // 🔍 MELHORADO: Atualizar marcadores para arquivo específico em todas as suas instâncias
  updateMarkersForFile(fileId: string) {
    console.log('🔄 updateMarkersForFile chamado para:', fileId);
    
    // Atualizar TODAS as instâncias do arquivo (pode haver splits/panes múltiplos)
    const leaves = this.plugin.app.workspace.getLeavesOfType('markdown');
    let updatedCount = 0;
    
    for (const leaf of leaves) {
      const view = leaf.view;
      if (view instanceof MarkdownView && view.file?.path === fileId) {
        // @ts-ignore - Acessando a instância interna do editor
        const editorView = view.editor?.cm;
        
        if (editorView && this.plugin.updateFileMarkersEffect) {
          console.log(`📝 Atualizando marcações para view do arquivo: ${fileId}`);
          // Usando o StateEffect corretamente
          editorView.dispatch({
            effects: this.plugin.updateFileMarkersEffect.of({ fileId })
          });
          updatedCount++;
        }
      }
    }
    
    console.log(`✅ Atualizadas ${updatedCount} views para o arquivo ${fileId}`);
  }

  getMarkerById(markerId: string): Marker | null {
    for (const [, markers] of this.markers.entries()) {
      const marker = markers.find(m => m.id === markerId);
      if (marker) {
        return marker;
      }
    }
    return null;
  }
  
  // Obter todos os marcadores de um arquivo específico
  getMarkersForFile(fileId: string): Marker[] {
    return this.markers.get(fileId) || [];
  }

  updateMarker(marker: Marker) {
    if (!marker) return;
    
    const fileMarkers = this.markers.get(marker.fileId);
    if (!fileMarkers) return;
    
    const index = fileMarkers.findIndex(m => m.id === marker.id);
    if (index >= 0) {
      fileMarkers[index] = marker;
      this.saveMarkers();
    }
  }
  
  // Remover um marcador específico
  removeMarker(markerId: string) {
    for (const [fileId, markers] of this.markers.entries()) {
      const index = markers.findIndex(m => m.id === markerId);
      if (index >= 0) {
        markers.splice(index, 1);
        this.saveMarkers();
        this.updateMarkersForFile(fileId);
        return true;
      }
    }
    return false;
  }

  // 🔍 MANTIDO: Obter view ativa (para compatibilidade)
  getActiveView(): MarkdownView | null {
    return this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
  }

  // 🔍 NOVO: Obter view específica para um arquivo
  getViewForFile(fileId: string): MarkdownView | null {
    const leaves = this.plugin.app.workspace.getLeavesOfType('markdown');
    
    for (const leaf of leaves) {
      const view = leaf.view;
      if (view instanceof MarkdownView && view.file?.path === fileId) {
        return view;
      }
    }
    
    return null;
  }

  // 🔍 NOVO: Obter todas as views para um arquivo (para casos de split/panes múltiplos)
  getAllViewsForFile(fileId: string): MarkdownView[] {
    const leaves = this.plugin.app.workspace.getLeavesOfType('markdown');
    const views: MarkdownView[] = [];
    
    for (const leaf of leaves) {
      const view = leaf.view;
      if (view instanceof MarkdownView && view.file?.path === fileId) {
        views.push(view);
      }
    }
    
    return views;
  }

  // Esses métodos de verificação de posição são úteis e serão mantidos
  isPositionBefore(pos1: {line: number, ch: number}, pos2: {line: number, ch: number}): boolean {
    if (pos1.line < pos2.line) return true;
    if (pos1.line > pos2.line) return false;
    return pos1.ch <= pos2.ch;
  }

  isPositionAfter(pos1: {line: number, ch: number}, pos2: {line: number, ch: number}): boolean {
    if (pos1.line > pos2.line) return true;
    if (pos1.line < pos2.line) return false;
    return pos1.ch >= pos2.ch;
  }

  clearAllMarkers() {
    this.markers.clear();
    this.plugin.saveData({ markers: {} });

    // 🔍 MELHORADO: Atualizar visualização de TODOS os arquivos abertos
    const leaves = this.plugin.app.workspace.getLeavesOfType('markdown');
    for (const leaf of leaves) {
      const view = leaf.view;
      if (view instanceof MarkdownView && view.file) {
        this.updateMarkersForFile(view.file.path);
      }
    }
  }

  getSettings(): CodeMarkerSettings {
    return this.plugin.settings;
  }
  
  // 🔍 NOVO: Método para debug - listar todas as instâncias ativas
  debugListActiveInstances(): void {
    const leaves = this.plugin.app.workspace.getLeavesOfType('markdown');
    
    console.log('🔍 DEBUG: Instâncias ativas do CodeMarker:');
    for (let i = 0; i < leaves.length; i++) {
      const leaf = leaves[i];
      const view = leaf.view;
      if (view instanceof MarkdownView) {
        console.log(`  ${i + 1}. Arquivo: ${view.file?.path || 'Sem arquivo'}`);
        console.log(`     View: `, view);
        // @ts-ignore
        console.log(`     Editor: `, view.editor?.cm);
      }
    }
  }
}
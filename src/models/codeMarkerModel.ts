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
  private plugin: CodeMarkerPlugin;
  
  // Remova esses efeitos daqui, pois agora estarão em markerStateField.ts
  // private addMarkerEffect = StateEffect.define<Marker>();
  // private removeMarkerEffect = StateEffect.define<string>();
  // private updateMarkersEffect = StateEffect.define<Marker[]>();

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
      
      // Atualizar visualização para o arquivo atual
      const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
      if (activeView && activeView.file) {
        this.updateMarkersForFile(activeView.file.path);
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
  
  // Este método será substituído pela implementação em markerStateField.ts
  // Então vamos removê-lo 
  // getEditorExtension() { ... }
  
  // Este método provavelmente não será mais necessário
  // createDecorationFromMarker(marker: Marker) { ... }
  
  // Converter posição de linha/coluna para offset no documento
  // Este método continuará sendo útil
  posToOffset(pos: {line: number, ch: number}): number | null {
    try {
      const view = this.getActiveView();
      if (!view?.editor) return null;
      
      // @ts-ignore - Acessando propriedades internas do editor
      return view.editor.posToOffset(pos);
    } catch (e) {
      console.error("CodeMarker: Erro ao converter posição para offset", e);
      return null;
    }
  }
  
  // Converter offset para posição {line, ch}
  offsetToPos(offset: number): {line: number, ch: number} | null {
    try {
      const view = this.getActiveView();
      if (!view?.editor) return null;
      
      // @ts-ignore - Acessando propriedades internas do editor
      return view.editor.offsetToPos(offset);
    } catch (e) {
      console.error("CodeMarker: Erro ao converter offset para posição", e);
      return null;
    }
  }
  
  // Este método será adaptado para usar o novo sistema
updateMarkersForFile(fileId: string) {
    const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
    
    if (!view || !view.file || view.file.path !== fileId) return;
    
    // @ts-ignore - Acessando a instância interna do editor
    const editorView = view.editor.cm;
    
    if (editorView && this.plugin.updateFileMarkersEffect) {
      // Usando o StateEffect corretamente
      editorView.dispatch({
        effects: this.plugin.updateFileMarkersEffect.of({ fileId })
      });
    }
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
  
  // Adicione este método para obter todos os marcadores de um arquivo
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
  
  // Adicione este método para remover um marcador
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

  getActiveView(): MarkdownView | null {
    return this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
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

    const view = this.getActiveView();
    if (!view?.file) return;

    // Atualizar a visualização do arquivo atual
    this.updateMarkersForFile(view.file.path);
  }

  getSettings(): CodeMarkerSettings {
    return this.plugin.settings;
  }
  
  // recalculateAllMarkers() {
  //   const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
  //   if (!view?.file) return;
  //   this.updateMarkersForFile(view.file.path);
  // }
}
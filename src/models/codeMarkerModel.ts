import { Editor, MarkdownView } from 'obsidian';
import { EditorView, Decoration, DecorationSet } from "@codemirror/view";
import { StateField, StateEffect, RangeSetBuilder } from "@codemirror/state";
import CodeMarkerPlugin from '../../main';

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
  
  // Efeitos para os marcadores
  private addMarkerEffect = StateEffect.define<Marker>();
  private removeMarkerEffect = StateEffect.define<string>();
  private updateMarkersEffect = StateEffect.define<Marker[]>();

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
    
    const selection = editor.listSelections()[0];
    if (!selection) return null;
    
    const anchor = selection.anchor;
    const head = selection.head;

    // Normaliza a ordem para garantir que `from` sempre venha antes de `to`
    const from = this.isPositionBefore(anchor, head) ? anchor : head;
    const to = this.isPositionBefore(anchor, head) ? head : anchor;

    const marker: Marker = {
      id: this.generateId(),
      fileId: view.file.path,
      range: {
        from,
        to
      },
      color: this.plugin.settings.defaultColor,
      code: '',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    // Adicionar o marcador à coleção
    this.addMarkerToFile(view.file.path, marker);
    
    // Salvar os marcadores
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
  
  // Criação da extensão do editor para marcações visuais
  getEditorExtension() {
    return StateField.define<DecorationSet>({
      create: () => Decoration.none,
      
      update: (decorations, transaction) => {
        // Aplicar alterações no editor às decorações existentes
        decorations = decorations.map(transaction.changes);
        
        // Processar efeitos
        for (const effect of transaction.effects) {
          if (effect.is(this.addMarkerEffect)) {
            // Adicionar nova marcação
            const marker = effect.value;
            const decoration = this.createDecorationFromMarker(marker);
            if (decoration) {
              decorations = decorations.update({
                add: [decoration]
              });
            }
          } 
          else if (effect.is(this.removeMarkerEffect)) {
            // Remover marcação por ID
            const markerId = effect.value;
            decorations = decorations.update({
              filter: (from, to, value) => {
                return value.spec.attributes?.["data-marker-id"] !== markerId;
              }
            });
          }
          else if (effect.is(this.updateMarkersEffect)) {
            // Atualizar todas as marcações para um arquivo
            const markers = effect.value;
            
            // Criar um novo conjunto de decorações
            const builder = new RangeSetBuilder<Decoration>();
            
            for (const marker of markers) {
              const decoration = this.createDecorationFromMarker(marker);
              if (decoration) {
                builder.add(decoration.from, decoration.to, decoration.value);
              }
            }
            
            decorations = builder.finish();
          }
        }
        
        return decorations;
      },
      
      provide: (field) => EditorView.decorations.from(field)
    });
  }
  
  // Criar decoração a partir de um marcador
 private createDecorationFromMarker(marker: Marker) {
  try {
    const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || !view.editor) return null;
    
    const from = this.posToOffset(view.editor, marker.range.from);
    const to = this.posToOffset(view.editor, marker.range.to);
    
    if (from === null || to === null) return null;
    
    // Converter o hexadecimal para rgba com 60% de opacidade
    let bgColor = 'rgba(255, 255, 0, 0.4)'; // Cor padrão amarelo marca-texto
    
    if (marker.color && marker.color.startsWith('#')) {
      const r = parseInt(marker.color.slice(1, 3), 16);
      const g = parseInt(marker.color.slice(3, 5), 16);
      const b = parseInt(marker.color.slice(5, 7), 16);
      bgColor = `rgba(${r}, ${g}, ${b}, 0.4)`;
    }
    
    // Criar decoração como marca-texto
    const decoration = Decoration.mark({
      class: "codemarker-highlight",
      attributes: {
        "data-marker-id": marker.id,
        "style": `background-color: ${bgColor};`
      }
    }).range(from, to);
    
    return decoration;
  } catch (e) {
    console.error("CodeMarker: Erro ao criar decoração", e);
    return null;
  }
}
  
  // Converter posição de linha/coluna para offset no documento
  private posToOffset(editor: Editor, pos: {line: number, ch: number}): number | null {
    try {
      // @ts-ignore - Acessando propriedades internas do editor
      return editor.posToOffset(pos);
    } catch (e) {
      console.error("CodeMarker: Erro ao converter posição", e);
      return null;
    }
  }
  
  // Aplicar decoração visual para um marcador
  applyMarkerDecoration(marker: Marker, view: MarkdownView) {
    if (!view.editor) return;
    
    // @ts-ignore - Acessando a instância interna do editor
    const editorView = view.editor.cm;
    
    if (editorView) {
      // Despachar o efeito para adicionar a decoração
      editorView.dispatch({
        effects: this.addMarkerEffect.of(marker)
      });
    }
  }
  
  // Atualizar marcações para um arquivo específico
  updateMarkersForFile(fileId: string) {
    const fileMarkers = this.markers.get(fileId) || [];
    const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
    
    if (!view || !view.file || view.file.path !== fileId) return;
    
    // @ts-ignore - Acessando a instância interna do editor
    const editorView = view.editor.cm;
    
    if (editorView) {
      // Despachar efeito para atualizar todas as marcações
      editorView.dispatch({
        effects: this.updateMarkersEffect.of(fileMarkers)
      });
    }
  }












// Adicione ao final da classe CodeMarkerModel

getMarkerById(markerId: string): Marker | null {
  for (const [, markers] of this.markers.entries()) {
    const marker = markers.find(m => m.id === markerId);
    if (marker) {
      return marker;
    }
  }
  return null;
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

getActiveView(): MarkdownView | null {
  return this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
}

getPositionAtCoords(editor: Editor, x: number, y: number): {line: number, ch: number} | null {
  try {
    // @ts-ignore - Acessando propriedades internas do editor
    const pos = editor.posAtCoords({left: x, top: y});
    if (pos) {
      // @ts-ignore - Convertendo posição interna para o formato {line, ch}
      return editor.offsetToPos(pos);
    }
    return null;
  } catch (e) {
    console.error("Erro ao obter posição nas coordenadas", e);
    return null;
  }
}

getEditorCoords(editor: Editor, pos: {line: number, ch: number}): {x: number, y: number} | null {
  try {
    console.log("CodeMarker: Obtendo coordenadas para posição", pos);
    
    // @ts-ignore - Convertendo posição para offset
    const offset = editor.posToOffset(pos);
    console.log("CodeMarker: Offset calculado", offset);
    
    // Verificar se temos um offset válido
    if (offset === undefined || offset === null) {
      console.error("CodeMarker: Offset inválido para posição", pos);
      return null;
    }
    
    // @ts-ignore - Acessando a instância CM6 do editor
    const cmEditor = editor.cm;
    if (!cmEditor) {
      console.error("CodeMarker: Editor CM não encontrado");
      return null;
    }
    
    // @ts-ignore - Obtendo coordenadas no offset
    const coords = cmEditor.coordsAtPos(offset);
    console.log("CodeMarker: Coordenadas retornadas", coords);
    
    if (!coords) {
      console.error("CodeMarker: Coordenadas não encontradas");
      return null;
    }
    
    return {
      x: coords.left,
      y: coords.top
    };
  } catch (e) {
    console.error("CodeMarker: Erro ao obter coordenadas na posição", e);
    return null;
  }
}

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

  // Adicione ao codeMarkerModel.ts
  posAtMouse(editor: Editor, clientX: number, clientY: number): {line: number, ch: number} | null {
    try {
      // @ts-ignore - Acessando propriedades internas do editor
      return editor.posAtMouse({x: clientX, y: clientY});
    } catch (e) {
      console.error("CodeMarker: Erro ao obter posição no ponto do mouse", e);
      return null;
    }
  }
  
}
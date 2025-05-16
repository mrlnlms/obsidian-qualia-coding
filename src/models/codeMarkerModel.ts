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
    
    const marker: Marker = {
      id: this.generateId(),
      fileId: view.file.path,
      range: {
        from: selection.anchor,
        to: selection.head
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
      const from = this.posToOffset(marker.range.from);
      const to = this.posToOffset(marker.range.to);
      
      // Verificar se a faixa é válida
      if (from === null || to === null) {
        console.error("CodeMarker: Offset inválido para posições", marker.range);
        return null;
      }
      
      // Verificar se a faixa tem tamanho (from != to)
      if (from === to) {
        console.error("CodeMarker: Decoração vazia", {from, to});
        return null;
      }
      
      // Garantir que from < to
      const actualFrom = Math.min(from, to);
      const actualTo = Math.max(from, to);
      
      // Criar a decoração
      const decoration = Decoration.mark({
        class: "codemarker-highlight",
        attributes: {
          "data-marker-id": marker.id,
          "style": `background-color: ${marker.color}; opacity: 0.3;`
        }
      }).range(actualFrom, actualTo);
      
      return decoration;
    } catch (e) {
      console.error("CodeMarker: Erro ao criar decoração", e);
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
  
    // Correção aqui: usar getActiveView em vez de getActiveViewOfType
    const view = this.getActiveView();
    
    if (!view || !view.file || view.file.path !== fileId) return;
    
    // @ts-ignore - Acessando a instância interna do editor
    const editorView = view.editor.cm;
    
    if (editorView) {
      try {
        // Ordenar as marcações por posição inicial
        const sortedMarkers = [...fileMarkers].sort((a, b) => {
          if (a.range.from.line !== b.range.from.line) {
            return a.range.from.line - b.range.from.line;
          }
          return a.range.from.ch - b.range.from.ch;
        });
        
        // Validar cada marcação
        const validMarkers = sortedMarkers.filter(marker => {
          // Verificar se as posições são válidas
          const isValidPos = 
            typeof marker.range.from.line === 'number' && 
            typeof marker.range.from.ch === 'number' &&
            typeof marker.range.to.line === 'number' && 
            typeof marker.range.to.ch === 'number';
            
          // Verificar se a faixa não é vazia
          const isNonEmpty = 
            (marker.range.from.line < marker.range.to.line) || 
            (marker.range.from.line === marker.range.to.line && 
             marker.range.from.ch < marker.range.to.ch);
             
          return isValidPos && isNonEmpty;
        });
        
        console.log("CodeMarker: Atualizando marcações", {
          original: fileMarkers.length,
          sorted: sortedMarkers.length,
          valid: validMarkers.length
        });
        
        // Só atualizar se houver marcações válidas
        if (validMarkers.length > 0) {
          // Despachar efeito para atualizar todas as marcações
          editorView.dispatch({
            effects: this.updateMarkersEffect.of(validMarkers)
          });
        }
      } catch (e) {
        console.error("CodeMarker: Erro ao atualizar marcações", e);
      }
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

              updateMarker(updatedMarker: Marker) {
                for (const [fileId, markers] of this.markers.entries()) {
                  const index = markers.findIndex(m => m.id === updatedMarker.id);
                  if (index >= 0) {
                    // Substituir a marcação no array
                    markers[index] = updatedMarker;
                    
                    // Atualizar a visualização
                    this.updateMarkersForFile(fileId);
                    
                    // Salvar as alterações
                    this.saveMarkers();
                    
                    console.log("CodeMarker: Marcação atualizada", updatedMarker);
                    return true;
                  }
                }
                
                return false;
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
                  // @ts-ignore - Convertendo posição para offset
                  const offset = editor.posToOffset(pos);
                  // @ts-ignore - Obtendo coordenadas no offset
                  const coords = editor.coordsAtPos(offset);
                  
                  if (coords) {
                    return {
                      x: coords.left,
                      y: coords.top
                    };
                  }
                  return null;
                } catch (e) {
                  console.error("Erro ao obter coordenadas na posição", e);
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


              // No CodeMarkerModel
posAtMouse(editor: Editor, clientX: number, clientY: number): {line: number, ch: number} | null {
  try {
    console.log("CodeMarker: Tentando obter posição em", clientX, clientY);
    
    // Método 1: Tentar usar editor.posAtMouse (API interna)
    try {
      // @ts-ignore
      if (editor.posAtMouse) {
        // @ts-ignore
        const pos = editor.posAtMouse({clientX, clientY});
        if (pos) {
          console.log("CodeMarker: Posição via editor.posAtMouse", pos);
          return pos;
        }
      }
    } catch (e) {
      console.log("CodeMarker: Falha em editor.posAtMouse", e);
    }
    
    // Método 2: Aproximação baseada no editor ativo
    const view = this.getActiveView();
    if (view) {
      // Obter o número total de linhas
      const lineCount = editor.lineCount();
      
      // Estimar a linha com base na posição vertical
      const editorEl = view.containerEl.querySelector('.cm-content, .CodeMirror');
      if (editorEl) {
        const rect = editorEl.getBoundingClientRect();
        
        // Calcular a posição relativa no editor
        const relY = (clientY - rect.top) / rect.height;
        
        // Estimar a linha
        const lineIndex = Math.floor(relY * lineCount);
        const clampedLine = Math.max(0, Math.min(lineCount - 1, lineIndex));
        
        // Obter o texto da linha estimada
        const lineText = editor.getLine(clampedLine) || '';
        
        // Estimar a coluna com base na posição horizontal
        const relX = (clientX - rect.left) / rect.width;
        const colIndex = Math.floor(relX * lineText.length);
        const clampedCol = Math.max(0, Math.min(lineText.length, colIndex));
        
        const estimatedPos = {
          line: clampedLine,
          ch: clampedCol
        };
        
        console.log("CodeMarker: Posição estimada", estimatedPos);
        return estimatedPos;
      }
    }
    
    // Não podemos mais usar activeMarker ou dragType aqui
    return null;
  } catch (e) {
    console.error("CodeMarker: Erro ao obter posição no mouse", e);
    return null;
  }
}



              // Adicione ao codeMarkerModel.ts
// Adicione estes métodos ao CodeMarkerModel
removeMarker(markerId: string) {
  for (const [, markers] of this.markers.entries()) {
    const index = markers.findIndex(m => m.id === markerId);
    if (index >= 0) {
      markers.splice(index, 1);
      this.saveMarkers();
      return true;
    }
  }
  return false;
}

addMarker(marker: Marker) {
  if (!this.markers.has(marker.fileId)) {
    this.markers.set(marker.fileId, []);
  }
  
  const fileMarkers = this.markers.get(marker.fileId);
  if (fileMarkers) {
    fileMarkers.push(marker);
    this.saveMarkers();
    this.updateMarkersForFile(marker.fileId);
    return true;
  }
  return false;
}
// Adicione este método ao CodeMarkerModel
// No CodeMarkerModel
updateSimpleMarker(updatedMarker: Marker) {
  try {
    console.log("CodeMarker: updateSimpleMarker", updatedMarker);
    
    // Verificações de validação
    const isValidFrom = 
      typeof updatedMarker.range.from.line === 'number' && 
      typeof updatedMarker.range.from.ch === 'number';
      
    const isValidTo = 
      typeof updatedMarker.range.to.line === 'number' && 
      typeof updatedMarker.range.to.ch === 'number';
      
    // Verificar se a faixa não é vazia (from deve vir antes de to)
    const isNonEmpty = 
      (updatedMarker.range.from.line < updatedMarker.range.to.line) || 
      (updatedMarker.range.from.line === updatedMarker.range.to.line && 
       updatedMarker.range.from.ch < updatedMarker.range.to.ch);
    
    if (!isValidFrom || !isValidTo || !isNonEmpty) {
      console.error("CodeMarker: Marcação inválida", {
        marker: updatedMarker,
        isValidFrom,
        isValidTo,
        isNonEmpty
      });
      return false;
    }
    
    // Encontrar a marcação pelo ID
    for (const [fileId, markers] of this.markers.entries()) {
      const index = markers.findIndex(m => m.id === updatedMarker.id);
      if (index >= 0) {
        // Substituir a marcação
        markers[index] = updatedMarker;
        
        // Salvar alterações
        this.saveMarkers();
        
        // Forçar uma recarga da visualização com atraso
        setTimeout(() => {
          console.log("CodeMarker: Forçando atualização da visualização");
          if (fileId) {
            this.updateMarkersForFile(fileId);
          }
        }, 100);
        
        return true;
      }
    }
    return false;
  } catch (e) {
    console.error("CodeMarker: Erro ao atualizar marcação", e);
    return false;
  }
}

  posToOffset(pos: {line: number, ch: number}): number | null {
  try {
    const view = this.getActiveView();
    if (!view || !view.editor) return null;
    
    // @ts-ignore - Acessando API interna
    return view.editor.posToOffset(pos);
  } catch (e) {
    console.error("CodeMarker: Erro ao converter posição para offset", e);
    return null;
  }
}
// Adicione ao codeMarkerModel.ts
private sortMarkers(markers: Marker[]): Marker[] {
  return [...markers].sort((a, b) => {
    // Primeiro, comparar a linha inicial
    if (a.range.from.line !== b.range.from.line) {
      return a.range.from.line - b.range.from.line;
    }
    
    // Se as linhas forem iguais, comparar a coluna inicial
    if (a.range.from.ch !== b.range.from.ch) {
      return a.range.from.ch - b.range.from.ch;
    }
    
    // Se os inícios forem iguais, comparar as linhas finais
    if (a.range.to.line !== b.range.to.line) {
      return a.range.to.line - b.range.to.line;
    }
    
    // Por fim, comparar as colunas finais
    return a.range.to.ch - b.range.to.ch;
  });
}

}









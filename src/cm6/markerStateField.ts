import { StateField, EditorState, StateEffect } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";  // Correto: RangeSetBuilder está em @codemirror/state
import { HandleWidget, startDragEffect, updateDragEffect, endDragEffect } from "./handleWidget";
import { CodeMarkerModel } from "../models/codeMarkerModel";

// Efeito para atualizar todas as marcações de um arquivo
export const updateFileMarkersEffect = StateEffect.define<{fileId: string}>();

// StateField para gerenciar as decorações de marcação e alças
export const createMarkerStateField = (model: CodeMarkerModel) => {
  return StateField.define<DecorationSet>({
    create() {
      return Decoration.none;
    },
    
    update(decorations, tr) {
      // Mapear decorações através de mudanças no documento
      decorations = decorations.map(tr.changes);
      
      // Processar efeitos de estado
      for (const effect of tr.effects) {
        if (effect.is(startDragEffect)) {
          // Iniciar arraste: não faz nada especial, apenas prepara o estado
          // No future podemos adicionar classes visuais específicas durante o arraste
        } 
        else if (effect.is(updateDragEffect)) {
          const { markerId, pos, type } = effect.value;
          const marker = model.getMarkerById(markerId);
          
          if (marker) {
            try {
              // Converter posição de offset para formato {line, ch}
              const view = model.getActiveView();
              if (!view?.editor) continue;
              
              // @ts-ignore
              const posObj = view.editor.offsetToPos(pos);
              
              // Atualizar a posição de início ou fim do marcador
              if (type === 'start') {
                // Não permitir que start ultrapasse end
                if (model.isPositionBefore(posObj, marker.range.to)) {
                  marker.range.from = posObj;
                }
              } else {
                // Não permitir que end fique antes de start
                if (model.isPositionAfter(posObj, marker.range.from)) {
                  marker.range.to = posObj;
                }
              }
              
              // Reconstruir as decorações com o marcador atualizado
              decorations = buildDecorationsForFile(tr.state, model, marker.fileId);
            } catch (e) {
              console.error("CodeMarker: Erro ao atualizar marcador durante arraste", e);
            }
          }
        }
        else if (effect.is(endDragEffect)) {
          const { markerId } = effect.value;
          const marker = model.getMarkerById(markerId);
          
          if (marker) {
            // Atualizar timestamp
            marker.updatedAt = Date.now();
            
            // Salvar alteração no modelo
            model.updateMarker(marker);
            
            // Não precisamos reconstruir as decorações aqui, pois já foram
            // atualizadas durante o arraste via updateDragEffect
          }
        }
        else if (effect.is(updateFileMarkersEffect)) {
          const fileId = effect.value.fileId;
          // Reconstruir todas as decorações para o arquivo
          decorations = buildDecorationsForFile(tr.state, model, fileId);
        }
      }
      
      return decorations;
    },
    
    provide: field => EditorView.decorations.from(field)
  });
};

// Função auxiliar para construir decorações para um arquivo
function buildDecorationsForFile(state: EditorState, model: CodeMarkerModel, fileId: string): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  
  if (!fileId) return Decoration.none;
  
  const markers = model.getMarkersForFile(fileId);
  
  // Primeiro, coletar todas as decorações que precisamos adicionar
  const allDecorations: Array<{from: number, to: number, decoration: Decoration}> = [];
  
  for (const marker of markers) {
    try {
      const view = model.getActiveView();
      if (!view?.editor) continue;
      
      // Converter posições para offsets
      // @ts-ignore
      const startOffset = view.editor.posToOffset(marker.range.from);
      // @ts-ignore
      const endOffset = view.editor.posToOffset(marker.range.to);
      
      if (startOffset === null || endOffset === null || 
          startOffset === undefined || endOffset === undefined) {
        continue;
      }
      
      // Validar que startOffset <= endOffset
      const from = Math.min(startOffset, endOffset);
      const to = Math.max(startOffset, endOffset);
      
      // Definir cor
      let bgColor = 'rgba(255, 255, 0, 0.4)'; // padrão amarelo
      let handleColor = '#6200EE'; // roxo padrão
      
      if (marker.color && marker.color.startsWith('#')) {
        const r = parseInt(marker.color.slice(1, 3), 16);
        const g = parseInt(marker.color.slice(3, 5), 16);
        const b = parseInt(marker.color.slice(5, 7), 16);
        bgColor = `rgba(${r}, ${g}, ${b}, 0.4)`;
        handleColor = marker.color;
      }
      
      // Mark decoration para o texto destacado
      const highlightDecoration = Decoration.mark({
        class: "codemarker-highlight",
        attributes: {
          'data-marker-id': marker.id,
          'style': `background-color: ${bgColor}; padding: 3px 0;`
        }
      });
      
      // Adicionar o highlight para o texto
      allDecorations.push({
        from,
        to,
        decoration: highlightDecoration
      });
      
      // Widget para alça de início (ao lado esquerdo do texto destacado)
      const startHandle = Decoration.widget({
        widget: new HandleWidget(marker, 'start', handleColor),
        side: -1,    // Posiciona antes do caractere
        block: false // Não interrompe o fluxo do texto
      });
      
      allDecorations.push({
        from,
        to: from,
        decoration: startHandle
      });
      
      // Widget para alça de fim (ao lado direito do texto destacado)
      const endHandle = Decoration.widget({
        widget: new HandleWidget(marker, 'end', handleColor),
        side: 1,     // Posiciona depois do caractere
        block: false // Não interrompe o fluxo do texto
      });
      
      allDecorations.push({
        from: to,
        to: to,
        decoration: endHandle
      });
    } catch (e) {
      console.error("CodeMarker: Erro ao criar decorações para marcador", marker.id, e);
    }
  }
  
  // Agora ordene todas as decorações pela posição 'from'
  allDecorations.sort((a, b) => {
    // Primeiro, compare as posições 'from'
    if (a.from !== b.from) return a.from - b.from;
    
    // Se as posições 'from' forem iguais, compare as posições 'to'
    if (a.to !== b.to) return a.to - b.to;
    
    // Se both from e to forem iguais, priorize widgets com side -1, depois marcações normais, depois widgets com side 1
    const aIsMark = a.from !== a.to; // É uma marcação (não um widget)
    const bIsMark = b.from !== b.to; // É uma marcação (não um widget)
    
    if (aIsMark && !bIsMark) return 1; // Marcações vêm depois de widgets com side -1
    if (!aIsMark && bIsMark) return -1; // Widgets vêm antes de marcações
    
    // Se ambos são widgets ou ambos são marcações, preserve a ordem original para estabilidade
    return 0;
  });
  
  // Finalmente, adicione as decorações ordenadas ao builder
  for (const deco of allDecorations) {
    builder.add(deco.from, deco.to, deco.decoration);
  }
  
  return builder.finish();
}
import { StateField, EditorState, StateEffect } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
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
        } 
        else if (effect.is(updateDragEffect)) {
          const { markerId, pos, type } = effect.value;
          const marker = model.getMarkerById(markerId);
          
          if (marker) {
            try {
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

// Adicionar a função de cálculo do padding fora do buildDecorationsForFile
function calculatePaddingRatio(fontSize: number, lineHeight: number): number {
  // Valor base para fonte tamanho 16
  // Aumentar = marcação mais alta
  // Diminuir = marcação mais fina
  const baseRatio = 0.1875;

  // Cálculo do espaçamento ideal entre linhas
  const idealSpacing = fontSize * 1.2;
  const actualSpacing = lineHeight;

  // Ajuste baseado no espaçamento
  // Aumentar 0.1 = mais sensível ao espaçamento entre linhas
  // Diminuir 0.1 = menos sensível ao espaçamento entre linhas
  //const spacingAdjustment = (actualSpacing / idealSpacing - 1) * 0.001; // 0.001 = Excelente para font 30
  const spacingAdjustment = (actualSpacing / idealSpacing - 1) * 0.001; // 0.001 = Excelente para font 30

  // Ajuste baseado no tamanho da fonte
  // Aumentar 0.005 = ajuste mais agressivo quando muda o tamanho da fonte
  // Diminuir 0.005 = ajuste mais suave quando muda o tamanho da fonte
  //const fontSizeAdjustment = (fontSize - 16) * 0.001; // 0.001 = Excelente para font 30
  const fontSizeAdjustment = (fontSize - 16) * 0.001; // 0.001 = Excelente para font 30

  // Valor mínimo que o ratio pode ter
  // Aumentar 0.05 = marcação nunca fica muito fina
  // Diminuir 0.05 = permite marcação mais fina
  return Math.max(baseRatio - fontSizeAdjustment - spacingAdjustment, 0.05);
}

function buildDecorationsForFile(state: EditorState, model: CodeMarkerModel, fileId: string): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  
  if (!fileId) return Decoration.none;
  
  const markers = model.getMarkersForFile(fileId);
  const settings = model.getSettings();
  
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
      
      // Calcular padding baseado no tamanho da fonte e na configuração de espessura
      // @ts-ignore - Acessar o elemento DOM do CodeMirror
      const editorElement = view.editor.cm.dom;
      const computedStyle = window.getComputedStyle(editorElement);
      const currentFontSize = parseFloat(computedStyle.fontSize);
      const lineHeight = parseFloat(computedStyle.lineHeight) || currentFontSize * 1.2;
      
      // Calcular o padding usando a nova função
      const paddingRatio = calculatePaddingRatio(currentFontSize, lineHeight);
      const paddingValue = Math.max(currentFontSize * paddingRatio, 1);
      
      // Definir cor
      let bgColor = 'rgba(98, 0, 238, 0.4)'; // padrão roxo
      let handleColor = '#6200EE'; // roxo padrão
      
      if (marker.color && marker.color.startsWith('#')) {
        const r = parseInt(marker.color.slice(1, 3), 16);
        const g = parseInt(marker.color.slice(3, 5), 16);
        const b = parseInt(marker.color.slice(5, 7), 16);
        bgColor = `rgba(${r}, ${g}, ${b}, ${settings.markerOpacity})`;
        handleColor = marker.color;
      }
      
      // Mark decoration para o texto destacado
      const highlightDecoration = Decoration.mark({
        class: `codemarker-highlight ${settings.showHandlesOnHover ? 'handles-hover-mode' : ''}`,
        attributes: {
          'data-marker-id': marker.id,
          'style': `background-color: ${bgColor}; padding: ${paddingValue}px 0;`
        }
      });
      
      // Adicionar o highlight para o texto
      allDecorations.push({
        from,
        to,
        decoration: highlightDecoration
      });
      
      // Widget para alça de início
      const startHandle = Decoration.widget({
        widget: new HandleWidget(marker, 'start', handleColor, settings),
        side: -1,
        block: false
      });
      
      allDecorations.push({
        from,
        to: from,
        decoration: startHandle
      });
      
      // Widget para alça de fim
      const endHandle = Decoration.widget({
        widget: new HandleWidget(marker, 'end', handleColor, settings),
        side: 1,
        block: false
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
  
  // Ordenar todas as decorações pela posição 'from'
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
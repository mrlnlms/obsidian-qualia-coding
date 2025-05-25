import { StateField, EditorState, StateEffect } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import { HandleWidget, startDragEffect, updateDragEffect, endDragEffect, setHoverEffect } from "./handleWidget";
import { CodeMarkerModel } from "../models/codeMarkerModel";

// Efeito para atualizar todas as marcações de um arquivo
export const updateFileMarkersEffect = StateEffect.define<{fileId: string}>();

// 🔍 Interface para o estado do campo - adicionar fileId
interface MarkerFieldState {
  decorations: DecorationSet;
  hoveredMarkerId: string | null;
  fileId: string | null; // 🔍 NOVO: Rastrear o arquivo deste StateField
}

// StateField para gerenciar as decorações de marcação e alças
export const createMarkerStateField = (model: CodeMarkerModel) => {
  console.log('🏗️ StateField criado! ID único:', Math.random());
  
  return StateField.define<MarkerFieldState>({
    create(): MarkerFieldState {
      return {
        decorations: Decoration.none,
        hoveredMarkerId: null,
        fileId: null // 🔍 NOVO
      };
    },
    
    update(state, tr): MarkerFieldState {
      // Mapear decorações através de mudanças no documento
      let decorations = state.decorations.map(tr.changes);
      let hoveredMarkerId = state.hoveredMarkerId;
      let needsRebuild = false;
      
      // Processar efeitos de estado
      for (const effect of tr.effects) {
        if (effect.is(setHoverEffect)) {
          // 🔍 NOVO: Atualizar estado de hover
          hoveredMarkerId = effect.value.markerId;
          needsRebuild = true;
          console.log('🔍 StateField processando hover:', {
            markerId: hoveredMarkerId,
            fileId: '???', // Precisamos identificar qual arquivo é este StateField
            stateId: Math.random() // Para ver se é o mesmo state ou diferente
          });
        }
        else if (effect.is(startDragEffect)) {
          // 🔍 IMPORTANTE: Ao iniciar arraste, definir o marcador como "hovered"
          const { markerId } = effect.value;
          hoveredMarkerId = markerId;
          needsRebuild = true;
          console.log('🎯 Iniciando arraste, marcador em hover:', markerId);
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
              
              // 🔍 IMPORTANTE: Durante o arraste, manter o markerId como "hovered"
              // para que suas alças permaneçam visíveis
              hoveredMarkerId = markerId;
              needsRebuild = true;
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
          // Reconstruir todas as decorações para o arquivo
          needsRebuild = true;
        }
      }
      
      // Se precisar reconstruir, fazer isso
      if (needsRebuild) {
        // 🔍 PROBLEMA: Não podemos usar getActiveView() aqui!
        // Precisamos saber QUAL arquivo este StateField pertence
        
        // Tentativa de identificar o arquivo correto através do estado
        const currentDoc = tr.state.doc.toString();
        const firstLine = currentDoc.split('\n')[0];
        console.log('🔍 StateField rebuild - primeira linha do doc:', firstLine.substring(0, 50));
        
        // Por enquanto, vamos usar o fileId do último efeito ou o arquivo ativo
        let fileIdToUse = '';
        
        // Tentar pegar o fileId do último updateFileMarkersEffect
        for (const effect of tr.effects) {
          if (effect.is(updateFileMarkersEffect)) {
            fileIdToUse = effect.value.fileId;
            break;
          }
        }
        
        if (!fileIdToUse) {
          const view = model.getActiveView();
          fileIdToUse = view?.file?.path || '';
        }
        
        console.log('🎯 Rebuilding para arquivo:', fileIdToUse);
        decorations = buildDecorationsForFile(tr.state, model, fileIdToUse, hoveredMarkerId);
      }
      
      return {
        fileId: state.fileId,
        decorations,
        hoveredMarkerId
      };
    },
    
    provide: field => EditorView.decorations.from(field, state => state.decorations)
  });
};

// Adicionar a função de cálculo do padding fora do buildDecorationsForFile
function calculatePaddingRatio(fontSize: number, lineHeight: number): number {
  const baseRatio = 0.1875;
  const idealSpacing = fontSize * 1.2;
  const actualSpacing = lineHeight;
  const spacingAdjustment = (actualSpacing / idealSpacing - 1) * 0.001;
  const fontSizeAdjustment = (fontSize - 16) * 0.001;
  return Math.max(baseRatio - fontSizeAdjustment - spacingAdjustment, 0.05);
}

function buildDecorationsForFile(
  state: EditorState, 
  model: CodeMarkerModel, 
  fileId: string,
  hoveredMarkerId: string | null = null // 🔍 NOVO parâmetro
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  
  if (!fileId) return Decoration.none;
  
  const markers = model.getMarkersForFile(fileId);
  const settings = model.getSettings();
  
  // 🔍 IMPORTANTE: Verificar qual arquivo está sendo processado
  const activeView = model.getActiveView();
  const currentFileInView = activeView?.file?.path;
  
  console.log('🔨 Building decorations:', {
    fileId,
    currentFileInView,
    fileMatch: fileId === currentFileInView,
    markersCount: markers.length,
    hoveredMarkerId,
    showHandlesOnHover: settings.showHandlesOnHover
  });
  
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
        class: 'codemarker-highlight',
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
      
      // 🔍 NOVO: Determinar se este marcador está com hover
      const isHovered = marker.id === hoveredMarkerId;
      
      // Widget para alça de início
      const startHandle = Decoration.widget({
        widget: new HandleWidget(marker, 'start', handleColor, settings, isHovered),
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
        widget: new HandleWidget(marker, 'end', handleColor, settings, isHovered),
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
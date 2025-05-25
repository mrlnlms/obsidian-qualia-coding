import { StateField, EditorState, StateEffect } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import { HandleWidget } from "./handleWidget";
import { CodeMarkerModel } from "../models/codeMarkerModel";
import { MarkdownView } from "obsidian";

// 🔥 ARQUITETURA CODEMIRROR CORRETA: STATEFIELD + VIEWPLUGIN
export const setFileIdEffect = StateEffect.define<{fileId: string}>();
export const setHoverEffect = StateEffect.define<{markerId: string | null}>();
export const startDragEffect = StateEffect.define<{markerId: string, type: 'start' | 'end'}>();
export const updateDragEffect = StateEffect.define<{markerId: string, pos: number, type: 'start' | 'end'}>();
export const endDragEffect = StateEffect.define<{markerId: string}>();
export const updateFileMarkersEffect = StateEffect.define<{fileId: string}>();

// Interface para o estado do campo
interface MarkerFieldState {
  decorations: DecorationSet;
  hoveredMarkerId: string | null;
  fileId: string | null;
  instanceId: string;
}

// 🔥 STATEFIELD SEGUINDO PADRÕES CODEMIRROR 6
export const createMarkerStateField = (model: CodeMarkerModel) => {
  const instanceId = Math.random().toString(36).substr(2, 9);
  
  console.log(`🏗️ [StateField ${instanceId}] Criado seguindo padrões CM6`);
  
  return StateField.define<MarkerFieldState>({
    create(): MarkerFieldState {
      console.log(`🎯 [StateField ${instanceId}] create() - estado inicial`);
      return {
        decorations: Decoration.none,
        hoveredMarkerId: null,
        fileId: null,
        instanceId
      };
    },
    
    update(state: MarkerFieldState, tr): MarkerFieldState {
      console.log(`🔄 [StateField ${state.instanceId}] update() - ${tr.effects.length} efeitos`);
      
      // Mapear decorações através de mudanças no documento (PADRÃO CM6)
      let decorations = state.decorations.map(tr.changes);
      let hoveredMarkerId = state.hoveredMarkerId;
      let fileId = state.fileId;
      let needsRebuild = false;
      
      // Processar efeitos de comunicação
      for (const effect of tr.effects) {
        if (effect.is(setFileIdEffect)) {
          const { fileId: newFileId } = effect.value;
          console.log(`📁 [StateField ${state.instanceId}] setFileIdEffect: ${newFileId}`);
          
          if (newFileId !== fileId) {
            fileId = newFileId;
            needsRebuild = true;
            console.log(`🎯 [StateField ${state.instanceId}] Arquivo definido: ${fileId}`);
          }
        }
        else if (effect.is(setHoverEffect)) {
          const { markerId } = effect.value;
          console.log(`🖱️ [StateField ${state.instanceId}] setHoverEffect: ${markerId}`);
          
          // Validar se marcador pertence a este arquivo
          if (markerId) {
            const marker = model.getMarkerById(markerId);
            if (!marker || marker.fileId !== fileId) {
              console.log(`🚫 [StateField ${state.instanceId}] Ignorando hover de outro arquivo`);
              continue;
            }
          }
          
          if (markerId !== hoveredMarkerId) {
            hoveredMarkerId = markerId;
            needsRebuild = true;
            console.log(`🔍 [StateField ${state.instanceId}] Hover atualizado: ${markerId}`);
          }
        }
        else if (effect.is(updateFileMarkersEffect)) {
          const { fileId: effectFileId } = effect.value;
          console.log(`📋 [StateField ${state.instanceId}] updateFileMarkersEffect: ${effectFileId}`);
          
          if (effectFileId === fileId) {
            needsRebuild = true;
            console.log(`🔄 [StateField ${state.instanceId}] Rebuild solicitado`);
          }
        }
        // Efeitos de drag podem ser adicionados aqui conforme necessário
      }
      
      // Reconstruir decorações se necessário
      if (needsRebuild && fileId) {
        console.log(`🔨 [StateField ${state.instanceId}] Rebuilding decorações para: ${fileId}`);
        decorations = buildDecorationsForFile(tr.state, model, fileId, hoveredMarkerId);
        console.log(`✅ [StateField ${state.instanceId}] Decorações rebuilds: ${decorations.size}`);
      }
      
      return {
        fileId,
        decorations,
        hoveredMarkerId,
        instanceId: state.instanceId
      };
    },
    
    // PADRÃO CM6: Fornecer decorações via facet
    provide: field => {
      console.log(`🎨 [StateField] Provide configurado`);
      return EditorView.decorations.from(field, state => {
        console.log(`🎨 [StateField ${state.instanceId}] Fornecendo ${state.decorations.size} decorações`);
        return state.decorations;
      });
    }
  });
};

// Função para obter view específica para um arquivo
function getViewForFile(fileId: string, model: CodeMarkerModel): MarkdownView | null {
  console.log(`🔍 getViewForFile: ${fileId}`);
  const app = model.plugin.app;
  const leaves = app.workspace.getLeavesOfType('markdown');
  
  for (const leaf of leaves) {
    const view = leaf.view;
    if (view instanceof MarkdownView && view.file?.path === fileId) {
      console.log(`✅ View encontrada para: ${fileId}`);
      return view;
    }
  }
  
  console.warn(`❌ Nenhuma view encontrada para: ${fileId}`);
  return null;
}

// Função de cálculo do padding
function calculatePaddingRatio(fontSize: number, lineHeight: number): number {
  const baseRatio = 0.1875;
  const idealSpacing = fontSize * 1.2;
  const actualSpacing = lineHeight;
  const spacingAdjustment = (actualSpacing / idealSpacing - 1) * 0.001;
  const fontSizeAdjustment = (fontSize - 16) * 0.001;
  return Math.max(baseRatio - fontSizeAdjustment - spacingAdjustment, 0.05);
}

// 🔥 FUNÇÃO DE BUILD SEGUINDO PADRÕES CM6
function buildDecorationsForFile(
  state: EditorState, 
  model: CodeMarkerModel, 
  fileId: string,
  hoveredMarkerId: string | null = null
): DecorationSet {
  console.log(`🔨 buildDecorationsForFile: ${fileId}`);
  
  const builder = new RangeSetBuilder<Decoration>();
  
  if (!fileId) {
    console.warn(`❌ buildDecorationsForFile sem fileId`);
    return Decoration.none;
  }
  
  const markers = model.getMarkersForFile(fileId);
  const settings = model.getSettings();
  
  console.log(`📊 buildDecorationsForFile:`, {
    fileId,
    markersCount: markers.length,
    hoveredMarkerId,
    showHandlesOnHover: settings.showHandlesOnHover
  });
  
  if (markers.length === 0) {
    console.log(`📭 Nenhum marcador para: ${fileId}`);
    return Decoration.none;
  }
  
  // Usar view específica do arquivo correto
  const targetView = getViewForFile(fileId, model);
  if (!targetView?.editor) {
    console.warn(`❌ Não foi possível encontrar view para: ${fileId}`);
    return Decoration.none;
  }
  
  console.log(`✅ View encontrada, processando ${markers.length} marcadores`);
  
  const allDecorations: Array<{from: number, to: number, decoration: Decoration}> = [];
  
  for (let i = 0; i < markers.length; i++) {
    const marker = markers[i];
    console.log(`🏷️ Processando marcador ${i + 1}/${markers.length}: ${marker.id}`);
    
    try {
      // Converter posições para offsets
      // @ts-ignore
      const startOffset = targetView.editor.posToOffset(marker.range.from);
      // @ts-ignore
      const endOffset = targetView.editor.posToOffset(marker.range.to);
      
      if (startOffset === null || endOffset === null || 
          startOffset === undefined || endOffset === undefined) {
        console.warn(`❌ Não foi possível converter posições para: ${marker.id}`);
        continue;
      }
      
      const from = Math.min(startOffset, endOffset);
      const to = Math.max(startOffset, endOffset);
      
      console.log(`✅ Marcador ${marker.id} offsets: ${from} → ${to}`);
      
      // Calcular padding baseado no tamanho da fonte
      // @ts-ignore
      const editorElement = targetView.editor.cm.dom;
      const computedStyle = window.getComputedStyle(editorElement);
      const currentFontSize = parseFloat(computedStyle.fontSize);
      const lineHeight = parseFloat(computedStyle.lineHeight) || currentFontSize * 1.2;
      
      const paddingRatio = calculatePaddingRatio(currentFontSize, lineHeight);
      const paddingValue = Math.max(currentFontSize * paddingRatio, 1);
      
      // Definir cor
      let bgColor = 'rgba(98, 0, 238, 0.4)';
      let handleColor = '#6200EE';
      
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
      
      allDecorations.push({ from, to, decoration: highlightDecoration });
      console.log(`✅ Highlight criado para: ${marker.id}`);
      
      // 🔥 LÓGICA CORRIGIDA: Determinar se mostrar alças
      const isHovered = marker.id === hoveredMarkerId;
      const shouldShowHandles = !settings.showHandlesOnHover || isHovered;
      
      console.log(`🖱️ Marcador ${marker.id} alças:`, {
        isHovered,
        showHandlesOnHover: settings.showHandlesOnHover,
        shouldShowHandles
      });
      
      if (shouldShowHandles) {
        // Widget para alça de início
        const startHandle = Decoration.widget({
          widget: new HandleWidget(marker, 'start', handleColor, settings, isHovered),
          side: -1,
          block: false
        });
        
        allDecorations.push({ from, to: from, decoration: startHandle });
        
        // Widget para alça de fim
        const endHandle = Decoration.widget({
          widget: new HandleWidget(marker, 'end', handleColor, settings, isHovered),
          side: 1,
          block: false
        });
        
        allDecorations.push({ from: to, to: to, decoration: endHandle });
        
        console.log(`✅ Alças criadas para: ${marker.id}`);
      }
      
    } catch (e) {
      console.error(`❌ Erro ao criar decorações para: ${marker.id}`, e);
    }
  }
  
  console.log(`📊 Total de decorações criadas: ${allDecorations.length}`);
  
  // Ordenar decorações (PADRÃO CM6)
  allDecorations.sort((a, b) => {
    if (a.from !== b.from) return a.from - b.from;
    if (a.to !== b.to) return a.to - b.to;
    
    const aIsMark = a.from !== a.to;
    const bIsMark = b.from !== b.to;
    
    if (aIsMark && !bIsMark) return 1;
    if (!aIsMark && bIsMark) return -1;
    
    return 0;
  });
  
  // Adicionar ao builder (PADRÃO CM6)
  for (const deco of allDecorations) {
    builder.add(deco.from, deco.to, deco.decoration);
  }
  
  const result = builder.finish();
  console.log(`✅ buildDecorationsForFile finalizada: ${result.size} decorações`);
  return result;
}
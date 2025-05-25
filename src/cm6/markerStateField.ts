import { StateField, EditorState, StateEffect } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import { HandleWidget } from "./handleWidget";
import { CodeMarkerModel } from "../models/codeMarkerModel";
import { MarkdownView } from "obsidian";

// 🔥 EFEITOS PARA COMUNICAÇÃO ENTRE VIEWPLUGIN E STATEFIELD
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

// Interface para marcadores processados com detecção de sobreposição
interface ProcessedMarker {
  marker: any;
  from: number;
  to: number;
  index: number;
  overlaps: number[];
  zIndexBase: number;
}

// 🔥 STATEFIELD COM DETECÇÃO DEFINITIVA DE SOBREPOSIÇÕES
export const createMarkerStateField = (model: CodeMarkerModel) => {
  const instanceId = Math.random().toString(36).substr(2, 9);
  
  console.log(`🏗️ [DEBUG] StateField criado! Instance ID: ${instanceId}`);
  
  return StateField.define<MarkerFieldState>({
    create(): MarkerFieldState {
      console.log(`🎯 [DEBUG] StateField ${instanceId} create() chamado`);
      return {
        decorations: Decoration.none,
        hoveredMarkerId: null,
        fileId: null,
        instanceId
      };
    },
    
    update(state: MarkerFieldState, tr): MarkerFieldState {
      console.log(`🔄 [DEBUG] StateField ${state.instanceId} update() chamado com ${tr.effects.length} efeitos`);
      
      // Mapear decorações através de mudanças no documento
      let decorations = state.decorations.map(tr.changes);
      let hoveredMarkerId = state.hoveredMarkerId;
      let fileId = state.fileId;
      let needsRebuild = false;
      
      // 🔥 LOG DETALHADO DOS EFEITOS RECEBIDOS
      if (tr.effects.length > 0) {
        console.log(`📋 [DEBUG] StateField ${state.instanceId} efeitos recebidos:`, 
          tr.effects.map(e => {
            if (e.is(setFileIdEffect)) return `setFileIdEffect: ${e.value.fileId}`;
            if (e.is(setHoverEffect)) return `setHoverEffect: ${e.value.markerId}`;
            if (e.is(updateFileMarkersEffect)) return `updateFileMarkersEffect: ${e.value.fileId}`;
            return 'outro efeito';
          })
        );
      }
      
      // 🔥 PROCESSAR EFEITOS DO VIEWPLUGIN
      for (const effect of tr.effects) {
        if (effect.is(setFileIdEffect)) {
          // ViewPlugin informa qual arquivo este StateField deve processar
          const { fileId: newFileId } = effect.value;
          console.log(`📁 [DEBUG] StateField ${state.instanceId} RECEBENDO setFileIdEffect:`, {
            newFileId,
            currentFileId: fileId,
            willChange: newFileId !== fileId
          });
          
          if (newFileId !== fileId) {
            fileId = newFileId;
            needsRebuild = true;
            console.log(`🎯 [DEBUG] StateField ${state.instanceId} ARQUIVO ATUALIZADO: ${fileId} - REBUILD NECESSÁRIO`);
          } else {
            console.log(`⚡ [DEBUG] StateField ${state.instanceId} arquivo já era o mesmo: ${fileId}`);
          }
        }
        else if (effect.is(setHoverEffect)) {
          // ViewPlugin informa mudança de hover
          const { markerId } = effect.value;
          console.log(`🖱️ [DEBUG] StateField ${state.instanceId} RECEBENDO setHoverEffect:`, {
            markerId,
            currentHover: hoveredMarkerId,
            currentFileId: fileId
          });
          
          if (markerId) {
            const marker = model.getMarkerById(markerId);
            if (!marker || marker.fileId !== fileId) {
              console.log(`🚫 [DEBUG] StateField ${state.instanceId} ignorando hover de outro arquivo:`, {
                markerId,
                markerFileId: marker?.fileId,
                thisFileId: fileId
              });
              continue; // Ignorar hover de marcador de outro arquivo
            }
          }
          
          if (markerId !== hoveredMarkerId) {
            hoveredMarkerId = markerId;
            needsRebuild = true;
            console.log(`🔍 [DEBUG] StateField ${state.instanceId} HOVER ATUALIZADO: ${markerId} - REBUILD NECESSÁRIO`);
          }
        }
        else if (effect.is(updateFileMarkersEffect)) {
          // Model solicita rebuild das marcações
          const { fileId: effectFileId } = effect.value;
          console.log(`📋 [DEBUG] StateField ${state.instanceId} RECEBENDO updateFileMarkersEffect:`, {
            effectFileId,
            currentFileId: fileId,
            matches: effectFileId === fileId
          });
          
          if (effectFileId === fileId) {
            needsRebuild = true;
            console.log(`🔄 [DEBUG] StateField ${state.instanceId} REBUILD SOLICITADO para arquivo: ${effectFileId} - REBUILD NECESSÁRIO`);
          } else {
            console.log(`🚫 [DEBUG] StateField ${state.instanceId} ignorando rebuild para outro arquivo:`, {
              effectFileId,
              thisFileId: fileId
            });
          }
        }
        // Outros efeitos (drag) omitidos para simplificar o debug inicial
      }
      
      // 🔥 LÓGICA DE REBUILD MELHORADA
      if (needsRebuild) {
        if (fileId) {
          console.log(`🔨 [DEBUG] StateField ${state.instanceId} INICIANDO REBUILD para arquivo: ${fileId}`);
          const newDecorations = buildDecorationsWithOverlapDetection(tr.state, model, fileId, hoveredMarkerId);
          console.log(`✅ [DEBUG] StateField ${state.instanceId} REBUILD COMPLETO. Decorações criadas: ${newDecorations.size}`);
          decorations = newDecorations;
        } else {
          console.warn(`⚠️ [DEBUG] StateField ${state.instanceId} REBUILD NECESSÁRIO mas SEM ARQUIVO! Limpando decorações.`);
          decorations = Decoration.none;
        }
      } else {
        console.log(`⏸️ [DEBUG] StateField ${state.instanceId} sem rebuild necessário`);
      }
      
      const finalState = {
        fileId,
        decorations,
        hoveredMarkerId,
        instanceId: state.instanceId
      };
      
      console.log(`🎯 [DEBUG] StateField ${state.instanceId} RETORNANDO ESTADO:`, {
        fileId: finalState.fileId,
        decorationsCount: finalState.decorations.size,
        hoveredMarkerId: finalState.hoveredMarkerId,
        instanceId: finalState.instanceId
      });
      
      return finalState;
    },
    
    provide: field => {
      console.log(`🎨 [DEBUG] StateField provide() configurado`);
      return EditorView.decorations.from(field, state => {
        console.log(`🎨 [DEBUG] StateField ${state.instanceId} FORNECENDO ${state.decorations.size} decorações`);
        return state.decorations;
      });
    }
  });
};

// Função para obter view específica para um arquivo
function getViewForFile(fileId: string, model: CodeMarkerModel): MarkdownView | null {
  console.log(`🔍 [DEBUG] getViewForFile chamado para: ${fileId}`);
  const app = model.plugin.app;
  const leaves = app.workspace.getLeavesOfType('markdown');
  
  console.log(`📄 [DEBUG] Total de leaves markdown: ${leaves.length}`);
  
  for (const leaf of leaves) {
    const view = leaf.view;
    if (view instanceof MarkdownView && view.file?.path === fileId) {
      console.log(`✅ [DEBUG] View encontrada para arquivo: ${fileId}`);
      return view;
    }
  }
  
  console.warn(`❌ [DEBUG] Nenhuma view encontrada para arquivo: ${fileId}`);
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

// 🔥 FUNÇÃO PRINCIPAL COM DETECÇÃO DEFINITIVA DE SOBREPOSIÇÕES
function buildDecorationsWithOverlapDetection(
  state: EditorState, 
  model: CodeMarkerModel, 
  fileId: string,
  hoveredMarkerId: string | null = null
): DecorationSet {
  console.log(`🔨 [DEBUG] buildDecorationsWithOverlapDetection INICIADA para: ${fileId}`);
  
  const builder = new RangeSetBuilder<Decoration>();
  
  if (!fileId) {
    console.warn(`❌ [DEBUG] buildDecorationsWithOverlapDetection chamado sem fileId`);
    return Decoration.none;
  }
  
  const markers = model.getMarkersForFile(fileId);
  const settings = model.getSettings();
  
  console.log(`📊 [DEBUG] buildDecorationsWithOverlapDetection dados:`, {
    fileId,
    markersCount: markers.length,
    hoveredMarkerId,
    showHandlesOnHover: settings.showHandlesOnHover
  });
  
  if (markers.length === 0) {
    console.log(`📭 [DEBUG] Nenhum marcador encontrado para arquivo: ${fileId}`);
    return Decoration.none;
  }
  
  // Usar a view específica do arquivo correto
  const targetView = getViewForFile(fileId, model);
  if (!targetView?.editor) {
    console.warn(`❌ [DEBUG] Não foi possível encontrar view para arquivo ${fileId} durante build`);
    return Decoration.none;
  }
  
  console.log(`✅ [DEBUG] View encontrada, processando ${markers.length} marcadores...`);
  
  // 🔥 ETAPA 1: PROCESSAR TODOS OS MARCADORES E CONVERTER POSIÇÕES
  const processedMarkers: ProcessedMarker[] = [];
  
  for (let i = 0; i < markers.length; i++) {
    const marker = markers[i];
    console.log(`🏷️ [DEBUG] Processando marcador ${i + 1}/${markers.length}: ${marker.id}`);
    
    try {
      // Converter posições para offsets
      // @ts-ignore
      const startOffset = targetView.editor.posToOffset(marker.range.from);
      // @ts-ignore
      const endOffset = targetView.editor.posToOffset(marker.range.to);
      
      console.log(`📍 [DEBUG] Marcador ${marker.id} posições:`, {
        from: marker.range.from,
        to: marker.range.to,
        startOffset,
        endOffset
      });
      
      if (startOffset === null || endOffset === null || 
          startOffset === undefined || endOffset === undefined) {
        console.warn(`❌ [DEBUG] Não foi possível converter posições para marcador ${marker.id}`);
        continue;
      }
      
      // Validar que startOffset <= endOffset
      const from = Math.min(startOffset, endOffset);
      const to = Math.max(startOffset, endOffset);
      
      console.log(`✅ [DEBUG] Marcador ${marker.id} offsets válidos: ${from} → ${to}`);
      
      processedMarkers.push({
        marker,
        from,
        to,
        index: i,
        overlaps: [],
        zIndexBase: 1000 + i // Base z-index
      });
      
    } catch (e) {
      console.error(`❌ [DEBUG] Erro ao processar marcador ${marker.id}:`, e);
    }
  }
  
  console.log(`📊 [DEBUG] Marcadores processados com sucesso: ${processedMarkers.length}`);
  
  // 🔥 ETAPA 2: DETECTAR TODAS AS SOBREPOSIÇÕES
  for (let i = 0; i < processedMarkers.length; i++) {
    for (let j = i + 1; j < processedMarkers.length; j++) {
      const markerA = processedMarkers[i];
      const markerB = processedMarkers[j];
      
      // Verificar se há sobreposição: A e B se sobrepõem se A.start < B.end AND B.start < A.end
      const hasOverlap = (markerA.from < markerB.to && markerB.from < markerA.to);
      
      if (hasOverlap) {
        markerA.overlaps.push(j);
        markerB.overlaps.push(i);
        
        console.log(`🔄 [DEBUG] SOBREPOSIÇÃO DETECTADA entre ${markerA.marker.id} (${markerA.from}-${markerA.to}) e ${markerB.marker.id} (${markerB.from}-${markerB.to})`);
      }
    }
  }
  
  // 🔥 ETAPA 3: CALCULAR Z-INDEX DINÂMICO BASEADO EM SOBREPOSIÇÕES
  for (const processed of processedMarkers) {
    // 🔥 Z-index simplificado: apenas baseado na posição
    processed.zIndexBase = 1000 + processed.index;
    
    console.log(`🎚️ [DEBUG] Marcador ${processed.marker.id} z-index calculado: ${processed.zIndexBase} (${processed.overlaps.length} sobreposições)`);
  }
  
  // 🔥 ETAPA 4: CRIAR DECORAÇÕES COM Z-INDEX OTIMIZADO
  const allDecorations: Array<{from: number, to: number, decoration: Decoration, zIndex: number}> = [];
  
  for (const processed of processedMarkers) {
    const { marker, from, to, overlaps, zIndexBase } = processed;
    
    // Calcular padding baseado no tamanho da fonte
    // @ts-ignore - Acessar o elemento DOM do CodeMirror
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
    
    console.log(`🎨 [DEBUG] Marcador ${marker.id} estilo:`, {
      bgColor,
      handleColor,
      paddingValue,
      overlaps: overlaps.length,
      zIndexBase
    });
    
    // 🔥 Mark decoration com z-index dinâmico
    const highlightZIndex = zIndexBase;
    const highlightDecoration = Decoration.mark({
      class: 'codemarker-highlight',
      attributes: {
        'data-marker-id': marker.id,
        'style': `background-color: ${bgColor}; padding: ${paddingValue}px 0; z-index: ${highlightZIndex}; position: relative;`
      }
    });
    
    // Adicionar o highlight
    allDecorations.push({
      from,
      to,
      decoration: highlightDecoration,
      zIndex: highlightZIndex
    });
    
    console.log(`✅ [DEBUG] Highlight criado para ${marker.id} com z-index: ${highlightZIndex}`);
    
    // Determinar se este marcador está com hover
    const isHovered = marker.id === hoveredMarkerId;
    
    // 🔥 LÓGICA SIMPLES: Mostrar alças se hover OU sempre mostrar (COMO ERA ANTES)
    const shouldShowHandles = !settings.showHandlesOnHover || isHovered;
    
    console.log(`🖱️ [DEBUG] Marcador ${marker.id} alças:`, {
      isHovered,
      showHandlesOnHover: settings.showHandlesOnHover,
      shouldShowHandles
    });
    
    if (shouldShowHandles) {
      // 🔥 Z-index para alças: SEMPRE mais alto que highlights
      const handleZIndex = zIndexBase + 10000;
      
      // Widget para alça de início
      const startHandle = Decoration.widget({
        widget: new HandleWidget(marker, 'start', handleColor, settings, isHovered, handleZIndex),
        side: -1,
        block: false
      });
      
      allDecorations.push({
        from,
        to: from,
        decoration: startHandle,
        zIndex: handleZIndex
      });
      
      // Widget para alça de fim
      const endHandle = Decoration.widget({
        widget: new HandleWidget(marker, 'end', handleColor, settings, isHovered, handleZIndex),
        side: 1,
        block: false
      });
      
      allDecorations.push({
        from: to,
        to: to,
        decoration: endHandle,
        zIndex: handleZIndex
      });
      
      console.log(`✅ [DEBUG] Alças criadas para ${marker.id} com z-index: ${handleZIndex}`);
    }
  }
  
  console.log(`📊 [DEBUG] Total de decorações criadas: ${allDecorations.length}`);
  
  // 🔥 ETAPA 5: ORDENAR DECORAÇÕES POR POSIÇÃO E Z-INDEX
  allDecorations.sort((a, b) => {
    // Primeiro por posição
    if (a.from !== b.from) return a.from - b.from;
    if (a.to !== b.to) return a.to - b.to;
    
    // Depois por z-index (menor primeiro para que maior fique por cima)
    return a.zIndex - b.zIndex;
  });
  
  // 🔥 ETAPA 6: ADICIONAR DECORAÇÕES AO BUILDER
  for (const deco of allDecorations) {
    builder.add(deco.from, deco.to, deco.decoration);
  }
  
  const result = builder.finish();
  console.log(`✅ [DEBUG] buildDecorationsWithOverlapDetection FINALIZADA. DecorationSet criado com ${result.size} itens`);
  return result;
}
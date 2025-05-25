import { ViewPlugin, EditorView, PluginValue, ViewUpdate, Decoration, DecorationSet } from "@codemirror/view";
import { StateField, StateEffect, RangeSetBuilder } from "@codemirror/state";
import { MarkdownView } from "obsidian";
import { HandleWidget } from "./handleWidget";
import { CodeMarkerModel } from "../models/codeMarkerModel";

// 🔥 SOLUÇÃO SIMPLIFICADA: Um único ViewPlugin que gerencia tudo

// Efeitos para comunicação
export const updateFileMarkersEffect = StateEffect.define<{fileId: string}>();
export const setHoverEffect = StateEffect.define<{markerId: string | null}>();
export const startDragEffect = StateEffect.define<{markerId: string, type: 'start' | 'end'}>();
export const updateDragEffect = StateEffect.define<{markerId: string, pos: number, type: 'start' | 'end'}>();
export const endDragEffect = StateEffect.define<{markerId: string}>();

// Função para calcular padding
function calculatePaddingRatio(fontSize: number, lineHeight: number): number {
  const baseRatio = 0.1875;
  const idealSpacing = fontSize * 1.2;
  const actualSpacing = lineHeight;
  const spacingAdjustment = (actualSpacing / idealSpacing - 1) * 0.001;
  const fontSizeAdjustment = (fontSize - 16) * 0.001;
  return Math.max(baseRatio - fontSizeAdjustment - spacingAdjustment, 0.05);
}

// 🔥 ViewPlugin que gerencia TUDO (estado, decorações, eventos)
export const createMarkerViewPlugin = (model: CodeMarkerModel) => {
  return ViewPlugin.fromClass(
    class implements PluginValue {
      // Estado da instância
      public instanceId: string;
      public fileId: string | null = null;
      public decorations: DecorationSet = Decoration.none;
      
      // Estado de interação
      dragging: { markerId: string, type: 'start' | 'end' } | null = null;
      hoveredMarkerId: string | null = null;
      private lastFontSize: number;
      private cleanup: Array<() => void> = [];
      
      constructor(view: EditorView) {
        this.instanceId = Math.random().toString(36).substr(2, 9);
        this.fileId = this.identifyFileForView(view);
        this.lastFontSize = this.getCurrentFontSize(view);
        
        console.log(`🎯 CodeMarker ViewPlugin criado:`, {
          instanceId: this.instanceId,
          fileId: this.fileId
        });
        
        // Construir decorações iniciais
        this.rebuildDecorations(view);
        
        this.setupFontChangeDetection(view);
      }
      
      // Identificar arquivo desta view
      private identifyFileForView(view: EditorView): string | null {
        const app = model.plugin.app;
        const leaves = app.workspace.getLeavesOfType('markdown');
        
        for (const leaf of leaves) {
          const leafView = leaf.view;
          if (leafView instanceof MarkdownView && leafView.editor) {
            // @ts-ignore
            if (leafView.editor.cm === view) {
              return leafView.file?.path || null;
            }
          }
        }
        
        console.warn(`❌ Não foi possível identificar arquivo para instância ${this.instanceId}`);
        return null;
      }
      
      private getCurrentFontSize(view: EditorView): number {
        const computedStyle = window.getComputedStyle(view.dom);
        return parseFloat(computedStyle.fontSize);
      }
      
      // 🔥 Método principal para reconstruir decorações
      private rebuildDecorations(view: EditorView) {
        if (!this.fileId) {
          console.warn(`❌ [${this.instanceId}] Sem arquivo, não construindo decorações`);
          this.decorations = Decoration.none;
          return;
        }
        
        const markers = model.getMarkersForFile(this.fileId);
        const settings = model.getSettings();
        const builder = new RangeSetBuilder<Decoration>();
        
        console.log(`🔨 [${this.instanceId}] Construindo ${markers.length} marcações para ${this.fileId}`);
        
        // Encontrar a view correta para este arquivo
        const targetView = this.getViewForFile(this.fileId);
        if (!targetView?.editor) {
          console.warn(`❌ [${this.instanceId}] Não encontrou view para ${this.fileId}`);
          this.decorations = Decoration.none;
          return;
        }
        
        const allDecorations: Array<{from: number, to: number, decoration: Decoration}> = [];
        
        for (const marker of markers) {
          try {
            // @ts-ignore
            const startOffset = targetView.editor.posToOffset(marker.range.from);
            // @ts-ignore
            const endOffset = targetView.editor.posToOffset(marker.range.to);
            
            if (startOffset === null || endOffset === null || 
                startOffset === undefined || endOffset === undefined) {
              continue;
            }
            
            const from = Math.min(startOffset, endOffset);
            const to = Math.max(startOffset, endOffset);
            
            // Calcular estilo
            // @ts-ignore
            const editorElement = targetView.editor.cm.dom;
            const computedStyle = window.getComputedStyle(editorElement);
            const currentFontSize = parseFloat(computedStyle.fontSize);
            const lineHeight = parseFloat(computedStyle.lineHeight) || currentFontSize * 1.2;
            
            const paddingRatio = calculatePaddingRatio(currentFontSize, lineHeight);
            const paddingValue = Math.max(currentFontSize * paddingRatio, 1);
            
            let bgColor = 'rgba(98, 0, 238, 0.4)';
            let handleColor = '#6200EE';
            
            if (marker.color && marker.color.startsWith('#')) {
              const r = parseInt(marker.color.slice(1, 3), 16);
              const g = parseInt(marker.color.slice(3, 5), 16);
              const b = parseInt(marker.color.slice(5, 7), 16);
              bgColor = `rgba(${r}, ${g}, ${b}, ${settings.markerOpacity})`;
              handleColor = marker.color;
            }
            
            // Decoração de destaque
            const highlightDecoration = Decoration.mark({
              class: 'codemarker-highlight',
              attributes: {
                'data-marker-id': marker.id,
                'style': `background-color: ${bgColor}; padding: ${paddingValue}px 0;`
              }
            });
            
            allDecorations.push({ from, to, decoration: highlightDecoration });
            
            // Alças (apenas se configurado ou com hover)
            const isHovered = marker.id === this.hoveredMarkerId;
            const shouldShowHandles = !settings.showHandlesOnHover || isHovered;
            
            if (shouldShowHandles) {
              // Alça de início
              const startHandle = Decoration.widget({
                widget: new HandleWidget(marker, 'start', handleColor, settings, isHovered),
                side: -1,
                block: false
              });
              
              allDecorations.push({ from, to: from, decoration: startHandle });
              
              // Alça de fim
              const endHandle = Decoration.widget({
                widget: new HandleWidget(marker, 'end', handleColor, settings, isHovered),
                side: 1,
                block: false
              });
              
              allDecorations.push({ from: to, to: to, decoration: endHandle });
            }
            
          } catch (e) {
            console.error(`❌ [${this.instanceId}] Erro ao criar decoração para marcador ${marker.id}:`, e);
          }
        }
        
        // Ordenar e construir
        allDecorations.sort((a, b) => {
          if (a.from !== b.from) return a.from - b.from;
          if (a.to !== b.to) return a.to - b.to;
          
          const aIsMark = a.from !== a.to;
          const bIsMark = b.from !== b.to;
          
          if (aIsMark && !bIsMark) return 1;
          if (!aIsMark && bIsMark) return -1;
          
          return 0;
        });
        
        for (const deco of allDecorations) {
          builder.add(deco.from, deco.to, deco.decoration);
        }
        
        this.decorations = builder.finish();
        console.log(`✅ [${this.instanceId}] Construídas ${allDecorations.length} decorações`);
      }
      
      private getViewForFile(fileId: string): MarkdownView | null {
        const app = model.plugin.app;
        const leaves = app.workspace.getLeavesOfType('markdown');
        
        for (const leaf of leaves) {
          const view = leaf.view;
          if (view instanceof MarkdownView && view.file?.path === fileId) {
            return view;
          }
        }
        return null;
      }
      
      // 🔍 MELHORADO: Verificar marcador na posição (com prioridade para menores)
      getMarkerAtPos(view: EditorView, pos: number): string | null {
        if (!this.fileId) return null;
        
        const markers = model.getMarkersForFile(this.fileId);
        const foundMarkers: Array<{marker: any, size: number}> = [];
        
        for (const marker of markers) {
          try {
            let startOffset: number, endOffset: number;
            
            // Tentar primeiro método (mais direto)
            try {
              startOffset = view.state.doc.line(marker.range.from.line + 1).from + marker.range.from.ch;
              endOffset = view.state.doc.line(marker.range.to.line + 1).from + marker.range.to.ch;
            } catch (e) {
              // Método alternativo se o primeiro falhar
              const targetView = this.getViewForFile(this.fileId);
              if (!targetView?.editor) continue;
              
              // @ts-ignore
              startOffset = targetView.editor.posToOffset(marker.range.from);
              // @ts-ignore
              endOffset = targetView.editor.posToOffset(marker.range.to);
            }
            
            if (startOffset === null || endOffset === null || 
                startOffset === undefined || endOffset === undefined) {
              continue;
            }
            
            // Verificar se a posição está dentro desta marcação
            if (pos >= startOffset && pos <= endOffset) {
              const size = endOffset - startOffset; // Tamanho da marcação
              foundMarkers.push({ marker, size });
              
              console.log(`📍 [${this.instanceId}] Marcador ${marker.id} contém posição ${pos}:`, {
                range: `${startOffset}-${endOffset}`,
                size,
                text: marker.range
              });
            }
            
          } catch (e) {
            console.error(`❌ [${this.instanceId}] Erro ao verificar marcador ${marker.id}:`, e);
          }
        }
        
        if (foundMarkers.length === 0) {
          return null;
        }
        
        // 🔥 PRIORIDADE: Retornar a marcação MENOR (mais específica) quando há sobreposição
        foundMarkers.sort((a, b) => a.size - b.size);
        const selectedMarker = foundMarkers[0].marker;
        
        console.log(`✅ [${this.instanceId}] Marcador selecionado: ${selectedMarker.id}`, {
          totalFound: foundMarkers.length,
          sizes: foundMarkers.map(f => f.size),
          selected: `${selectedMarker.id} (tamanho: ${foundMarkers[0].size})`
        });
        
        return selectedMarker.id;
      }
      
      private setupFontChangeDetection(view: EditorView) {
        const handleZoom = (e: WheelEvent) => {
          if (e.ctrlKey || e.metaKey) {
            requestAnimationFrame(() => this.checkFontChange(view));
          }
        };

        const mutationObserver = new MutationObserver(() => {
          this.checkFontChange(view);
        });

        const resizeObserver = new ResizeObserver(() => {
          this.checkFontChange(view);
        });

        view.dom.addEventListener('wheel', handleZoom, { passive: true });
        mutationObserver.observe(document.body, { 
          attributes: true, 
          attributeFilter: ['style', 'class'] 
        });
        mutationObserver.observe(document.documentElement, { 
          attributes: true, 
          attributeFilter: ['style', 'class'] 
        });
        resizeObserver.observe(view.dom);

        this.cleanup = [
          () => view.dom.removeEventListener('wheel', handleZoom),
          () => mutationObserver.disconnect(),
          () => resizeObserver.disconnect()
        ];
      }
      
      private checkFontChange(view: EditorView) {
        const currentFontSize = this.getCurrentFontSize(view);
        
        if (Math.abs(currentFontSize - this.lastFontSize) > 0.1) {
          console.log(`🔄 [${this.instanceId}] Fonte mudou de ${this.lastFontSize}px para ${currentFontSize}px`);
          this.lastFontSize = currentFontSize;
          this.rebuildDecorations(view);
        }
      }
      
      update(update: ViewUpdate) {
        // Verificar mudanças durante updates do viewport
        if (update.geometryChanged || update.viewportChanged) {
          this.checkFontChange(update.view);
        }
        
        // Re-identificar arquivo se necessário
        if (!this.fileId) {
          this.fileId = this.identifyFileForView(update.view);
          if (this.fileId) {
            this.rebuildDecorations(update.view);
          }
        }
        
        // Processar efeitos
        let needsRebuild = false;
        
        for (const effect of update.transactions.flatMap(tr => tr.effects)) {
          if (effect.is(updateFileMarkersEffect)) {
            const { fileId } = effect.value;
            if (fileId === this.fileId) {
              needsRebuild = true;
              console.log(`🔄 [${this.instanceId}] Rebuild solicitado para ${fileId}`);
            }
          }
          else if (effect.is(setHoverEffect)) {
            const { markerId } = effect.value;
            
            // Só processar se for marcador deste arquivo
            if (markerId) {
              const marker = model.getMarkerById(markerId);
              if (!marker || marker.fileId !== this.fileId) {
                continue; // Ignorar marcador de outro arquivo
              }
            }
            
            if (this.hoveredMarkerId !== markerId) {
              this.hoveredMarkerId = markerId;
              needsRebuild = true;
              console.log(`🔍 [${this.instanceId}] Hover mudou para: ${markerId}`);
            }
          }
          else if (effect.is(startDragEffect)) {
            const { markerId } = effect.value;
            const marker = model.getMarkerById(markerId);
            
            if (marker && marker.fileId === this.fileId) {
              this.hoveredMarkerId = markerId;
              needsRebuild = true;
              console.log(`🎯 [${this.instanceId}] Iniciando arraste: ${markerId}`);
            }
          }
          else if (effect.is(updateDragEffect)) {
            const { markerId, pos, type } = effect.value;
            const marker = model.getMarkerById(markerId);
            
            if (marker && marker.fileId === this.fileId) {
              try {
                const targetView = this.getViewForFile(this.fileId);
                if (targetView?.editor) {
                  // @ts-ignore
                  const posObj = targetView.editor.offsetToPos(pos);
                  
                  if (type === 'start') {
                    if (model.isPositionBefore(posObj, marker.range.to)) {
                      marker.range.from = posObj;
                    }
                  } else {
                    if (model.isPositionAfter(posObj, marker.range.from)) {
                      marker.range.to = posObj;
                    }
                  }
                  
                  this.hoveredMarkerId = markerId;
                  needsRebuild = true;
                }
              } catch (e) {
                console.error(`❌ [${this.instanceId}] Erro durante arraste:`, e);
              }
            }
          }
          else if (effect.is(endDragEffect)) {
            const { markerId } = effect.value;
            const marker = model.getMarkerById(markerId);
            
            if (marker && marker.fileId === this.fileId) {
              marker.updatedAt = Date.now();
              model.updateMarker(marker);
              console.log(`✅ [${this.instanceId}] Arraste finalizado: ${markerId}`);
            }
          }
        }
        
        if (needsRebuild) {
          this.rebuildDecorations(update.view);
        }
      }
      
      destroy() {
        console.log(`🗑️ Destruindo instância ${this.instanceId} do arquivo ${this.fileId}`);
        this.cleanup.forEach(cleanupFn => cleanupFn());
        this.dragging = null;
        this.hoveredMarkerId = null;
        
        if (this.dragging) {
          document.body.classList.remove('codemarker-dragging');
          document.body.classList.remove('codemarker-dragging-start', 'codemarker-dragging-end');
        }
      }
    },
    {
      // 🔥 IMPORTANTE: Fornecer decorações ao editor
      decorations: (value) => value.decorations,
      
      eventHandlers: {
        mousedown(event: MouseEvent, view: EditorView) {
          const target = event.target as Element;
          
          if (target.tagName === 'svg' || 
              target.tagName === 'rect' || 
              target.tagName === 'circle' ||
              target.classList.contains('codemarker-circle') ||
              target.classList.contains('codemarker-line') ||
              target.classList.contains('codemarker-handle-svg')) {
            
            const svgElement = target.closest('svg') || target;
            const handleType = svgElement.getAttribute('data-handle-type') as 'start' | 'end';
            const markerId = svgElement.getAttribute('data-marker-id');
            
            if (markerId && (handleType === 'start' || handleType === 'end')) {
              const marker = model.getMarkerById(markerId);
              if (!marker || marker.fileId !== this.fileId) {
                return false;
              }
              
              console.log(`🎯 [${this.instanceId}] Iniciando arraste do marcador ${markerId}`);
              
              event.preventDefault();
              event.stopPropagation();
              
              this.dragging = { markerId, type: handleType };
              
              document.body.classList.add('codemarker-dragging');
              document.body.classList.add(handleType === 'start' ? 'codemarker-dragging-start' : 'codemarker-dragging-end');
              
              view.dispatch({
                effects: startDragEffect.of({ markerId, type: handleType })
              });
              
              return true;
            }
          }
          
          return false;
        },
        
        mousemove(event: MouseEvent, view: EditorView) {
          if (this.dragging) {
            const marker = model.getMarkerById(this.dragging.markerId);
            if (!marker || marker.fileId !== this.fileId) {
              return false;
            }
            
            const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
            if (pos === null) return false;
            
            view.dispatch({
              effects: updateDragEffect.of({
                markerId: this.dragging.markerId,
                pos,
                type: this.dragging.type
              })
            });
            
            return true;
          }
          
          // 🔍 MELHORADO: Detectar hover com logs detalhados
          const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
          if (pos !== null) {
            const markerId = this.getMarkerAtPos(view, pos);
            
            // Se mudou o estado de hover
            if (markerId !== this.hoveredMarkerId) {
              if (this.hoveredMarkerId && markerId) {
                console.log(`🔄 [${this.instanceId}] Hover mudou de ${this.hoveredMarkerId} para ${markerId} na posição ${pos}`);
              } else if (this.hoveredMarkerId && !markerId) {
                console.log(`👋 [${this.instanceId}] Saiu da marcação ${this.hoveredMarkerId} na posição ${pos}`);
              } else if (!this.hoveredMarkerId && markerId) {
                console.log(`🎯 [${this.instanceId}] Entrou na marcação ${markerId} na posição ${pos}`);
              }
              
              view.dispatch({
                effects: setHoverEffect.of({ markerId })
              });
            }
          }
          
          return false;
        },
        
        mouseup(event: MouseEvent, view: EditorView) {
          if (!this.dragging) return false;
          
          const marker = model.getMarkerById(this.dragging.markerId);
          if (!marker || marker.fileId !== this.fileId) {
            return false;
          }
          
          document.body.classList.remove('codemarker-dragging');
          document.body.classList.remove('codemarker-dragging-start', 'codemarker-dragging-end');
          
          view.dispatch({
            effects: endDragEffect.of({ markerId: this.dragging.markerId })
          });
          
          this.dragging = null;
          return true;
        },
        
        mouseleave(event: MouseEvent, view: EditorView) {
          if (this.hoveredMarkerId) {
            view.dispatch({
              effects: setHoverEffect.of({ markerId: null })
            });
          }
          return false;
        }
      }
    }
  );
};
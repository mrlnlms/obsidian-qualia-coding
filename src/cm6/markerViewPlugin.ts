import { ViewPlugin, EditorView, PluginValue, ViewUpdate } from "@codemirror/view";
import { startDragEffect, updateDragEffect, endDragEffect } from "./handleWidget";
import { CodeMarkerModel } from "../models/codeMarkerModel";
import { updateFileMarkersEffect } from "./markerStateField"; // ✅ ADICIONAR esta linha

// ViewPlugin para gerenciar os eventos de mouse para as alças
export const createMarkerViewPlugin = (model: CodeMarkerModel) => {
  return ViewPlugin.fromClass(
    class implements PluginValue {
      // Estado de arraste
      protected dragging: { markerId: string, type: 'start' | 'end' } | null = null;
      private lastFontSize: number; // ✅ Adicionar tracking de fonte
      private cleanup: Array<() => void> = []; // ✅ Array para cleanup
      
      constructor(view: EditorView) {
        // ✅ CORREÇÃO: Capturar tamanho REAL da fonte atual
        this.lastFontSize = this.getCurrentFontSize(view);
        console.log(`🎯 CodeMarker iniciado com fonte: ${this.lastFontSize}px`);
        
        // ✅ Configurar monitoramento de mudanças
        this.setupFontChangeDetection(view);
      }
      
      // ✅ Método para obter tamanho atual da fonte
      private getCurrentFontSize(view: EditorView): number {
        const computedStyle = window.getComputedStyle(view.dom);
        return parseFloat(computedStyle.fontSize);
      }
      
      // ✅ Configurar detecção de mudanças de fonte
      private setupFontChangeDetection(view: EditorView) {
        // 1. Detectar zoom (Ctrl+scroll/pinch)
        const handleZoom = (e: WheelEvent) => {
          if (e.ctrlKey || e.metaKey) {
            // Aguardar frame para zoom ser aplicado
            requestAnimationFrame(() => this.checkFontChange(view));
          }
        };

        // 2. Detectar mudanças via Settings do Obsidian
        const mutationObserver = new MutationObserver(() => {
          this.checkFontChange(view);
        });

        // 3. Detectar redimensionamento que pode afetar fonte
        const resizeObserver = new ResizeObserver(() => {
          this.checkFontChange(view);
        });

        // Registrar todos os eventos
        view.dom.addEventListener('wheel', handleZoom, { passive: true });
        
        // Observar mudanças no body (Settings do Obsidian)
        mutationObserver.observe(document.body, { 
          attributes: true, 
          attributeFilter: ['style', 'class'] 
        });
        
        // Observar mudanças no document (CSS geral)
        mutationObserver.observe(document.documentElement, { 
          attributes: true, 
          attributeFilter: ['style', 'class'] 
        });
        
        resizeObserver.observe(view.dom);

        // Armazenar para cleanup
        this.cleanup = [
          () => view.dom.removeEventListener('wheel', handleZoom),
          () => mutationObserver.disconnect(),
          () => resizeObserver.disconnect()
        ];
      }
      
      // ✅ Verificar se a fonte mudou
      private checkFontChange(view: EditorView) {
        const currentFontSize = this.getCurrentFontSize(view);
        
        // Só detectar mudanças REAIS (diferença > 0.1px)
        if (Math.abs(currentFontSize - this.lastFontSize) > 0.1) {
          console.log(`🔄 CodeMarker: Fonte mudou de ${this.lastFontSize}px para ${currentFontSize}px`);
          
          this.lastFontSize = currentFontSize;
          
          // Forçar recriação de todas as marcações com novo tamanho
          const activeView = model.getActiveView();
          if (activeView?.file) {
            view.dispatch({
              effects: updateFileMarkersEffect.of({ fileId: activeView.file.path })
            });
          }
        }
      }
      
      update(update: ViewUpdate) {
        // ✅ Verificar mudanças durante updates do viewport
        if (update.geometryChanged || update.viewportChanged) {
          this.checkFontChange(update.view);
        }
      }
      
      destroy() {
        // ✅ Limpar todos os observers
        this.cleanup.forEach(cleanupFn => cleanupFn());
        
        // Limpar estado
        this.dragging = null;
        
        // Remover classes do corpo
        document.body.classList.remove('codemarker-dragging');
        document.body.classList.remove('codemarker-dragging-start', 'codemarker-dragging-end');
      }
    },
    {
      eventHandlers: {
        mousedown(event: MouseEvent, view: EditorView) {
          // Identificar cliques nas alças
          const target = event.target as Element;
          
          // Verificar se o clique ocorreu em um elemento SVG ou seus filhos
          if (target.tagName === 'svg' || 
              target.tagName === 'rect' || 
              target.tagName === 'circle' ||
              target.classList.contains('codemarker-circle') ||
              target.classList.contains('codemarker-line') ||
              target.classList.contains('codemarker-handle-svg')) {
            
            // Encontrar o elemento SVG pai se estamos em um filho
            const svgElement = target.closest('svg') || target;
            
            // Obter o tipo de alça (start/end) e o ID do marcador
            const handleType = svgElement.getAttribute('data-handle-type') as 'start' | 'end';
            const markerId = svgElement.getAttribute('data-marker-id');
            
            if (markerId && (handleType === 'start' || handleType === 'end')) {
              event.preventDefault();
              event.stopPropagation();
              
              this.dragging = { markerId, type: handleType };
              
              // Adicionar classes ao corpo para controlar o cursor
              document.body.classList.add('codemarker-dragging');
              document.body.classList.add(handleType === 'start' ? 'codemarker-dragging-start' : 'codemarker-dragging-end');
              
              // Iniciar o arraste
              view.dispatch({
                effects: startDragEffect.of({ markerId, type: handleType })
              });
              
              return true;
            }
          }
          
          return false;
        },
        
        mousemove(event: MouseEvent, view: EditorView) {
          if (!this.dragging) return false;
          
          // Obter a posição no documento baseada nas coordenadas do mouse
          const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
          if (pos === null) return false;
          
          // Despachar efeito para atualizar a posição durante arraste
          view.dispatch({
            effects: updateDragEffect.of({
              markerId: this.dragging.markerId,
              pos,
              type: this.dragging.type
            })
          });
          
          return true;
        },
        
        mouseup(event: MouseEvent, view: EditorView) {
          if (!this.dragging) return false;
          
          // Remover classes do corpo
          document.body.classList.remove('codemarker-dragging');
          document.body.classList.remove('codemarker-dragging-start', 'codemarker-dragging-end');
          
          // Finalizar arraste
          view.dispatch({
            effects: endDragEffect.of({ markerId: this.dragging.markerId })
          });
          
          this.dragging = null;
          return true;
        }
      }
    }
  );
};
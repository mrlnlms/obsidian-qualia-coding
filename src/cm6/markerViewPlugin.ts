import { ViewPlugin, EditorView, PluginValue, ViewUpdate } from "@codemirror/view";
import { startDragEffect, updateDragEffect, endDragEffect } from "./handleWidget";
import { CodeMarkerModel } from "../models/codeMarkerModel";

// ViewPlugin para gerenciar os eventos de mouse para as alças
export const createMarkerViewPlugin = (model: CodeMarkerModel) => {
  return ViewPlugin.fromClass(
    class implements PluginValue {
      // Mudado para protected em vez de private para permitir acesso nas funções de handler
      protected dragging: { markerId: string, type: 'start' | 'end' } | null = null;
      
      constructor(view: EditorView) {
        // Construtor vazio - estado inicial
      }
      
      update(update: ViewUpdate) {
        // Não precisamos reagir a atualizações de viewport, etc.
      }
      
      destroy() {
        // Limpar o estado ao destruir
        this.dragging = null;
        
        // Garantir que as classes de arraste sejam removidas
        document.body.classList.remove('codemarker-dragging');
        document.body.classList.remove('codemarker-dragging-start', 'codemarker-dragging-end');
      }
    },
    {
      eventHandlers: {
        mousedown(event: MouseEvent, view: EditorView) {
          // Verificar se clicou em qualquer elemento do SVG
          const target = event.target as Element;
          let handleElement: Element | null = null;
          
          // Verificar se é um elemento SVG ou filho
          if (target.tagName === 'svg' || 
              target.tagName === 'rect' || 
              target.tagName === 'circle') {
            handleElement = target.closest('svg');
          }
          
          if (handleElement) {
            event.preventDefault();
            
            const markerId = handleElement.getAttribute('data-marker-id');
            const type = handleElement.getAttribute('data-handle-type') as 'start' | 'end';
            
            if (markerId && (type === 'start' || type === 'end')) {
              this.dragging = { markerId, type };
              
              // Adicionar classes para controlar o cursor durante arraste
              document.body.classList.add('codemarker-dragging');
              document.body.classList.add(type === 'start' ? 'codemarker-dragging-start' : 'codemarker-dragging-end');
              
              // Despachar efeito para iniciar arraste
              view.dispatch({
                effects: startDragEffect.of({ markerId, type })
              });
              
              return true; // Indicar que o evento foi tratado
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
          
          // Remover classes de arraste quando o arraste termina
          document.body.classList.remove('codemarker-dragging');
          document.body.classList.remove('codemarker-dragging-start', 'codemarker-dragging-end');
          
          // Despachar efeito para finalizar arraste
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
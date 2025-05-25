import { ViewPlugin, EditorView, PluginValue, ViewUpdate } from "@codemirror/view";
import { MarkdownView } from "obsidian";
import { CodeMarkerModel } from "../models/codeMarkerModel";
import { 
  setFileIdEffect, 
  setHoverEffect,
  startDragEffect,
  updateDragEffect,
  endDragEffect
} from "./markerStateField";

// 🔥 VIEWPLUGIN COMPLETO COM ARRASTE FUNCIONAL
export const createMarkerViewPlugin = (model: CodeMarkerModel) => {
  return ViewPlugin.fromClass(
    class implements PluginValue {
      // Estado isolado POR INSTÂNCIA
      public instanceId: string;
      public fileId: string | null = null;
      private fileIdSent = false;
      
      // 🔥 Estado de arraste - RESTAURADO
      dragging: { markerId: string, type: 'start' | 'end' } | null = null;
      private lastFontSize: number;
      private cleanup: Array<() => void> = [];
      
      // Estado de hover local
      hoveredMarkerId: string | null = null;
      
      constructor(view: EditorView) {
        this.instanceId = Math.random().toString(36).substr(2, 9);
        console.log(`🎯 [DEBUG] ViewPlugin ${this.instanceId} constructor iniciado`);
        
        this.lastFontSize = this.getCurrentFontSize(view);
        this.identifyAndSendFileId(view);
        this.setupFontChangeDetection(view);
        
        console.log(`✅ [DEBUG] ViewPlugin ${this.instanceId} constructor finalizado`);
      }
      
      private identifyAndSendFileId(view: EditorView, retryCount = 0) {
        console.log(`🔍 [DEBUG] ViewPlugin ${this.instanceId} identifyAndSendFileId tentativa ${retryCount + 1}`);
        
        const fileId = this.identifyFileForView(view);
        
        if (fileId) {
          this.fileId = fileId;
          console.log(`📤 [DEBUG] ViewPlugin ${this.instanceId} enviando setFileIdEffect: ${fileId}`);
          
          // 🔥 PROTEÇÃO: Verificar se view ainda existe e não foi destruída
          if (!view.dom || !view.dom.isConnected) {
            console.warn(`⚠️ [DEBUG] ViewPlugin ${this.instanceId} view foi destruída, cancelando envio`);
            return;
          }
          
          requestAnimationFrame(() => {
            try {
              // 🔥 SEGUNDA VERIFICAÇÃO: View ainda válida?
              if (!view.dom || !view.dom.isConnected) {
                console.warn(`⚠️ [DEBUG] ViewPlugin ${this.instanceId} view destruída durante RAF`);
                return;
              }
              
              view.dispatch({
                effects: setFileIdEffect.of({ fileId })
              });
              
              this.fileIdSent = true;
              console.log(`✅ [DEBUG] ViewPlugin ${this.instanceId} setFileIdEffect enviado com sucesso!`);
              
              // 🔥 BACKUP com verificação adicional
              setTimeout(() => {
                if (!view.dom || !view.dom.isConnected) return;
                
                console.log(`🔄 [DEBUG] ViewPlugin ${this.instanceId} enviando backup setFileIdEffect`);
                view.dispatch({
                  effects: setFileIdEffect.of({ fileId })
                });
              }, 100);
              
            } catch (e) {
              console.error(`❌ [DEBUG] ViewPlugin ${this.instanceId} erro ao enviar setFileIdEffect:`, e);
              
              // Retry apenas se não foi erro de view destruída
              if (retryCount < 3 && !e.message.includes('update')) {
                setTimeout(() => {
                  this.identifyAndSendFileId(view, retryCount + 1);
                }, 200);
              }
            }
          });
          
        } else {
          console.warn(`❌ [DEBUG] ViewPlugin ${this.instanceId} não conseguiu identificar arquivo!`);
          
          if (retryCount < 5) {
            setTimeout(() => {
              this.identifyAndSendFileId(view, retryCount + 1);
            }, 300);
          }
        }
      }
      
      private identifyFileForView(view: EditorView): string | null {
        console.log(`🔍 [DEBUG] ViewPlugin ${this.instanceId} identifyFileForView iniciado`);
        
        const app = model.plugin.app;
        const leaves = app.workspace.getLeavesOfType('markdown');
        
        for (let i = 0; i < leaves.length; i++) {
          const leaf = leaves[i];
          const leafView = leaf.view;
          
          if (leafView instanceof MarkdownView && leafView.editor) {
            try {
              // @ts-ignore
              const cmView = leafView.editor.cm;
              const isThisView = cmView === view;
              
              if (isThisView) {
                const filePath = leafView.file?.path || null;
                console.log(`✅ [DEBUG] ViewPlugin ${this.instanceId} arquivo identificado: ${filePath}`);
                return filePath;
              }
            } catch (e) {
              console.warn(`⚠️ [DEBUG] ViewPlugin ${this.instanceId} erro ao acessar cm:`, e);
            }
          }
        }
        
        // Fallback
        const activeView = app.workspace.getActiveViewOfType(MarkdownView);
        if (activeView && activeView.editor) {
          try {
            // @ts-ignore
            const isThisView = activeView.editor.cm === view;
            if (isThisView) {
              const filePath = activeView.file?.path || null;
              console.log(`🔄 [DEBUG] ViewPlugin ${this.instanceId} arquivo identificado via fallback: ${filePath}`);
              return filePath;
            }
          } catch (e) {
            console.warn(`⚠️ [DEBUG] ViewPlugin ${this.instanceId} erro no fallback:`, e);
          }
        }
        
        console.warn(`❌ [DEBUG] ViewPlugin ${this.instanceId} não conseguiu identificar arquivo`);
        return null;
      }
      
      private getCurrentFontSize(view: EditorView): number {
        const computedStyle = window.getComputedStyle(view.dom);
        return parseFloat(computedStyle.fontSize);
      }
      
      // 🔥 MÉTODO PARA DETECTAR MARCADOR POR POSIÇÃO
      getMarkerAtPos(view: EditorView, pos: number): string | null {
        if (!this.fileId) return null;
        
        const markers = model.getMarkersForFile(this.fileId);
        
        for (const marker of markers) {
          try {
            const startOffset = view.state.doc.line(marker.range.from.line + 1).from + marker.range.from.ch;
            const endOffset = view.state.doc.line(marker.range.to.line + 1).from + marker.range.to.ch;
            
            if (pos >= startOffset && pos <= endOffset) {
              return marker.id;
            }
          } catch (e) {
            // Ignorar erro
          }
        }
        
        return null;
      }
      
      // 🔥 MÉTODO PARA ATUALIZAR POSIÇÃO DO MARCADOR (PUBLIC para event handlers)
      updateMarkerPosition(view: EditorView, markerId: string, newPos: number, type: 'start' | 'end') {
        if (!this.fileId) return;
        
        const marker = model.getMarkerById(markerId);
        if (!marker || marker.fileId !== this.fileId) return;
        
        try {
          // Converter offset para posição
          const newPosConverted = model.offsetToPos(newPos, this.fileId);
          if (!newPosConverted) return;
          
          // Atualizar o marcador
          const updatedMarker = { ...marker };
          
          if (type === 'start') {
            // Garantir que start não passe do end
            if (model.isPositionBefore(newPosConverted, marker.range.to) || 
                (newPosConverted.line === marker.range.to.line && newPosConverted.ch === marker.range.to.ch)) {
              updatedMarker.range.from = newPosConverted;
            }
          } else {
            // Garantir que end não fique antes do start
            if (model.isPositionAfter(newPosConverted, marker.range.from) || 
                (newPosConverted.line === marker.range.from.line && newPosConverted.ch === marker.range.from.ch)) {
              updatedMarker.range.to = newPosConverted;
            }
          }
          
          updatedMarker.updatedAt = Date.now();
          
          // Salvar e atualizar
          model.updateMarker(updatedMarker);
          model.updateMarkersForFile(this.fileId);
          
        } catch (e) {
          console.error('Erro ao atualizar posição do marcador:', e);
        }
      }
      
      private setupFontChangeDetection(view: EditorView) {
        this.cleanup = [];
      }
      
      update(update: ViewUpdate) {
        console.log(`🔄 [DEBUG] ViewPlugin ${this.instanceId} update() chamado`);
        
        // 🔥 CORREÇÃO: Apenas re-identificar se necessário, SEM dispatch durante update
        if (!this.fileId || !this.fileIdSent) {
          console.log(`🔍 [DEBUG] ViewPlugin ${this.instanceId} re-identificando arquivo no update...`);
          
          // 🔥 CRÍTICO: Usar setTimeout para evitar dispatch durante update
          setTimeout(() => {
            this.identifyAndSendFileId(update.view);
          }, 0);
        }
        
        // 🔥 REMOVIDO: Não fazer dispatch durante update() - isso causa recursão infinita!
        // O StateField já mapeia decorações automaticamente via tr.changes
      }
      
      destroy() {
        console.log(`🗑️ [DEBUG] ViewPlugin ${this.instanceId} destroy() chamado`);
        
        this.cleanup.forEach(cleanupFn => cleanupFn());
        this.dragging = null;
        this.hoveredMarkerId = null;
        this.fileIdSent = false;
        
        // Limpar cursors de arraste
        document.body.classList.remove('codemarker-dragging', 'codemarker-dragging-start', 'codemarker-dragging-end');
        
        console.log(`✅ [DEBUG] ViewPlugin ${this.instanceId} destroy() finalizado`);
      }
    },
    {
      eventHandlers: {
        // 🔥 MOUSEDOWN - DETECTAR INÍCIO DE ARRASTE
        mousedown(event: MouseEvent, view: EditorView) {
          const target = event.target as HTMLElement;
          
          // Verificar se clicou em uma alça
          if (target.closest('.codemarker-handle-svg') || 
              target.classList.contains('codemarker-circle') ||
              target.classList.contains('codemarker-line') ||
              target.classList.contains('codemarker-handle-svg')) {
            
            const markerId = target.getAttribute('data-marker-id') || 
                           target.closest('[data-marker-id]')?.getAttribute('data-marker-id');
            const handleType = target.getAttribute('data-handle-type') || 
                             target.closest('[data-handle-type]')?.getAttribute('data-handle-type');
            
            if (markerId && handleType && (handleType === 'start' || handleType === 'end')) {
              console.log(`🔥 [DEBUG] ViewPlugin ${this.instanceId} iniciando arraste:`, {
                markerId,
                handleType
              });
              
              event.preventDefault();
              event.stopPropagation();
              
              // Definir estado de arraste
              this.dragging = { markerId, type: handleType as 'start' | 'end' };
              
              // Aplicar cursors visuais
              document.body.classList.add('codemarker-dragging');
              if (handleType === 'start') {
                document.body.classList.add('codemarker-dragging-start');
              } else {
                document.body.classList.add('codemarker-dragging-end');
              }
              
              // Enviar efeito para StateField
              view.dispatch({
                effects: startDragEffect.of({ markerId, type: handleType as 'start' | 'end' })
              });
              
              // Capturar pointer se disponível
              if ('setPointerCapture' in target && event instanceof PointerEvent) {
                (target as any).setPointerCapture(event.pointerId);
              }
              
              return true;
            }
          }
          
          console.log(`🖱️ [DEBUG] ViewPlugin mousedown normal capturado`);
          return false;
        },
        
        // 🔥 MOUSEMOVE - ARRASTAR + HOVER
        mousemove(event: MouseEvent, view: EditorView) {
          // 🔥 LÓGICA DE ARRASTE
          if (this.dragging) {
            event.preventDefault();
            
            const coords = { x: event.clientX, y: event.clientY };
            let pos = view.posAtCoords(coords);
            
            // Se saiu da viewport, tentar posição aproximada
            if (pos === null) {
              pos = view.posAtCoords(coords, false);
            }
            
            if (pos !== null) {
              console.log(`🔄 [DEBUG] ViewPlugin ${this.instanceId} arrastando para posição:`, pos);
              
              // Atualizar posição do marcador
              this.updateMarkerPosition(view, this.dragging.markerId, pos, this.dragging.type);
              
              // Enviar efeito de atualização
              view.dispatch({
                effects: updateDragEffect.of({ 
                  markerId: this.dragging.markerId, 
                  pos, 
                  type: this.dragging.type 
                })
              });
            }
            
            return true;
          }
          
          // 🔥 LÓGICA DE HOVER (apenas se não estiver arrastando)
          const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
          if (pos !== null) {
            const markerId = this.getMarkerAtPos(view, pos);
            
            if (markerId !== this.hoveredMarkerId) {
              console.log(`🖱️ [DEBUG] ViewPlugin ${this.instanceId} hover mudou para: ${markerId}`);
              this.hoveredMarkerId = markerId;
              
              view.dispatch({
                effects: setHoverEffect.of({ markerId })
              });
            }
          }
          
          return false;
        },
        
        // 🔥 MOUSEUP - FINALIZAR ARRASTE
        mouseup(event: MouseEvent, view: EditorView) {
          if (this.dragging) {
            console.log(`🔥 [DEBUG] ViewPlugin ${this.instanceId} finalizando arraste:`, this.dragging.markerId);
            
            const markerId = this.dragging.markerId;
            
            // Limpar estado de arraste
            this.dragging = null;
            
            // Remover cursors visuais
            document.body.classList.remove('codemarker-dragging', 'codemarker-dragging-start', 'codemarker-dragging-end');
            
            // Liberar pointer capture
            const target = event.target as HTMLElement;
            if ('releasePointerCapture' in target && event instanceof PointerEvent) {
              (target as any).releasePointerCapture(event.pointerId);
            }
            
            // Enviar efeito de fim de arraste
            view.dispatch({
              effects: endDragEffect.of({ markerId })
            });
            
            return true;
          }
          
          return false;
        },
        
        // 🔥 MOUSELEAVE - LIMPAR HOVER
        mouseleave(event: MouseEvent, view: EditorView) {
          if (this.hoveredMarkerId) {
            console.log(`👋 [DEBUG] ViewPlugin ${this.instanceId} mouse saiu do editor`);
            this.hoveredMarkerId = null;
            
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
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

// 🔥 VIEWPLUGIN SEGUINDO PADRÕES CODEMIRROR 6
export const createMarkerViewPlugin = (model: CodeMarkerModel) => {
  return ViewPlugin.fromClass(
    class implements PluginValue {
      // Estado POR INSTÂNCIA (correto no CM6)
      public instanceId: string;
      public fileId: string | null = null;
      private fileIdSent = false;
      
      // Estado de arraste
      dragging: { markerId: string, type: 'start' | 'end' } | null = null;
      private lastFontSize: number;
      private cleanup: Array<() => void> = [];
      
      // Estado de hover local
      hoveredMarkerId: string | null = null;
      
      constructor(view: EditorView) {
        this.instanceId = Math.random().toString(36).substr(2, 9);
        console.log(`🎯 [ViewPlugin ${this.instanceId}] Criado seguindo padrões CM6`);
        
        this.lastFontSize = this.getCurrentFontSize(view);
        
        // 🔥 IDENTIFICAR E ENVIAR ARQUIVO PARA STATEFIELD
        this.identifyAndSendFileId(view);
        this.setupFontChangeDetection(view);
        
        console.log(`✅ [ViewPlugin ${this.instanceId}] Inicializado`);
      }
      
      // 🔥 IDENTIFICAÇÃO ROBUSTA DE ARQUIVO
      private identifyAndSendFileId(view: EditorView, retryCount = 0) {
        console.log(`🔍 [ViewPlugin ${this.instanceId}] Identificando arquivo (tentativa ${retryCount + 1})`);
        
        const fileId = this.identifyFileForView(view);
        
        if (fileId) {
          this.fileId = fileId;
          console.log(`📤 [ViewPlugin ${this.instanceId}] Enviando setFileIdEffect: ${fileId}`);
          
          // Garantir que StateField está pronto
          requestAnimationFrame(() => {
            try {
              if (!view.dom || !view.dom.isConnected) {
                console.warn(`⚠️ [ViewPlugin ${this.instanceId}] View destruída, cancelando`);
                return;
              }
              
              view.dispatch({
                effects: setFileIdEffect.of({ fileId })
              });
              
              this.fileIdSent = true;
              console.log(`✅ [ViewPlugin ${this.instanceId}] setFileIdEffect enviado!`);
              
            } catch (e) {
              console.error(`❌ [ViewPlugin ${this.instanceId}] Erro ao enviar effect:`, e);
              
              if (retryCount < 3) {
                setTimeout(() => {
                  this.identifyAndSendFileId(view, retryCount + 1);
                }, 200);
              }
            }
          });
          
        } else {
          console.warn(`❌ [ViewPlugin ${this.instanceId}] Não conseguiu identificar arquivo`);
          
          if (retryCount < 5) {
            setTimeout(() => {
              this.identifyAndSendFileId(view, retryCount + 1);
            }, 300);
          }
        }
      }
      
      // 🔥 IDENTIFICAÇÃO MELHORADA
      private identifyFileForView(view: EditorView): string | null {
        console.log(`🔍 [ViewPlugin ${this.instanceId}] identifyFileForView`);
        
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
                console.log(`✅ [ViewPlugin ${this.instanceId}] Arquivo identificado: ${filePath}`);
                return filePath;
              }
            } catch (e) {
              console.warn(`⚠️ [ViewPlugin ${this.instanceId}] Erro ao comparar views:`, e);
            }
          }
        }
        
        console.warn(`❌ [ViewPlugin ${this.instanceId}] Arquivo não identificado`);
        return null;
      }
      
      private getCurrentFontSize(view: EditorView): number {
        const computedStyle = window.getComputedStyle(view.dom);
        return parseFloat(computedStyle.fontSize);
      }
      
      // 🔥 DETECÇÃO DE MARCADOR CORRIGIDA (VOLTA AO SIMPLES QUE FUNCIONAVA)
      getMarkerAtPos(view: EditorView, pos: number): string | null {
        if (!this.fileId) return null;
        
        const markers = model.getMarkersForFile(this.fileId);
        
        // 🔥 CORREÇÃO: Procurar TODOS os marcadores na posição e retornar o MENOR
        const foundMarkers: Array<{marker: any, size: number}> = [];
        
        for (const marker of markers) {
          try {
            let startOffset: number, endOffset: number;
            
            // Método direto primeiro
            try {
              startOffset = view.state.doc.line(marker.range.from.line + 1).from + marker.range.from.ch;
              endOffset = view.state.doc.line(marker.range.to.line + 1).from + marker.range.to.ch;
            } catch (e) {
              // Método alternativo via view
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
            
            // Verificar se posição está dentro desta marcação
            if (pos >= startOffset && pos <= endOffset) {
              const size = endOffset - startOffset;
              foundMarkers.push({ marker, size });
              
              console.log(`📍 [ViewPlugin ${this.instanceId}] Marcador ${marker.id} contém posição ${pos} (tamanho: ${size})`);
            }
            
          } catch (e) {
            console.error(`❌ [ViewPlugin ${this.instanceId}] Erro ao verificar marcador ${marker.id}:`, e);
          }
        }
        
        if (foundMarkers.length === 0) {
          return null;
        }
        
        // 🔥 PRIORIDADE: Menor marcação (mais específica)
        foundMarkers.sort((a, b) => a.size - b.size);
        const selectedMarker = foundMarkers[0].marker;
        
        console.log(`✅ [ViewPlugin ${this.instanceId}] Marcador selecionado: ${selectedMarker.id}`, {
          totalFound: foundMarkers.length,
          sizes: foundMarkers.map(f => f.size),
          selected: `${selectedMarker.id} (${foundMarkers[0].size})`
        });
        
        return selectedMarker.id;
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
      
      updateMarkerPosition(view: EditorView, markerId: string, newPos: number, type: 'start' | 'end') {
        if (!this.fileId) return;
        
        const marker = model.getMarkerById(markerId);
        if (!marker || marker.fileId !== this.fileId) return;
        
        try {
          const targetView = this.getViewForFile(this.fileId);
          if (!targetView?.editor) return;
          
          // @ts-ignore
          const newPosConverted = targetView.editor.offsetToPos(newPos);
          if (!newPosConverted) return;
          
          const updatedMarker = { ...marker };
          
          if (type === 'start') {
            if (model.isPositionBefore(newPosConverted, marker.range.to) || 
                (newPosConverted.line === marker.range.to.line && newPosConverted.ch === marker.range.to.ch)) {
              updatedMarker.range.from = newPosConverted;
            }
          } else {
            if (model.isPositionAfter(newPosConverted, marker.range.from) || 
                (newPosConverted.line === marker.range.from.line && newPosConverted.ch === marker.range.from.ch)) {
              updatedMarker.range.to = newPosConverted;
            }
          }
          
          updatedMarker.updatedAt = Date.now();
          model.updateMarker(updatedMarker);
          model.updateMarkersForFile(this.fileId);
          
        } catch (e) {
          console.error(`❌ [ViewPlugin ${this.instanceId}] Erro ao atualizar posição:`, e);
        }
      }
      
      private setupFontChangeDetection(view: EditorView) {
        this.cleanup = [];
      }
      
      update(update: ViewUpdate) {
        console.log(`🔄 [ViewPlugin ${this.instanceId}] update()`);
        
        // Garantir que arquivo foi identificado
        if (!this.fileId || !this.fileIdSent) {
          console.log(`🔍 [ViewPlugin ${this.instanceId}] Re-identificando arquivo...`);
          setTimeout(() => {
            this.identifyAndSendFileId(update.view);
          }, 0);
        }
      }
      
      destroy() {
        console.log(`🗑️ [ViewPlugin ${this.instanceId}] destroy()`);
        
        this.cleanup.forEach(cleanupFn => cleanupFn());
        this.dragging = null;
        this.hoveredMarkerId = null;
        this.fileIdSent = false;
        
        // Limpar cursors de arraste
        document.body.classList.remove('codemarker-dragging', 'codemarker-dragging-start', 'codemarker-dragging-end');
        
        console.log(`✅ [ViewPlugin ${this.instanceId}] Destruído`);
      }
    },
    {
      eventHandlers: {
        // 🔥 MOUSEDOWN: Detectar arraste das alças
        mousedown(event: MouseEvent, view: EditorView) {
          const target = event.target as HTMLElement;
          
          if (target.tagName === 'svg' || 
              target.tagName === 'rect' || 
              target.tagName === 'circle' ||
              target.classList.contains('codemarker-circle') ||
              target.classList.contains('codemarker-line') ||
              target.classList.contains('codemarker-handle-svg')) {
            
            const markerId = target.getAttribute('data-marker-id') || 
                           target.closest('[data-marker-id]')?.getAttribute('data-marker-id');
            const handleType = target.getAttribute('data-handle-type') || 
                             target.closest('[data-handle-type]')?.getAttribute('data-handle-type');
            
            if (markerId && handleType && (handleType === 'start' || handleType === 'end')) {
              console.log(`🔥 [ViewPlugin ${this.instanceId}] Iniciando arraste: ${markerId} (${handleType})`);
              
              event.preventDefault();
              event.stopPropagation();
              
              this.dragging = { markerId, type: handleType as 'start' | 'end' };
              
              document.body.classList.add('codemarker-dragging');
              if (handleType === 'start') {
                document.body.classList.add('codemarker-dragging-start');
              } else {
                document.body.classList.add('codemarker-dragging-end');
              }
              
              view.dispatch({
                effects: startDragEffect.of({ markerId, type: handleType as 'start' | 'end' })
              });
              
              return true;
            }
          }
          
          console.log(`🖱️ [ViewPlugin ${this.instanceId}] Mousedown normal`);
          return false;
        },
        
        // 🔥 MOUSEMOVE: Arraste + Hover
        mousemove(event: MouseEvent, view: EditorView) {
          // Lógica de arraste
          if (this.dragging) {
            event.preventDefault();
            
            const coords = { x: event.clientX, y: event.clientY };
            let pos = view.posAtCoords(coords);
            
            if (pos === null) {
              pos = view.posAtCoords(coords, false);
            }
            
            if (pos !== null) {
              console.log(`🔄 [ViewPlugin ${this.instanceId}] Arrastando para posição: ${pos}`);
              this.updateMarkerPosition(view, this.dragging.markerId, pos, this.dragging.type);
              
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
          
          // 🔥 LÓGICA DE HOVER CORRIGIDA
          const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
          if (pos !== null) {
            const markerId = this.getMarkerAtPos(view, pos);
            
            if (markerId !== this.hoveredMarkerId) {
              console.log(`🔄 [ViewPlugin ${this.instanceId}] Hover mudou para: ${markerId}`);
              this.hoveredMarkerId = markerId;
              
              // 🔥 ENVIAR PARA STATEFIELD VIA EFFECT (PADRÃO CM6)
              view.dispatch({
                effects: setHoverEffect.of({ markerId })
              });
            }
          }
          
          return false;
        },
        
        // 🔥 MOUSEUP: Finalizar arraste
        mouseup(event: MouseEvent, view: EditorView) {
          if (this.dragging) {
            console.log(`🔥 [ViewPlugin ${this.instanceId}] Finalizando arraste: ${this.dragging.markerId}`);
            
            const markerId = this.dragging.markerId;
            this.dragging = null;
            
            document.body.classList.remove('codemarker-dragging', 'codemarker-dragging-start', 'codemarker-dragging-end');
            
            view.dispatch({
              effects: endDragEffect.of({ markerId })
            });
            
            return true;
          }
          
          return false;
        },
        
        // 🔥 MOUSELEAVE: Limpar hover
        mouseleave(event: MouseEvent, view: EditorView) {
          if (this.hoveredMarkerId) {
            console.log(`👋 [ViewPlugin ${this.instanceId}] Mouse saiu, limpando hover`);
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
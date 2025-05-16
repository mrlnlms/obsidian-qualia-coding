import { CodeMarkerModel, Marker } from '../models/codeMarkerModel';

export class ResizeHandles {
  private model: CodeMarkerModel;
  private activeHandles: HTMLElement[] = [];
  private activeMarker: Marker | null = null;
  private isDragging = false;
  private dragType: 'start' | 'end' | null = null;
  private newFromPos: {line: number, ch: number} | null = null;
  private newToPos: {line: number, ch: number} | null = null;
  private newStartX: number | null = null;
  private newStartY: number | null = null;
  private newEndX: number | null = null;
  private newEndY: number | null = null;
  
  constructor(model: CodeMarkerModel) {
    this.model = model;
    this.setupEventListeners();
  }
  
  private setupEventListeners() {
    // Listener para mouseover em marcações
    document.addEventListener('mouseover', (event) => {
      const target = event.target as HTMLElement;
      
      if (target.classList.contains('codemarker-highlight') && !this.isDragging) {
        const markerId = target.getAttribute('data-marker-id');
        if (markerId) {
          const marker = this.model.getMarkerById(markerId);
          if (marker) {
            this.showHandlesForMarker(target, marker);
          }
        }
      }
    });
    
    // Listener para mouseout
    document.addEventListener('mouseout', (event) => {
      const target = event.target as HTMLElement;
      const relatedTarget = event.relatedTarget as HTMLElement;
      
      if (target.classList.contains('codemarker-highlight') && !this.isDragging) {
        // Verificar se não estamos saindo para um handle ou outro elemento relacionado
        if (!this.isRelatedElement(relatedTarget)) {
          setTimeout(() => {
            if (!this.isMouseOverHandles() && !this.isMouseOverHighlight(target)) {
              this.hideHandles();
            }
          }, 100);
        }
      }
    });
    
    // Listener para mouse down nas alças
      // Adicionar um listener global para detectar cliques fora das alças
      document.addEventListener('mousedown', (event) => {
        const target = event.target as HTMLElement;
        
        if (target.classList.contains('codemarker-handle')) {
          console.log("CodeMarker: MOUSEDOWN na alça", {
            target: target.className,
            clientX: event.clientX,
            clientY: event.clientY
          });
          
          // Parar propagação
          event.preventDefault();
          event.stopPropagation();
          
          this.isDragging = true;
          // @ts-ignore - Esta variável será usada posteriormente
          this.dragType = target.classList.contains('handle-start') ? 'start' : 'end';
          
          // Destacar visualmente a alça arrastada
          target.style.backgroundColor = '#FF5722';
          
          // Garantir que o documento captura o evento mouseup
          document.addEventListener('mouseup', this.handleDocumentMouseUp, { once: true });
          document.addEventListener('mousemove', this.handleDocumentMouseMove);
        }
      });
        
        // Adicionar um listener global para movimento do mouse
        document.addEventListener('mousemove', (event) => {
            if (this.isDragging && this.activeMarker) {
            this.handleDrag(event as MouseEvent);
            } else if (this.activeHandles.length > 0) {
            // Verificar se o mouse está sobre alguma alça ou marcação
            const target = event.target as HTMLElement;
            const isOverHandle = target.classList.contains('codemarker-handle');
            const isOverHighlight = target.classList.contains('codemarker-highlight');
            
            if (!isOverHandle && !isOverHighlight && !this.isMouseOverHandles() && !this.isMouseOverHighlight()) {
                // Se não estiver sobre nenhum elemento relevante, esconder as alças
                this.hideHandles();
            }
            }
        });
            
    // Listener para mouse up (finalizar redimensionamento)
document.addEventListener('mouseup', () => {
    if (this.isDragging && this.activeMarker) {
      // Restaurar estilo das alças
      this.activeHandles.forEach(handle => {
        handle.style.transform = 'translate(-50%, -50%)';
        handle.style.backgroundColor = '#6200EE'; // Restaurar cor original
      });
      
      this.finalizeDrag();
    }
  });

     // NOVO: Adicionar listeners para eventos de navegação
  // Isso garante que as alças desapareçam quando a página mudar
    window.addEventListener('hashchange', () => {
        this.hideHandles();
      });

      // NOVO: Adicionar listener para quando o documento fica invisível
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
        this.hideHandles();
        }
    });
    
        // NOVO: Limpar alças quando a janela perder o foco
        window.addEventListener('blur', () => {
            this.hideHandles();
        });

  }
  
  private isRelatedElement(element: HTMLElement): boolean {
    // Verifica se o elemento é uma alça ou parte do sistema de marcação
    return element?.classList?.contains('codemarker-handle') || 
           element?.classList?.contains('codemarker-highlight');
  }
  
  private showHandlesForMarker(targetElement: HTMLElement, marker: Marker) {
    console.log("CodeMarker: Exibindo alças para marcação", marker.id);
    
    // Remover alças existentes primeiro
    this.hideHandles();
    
    this.activeMarker = marker;
    
    // Obter todos os elementos de destaque com o mesmo ID de marcação
    const allHighlights = document.querySelectorAll(`.codemarker-highlight[data-marker-id="${marker.id}"]`);
    console.log("CodeMarker: Elementos encontrados", allHighlights.length);
    
    if (allHighlights.length === 0) {
      console.error("CodeMarker: Nenhum elemento encontrado para a marcação");
      return;
    }
    
    // Primeiro elemento (início da marcação)
    const firstElement = allHighlights[0] as HTMLElement;
    const firstRect = firstElement.getBoundingClientRect();
    
    // Último elemento (fim da marcação)
    const lastElement = allHighlights[allHighlights.length - 1] as HTMLElement;
    const lastRect = lastElement.getBoundingClientRect();
    
    console.log("CodeMarker: Retângulos", {first: firstRect, last: lastRect});
    
    // Alça de início
    const startHandle = this.createHandle(firstRect.left, firstRect.top, 'handle-start');
    document.body.appendChild(startHandle);
    this.activeHandles.push(startHandle);
    
    // Alça de fim
    const endHandle = this.createHandle(lastRect.right, lastRect.bottom, 'handle-end');
    document.body.appendChild(endHandle);
    this.activeHandles.push(endHandle);
    
    console.log("CodeMarker: Alças criadas e adicionadas ao DOM");
  }
  
  private createHandle(x: number, y: number, className: string): HTMLElement {
    const handle = document.createElement('div');
    handle.className = `codemarker-handle ${className}`;
    
    // Aplicando estilos diretamente para maior controle
    handle.style.position = 'absolute';
    handle.style.width = '16px'; // MUITO maior
    handle.style.height = '16px'; // MUITO maior
    handle.style.backgroundColor = '#6200EE'; // Roxo mais vibrante
    handle.style.borderRadius = '50%';
    handle.style.cursor = className === 'handle-start' ? 'w-resize' : 'e-resize';
    handle.style.zIndex = '9999';
    handle.style.transform = 'translate(-50%, -50%)';
    handle.style.left = `${x}px`;
    handle.style.top = `${y}px`;
    handle.style.border = '2px solid white'; // Borda destacada
    handle.style.boxShadow = '0 0 5px rgba(0, 0, 0, 0.8)'; // Sombra mais pronunciada
    
    // Efeito ao passar o mouse (opcional, mais avançado)
    handle.onmouseenter = () => {
      handle.style.transform = 'translate(-50%, -50%) scale(1.2)';
      handle.style.boxShadow = '0 0 8px rgba(0, 0, 0, 0.9)';
    };
    
    handle.onmouseleave = () => {
      handle.style.transform = 'translate(-50%, -50%)';
      handle.style.boxShadow = '0 0 5px rgba(0, 0, 0, 0.8)';
    };
    
    return handle;
  }
  
  public hideHandles() {
    this.activeHandles.forEach(handle => {
      if (handle.parentNode) {
        handle.parentNode.removeChild(handle);
      }
    });
    
    this.activeHandles = [];
    
    if (!this.isDragging) {
      this.activeMarker = null;
    }
  }
  
  private isMouseOverHandles(): boolean {
    // Obtenha o evento atual como MouseEvent
        const mouseEvent = window.event as MouseEvent;
        if (!mouseEvent) return false;
        
        const mouseX = mouseEvent.clientX;
        const mouseY = mouseEvent.clientY;
        
        // Adicionar uma pequena margem ao redor das alças para facilitar a detecção
        const margin = 5; // pixels
        
        return this.activeHandles.some(handle => {
          const rect = handle.getBoundingClientRect();
          return (
            mouseX >= rect.left - margin && 
            mouseX <= rect.right + margin &&
            mouseY >= rect.top - margin && 
            mouseY <= rect.bottom + margin
          );
        });
      }
  
      private isMouseOverHighlight(element?: HTMLElement): boolean {
        const mouseEvent = window.event as MouseEvent;
        if (!mouseEvent) return false;
        
        const mouseX = mouseEvent.clientX;
        const mouseY = mouseEvent.clientY;
        
        if (!element) {
          // Se não for fornecido um elemento, verificar todos os elementos marcados
          if (this.activeMarker) {
            const allHighlights = document.querySelectorAll(
              `.codemarker-highlight[data-marker-id="${this.activeMarker.id}"]`
            );
            
            // Verificar se o mouse está sobre qualquer um dos elementos
            for (let i = 0; i < allHighlights.length; i++) {
              const highlight = allHighlights[i] as HTMLElement;
              const rect = highlight.getBoundingClientRect();
              
              if (
                mouseX >= rect.left && 
                mouseX <= rect.right &&
                mouseY >= rect.top && 
                mouseY <= rect.bottom
              ) {
                return true;
              }
            }
          }
          
          return false;
        }
        
        // Comportamento original para quando um elemento é fornecido
        const rect = element.getBoundingClientRect();
        return (
          mouseX >= rect.left && 
          mouseX <= rect.right &&
          mouseY >= rect.top && 
          mouseY <= rect.bottom
        );
      }
  
      private handleDrag(event: MouseEvent) {
        if (!this.isDragging || !this.activeMarker || !this.dragType) return;
        
        // Evitar comportamento padrão
        event.preventDefault();
      
        console.log("CodeMarker: Arrastando alça", this.dragType);
        
        // Mover apenas a alça visualmente
        if (this.dragType === 'start') {
          const startHandle = this.activeHandles[0];
          if (startHandle) {
            console.log("CodeMarker: Movendo alça inicial para", event.clientX, event.clientY);
            startHandle.style.left = `${event.clientX}px`;
            startHandle.style.top = `${event.clientY}px`;
            
            // Guardar a posição para aplicar depois
            this.newStartX = event.clientX;
            this.newStartY = event.clientY;
          }
        } else {
          const endHandle = this.activeHandles[1];
          if (endHandle) {
            console.log("CodeMarker: Movendo alça final para", event.clientX, event.clientY);
            endHandle.style.left = `${event.clientX}px`;
            endHandle.style.top = `${event.clientY}px`;
            
            // Guardar a posição para aplicar depois
            this.newEndX = event.clientX;
            this.newEndY = event.clientY;
          }
        }
      }


    private isPosBeforePos(pos1: {line: number, ch: number}, pos2: {line: number, ch: number}): boolean {
    if (pos1.line < pos2.line) return true;
    if (pos1.line > pos2.line) return false;
    return pos1.ch <= pos2.ch;
    }

    private isPosAfterPos(pos1: {line: number, ch: number}, pos2: {line: number, ch: number}): boolean {
    if (pos1.line > pos2.line) return true;
    if (pos1.line < pos2.line) return false;
    return pos1.ch >= pos2.ch;
    }


  private updateHandlePositions() {
    if (!this.activeMarker || this.activeHandles.length !== 2) return;
    
    const view = this.model.getActiveView();
    if (!view || !view.editor) return;
    
    // Obtém as coordenadas de tela das posições de início e fim
    const startCoords = this.model.getEditorCoords(view.editor, this.activeMarker.range.from);
    const endCoords = this.model.getEditorCoords(view.editor, this.activeMarker.range.to);
    
    if (!startCoords || !endCoords) return;
    
    // Atualiza as posições das alças
    const startHandle = this.activeHandles[0];
    startHandle.style.left = `${startCoords.x}px`;
    startHandle.style.top = `${startCoords.y}px`;
    
    const endHandle = this.activeHandles[1];
    endHandle.style.left = `${endCoords.x}px`;
    endHandle.style.top = `${endCoords.y}px`;
  }
  
  private finalizeDrag() {
    console.log("CodeMarker: Finalizando arrasto");
    
    if (!this.activeMarker) return;
    
    // Determinar se alguma posição foi alterada
    const startMoved = this.newStartX !== null && this.newStartY !== null;
    const endMoved = this.newEndX !== null && this.newEndY !== null;
    
    if (startMoved || endMoved) {
      try {
        // Obter o editor ativo
        const view = this.model.getActiveView();
        if (!view || !view.editor) return;
        
        // Converter posições de tela para posições no documento
        let newFromPos = this.activeMarker.range.from;
        let newToPos = this.activeMarker.range.to;
        
        if (startMoved && this.newStartX && this.newStartY) {
          const posAtMouse = this.model.posAtMouse(view.editor, this.newStartX, this.newStartY);
          console.log("CodeMarker: Nova posição inicial", posAtMouse);
          if (posAtMouse) {
            newFromPos = posAtMouse;
          }
        }
        
        if (endMoved && this.newEndX && this.newEndY) {
          const posAtMouse = this.model.posAtMouse(view.editor, this.newEndX, this.newEndY);
          console.log("CodeMarker: Nova posição final", posAtMouse);
          if (posAtMouse) {
            newToPos = posAtMouse;
          }
        }
        
        console.log("CodeMarker: Posições calculadas", {
          from: newFromPos,
          to: newToPos,
          isValid: this.isPosBeforePos(newFromPos, newToPos)
        });
        
        // Corrigir posições automaticamente se forem inválidas
        if (!this.isPosBeforePos(newFromPos, newToPos)) {
          console.log("CodeMarker: Corrigindo posições inválidas");
          
          // Se o usuário inverteu as posições, use a antiga ordem
          if (startMoved && endMoved) {
            const temp = newFromPos;
            newFromPos = newToPos;
            newToPos = temp;
          } else if (startMoved) {
            // Se só a posição inicial foi movida, restrinja para antes do fim
            newFromPos = this.activeMarker.range.from;
          } else if (endMoved) {
            // Se só a posição final foi movida, restrinja para depois do início
            newToPos = this.activeMarker.range.to;
          }
        }
        
        // Se ainda temos posições inválidas após tentativa de correção, use as originais
        if (!this.isPosBeforePos(newFromPos, newToPos)) {
          console.log("CodeMarker: Usando posições originais");
          newFromPos = this.activeMarker.range.from;
          newToPos = this.activeMarker.range.to;
        }
        
        // Atualizar a marcação (mesmo que nenhuma mudança real aconteça)
        const updatedMarker = {...this.activeMarker};
        updatedMarker.range.from = newFromPos;
        updatedMarker.range.to = newToPos;
        updatedMarker.updatedAt = Date.now();
        
        console.log("CodeMarker: Tentando atualizar marcação", updatedMarker);
        
        // Usar updateSimpleMarker para evitar problemas de ordenação
        this.model.updateSimpleMarker(updatedMarker);
      } catch (e) {
        console.error("CodeMarker: Erro ao finalizar arrasto", e);
      }
    }
    
    // Resetar estado
    this.isDragging = false;
    this.dragType = null;
    this.newStartX = null;
    this.newStartY = null;
    this.newEndX = null;
    this.newEndY = null;
  }



  // Adicione estes métodos como propriedades da classe
private handleDocumentMouseMove = (event: MouseEvent) => {
    if (this.isDragging && this.activeMarker) {
      console.log("CodeMarker: MOUSEMOVE durante arrasto", {
        clientX: event.clientX,
        clientY: event.clientY
      });
      this.handleDrag(event);
    }
  }
  
  // Modificar o handler de mouseup para garantir que ele funcione
private handleDocumentMouseUp = (event: MouseEvent) => {
    console.log("CodeMarker: MOUSEUP global", { 
      isDragging: this.isDragging,
      hasDragType: !!this.dragType,
      hasActiveMarker: !!this.activeMarker
    });
    
    // Remover os listeners explicitamente
    document.removeEventListener('mousemove', this.handleDocumentMouseMove);
    
    // Salvar uma referência local às variáveis importantes
    const wasDragging = this.isDragging;
    const marker = this.activeMarker;
    // @ts-ignore
    const dragType = this.dragType;
    
    // Finalizar o arrasto se estávamos arrastando
    if (wasDragging && marker) {
      this.finalizeDragSafely();
    }
  }

  private finalizeDragSafely() {
    try {
      console.log("CodeMarker: Tentando finalizar arrasto com segurança");
      
      // Simplificar completamente o finalizeDrag para apenas salvar a marcação
      if (!this.activeMarker) return;
      
      // Resetar visual das alças
      this.activeHandles.forEach(handle => {
        handle.style.backgroundColor = '#6200EE';
      });
      
      // Limpar estado
      this.isDragging = false;
      this.dragType = null;
      
      // Para esta versão simplificada, não tentamos atualizar a marcação
      // Apenas salvamos o que já temos e recarregamos a visualização
      
      console.log("CodeMarker: Arrasto finalizado com segurança");
      
      // Esconder as alças após finalizar
      setTimeout(() => {
        this.hideHandles();
      }, 200);
    } catch (e) {
      console.error("CodeMarker: Erro ao finalizar arrasto com segurança", e);
      
      // Garantir que o estado é resetado mesmo com erro
      this.isDragging = false;
      this.dragType = null;
      this.hideHandles();
    }
  }

  private updateHandleVisualPositions(fromPos: {line: number, ch: number}, toPos: {line: number, ch: number}) {
    if (this.activeHandles.length !== 2) return;
    
    const view = this.model.getActiveView();
    if (!view || !view.editor) return;
    
    try {
      // Obter coordenadas na tela para as posições
      // @ts-ignore - Usando API interna
      const fromCoords = view.editor.coordsAtPos(view.editor.posToOffset(fromPos));
      // @ts-ignore - Usando API interna
      const toCoords = view.editor.coordsAtPos(view.editor.posToOffset(toPos));
      
      if (!fromCoords || !toCoords) return;
      
      // Atualizar apenas as posições visuais das alças
      const startHandle = this.activeHandles[0];
      startHandle.style.left = `${fromCoords.left}px`;
      startHandle.style.top = `${fromCoords.top}px`;
      
      const endHandle = this.activeHandles[1];
      endHandle.style.left = `${toCoords.right}px`;
      endHandle.style.top = `${toCoords.bottom}px`;
    } catch (e) {
      console.error("CodeMarker: Erro ao atualizar posições visuais", e);
    }
  }



  public cleanup() {
    this.hideHandles();
    
    // Remover todos os listeners globais
    document.removeEventListener('mousemove', this.handleDocumentMouseMove);
    document.removeEventListener('mouseup', this.handleDocumentMouseUp);
  }
}
import { CodeMarkerModel, Marker } from '../models/codeMarkerModel';

export class ResizeHandles {
  private model: CodeMarkerModel;
  private activeHandles: HTMLElement[] = [];
  private activeMarker: Marker | null = null;
  private isDragging = false;
  private dragType: 'start' | 'end' | null = null;
  
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
    document.addEventListener('mousedown', (event) => {
      const target = event.target as HTMLElement;
      
      if (target.classList.contains('codemarker-handle')) {
        event.preventDefault();
        this.isDragging = true;
        this.dragType = target.classList.contains('handle-start') ? 'start' : 'end';
      }
    });
    
    // Adicionar um listener global para detectar cliques fora das alças
    document.addEventListener('mousedown', (event) => {
      if (!this.isDragging) {
        const target = event.target as HTMLElement;
        // Se clicar em qualquer coisa que não seja uma alça ou uma marcação, esconder
        if (!target.classList.contains('codemarker-handle') && 
            !target.classList.contains('codemarker-highlight')) {
          this.hideHandles();
        }
      }
    });


    // Listener para mouse move (redimensionamento)
    document.addEventListener('mousemove', (event) => {
      if (this.isDragging && this.activeMarker) {
        this.handleDrag(event as MouseEvent);
      }
    });


    document.addEventListener('mousemove', (event) => {
      if (this.isDragging && this.activeMarker) {
        this.handleDrag(event as MouseEvent);
      } else if (this.activeHandles.length > 0) {
        // Verificar se o mouse está sobre alguma alça ou marcação
        const target = event.target as HTMLElement;
        const isOverHandle = target.classList.contains('codemarker-handle');
        const isOverHighlight = target.classList.contains('codemarker-highlight');
        
        if (!isOverHandle && !isOverHighlight && !this.isMouseOverHandles()) {
          // Se não estiver sobre nenhuma alça, verificar cada elemento de destaque individualmente
          let isOverAnyHighlight = false;
          
          if (this.activeMarker) {
            const allHighlights = document.querySelectorAll(
              `.codemarker-highlight[data-marker-id="${this.activeMarker.id}"]`
            );
            
            for (let i = 0; i < allHighlights.length; i++) {
              if (this.isMouseOverHighlight(allHighlights[i] as HTMLElement)) {
                isOverAnyHighlight = true;
                break;
              }
            }
          }
          
          if (!isOverAnyHighlight) {
            this.hideHandles();
          }
        }
      }
    });
    
    // Listener para mouse up (finalizar redimensionamento)
    document.addEventListener('mouseup', () => {
      if (this.isDragging && this.activeMarker) {
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
    // Remover alças existentes primeiro
    this.hideHandles();
    
    this.activeMarker = marker;
    
    // Tente encontrar todos os elementos com o mesmo ID de marcação
    const allHighlights = document.querySelectorAll(`.codemarker-highlight[data-marker-id="${marker.id}"]`);
    
    if (allHighlights.length > 1) {
      // Para marcações multilinhas, encontrar os extremos
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      
      // Verificar todos os elementos para encontrar os extremos
      allHighlights.forEach((element) => {
        const rect = element.getBoundingClientRect();
        
        // Atualizar extremos
        minX = Math.min(minX, rect.left);
        minY = Math.min(minY, rect.top);
        maxX = Math.max(maxX, rect.right);
        maxY = Math.max(maxY, rect.bottom);
      });
      
      // Criar alças nos pontos extremos
      if (minX !== Infinity && minY !== Infinity) {
        const startHandle = this.createHandle(minX, minY, 'handle-start');
        document.body.appendChild(startHandle);
        this.activeHandles.push(startHandle);
      }
      
      if (maxX !== -Infinity && maxY !== -Infinity) {
        const endHandle = this.createHandle(maxX, maxY, 'handle-end');
        document.body.appendChild(endHandle);
        this.activeHandles.push(endHandle);
      }
    } else {
      // Para marcações de uma linha, usar o método atual que já está funcionando
      const rect = targetElement.getBoundingClientRect();
      
      // Alça de início
      const startHandle = this.createHandle(rect.left, rect.top, 'handle-start');
      document.body.appendChild(startHandle);
      this.activeHandles.push(startHandle);
      
      // Alça de fim
      const endHandle = this.createHandle(rect.right, rect.bottom, 'handle-end');
      document.body.appendChild(endHandle);
      this.activeHandles.push(endHandle);
    }
    // Criar alças laterais em vez de pontos
    const startHandleHeight = firstRect.bottom - firstRect.top;
    const startHandle = this.createVerticalHandle(
      firstRect.left - 3, // Ligeiramente à esquerda
      firstRect.top,
      startHandleHeight,
      'handle-start'
    );
    document.body.appendChild(startHandle);
    this.activeHandles.push(startHandle);
    
    const endHandleHeight = lastRect.bottom - lastRect.top;
    const endHandle = this.createVerticalHandle(
      lastRect.right + 3, // Ligeiramente à direita
      lastRect.top,
      endHandleHeight,
      'handle-end'
    );
    document.body.appendChild(endHandle);
    this.activeHandles.push(endHandle);
  }

  private createVerticalHandle(x: number, y: number, height: number, className: string): HTMLElement {
    const handle = document.createElement('div');
    handle.className = `codemarker-handle ${className}`;
    
    handle.style.position = 'absolute';
    handle.style.width = '6px';
    handle.style.height = `${height}px`;
    handle.style.backgroundColor = '#6200EE';
    handle.style.cursor = className === 'handle-start' ? 'w-resize' : 'e-resize';
    handle.style.zIndex = '9999';
    handle.style.left = `${x}px`;
    handle.style.top = `${y}px`;
    handle.style.borderRadius = '3px';
    handle.style.border = '1px solid white';
    handle.style.boxShadow = '0 0 4px rgba(0, 0, 0, 0.6)';
    
    return handle;
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
    if (!this.activeMarker || !this.dragType) return;
    
    const view = this.model.getActiveView();
    if (!view || !view.editor) return;
    
    try {
      // @ts-ignore - Acessando propriedades internas do editor
      const posAtMouse = view.editor.posAtMouse({x: event.clientX, y: event.clientY});
      
      if (!posAtMouse) {
        console.error("CodeMarker: Não foi possível obter posição no ponto do mouse");
        return;
      }
      
      // Atualiza o marker com a nova posição
      if (this.dragType === 'start') {
        // Garantir que a posição inicial não fique após a posição final
        const endPos = this.activeMarker.range.to;
        if (posAtMouse.line < endPos.line || (posAtMouse.line === endPos.line && posAtMouse.ch < endPos.ch)) {
          this.activeMarker.range.from = posAtMouse;
        }
      } else {
        // Garantir que a posição final não fique antes da posição inicial
        const startPos = this.activeMarker.range.from;
        if (posAtMouse.line > startPos.line || (posAtMouse.line === startPos.line && posAtMouse.ch > startPos.ch)) {
          this.activeMarker.range.to = posAtMouse;
        }
      }
      
      // Atualiza a visualização
      this.model.updateMarker(this.activeMarker);
      const file = view.file;
      if (file) {
        this.model.updateMarkersForFile(file.path);
        
        // Reposicionar as alças após atualização
        setTimeout(() => {
          this.updateHandlePositions();
        }, 50); // Pequeno atraso para permitir que as marcações sejam atualizadas
      }
    } catch (e) {
      console.error("CodeMarker: Erro ao arrastar alça", e);
    }
  }
  
  private updateHandlePositions() {
    if (!this.activeMarker || this.activeHandles.length !== 2) return;
    
    // Obter todos os elementos de destaque com o mesmo ID de marcação
    const allHighlights = document.querySelectorAll(`.codemarker-highlight[data-marker-id="${this.activeMarker.id}"]`);
    
    if (allHighlights.length === 0) return;
    
    // Encontrar extremos
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    
    allHighlights.forEach((element) => {
      const rect = element.getBoundingClientRect();
      
      minX = Math.min(minX, rect.left);
      minY = Math.min(minY, rect.top);
      maxX = Math.max(maxX, rect.right);
      maxY = Math.max(maxY, rect.bottom);
    });
    
    // Atualiza as posições das alças se os extremos são válidos
    if (minX !== Infinity && minY !== Infinity && maxX !== -Infinity && maxY !== -Infinity) {
      const startHandle = this.activeHandles[0];
      startHandle.style.left = `${minX}px`;
      startHandle.style.top = `${minY}px`;
      
      const endHandle = this.activeHandles[1];
      endHandle.style.left = `${maxX}px`;
      endHandle.style.top = `${maxY}px`;
    }
  }
  
  private finalizeDrag() {
    if (!this.activeMarker) return;
    
    // Atualiza timestamp
    this.activeMarker.updatedAt = Date.now();
    
    // Salva a marcação atualizada
    this.model.updateMarker(this.activeMarker);
    
    // Atualiza visualização
    const view = this.model.getActiveView();
    if (view && view.file) {
      this.model.updateMarkersForFile(view.file.path);
    }
    
    // Limpa estado
    this.isDragging = false;
    this.dragType = null;
  }
  public cleanup() {
    this.hideHandles();
  }
}
import { CodeMarkerModel, Marker } from '../models/codeMarkerModel';

export class ResizeHandles {
  private model: CodeMarkerModel;
  private activeHandles: HTMLElement[] = [];
  private activeMarker: Marker | null = null;
  private isDragging = false;
  private dragType: 'start' | 'end' | null = null;
  private dragStartX = 0;
private dragStartY = 0;

  constructor(model: CodeMarkerModel) {
    this.model = model;
    this.setupEventListeners();
  }
  
  private setupEventListeners() {
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

   document.addEventListener('mouseout', (event) => {
  const target = event.target as HTMLElement;
  const relatedTarget = event.relatedTarget as HTMLElement;

  if (target.classList.contains('codemarker-highlight') && !this.isDragging) {
    // Se o mouse está saindo para uma alça, NÃO esconda
    if (relatedTarget?.closest('.codemarker-handle')) return;

    setTimeout(() => {
      if (!this.isMouseOverHandles() && !this.isMouseOverHighlight(target)) {
        this.hideHandles();
      }
    }, 100);
  }
});

    // Substitua o trecho do evento 'mousedown' por:
document.addEventListener('mousedown', (event) => {
  const target = event.target as HTMLElement;
  const handleEl = target.closest('.codemarker-handle');
  if (handleEl) {
    event.preventDefault();
    this.isDragging = true;
    this.dragType = handleEl.classList.contains('handle-start') ? 'start' : 'end';
    
    // Calcular offset RELATIVO AO CENTRO da alça
    const handleRect = handleEl.getBoundingClientRect();
    this.handleOffsetX = event.clientX - (handleRect.left + handleRect.width / 2);
    this.handleOffsetY = event.clientY - (handleRect.top + handleRect.height / 2);
  }
});

    document.addEventListener('mousedown', (event) => {
      if (!this.isDragging) {
        const target = event.target as HTMLElement;
        if (!target.closest('.codemarker-handle') &&
            !target.closest('.codemarker-highlight')) {
          this.hideHandles();
        }
      }
    });

    document.addEventListener('mousemove', (event) => {
      if (this.isDragging && this.activeMarker) {
        try {
          this.handleDrag(event as MouseEvent);
        } catch (error) {
          console.error("CodeMarker: Erro inesperado ao arrastar alça", error);
          this.isDragging = false;
          this.dragType = null;
          this.hideHandles();
        }
      }
    });

    document.addEventListener('mousemove', (event) => {
      if (this.isDragging && this.activeMarker) {
        this.handleDrag(event as MouseEvent);
      } else if (this.activeHandles.length > 0) {
        const target = event.target as HTMLElement;
        const isOverHandle = target.classList.contains('codemarker-handle');
        const isOverHighlight = target.classList.contains('codemarker-highlight');
        if (!isOverHandle && !isOverHighlight && !this.isMouseOverHandles()) {
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

    document.addEventListener('mouseup', () => {
      if (this.isDragging && this.activeMarker) {
        this.finalizeDrag();
      }
    });

    window.addEventListener('hashchange', () => {
      this.hideHandles();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.hideHandles();
      }
    });
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



  
  const view = this.model.getActiveView();
  if (!view || !view.editor) return;

  const editor = view.editor;
  // @ts-ignore - Acessando o editor CM6
  const cmEditor = editor.cm;
  if (!cmEditor) return;

  const startOffset = editor.posToOffset(marker.range.from);
  const endOffset = editor.posToOffset(marker.range.to);

  if (startOffset === null || endOffset === null) return;

  const startCoords = cmEditor.coordsAtPos(startOffset);
  const endCoords = cmEditor.coordsAtPos(endOffset);

  if (!startCoords || !endCoords) return;

  // Criar alça de início
  const startHandle = this.createHandle(startCoords.left, startCoords.top, 'handle-start');
  document.body.appendChild(startHandle);
  this.activeHandles.push(startHandle);

  // Criar alça de fim
  const endHandle = this.createHandle(endCoords.left, endCoords.top, 'handle-end');
  document.body.appendChild(endHandle);
  this.activeHandles.push(endHandle);


// const lineHeight = Math.max(
//   1.5 * parseFloat(getComputedStyle(cmEditor.dom).lineHeight) || 24,
//   endCoords.bottom - startCoords.top // Altura real da seleção
// );
const lineHeight = parseFloat(getComputedStyle(cmEditor.contentDOM).lineHeight);

// Aplicar altura às barras
startHandle.style.setProperty('--line-height', `${lineHeight}px`);
endHandle.style.setProperty('--line-height', `${lineHeight}px`);
// ▲▲▲ FIM DO TRECHO ADICIONADO ▲▲▲



document.querySelectorAll(`.codemarker-highlight[data-marker-id="${marker.id}"]`)
  .forEach(el => el.classList.add('codemarker-hover'));


}
  private showHandlesForMarker2(targetElement: HTMLElement, marker: Marker) {
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
      // Centralize a alça no ponto exato do texto
  handle.style.left = `${x}px`;
  handle.style.top = `${y}px`;

    // Aplicando estilos diretamente para maior controle
    handle.style.position = 'absolute';
    handle.style.width = '16px'; // MUITO maior
    handle.style.height = '16px'; // MUITO maior
    handle.style.backgroundColor = '#6200EE'; // Roxo mais vibrante
    handle.style.borderRadius = '50%';
    handle.style.cursor = className === 'handle-start' ? 'w-resize' : 'e-resize';
    handle.style.zIndex = '9999';
    //handle.style.transform = 'translate(-50%, -50%)';
    // Detecta se é alça de início ou fim para aplicar deslocamento visual
      if (className === 'handle-start') {
        handle.style.left = `${x - 1}px`;   // desloca um pouco para a esquerda
        handle.style.top = `${y - 8}px`;    // sobe um pouco
      } else {
        handle.style.left = `${x+1}px`;   // desloca um pouco para a direita
        handle.style.top = `${y + 26}px`;   // desce para alinhar com o fundo da linha
      }
    handle.style.border = '2px solid white'; // Borda destacada
    handle.style.boxShadow = '0 0 5px rgba(0, 0, 0, 0.8)'; // Sombra mais pronunciada


    // Cria a bolinha interna como filho real
  const ball = document.createElement('div');
  ball.className = 'codemarker-ball';
  handle.appendChild(ball);

  return handle;
    // // Efeito ao passar o mouse (opcional, mais avançado)
    // handle.onmouseenter = () => {
    //   handle.style.transform = 'translate(-50%, -50%) scale(1.2)';
    //   handle.style.boxShadow = '0 0 8px rgba(0, 0, 0, 0.9)';
    // };
    
    // handle.onmouseleave = () => {
    //   handle.style.transform = 'translate(-50%, -50%)';
    //   handle.style.boxShadow = '0 0 5px rgba(0, 0, 0, 0.8)';
    // };
    
    // return handle;
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
    document.querySelectorAll('.codemarker-highlight.codemarker-hover')
      .forEach(el => el.classList.remove('codemarker-hover'));

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
  const editor = view.editor;

  try {
    // @ts-ignore - Acessar o editor CM6
    const cmEditor = editor.cm;
    if (!cmEditor) return;

    // Obter coordenadas ajustadas (centralizadas)
    const adjustedX = event.clientX - this.handleOffsetX;
    const adjustedY = event.clientY - this.handleOffsetY;

    // Obter posição no editor
    // @ts-ignore
    const posAtMouse = cmEditor.posAtCoords({ x: adjustedX, y: adjustedY }, false); // 'false' para coordenadas precisas
    if (!posAtMouse) return;

    // Atualizar o marcador
    if (this.dragType === 'start') {
      this.activeMarker.range.from = posAtMouse;
    } else {
      this.activeMarker.range.to = posAtMouse;
    }

    // Forçar atualização IMEDIATA da view
    this.model.updateMarker(this.activeMarker);
    this.updateHandlePositions(); // Atualizar alças sem delay
  } catch (e) {
    console.error("Erro ao arrastar:", e);
    this.isDragging = false;
    this.dragType = null;
  }
}

// No método updateHandlePositions, ajuste o posicionamento:
private updateHandlePositions() {
  if (!this.activeMarker || this.activeHandles.length !== 2) return;

  const view = this.model.getActiveView();
  if (!view?.editor) return;

  // @ts-ignore - Acessar o editor CM6
  const cm = view.editor.cm;
  if (!cm) return;

  // Obter offsets atualizados
  const startOffset = view.editor.posToOffset(this.activeMarker.range.from);
  const endOffset = view.editor.posToOffset(this.activeMarker.range.to);

  if (startOffset == null || endOffset == null) return;

  // Forçar atualização do layout ANTES de pegar as coordenadas
  cm.requestMeasure();

  // Obter coordenadas ATUALIZADAS
  const startCoords = cm.coordsAtPos(startOffset);
  const endCoords = cm.coordsAtPos(endOffset);

  if (!startCoords || !endCoords) return;

  // Aplicar posições CENTRALIZADAS
  const startHandle = this.activeHandles[0];
  startHandle.style.left = `${startCoords.left - startHandle.offsetWidth / 2}px`;
  startHandle.style.top = `${startCoords.top - startHandle.offsetHeight / 2}px`;

  const endHandle = this.activeHandles[1];
  endHandle.style.left = `${endCoords.left - endHandle.offsetWidth / 2}px`;
  endHandle.style.top = `${endCoords.top - endHandle.offsetHeight / 2}px`;
}

  
private finalizeDrag() {
  if (!this.activeMarker) return;

  this.activeMarker.updatedAt = Date.now();
  this.model.updateMarker(this.activeMarker);

  const view = this.model.getActiveView();
  if (view?.file) {
    this.model.updateMarkersForFile(view.file.path);
  }

  // Limpar estado
  this.isDragging = false;
  this.dragType = null;
  this.hideHandles();
}
public cleanup() {
  this.hideHandles();
}


}
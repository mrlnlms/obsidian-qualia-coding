import { WidgetType, EditorView } from "@codemirror/view";
import { StateEffect } from "@codemirror/state";
import { Marker } from "../models/codeMarkerModel";
import { CodeMarkerSettings } from "../models/settings";

// Define os efeitos de estado para as operações de arraste
export const startDragEffect = StateEffect.define<{markerId: string, type: 'start' | 'end'}>()
export const updateDragEffect = StateEffect.define<{markerId: string, pos: number, type: 'start' | 'end'}>()
export const endDragEffect = StateEffect.define<{markerId: string}>()

/**
 * Widget extremamente simplificado que mostra ambas as alças juntas
 */
export class CombinedHandleWidget extends WidgetType {
  static BALL_SIZE = 12;
  static BAR_WIDTH = 2;
  static BAR_LENGTH = 20;
  static TOP_OFFSET = 25;
  
  constructor(
    private marker: Marker,
    private color: string
  ) { 
    super();
  }

  eq(other: CombinedHandleWidget) {
    return this.marker.id === other.marker.id;
  }

  toDOM(view: EditorView) {
    // Criar o container
    const container = document.createElement('div');
    container.className = 'codemarker-handles-container';
    container.setAttribute('data-marker-id', this.marker.id);
    
    // Estilizar o container para não interferir com o texto
    container.style.position = 'relative';
    container.style.display = 'inline-block';
    container.style.width = '0';
    container.style.height = '0';
    container.style.overflow = 'visible';
    
    // Converter cor hexadecimal para RGB
    let displayColor = this.color;
    if (this.color.startsWith('#')) {
      const r = parseInt(this.color.slice(1, 3), 16);
      const g = parseInt(this.color.slice(3, 5), 16);
      const b = parseInt(this.color.slice(5, 7), 16);
      displayColor = `rgb(${r}, ${g}, ${b})`;
    }
    
    // Criar alça de início
    const startHandle = document.createElement('div');
    startHandle.className = 'codemarker-handle start-handle';
    startHandle.setAttribute('data-marker-id', this.marker.id);
    startHandle.setAttribute('data-handle-type', 'start');
    
    startHandle.innerHTML = `
      <svg width="${CombinedHandleWidget.BALL_SIZE}" height="${CombinedHandleWidget.TOP_OFFSET + CombinedHandleWidget.BALL_SIZE}" 
           style="position:absolute; left:-${CombinedHandleWidget.BALL_SIZE/2}px; top:-${CombinedHandleWidget.TOP_OFFSET}px; cursor:w-resize; pointer-events:auto;"
           class="codemarker-handle-svg" data-marker-id="${this.marker.id}" data-handle-type="start">
        <circle cx="${CombinedHandleWidget.BALL_SIZE/2}" cy="${CombinedHandleWidget.BALL_SIZE/2}" 
                r="${CombinedHandleWidget.BALL_SIZE/2}" fill="${displayColor}" stroke="white" stroke-width="1.5" 
                class="codemarker-circle" />
        <rect x="${CombinedHandleWidget.BALL_SIZE/2 - CombinedHandleWidget.BAR_WIDTH/2}" 
              y="${CombinedHandleWidget.BALL_SIZE}" width="${CombinedHandleWidget.BAR_WIDTH}" 
              height="${CombinedHandleWidget.BAR_LENGTH}" rx="1" fill="${displayColor}" 
              class="codemarker-line" />
      </svg>
    `;
    
    // Criar alça de fim
    const endHandle = document.createElement('div');
    endHandle.className = 'codemarker-handle end-handle';
    endHandle.setAttribute('data-marker-id', this.marker.id);
    endHandle.setAttribute('data-handle-type', 'end');
    
    endHandle.innerHTML = `
      <svg width="${CombinedHandleWidget.BALL_SIZE}" height="${CombinedHandleWidget.TOP_OFFSET + CombinedHandleWidget.BALL_SIZE}" 
           style="position:absolute; right:-${CombinedHandleWidget.BALL_SIZE/2}px; top:-${CombinedHandleWidget.TOP_OFFSET}px; cursor:e-resize; pointer-events:auto;"
           class="codemarker-handle-svg" data-marker-id="${this.marker.id}" data-handle-type="end">
        <rect x="${CombinedHandleWidget.BALL_SIZE/2 - CombinedHandleWidget.BAR_WIDTH/2}" 
              y="0" width="${CombinedHandleWidget.BAR_WIDTH}" 
              height="${CombinedHandleWidget.BAR_LENGTH}" rx="1" fill="${displayColor}" 
              class="codemarker-line" />
        <circle cx="${CombinedHandleWidget.BALL_SIZE/2}" cy="${CombinedHandleWidget.BAR_LENGTH + CombinedHandleWidget.BALL_SIZE/2}" 
                r="${CombinedHandleWidget.BALL_SIZE/2}" fill="${displayColor}" stroke="white" stroke-width="1.5" 
                class="codemarker-circle" />
      </svg>
    `;
    
    // Adicionar as alças ao container
    container.appendChild(startHandle);
    container.appendChild(endHandle);
    
    return container;
  }

  // Permitir eventos em qualquer elemento SVG dentro das alças
  ignoreEvent(event: Event): boolean {
    const target = event.target as Element;
    return !(
      target.tagName === 'svg' ||
      target.tagName === 'rect' ||
      target.tagName === 'circle' ||
      target.classList.contains('codemarker-handle-svg') ||
      target.classList.contains('codemarker-line') ||
      target.classList.contains('codemarker-circle')
    );
  }
}

/**
 * Widget que representa uma alça de arraste (mantida para compatibilidade)
 */
export class HandleWidget extends WidgetType {
  // Definir proporções em vez de valores fixos
  static BASE_FONT_SIZE = 16; // Tamanho base de referência
  static BALL_SIZE_RATIO = 0.75; // Proporção em relação ao tamanho da fonte
  static BAR_WIDTH_RATIO = 0.125; // Proporção em relação ao tamanho da fonte
  static BAR_LENGTH_RATIO = 1.1; // Proporção em relação ao tamanho da fonte
  
  private static resizeObserver: ResizeObserver | null = null;
  private static zoomListener: ((e: Event) => void) | null = null;
  private static fontSizeObserver: MutationObserver | null = null;
  
  constructor(
    private marker: Marker,
    private type: 'start' | 'end',
    private color: string,
    private settings: CodeMarkerSettings
  ) { 
    super();
  }

  private setupResizeHandling(view: EditorView) {
    // Configurar ResizeObserver se ainda não existir
    if (!HandleWidget.resizeObserver) {
      HandleWidget.resizeObserver = new ResizeObserver((entries) => {
        this.updateHandleDimensions(view);
      });
      HandleWidget.resizeObserver.observe(view.dom);
    }

    // Configurar listener de zoom se ainda não existir
    if (!HandleWidget.zoomListener) {
      HandleWidget.zoomListener = () => {
        this.updateHandleDimensions(view);
      };
      window.addEventListener('resize', HandleWidget.zoomListener);
      document.addEventListener('wheel', (e) => {
        if (e.ctrlKey || e.metaKey) {
          this.updateHandleDimensions(view);
        }
      });
    }

    // Observar mudanças no tamanho da fonte do Obsidian
    if (!HandleWidget.fontSizeObserver) {
      HandleWidget.fontSizeObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
            this.updateHandleDimensions(view);
          }
        });
      });

      // Observar o elemento root do Obsidian para mudanças de estilo
      const rootElement = document.documentElement;
      HandleWidget.fontSizeObserver.observe(rootElement, {
        attributes: true,
        attributeFilter: ['style']
      });

      // Observar também o body para mudanças de classe que podem afetar o tamanho da fonte
      HandleWidget.fontSizeObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ['class', 'style']
      });
    }
  }

  private updateHandleDimensions(view: EditorView) {
    // Pequeno delay para garantir que os estilos foram aplicados
    requestAnimationFrame(() => {
      const handles = document.querySelectorAll('.codemarker-handle');
      
      const computedStyle = window.getComputedStyle(view.dom);
      const currentFontSize = parseFloat(computedStyle.fontSize);
      const lineHeight = parseFloat(computedStyle.lineHeight) || currentFontSize * 1.2;
      
      const ballSize = currentFontSize * HandleWidget.BALL_SIZE_RATIO;
      const barWidth = currentFontSize * HandleWidget.BAR_WIDTH_RATIO;
      const barLength = lineHeight * HandleWidget.BAR_LENGTH_RATIO;

      handles.forEach(handle => {
        const svg = handle.querySelector('svg');
        const group = svg?.querySelector('g');
        const circle = svg?.querySelector('circle');
        const line = svg?.querySelector('rect');
        
        if (svg && group && circle && line) {
          // Atualizar dimensões do SVG
          svg.setAttribute("width", `${ballSize}px`);
          svg.setAttribute("height", `${lineHeight * 2}px`);
          svg.style.left = `-${ballSize/2}px`;
          svg.style.top = `-${lineHeight}px`;

          // Atualizar posição do grupo
          const isStart = handle.classList.contains('start-handle');
          const yOffset = isStart ? lineHeight * 0.1 : lineHeight * 0.3;
          group.setAttribute("transform", `translate(${ballSize/2}, ${yOffset})`);

          // Atualizar dimensões da linha
          line.setAttribute("x", `-${barWidth/2}`);
          line.setAttribute("width", `${barWidth}`);
          line.setAttribute("height", `${barLength}`);
          line.setAttribute("rx", `${barWidth/2}`);

          // Atualizar dimensões da bolinha
          circle.setAttribute("r", `${ballSize/2}`);
          circle.setAttribute("stroke-width", `${barWidth * 0.75}`);
          if (!isStart) {
            circle.setAttribute("cy", `${barLength}`);
          }
        }
      });
    });
  }

  destroy(dom: HTMLElement): void {
    if (HandleWidget.resizeObserver) {
      HandleWidget.resizeObserver.disconnect();
      HandleWidget.resizeObserver = null;
    }
    if (HandleWidget.zoomListener) {
      window.removeEventListener('resize', HandleWidget.zoomListener);
      HandleWidget.zoomListener = null;
    }
    if (HandleWidget.fontSizeObserver) {
      HandleWidget.fontSizeObserver.disconnect();
      HandleWidget.fontSizeObserver = null;
    }
  }

  eq(widget: WidgetType): boolean {
    if (!(widget instanceof HandleWidget)) return false;
    return this.marker.id === widget.marker.id && 
           this.type === widget.type;
  }

  toDOM(view: EditorView): HTMLElement {
    // Configurar os handlers de resize assim que o widget for criado
    this.setupResizeHandling(view);

    // Container zero-size para não afetar o fluxo do texto
    const handle = document.createElement('div');
    handle.className = `codemarker-handle ${this.type}-handle`;
    
    // Adicionar classe específica se o modo hover estiver ativo
    if (this.settings.showHandlesOnHover) {
      handle.classList.add('handles-hover-mode');
    }

    handle.setAttribute('data-marker-id', this.marker.id);
    handle.setAttribute('data-handle-type', this.type);
    
    // Configuração essencial para não afetar o texto
    handle.style.position = 'relative';
    handle.style.display = 'inline-block';
    handle.style.width = '0px';
    handle.style.height = '0px';
    handle.style.overflow = 'visible';
    handle.style.zIndex = '9999';
    handle.style.pointerEvents = 'none';

    // Converter cor hexadecimal para RGB
    let displayColor = this.color;
    if (this.color.startsWith('#')) {
      const r = parseInt(this.color.slice(1, 3), 16);
      const g = parseInt(this.color.slice(3, 5), 16);
      const b = parseInt(this.color.slice(5, 7), 16);
      displayColor = `rgb(${r}, ${g}, ${b})`;
    }

    // Calcular dimensões baseadas no tamanho atual da fonte do editor
    const computedStyle = window.getComputedStyle(view.dom);
    const currentFontSize = parseFloat(computedStyle.fontSize);
    const lineHeight = parseFloat(computedStyle.lineHeight) || currentFontSize * 1.2;
    
    // Calcular dimensões dinâmicas
    const ballSize = currentFontSize * HandleWidget.BALL_SIZE_RATIO;
    const barWidth = currentFontSize * HandleWidget.BAR_WIDTH_RATIO;
    const barLength = lineHeight * HandleWidget.BAR_LENGTH_RATIO;
    
    // Criar SVG base com dimensões dinâmicas
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", `${ballSize}px`);
    svg.setAttribute("height", `${lineHeight * 2}px`);
    svg.style.position = "absolute";
    svg.style.left = `-${ballSize/2}px`;
    svg.style.top = `-${lineHeight}px`;
    svg.style.transformOrigin = "center";
    svg.style.overflow = "visible";
    svg.style.pointerEvents = "auto";
    svg.classList.add("codemarker-handle-svg");
    svg.setAttribute('data-marker-id', this.marker.id);
    svg.setAttribute('data-handle-type', this.type);

    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    
    if (this.type === 'start') {
      svg.style.cursor = "w-resize";
      group.setAttribute("transform", `translate(${ballSize/2}, ${lineHeight * 0.1})`);
      
      // Linha com dimensões dinâmicas
      const line = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      line.setAttribute("x", `-${barWidth/2}`);
      line.setAttribute("y", "0");
      line.setAttribute("width", `${barWidth}`);
      line.setAttribute("height", `${barLength}`);
      line.setAttribute("rx", `${barWidth/2}`);
      line.setAttribute("fill", displayColor);
      line.classList.add("codemarker-line");
      line.setAttribute('data-marker-id', this.marker.id);
      line.setAttribute('data-handle-type', this.type);

      // Bolinha com dimensões dinâmicas
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", "0");
      circle.setAttribute("cy", "0");
      circle.setAttribute("r", `${ballSize/2}`);
      circle.setAttribute("fill", displayColor);
      circle.setAttribute("stroke", "white");
      circle.setAttribute("stroke-width", `${barWidth * 0.75}`);
      circle.classList.add("codemarker-circle");
      circle.setAttribute('data-marker-id', this.marker.id);
      circle.setAttribute('data-handle-type', this.type);

      group.appendChild(line);
      group.appendChild(circle);
    } else {
      svg.style.cursor = "e-resize";
      group.setAttribute("transform", `translate(${ballSize/2}, ${lineHeight * 0.3})`);
  
      // Linha com dimensões dinâmicas
      const line = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      line.setAttribute("x", `-${barWidth/2}`);
      line.setAttribute("y", "0");
      line.setAttribute("width", `${barWidth}`);
      line.setAttribute("height", `${barLength}`);
      line.setAttribute("rx", `${barWidth/2}`);
      line.setAttribute("fill", displayColor);
      line.classList.add("codemarker-line");
      line.setAttribute('data-marker-id', this.marker.id);
      line.setAttribute('data-handle-type', this.type);
    
      // Bolinha com dimensões dinâmicas
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", "0");
      circle.setAttribute("cy", `${barLength}`);
      circle.setAttribute("r", `${ballSize/2}`);
      circle.setAttribute("fill", displayColor);
      circle.setAttribute("stroke", "white");
      circle.setAttribute("stroke-width", `${barWidth * 0.75}`);
      circle.classList.add("codemarker-circle");
      circle.setAttribute('data-marker-id', this.marker.id);
      circle.setAttribute('data-handle-type', this.type);
    
      group.appendChild(line);
      group.appendChild(circle);
    }

    svg.appendChild(group);
    handle.appendChild(svg);
    return handle;
  }

  // Mantém o mesmo método ignoreEvent
  ignoreEvent(event: Event): boolean {
    const target = event.target as Element;
    return !(
      target.tagName === 'svg' ||
      target.tagName === 'rect' ||
      target.tagName === 'circle' ||
      target.classList.contains('codemarker-handle-svg') ||
      target.classList.contains('codemarker-line') ||
      target.classList.contains('codemarker-circle')
    );
  }
}
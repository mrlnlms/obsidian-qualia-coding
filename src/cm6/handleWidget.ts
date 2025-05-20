import { WidgetType, EditorView } from "@codemirror/view";
import { StateEffect } from "@codemirror/state";
import { Marker } from "../models/codeMarkerModel";

// Define os efeitos de estado para as operações de arraste
export const startDragEffect = StateEffect.define<{markerId: string, type: 'start' | 'end'}>()
export const updateDragEffect = StateEffect.define<{markerId: string, pos: number, type: 'start' | 'end'}>()
export const endDragEffect = StateEffect.define<{markerId: string}>()

/**
 * Widget que representa uma alça de arraste
 */
export class HandleWidget extends WidgetType {
  // Constantes de configuração visual - fácil de ajustar
  static BALL_SIZE = 12;      // Tamanho da bolinha em pixels (reduzido de 20 para 12)
  static BAR_WIDTH = 2;       // Largura da barra conectora (reduzido de 3 para 2)
  static BAR_LENGTH = 20;     // Comprimento da barra conectora (reduzido de 30 para 20)
  static TOP_OFFSET = 25;     // Distância para alça superior (do topo da marcação) (reduzido de 40 para 25)
  static BOTTOM_OFFSET = 5;   // Distância para alça inferior (do fundo da marcação) (reduzido de 10 para 5)

  constructor(
    private marker: Marker,
    private type: 'start' | 'end',
    private color: string
  ) { 
    super();
  }

  eq(other: HandleWidget) {
    return this.marker.id === other.marker.id && 
           this.type === other.type;
  }

  toDOM(view: EditorView) {
    // Container zero-size para não afetar o fluxo do texto
    const handle = document.createElement('div');
    handle.className = `codemarker-handle ${this.type}-handle`;
    handle.setAttribute('data-marker-id', this.marker.id);
    handle.setAttribute('data-handle-type', this.type);
    
    // Configuração essencial para não afetar o texto
    handle.style.position = 'relative';
    handle.style.display = 'inline-block';
    handle.style.width = '0px';
    handle.style.height = '0px';
    handle.style.overflow = 'visible';
    handle.style.zIndex = '9999';
    handle.style.pointerEvents = 'none'; // Container não captura eventos
    
    // Converter cor hexadecimal para RGB
    let displayColor = this.color;
    if (this.color.startsWith('#')) {
      const r = parseInt(this.color.slice(1, 3), 16);
      const g = parseInt(this.color.slice(3, 5), 16);
      const b = parseInt(this.color.slice(5, 7), 16);
      displayColor = `rgb(${r}, ${g}, ${b})`;
    }
    
    if (this.type === 'start') {
      // Alça de início: SVG acima do texto
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("width", `${HandleWidget.BALL_SIZE}px`);
      svg.setAttribute("height", `${HandleWidget.TOP_OFFSET + HandleWidget.BALL_SIZE}px`);
      svg.style.position = "absolute";
      svg.style.left = `-${HandleWidget.BALL_SIZE/2}px`;
      svg.style.top = `-${HandleWidget.TOP_OFFSET}px`;
      svg.style.overflow = "visible";
      svg.style.pointerEvents = "auto";
      svg.style.cursor = "w-resize";
      svg.setAttribute('data-marker-id', this.marker.id);
      svg.setAttribute('data-handle-type', this.type);
      svg.classList.add("codemarker-handle-svg");
      
      // INVERTIDO: Círculo/bolinha primeiro (no topo)
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", `${HandleWidget.BALL_SIZE/2}`);
      circle.setAttribute("cy", `${HandleWidget.BALL_SIZE/2}`); // Bolinha no topo
      circle.setAttribute("r", `${HandleWidget.BALL_SIZE/2}`);
      circle.setAttribute("fill", displayColor);
      circle.setAttribute("stroke", "white");
      circle.setAttribute("stroke-width", "1.5");
      circle.classList.add("codemarker-circle");
      
      // INVERTIDO: Linha/barrinha abaixo da bolinha
      const line = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      line.setAttribute("x", `${HandleWidget.BALL_SIZE/2 - HandleWidget.BAR_WIDTH/2}`);
      line.setAttribute("y", `${HandleWidget.BALL_SIZE}`); // Começa logo após a bolinha
      line.setAttribute("width", `${HandleWidget.BAR_WIDTH}`);
      line.setAttribute("height", `${HandleWidget.BAR_LENGTH}`);
      line.setAttribute("rx", "1");
      line.setAttribute("fill", displayColor);
      line.classList.add("codemarker-line");
      
      svg.appendChild(circle); // Primeiro adiciona o círculo
      svg.appendChild(line);   // Depois adiciona a linha
      handle.appendChild(svg);
      
    } else {
      // Alça de fim: SVG posicionada no lado direito
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("width", `${HandleWidget.BALL_SIZE}px`);
      svg.setAttribute("height", `${HandleWidget.TOP_OFFSET + HandleWidget.BALL_SIZE}px`);
      svg.style.position = "absolute";
      svg.style.left = `-${HandleWidget.BALL_SIZE/2}px`;
      svg.style.top = `-${HandleWidget.TOP_OFFSET}px`; // Posicionamento igual ao da alça inicial
      svg.style.overflow = "visible";
      svg.style.pointerEvents = "auto";
      svg.style.cursor = "e-resize";
      svg.setAttribute('data-marker-id', this.marker.id);
      svg.setAttribute('data-handle-type', this.type);
      svg.classList.add("codemarker-handle-svg");
      
      // Linha/barrinha - exatamente igual à primeira alça
      const line = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      line.setAttribute("x", `${HandleWidget.BALL_SIZE/2 - HandleWidget.BAR_WIDTH/2}`);
      line.setAttribute("y", "0");
      line.setAttribute("width", `${HandleWidget.BAR_WIDTH}`);
      line.setAttribute("height", `${HandleWidget.BAR_LENGTH}`);
      line.setAttribute("rx", "1");
      line.setAttribute("fill", displayColor);
      line.classList.add("codemarker-line");
      
      // Círculo/bolinha - exatamente igual à primeira alça
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", `${HandleWidget.BALL_SIZE/2}`);
      circle.setAttribute("cy", `${HandleWidget.BAR_LENGTH + HandleWidget.BALL_SIZE/2}`);
      circle.setAttribute("r", `${HandleWidget.BALL_SIZE/2}`);
      circle.setAttribute("fill", displayColor);
      circle.setAttribute("stroke", "white");
      circle.setAttribute("stroke-width", "1.5");
      circle.classList.add("codemarker-circle");
      
      svg.appendChild(line);
      svg.appendChild(circle);
      handle.appendChild(svg);
    }
    
    return handle;
  }

  // Permitir eventos em qualquer elemento SVG dentro das alças
  ignoreEvent(event: Event): boolean {
    const target = event.target as Element;
    // Permitir eventos se o elemento for parte do SVG
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
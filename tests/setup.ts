/**
 * Vitest setup file — runs before all test suites.
 *
 * Provides a minimal HTMLCanvasElement.getContext() mock for jsdom, plus
 * polyfills for Obsidian's DOM helpers (empty, createDiv, createEl, createSpan,
 * addClass) so modules that call those on elements work under jsdom.
 */

// ── Obsidian DOM helper polyfills ───────────────────────────────
// These are what Obsidian patches onto Element.prototype at runtime. They're
// intentionally narrow — only supporting the attribute shapes used in the
// codebase. Extend here if a test surfaces a new usage.

interface ElementAttrs {
  cls?: string | string[];
  text?: string;
  attr?: Record<string, string>;
  // Shortcut attributes supported by Obsidian's createEl — they map onto the
  // corresponding DOM property/attribute without needing a nested `attr` object.
  type?: string;
  value?: string;
  placeholder?: string;
  href?: string;
  title?: string;
}

declare global {
  interface HTMLElement {
    empty(): void;
    createDiv(attrs?: ElementAttrs): HTMLDivElement;
    createSpan(attrs?: ElementAttrs): HTMLSpanElement;
    createEl<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: ElementAttrs): HTMLElementTagNameMap[K];
    addClass(cls: string): void;
    removeClass(cls: string): void;
    toggleClass(cls: string, force?: boolean): void;
  }
}

function applyAttrs(el: HTMLElement, attrs?: ElementAttrs): void {
  if (!attrs) return;
  if (attrs.cls) {
    if (Array.isArray(attrs.cls)) el.classList.add(...attrs.cls);
    else el.className = attrs.cls;
  }
  if (attrs.text != null) el.textContent = attrs.text;
  if (attrs.type != null) (el as HTMLInputElement).type = attrs.type;
  if (attrs.value != null) (el as HTMLInputElement).value = attrs.value;
  if (attrs.placeholder != null) (el as HTMLInputElement).placeholder = attrs.placeholder;
  if (attrs.href != null) (el as HTMLAnchorElement).href = attrs.href;
  if (attrs.title != null) el.title = attrs.title;
  if (attrs.attr) {
    for (const [k, v] of Object.entries(attrs.attr)) el.setAttribute(k, v);
  }
}

HTMLElement.prototype.empty = function () {
  while (this.firstChild) this.removeChild(this.firstChild);
};

HTMLElement.prototype.createDiv = function (attrs) {
  const el = document.createElement('div');
  applyAttrs(el, attrs);
  this.appendChild(el);
  return el;
};

HTMLElement.prototype.createSpan = function (attrs) {
  const el = document.createElement('span');
  applyAttrs(el, attrs);
  this.appendChild(el);
  return el;
};

HTMLElement.prototype.createEl = function (tag, attrs) {
  const el = document.createElement(tag);
  applyAttrs(el, attrs);
  this.appendChild(el);
  return el as HTMLElementTagNameMap[typeof tag];
};

HTMLElement.prototype.addClass = function (cls) {
  this.classList.add(cls);
};

HTMLElement.prototype.removeClass = function (cls) {
  this.classList.remove(cls);
};

HTMLElement.prototype.toggleClass = function (cls, force) {
  this.classList.toggle(cls, force);
};


HTMLCanvasElement.prototype.getContext = function (contextId: string) {
  if (contextId === '2d') {
    return {
      fillRect: () => {},
      clearRect: () => {},
      getImageData: () => ({ data: new Uint8ClampedArray(0) }),
      putImageData: () => {},
      createImageData: () => ({ data: new Uint8ClampedArray(0) }),
      setTransform: () => {},
      drawImage: () => {},
      save: () => {},
      fillText: () => {},
      restore: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      closePath: () => {},
      stroke: () => {},
      translate: () => {},
      scale: () => {},
      rotate: () => {},
      arc: () => {},
      fill: () => {},
      measureText: () => ({ width: 0, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0 }),
      transform: () => {},
      rect: () => {},
      clip: () => {},
      canvas: this,
    } as unknown as CanvasRenderingContext2D;
  }
  return null;
} as any;

# markerViewPlugin.ts Refactor — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduzir markerViewPlugin.ts de 701 LOC para ~350 LOC extraindo o renderer de handle overlay SVG e a logica de drag em modulos independentes.

**Architecture:** Extrair 2 modulos: (1) `handleOverlayRenderer.ts` — classe que gerencia o overlay DOM, cria/atualiza/posiciona SVGs de drag handles, e faz o requestMeasure read/write cycle. Recebe estado (hoveredMarkerId, dragging) via parametros, nao guarda estado de hover/drag. (2) `dragManager.ts` — gerencia o ciclo de vida do drag: mousedown no overlay, mousemove com throttle + updateMarkerPosition, mouseup com cleanup. O `markerViewPlugin.ts` fica como orquestrador: lifecycle do ViewPlugin, hover state, event handlers de hover/selection, e delega rendering e drag.

**Tech Stack:** CodeMirror 6 (ViewPlugin, requestMeasure), SVG DOM, Vitest + jsdom

---

## Arquivos

| Arquivo | Acao | LOC estimado |
|---|---|---|
| `src/markdown/cm6/markerViewPlugin.ts` | Modificar (701 → ~350) | 350 |
| `src/markdown/cm6/handleOverlayRenderer.ts` | Criar | ~220 |
| `src/markdown/cm6/dragManager.ts` | Criar | ~130 |

**Nao muda**: markerStateField.ts, selectionMenuField.ts, hoverMenuExtension.ts, marginPanelExtension.ts, utils/, index.ts

**Consumer unico**: `index.ts` importa `createMarkerViewPlugin`, `SELECTION_EVENT`, `SelectionEventDetail` — nao muda.
`segmentEditor.ts` importa `createMarkerViewPlugin` — nao muda.
`hoverMenuExtension.ts` e `dragHandles.ts` referenciam em comentarios — nao muda.

---

## Chunk 1: Extrair HandleOverlayRenderer

A maior extracao — todo o rendering de SVG handles.

### Task 1: Criar handleOverlayRenderer.ts

**Files:**
- Create: `src/markdown/cm6/handleOverlayRenderer.ts`

- [ ] **Step 1: Criar handleOverlayRenderer.ts com a classe HandleOverlayRenderer**

```typescript
// src/markdown/cm6/handleOverlayRenderer.ts

import { EditorView } from "@codemirror/view";
import type { CodeMarkerModel } from "../models/codeMarkerModel";
import { getViewForFile } from "./utils/viewLookupUtils";

export interface HandleData {
	x: number; y: number; type: 'start' | 'end';
	markerId: string; color: string; isHovered: boolean;
	shouldShow: boolean; index: number;
	fontSize: number; lineHeight: number;
}

export interface HandleRenderState {
	fileId: string;
	hoveredMarkerId: string | null;
	hoveredMarkerIds: string[];
	dragging: { markerId: string; type: 'start' | 'end' } | null;
}

export class HandleOverlayRenderer {
	readonly overlayEl: HTMLDivElement;
	private handleElements = new Map<string, SVGSVGElement>();
	private _lastFontSize = 0;

	constructor(private model: CodeMarkerModel, scrollDOM: HTMLElement) {
		this.overlayEl = document.createElement('div');
		this.overlayEl.className = 'codemarker-handle-overlay';
		this.overlayEl.style.position = 'absolute';
		this.overlayEl.style.top = '0';
		this.overlayEl.style.left = '0';
		this.overlayEl.style.width = '100%';
		this.overlayEl.style.height = '0';
		this.overlayEl.style.overflow = 'visible';
		this.overlayEl.style.pointerEvents = 'none';
		this.overlayEl.style.zIndex = '10000';
		scrollDOM.style.position = 'relative';
		scrollDOM.appendChild(this.overlayEl);
	}

	/** Full render — used when NOT dragging */
	scheduleRender(view: EditorView, state: HandleRenderState): void {
		const { fileId, hoveredMarkerId, hoveredMarkerIds } = state;

		view.requestMeasure({
			key: 'codemarker-handle-overlay',
			read: (view) => {
				const settings = this.model.getSettings();
				const markers = this.model.getMarkersForFile(fileId);
				if (!markers || markers.length === 0) return null;

				const targetView = getViewForFile(fileId, this.model.plugin.app);
				if (!targetView?.editor) return null;

				const scrollRect = view.scrollDOM.getBoundingClientRect();
				const computedStyle = window.getComputedStyle(view.dom);
				const fontSize = parseFloat(computedStyle.fontSize);
				const lineHeight = parseFloat(computedStyle.lineHeight) || fontSize * 1.2;

				const handles: HandleData[] = [];

				for (let i = 0; i < markers.length; i++) {
					const m = markers[i];
					if (!m) continue;
					const isHovered = m.id === hoveredMarkerId || hoveredMarkerIds.includes(m.id);
					const shouldShow = !settings.showHandlesOnHover || isHovered;

					let handleColor = '#999';
					if (m.colorOverride) {
						handleColor = m.colorOverride;
					} else if (m.codes && m.codes.length > 0) {
						const def = this.model.registry.getByName(m.codes[0]!);
						if (def) handleColor = def.color;
					}

					try {
						const fromOffset = targetView.editor.posToOffset(m.range.from);
						const toOffset = targetView.editor.posToOffset(m.range.to);
						const fromCoords = view.coordsAtPos(fromOffset);
						const toCoords = view.coordsAtPos(toOffset);

						if (fromCoords) {
							handles.push({
								x: fromCoords.left - scrollRect.left + view.scrollDOM.scrollLeft,
								y: fromCoords.top - scrollRect.top + view.scrollDOM.scrollTop,
								type: 'start', markerId: m.id, color: handleColor,
								isHovered, shouldShow, index: i,
								fontSize, lineHeight
							});
						}
						if (toCoords) {
							handles.push({
								x: toCoords.left - scrollRect.left + view.scrollDOM.scrollLeft,
								y: toCoords.top - scrollRect.top + view.scrollDOM.scrollTop,
								type: 'end', markerId: m.id, color: handleColor,
								isHovered, shouldShow, index: i,
								fontSize, lineHeight
							});
						}
					} catch { /* skip marker */ }
				}

				return { handles };
			},
			write: (result: { handles: HandleData[] } | null) => {
				this.applyHandles(result);
			}
		});
	}

	/** Fast path — during drag, only reposition the dragged marker's handles */
	scheduleDragRender(view: EditorView, fileId: string, dragMarkerId: string): void {
		view.requestMeasure({
			key: 'codemarker-handle-overlay',
			read: (view) => {
				const marker = this.model.getMarkerById(dragMarkerId);
				if (!marker) return null;

				const targetView = getViewForFile(fileId, this.model.plugin.app);
				if (!targetView?.editor) return null;

				const scrollRect = view.scrollDOM.getBoundingClientRect();

				try {
					const fromOffset = targetView.editor.posToOffset(marker.range.from);
					const toOffset = targetView.editor.posToOffset(marker.range.to);
					const fromCoords = view.coordsAtPos(fromOffset);
					const toCoords = view.coordsAtPos(toOffset);

					const computedStyle = window.getComputedStyle(view.dom);
					const fontSize = parseFloat(computedStyle.fontSize);
					const lineHeight = parseFloat(computedStyle.lineHeight) || fontSize * 1.2;

					return {
						markerId: dragMarkerId,
						startX: fromCoords ? fromCoords.left - scrollRect.left + view.scrollDOM.scrollLeft : null,
						startY: fromCoords ? fromCoords.top - scrollRect.top + view.scrollDOM.scrollTop : null,
						endX: toCoords ? toCoords.left - scrollRect.left + view.scrollDOM.scrollLeft : null,
						endY: toCoords ? toCoords.top - scrollRect.top + view.scrollDOM.scrollTop : null,
						fontSize, lineHeight
					};
				} catch { return null; }
			},
			write: (result: { markerId: string; startX: number | null; startY: number | null; endX: number | null; endY: number | null; fontSize: number; lineHeight: number } | null) => {
				if (!result) return;
				const ballSize = result.fontSize * 0.75;
				const startSvg = this.handleElements.get(result.markerId + '-start');
				if (startSvg && result.startX !== null && result.startY !== null) {
					startSvg.style.left = `${result.startX - ballSize / 2}px`;
					startSvg.style.top = `${result.startY - result.lineHeight * 0.3}px`;
				}
				const endSvg = this.handleElements.get(result.markerId + '-end');
				if (endSvg && result.endX !== null && result.endY !== null) {
					endSvg.style.left = `${result.endX - ballSize / 2}px`;
					endSvg.style.top = `${result.endY - result.lineHeight * 0.3}px`;
				}
			}
		});
	}

	destroy(): void {
		this.handleElements.clear();
		this.overlayEl.remove();
	}

	// ─── Private rendering ────────────────────────────────────

	private applyHandles(result: { handles: HandleData[] } | null): void {
		// Invalidate cache when font size changes
		if (result && result.handles.length > 0) {
			const newFontSize = result.handles[0]!.fontSize;
			if (this._lastFontSize && this._lastFontSize !== newFontSize) {
				for (const [, svg] of this.handleElements) {
					svg.remove();
				}
				this.handleElements.clear();
			}
			this._lastFontSize = newFontSize;
		}

		if (!result || result.handles.length === 0) {
			for (const [, svg] of this.handleElements) {
				svg.remove();
			}
			this.handleElements.clear();
			return;
		}

		const seen = new Set<string>();
		for (const h of result.handles) {
			const key = h.markerId + '-' + h.type;
			seen.add(key);
			const existing = this.handleElements.get(key);
			if (existing) {
				this.updateHandlePosition(existing, h);
			} else {
				const svg = this.createHandleSVG(h);
				this.handleElements.set(key, svg);
			}
		}
		// Remove stale handles
		for (const [key, svg] of this.handleElements) {
			if (!seen.has(key)) {
				svg.remove();
				this.handleElements.delete(key);
			}
		}
	}

	private updateHandlePosition(svg: SVGSVGElement, h: HandleData): void {
		const ballSize = h.fontSize * 0.75;
		svg.style.left = `${h.x - ballSize / 2}px`;
		svg.style.top = `${h.y - h.lineHeight * 0.3}px`;
		svg.style.pointerEvents = h.shouldShow ? 'auto' : 'none';
		svg.style.zIndex = (10000 + h.index).toString();
		svg.classList.toggle('codemarker-handle-hidden', !h.shouldShow);
		svg.classList.toggle('codemarker-handle-visible', h.shouldShow && h.isHovered);
	}

	private createHandleSVG(h: HandleData): SVGSVGElement {
		const { x, y, type, markerId, color, isHovered, shouldShow, index, fontSize, lineHeight } = h;

		const ballSize = fontSize * 0.75;
		const barWidth = fontSize * 0.125;
		const barLength = lineHeight * 1.1;
		const zIndex = 10000 + index;

		let displayColor = color;
		if (color.startsWith('#')) {
			const r = parseInt(color.slice(1, 3), 16);
			const g = parseInt(color.slice(3, 5), 16);
			const b = parseInt(color.slice(5, 7), 16);
			displayColor = `rgb(${r}, ${g}, ${b})`;
		}

		const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		svg.setAttribute("width", `${ballSize}px`);
		svg.setAttribute("height", `${lineHeight * 2}px`);
		svg.style.position = 'absolute';
		svg.style.left = `${x - ballSize / 2}px`;
		svg.style.top = `${y - lineHeight * 0.3}px`;
		svg.style.overflow = 'visible';
		svg.style.pointerEvents = shouldShow ? 'auto' : 'none';
		svg.style.zIndex = zIndex.toString();
		svg.style.transformOrigin = 'center';
		svg.classList.add('codemarker-handle-svg');
		svg.setAttribute('data-marker-id', markerId);
		svg.setAttribute('data-handle-type', type);

		if (!shouldShow) {
			svg.classList.add('codemarker-handle-hidden');
		} else if (isHovered) {
			svg.classList.add('codemarker-handle-visible');
		}

		svg.style.cursor = type === 'start' ? 'w-resize' : 'e-resize';

		const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
		const groupY = type === 'start' ? lineHeight * 0.1 : lineHeight * 0.3;
		group.setAttribute("transform", `translate(${ballSize / 2}, ${groupY})`);

		const line = document.createElementNS("http://www.w3.org/2000/svg", "rect");
		line.setAttribute("x", `${-barWidth / 2}`);
		line.setAttribute("y", "0");
		line.setAttribute("width", `${barWidth}`);
		line.setAttribute("height", `${barLength}`);
		line.setAttribute("rx", `${barWidth / 2}`);
		line.setAttribute("fill", displayColor);
		line.classList.add("codemarker-line");
		line.setAttribute('data-marker-id', markerId);
		line.setAttribute('data-handle-type', type);

		const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
		circle.setAttribute("cx", "0");
		circle.setAttribute("cy", type === 'start' ? "0" : `${barLength}`);
		circle.setAttribute("r", `${ballSize / 2}`);
		circle.setAttribute("fill", displayColor);
		circle.setAttribute("stroke", "white");
		circle.setAttribute("stroke-width", `${barWidth * 0.75}`);
		circle.classList.add("codemarker-circle");
		circle.setAttribute('data-marker-id', markerId);
		circle.setAttribute('data-handle-type', type);

		group.appendChild(line);
		group.appendChild(circle);
		svg.appendChild(group);
		this.overlayEl.appendChild(svg);
		return svg;
	}
}
```

- [ ] **Step 2: Rodar build para confirmar que compila**

Run: `npm run build`
Expected: PASS (arquivo novo, ninguem importa ainda)

- [ ] **Step 3: Commit**

```bash
git add src/markdown/cm6/handleOverlayRenderer.ts
~/.claude/scripts/commit.sh "refactor: cria HandleOverlayRenderer com rendering SVG de drag handles"
```

### Task 2: Atualizar markerViewPlugin.ts para usar HandleOverlayRenderer

**Files:**
- Modify: `src/markdown/cm6/markerViewPlugin.ts`

- [ ] **Step 1: Substituir handle rendering por HandleOverlayRenderer**

No construtor da classe ViewPlugin:
- Remover criacao manual do overlay div
- Criar instancia de `HandleOverlayRenderer`
- Manter os event listeners no overlay (mousedown, mousemove) no plugin — eles precisam do estado de hover/drag

Imports a adicionar:
```typescript
import { HandleOverlayRenderer } from './handleOverlayRenderer';
```

Imports a remover (nao mais usados diretamente no plugin):
```typescript
// Remover getViewForFile — agora importado apenas em handleOverlayRenderer.ts e dragManager.ts
```

Propriedades a remover do plugin:
```typescript
// Remover:
// handleOverlay: HTMLDivElement | null = null;
// private handleElements = new Map<string, SVGSVGElement>();
// private _lastFontSize: number = 0;
```

Propriedade a adicionar:
```typescript
private renderer: HandleOverlayRenderer;
```

No construtor, substituir `this.createHandleOverlay(view)` por:
```typescript
this.renderer = new HandleOverlayRenderer(model, view.scrollDOM);
this.setupOverlayListeners(view);
```

O metodo `createHandleOverlay` vira `setupOverlayListeners` — so os event listeners:
```typescript
private setupOverlayListeners(view: EditorView) {
	// mousedown para drag initiation (mesmo codigo atual, mas usa this.renderer.overlayEl)
	const onMouseDown = (event: MouseEvent) => { ... };
	this.renderer.overlayEl.addEventListener('mousedown', onMouseDown);
	this.cleanup.push(() => this.renderer.overlayEl.removeEventListener('mousedown', onMouseDown));

	// hover maintenance no overlay
	const onOverlayMouseMove = (event: MouseEvent) => { ... };
	this.renderer.overlayEl.addEventListener('mousemove', onOverlayMouseMove);
	this.cleanup.push(() => this.renderer.overlayEl.removeEventListener('mousemove', onOverlayMouseMove));
}
```

Metodos a remover (movidos para renderer):
- `scheduleHandleOverlayRender` → `this.renderer.scheduleRender`
- `updateDraggedHandlePosition` → `this.renderer.scheduleDragRender`
- `updateHandlePosition` → removido (privado no renderer)
- `createHandleSVG` → removido (privado no renderer)

No metodo `update()`, substituir:
```typescript
// Antes:
this.updateDraggedHandlePosition(update.view);
// Depois:
this.renderer.scheduleDragRender(update.view, this.fileId!, this.dragging.markerId);

// Antes:
this.scheduleHandleOverlayRender(update.view);
// Depois:
this.renderer.scheduleRender(update.view, {
	fileId: this.fileId!,
	hoveredMarkerId: this.hoveredMarkerId,
	hoveredMarkerIds: this.hoveredMarkerIds,
	dragging: this.dragging,
});
```

No metodo `destroy()`, substituir:
```typescript
// Antes:
this.handleElements.clear();
this.handleOverlay?.remove();
this.handleOverlay = null;
// Depois:
this.renderer.destroy();
```

- [ ] **Step 2: Rodar build + testes**

Run: `npm run build && npm run test`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/markdown/cm6/markerViewPlugin.ts
~/.claude/scripts/commit.sh "refactor: markerViewPlugin delega rendering para HandleOverlayRenderer"
```

---

## Chunk 2: Extrair DragManager

### Task 3: Criar dragManager.ts

**Files:**
- Create: `src/markdown/cm6/dragManager.ts`

- [ ] **Step 1: Criar dragManager.ts**

Extrair a logica de drag: initiation, mousemove com throttle + position update, mouseup cleanup. O DragManager nao depende de ViewPlugin — recebe callbacks.

```typescript
// src/markdown/cm6/dragManager.ts

import { EditorView } from "@codemirror/view";
import { startDragEffect, updateDragEffect, endDragEffect } from "./markerStateField";
import type { CodeMarkerModel } from "../models/codeMarkerModel";
import { getViewForFile } from "./utils/viewLookupUtils";

export interface DragState {
	markerId: string;
	type: 'start' | 'end';
}

export class DragManager {
	current: DragState | null = null;
	private _lastDragUpdate = 0;

	constructor(private model: CodeMarkerModel) {}

	/** Start drag from overlay mousedown */
	start(view: EditorView, markerId: string, type: 'start' | 'end'): void {
		this.current = { markerId, type };

		document.body.classList.add('codemarker-dragging');
		document.body.classList.add(type === 'start' ? 'codemarker-dragging-start' : 'codemarker-dragging-end');

		view.dispatch({
			effects: startDragEffect.of({ markerId, type })
		});

		// Document-level mouseup to ensure drag always ends
		const onDocMouseUp = () => {
			document.removeEventListener('mouseup', onDocMouseUp, true);
			if (this.current) {
				this.end(view, this.current.markerId);
			}
		};
		document.addEventListener('mouseup', onDocMouseUp, true);
	}

	/** Handle mousemove during drag — throttled to ~60fps. Returns true if event was handled. */
	move(view: EditorView, event: MouseEvent, fileId: string): boolean {
		if (!this.current) return false;

		event.preventDefault();
		const now = Date.now();
		if (now - this._lastDragUpdate < 16) return true;
		this._lastDragUpdate = now;

		const coords = { x: event.clientX, y: event.clientY };
		let pos = view.posAtCoords(coords);
		if (pos === null) pos = view.posAtCoords(coords, false);

		if (pos !== null) {
			this.updateMarkerPosition(view, fileId, this.current.markerId, pos, this.current.type);
			view.dispatch({
				effects: updateDragEffect.of({
					markerId: this.current.markerId,
					pos,
					type: this.current.type
				})
			});
		}

		return true;
	}

	/** End drag */
	end(view: EditorView, markerId: string): void {
		this.current = null;
		document.body.classList.remove('codemarker-dragging', 'codemarker-dragging-start', 'codemarker-dragging-end');
		view.dispatch({
			effects: endDragEffect.of({ markerId })
		});
	}

	/** Update marker range boundary during drag */
	private updateMarkerPosition(view: EditorView, fileId: string, markerId: string, newPos: number, type: 'start' | 'end'): void {
		const marker = this.model.getMarkerById(markerId);
		if (!marker || marker.fileId !== fileId) return;

		try {
			const targetView = getViewForFile(fileId, this.model.plugin.app);
			if (!targetView?.editor) return;

			const newPosConverted = targetView.editor.offsetToPos(newPos);
			if (!newPosConverted) return;

			const updatedMarker = { ...marker };

			if (type === 'start') {
				if (this.model.isPositionBefore(newPosConverted, marker.range.to) ||
					(newPosConverted.line === marker.range.to.line && newPosConverted.ch === marker.range.to.ch)) {
					updatedMarker.range.from = newPosConverted;
				}
			} else {
				if (this.model.isPositionAfter(newPosConverted, marker.range.from) ||
					(newPosConverted.line === marker.range.from.line && newPosConverted.ch === marker.range.from.ch)) {
					updatedMarker.range.to = newPosConverted;
				}
			}

			updatedMarker.updatedAt = Date.now();
			this.model.updateMarker(updatedMarker);
			this.model.updateMarkersForFile(fileId);

		} catch (e) {
			console.warn(`QualiaCoding: Error updating marker position`, e);
		}
	}
}
```

- [ ] **Step 2: Rodar build para confirmar que compila**

Run: `npm run build`
Expected: PASS (arquivo novo, ninguem importa ainda)

- [ ] **Step 3: Commit**

```bash
git add src/markdown/cm6/dragManager.ts
~/.claude/scripts/commit.sh "refactor: cria DragManager para ciclo de vida do drag de markers"
```

### Task 4: Atualizar markerViewPlugin.ts para usar DragManager

**Files:**
- Modify: `src/markdown/cm6/markerViewPlugin.ts`

- [ ] **Step 1: Substituir drag logic por DragManager**

Imports a adicionar:
```typescript
import { DragManager } from './dragManager';
```

Imports a remover:
```typescript
// startDragEffect, updateDragEffect, endDragEffect — agora encapsulados no DragManager
// getViewForFile — agora encapsulado no renderer e dragManager
```

Propriedades a remover:
```typescript
// Remover:
// dragging: { markerId: string, type: 'start' | 'end' } | null = null;
// _lastDragUpdate: number = 0;
```

Propriedade a adicionar:
```typescript
private drag: DragManager;
```

No construtor:
```typescript
this.drag = new DragManager(model);
```

No `setupOverlayListeners`, substituir o mousedown handler:
```typescript
const onMouseDown = (event: MouseEvent) => {
	const target = event.target as Element;
	if (!target.closest('.codemarker-handle-svg')) return;

	const markerId = target.getAttribute('data-marker-id') ||
		target.closest('[data-marker-id]')?.getAttribute('data-marker-id');
	const handleType = target.getAttribute('data-handle-type') ||
		target.closest('[data-handle-type]')?.getAttribute('data-handle-type');

	if (markerId && handleType && (handleType === 'start' || handleType === 'end')) {
		event.preventDefault();
		event.stopPropagation();
		this.drag.start(view, markerId, handleType as 'start' | 'end');
	}
};
```

No eventHandlers.mousemove, substituir o bloco de drag:
```typescript
// Antes:
if (this.dragging) { ... }
// Depois:
if (this.drag.current) {
	return this.drag.move(view, event, this.fileId!);
}
```

No eventHandlers.mouseup, substituir:
```typescript
// Antes:
if (this.dragging) { ... }
// Depois:
if (this.drag.current) {
	const markerId = this.drag.current.markerId;
	this.drag.end(view, markerId);
	return true;
}
```

No `update()`, substituir:
```typescript
// Antes:
if (this.dragging) {
// Depois:
if (this.drag.current) {
```

Remover metodo `updateMarkerPosition` inteiro (movido para DragManager).

No `destroy()`:
```typescript
// Antes:
this.dragging = null;
// Depois:
// drag state limpo automaticamente (ou: nao precisa — DragManager nao tem cleanup pendente)
```

- [ ] **Step 2: Rodar build + testes**

Run: `npm run build && npm run test`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/markdown/cm6/markerViewPlugin.ts
~/.claude/scripts/commit.sh "refactor: markerViewPlugin delega drag para DragManager"
```

---

## Chunk 3: Docs e cleanup

### Task 5: Atualizar docs

**Files:**
- Modify: `CLAUDE.md` — atualizar secao markdown/

- [ ] **Step 1: Atualizar CLAUDE.md secao markdown/**

Na secao de estrutura, expandir a linha do markdown:
```
  markdown/                  — CodeMirror 6 engine para markdown
    cm6/
      markerViewPlugin.ts    — ViewPlugin orquestrador (~350 LOC): hover, selection, lifecycle
      handleOverlayRenderer.ts — SVG drag handles: create, position, render cycle (requestMeasure)
      dragManager.ts         — ciclo de vida do drag: start, move (throttled), end, position update
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
~/.claude/scripts/commit.sh "docs: atualiza estrutura markdown/cm6 apos split markerViewPlugin"
```

---

## Verificacao final

- `npm run build` — zero erros TS
- `npm run test` — todos os 1248+ testes passam
- `markerViewPlugin.ts` caiu de 701 para ~350 LOC
- Nenhum consumer externo quebrou (`index.ts` e `segmentEditor.ts` importam `createMarkerViewPlugin` — continua funcionando)
- 2 novos arquivos focados: handleOverlayRenderer (~220), dragManager (~130)

## Notas importantes

- `SELECTION_EVENT` e `SelectionEventDetail` continuam exportados de `markerViewPlugin.ts` — sao usados por `index.ts`
- `HandleData` passa a ser exportado de `handleOverlayRenderer.ts` (era interface privada)
- `CodeMarkerModel.plugin` e publico — DragManager e HandleOverlayRenderer acessam `model.plugin.app` sem problemas
- `scheduleRender()` e `scheduleDragRender()` sao metodos publicos do HandleOverlayRenderer — chamados pelo plugin no `update()`
- O overlay div e criado pelo renderer mas os event listeners (mousedown, mousemove) ficam no plugin — eles precisam de acesso ao estado de hover/drag
- `getViewForFile` e `findFileIdForEditorView` ficam importados onde sao usados: renderer usa `getViewForFile` para resolver coordenadas, plugin usa `findFileIdForEditorView` para identificar o arquivo
- O `handleOverlay` referenciado nos cleanup listeners do plugin muda para `this.renderer.overlayEl`
- O pattern `this.dragging` muda para `this.drag.current` em todos os checks

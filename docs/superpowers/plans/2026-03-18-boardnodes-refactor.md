# boardNodes.ts Refactor — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduzir boardNodes.ts de 816 LOC para ~200 LOC extraindo helpers compartilhados e separando cada node type em seu proprio arquivo.

**Architecture:** Extrair 3 camadas: (1) `boardNodeHelpers.ts` com factories de Fabric.js objects reusaveis (bg card, textbox, accent bar, source badges, theme), (2) um arquivo por node type com create+get+data interface, (3) `boardNodes.ts` como barrel re-export. Os `as unknown as` sao inevitaveis (Fabric.js nao suporta custom properties em tipos) mas ficam isolados num helper `assignNodeProps`.

**Tech Stack:** Fabric.js 6.x, TypeScript strict, Vitest + jsdom

---

## Chunk 1: Helpers e testes dos getters existentes

### Task 1: Criar boardNodeHelpers.ts com factories compartilhadas

**Files:**
- Create: `src/analytics/board/boardNodeHelpers.ts`

Padroes repetidos em todos os 6 node creators que viram helpers:

- [ ] **Step 1: Criar arquivo com helpers de theme e card background**

```typescript
// src/analytics/board/boardNodeHelpers.ts

import { Rect, Textbox, Shadow, type FabricObject, type Group, type Canvas } from "fabric";

// ─── Theme ───

export function isDarkTheme(): boolean {
  return document.body.classList.contains("theme-dark");
}

export function themeColor(dark: string, light: string): string {
  return isDarkTheme() ? dark : light;
}

// ─── Card Background ───

export interface CardBgOptions {
  width: number;
  height: number;
  fill?: string;
  rx?: number;
  ry?: number;
  stroke?: string;
  strokeWidth?: number;
  strokeDashArray?: number[];
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
}

export function createCardBg(opts: CardBgOptions): Rect {
  const isDark = isDarkTheme();
  return new Rect({
    width: opts.width,
    height: opts.height,
    fill: opts.fill ?? themeColor("#1e1e22", "#ffffff"),
    rx: opts.rx ?? 6,
    ry: opts.ry ?? 6,
    shadow: new Shadow({
      color: "rgba(0,0,0,0.15)",
      blur: opts.shadowBlur ?? 6,
      offsetX: opts.shadowOffsetX ?? 1,
      offsetY: opts.shadowOffsetY ?? 2,
    }),
    stroke: opts.stroke ?? themeColor("#444", "#ddd"),
    strokeWidth: opts.strokeWidth ?? 1,
    strokeDashArray: opts.strokeDashArray,
  });
}

// ─── Textbox ───

export interface CardTextOptions {
  text: string;
  width: number;
  left: number;
  top: number;
  fontSize?: number;
  fontWeight?: string;
  fill?: string;
  textAlign?: string;
  editable?: boolean;
}

export function createCardText(opts: CardTextOptions): Textbox {
  return new Textbox(opts.text, {
    width: opts.width,
    fontSize: opts.fontSize ?? 12,
    fontFamily: "sans-serif",
    fontWeight: opts.fontWeight,
    fill: opts.fill ?? themeColor("#ddd", "#333"),
    left: opts.left,
    top: opts.top,
    editable: opts.editable ?? false,
    textAlign: opts.textAlign,
    splitByGrapheme: false,
  });
}

// ─── Source Badges (reusado em codeCard; excerpt usa code chips, nao badges) ───

export const SOURCE_BADGE_LABELS: Record<string, string> = {
  markdown: "MD", "csv-segment": "CSV", "csv-row": "ROW",
  image: "IMG", pdf: "PDF", audio: "AUD", video: "VID",
};

export const SOURCE_BADGE_COLORS: Record<string, string> = {
  markdown: "#42A5F5", "csv-segment": "#66BB6A", "csv-row": "#81C784",
  image: "#FFA726", pdf: "#EF5350", audio: "#AB47BC", video: "#00ACC1",
};

export function createSourceBadges(sources: string[], startX: number, y: number, containerW: number): FabricObject[] {
  const objects: FabricObject[] = [];
  const totalBadgeW = sources.length * 30 + (sources.length - 1) * 4;
  let bx = (containerW - totalBadgeW) / 2;
  // Se startX fornecido e nao centrado, usar startX
  if (startX > 0) bx = startX;

  for (const src of sources) {
    const badgeBg = new Rect({
      width: 28, height: 14,
      fill: SOURCE_BADGE_COLORS[src] ?? "#888",
      rx: 3, ry: 3,
      left: bx, top: y,
    });
    objects.push(badgeBg);

    const badgeLabel = new Textbox(SOURCE_BADGE_LABELS[src] ?? src.slice(0, 3).toUpperCase(), {
      width: 28, fontSize: 8,
      fontFamily: "sans-serif", fontWeight: "bold",
      fill: "#fff",
      left: bx, top: y + 1,
      editable: false, textAlign: "center",
    });
    objects.push(badgeLabel);
    bx += 32;
  }
  return objects;
}

// ─── Node property assignment ───

export function assignNodeProps<T extends Record<string, unknown>>(
  group: Group, props: T
): void {
  const obj = group as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(props)) {
    obj[key] = value;
  }
}

// ─── Finalize node (add to canvas + render) ───

export function finalizeNode(canvas: Canvas, group: Group, sendToBack = false): void {
  canvas.add(group);
  if (sendToBack) canvas.sendObjectToBack(group);
  canvas.requestRenderAll();
}
```

- [ ] **Step 2: Rodar build para confirmar que compila**

Run: `npm run build`
Expected: PASS (arquivo novo, ninguem importa ainda)

- [ ] **Step 3: Commit**

```bash
git add src/analytics/board/boardNodeHelpers.ts
~/.claude/scripts/commit.sh "refactor: cria boardNodeHelpers com factories compartilhadas (theme, cardBg, textbox, badges)"
```

### Task 2: Testes para os 6 getters existentes (get*Data)

Antes de refatorar os creators, testar os getters para garantir que a round-trip serialization nao quebra.

**Files:**
- Create: `tests/analytics/boardNodes.test.ts`

- [ ] **Step 1: Escrever testes para todos os 6 get*Data**

```typescript
// tests/analytics/boardNodes.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Group, Rect, Textbox } from "fabric";

// Mock fabric com classes minimas
vi.mock("fabric", () => {
  class FabricObject {
    [key: string]: unknown;
    constructor(opts?: Record<string, unknown>) { Object.assign(this, opts); }
    set(opts: Record<string, unknown>) { Object.assign(this, opts); }
  }
  class MockRect extends FabricObject { }
  class MockTextbox extends FabricObject {
    text: string;
    constructor(text: string, opts?: Record<string, unknown>) {
      super(opts);
      this.text = text;
    }
  }
  class MockGroup extends FabricObject {
    private _objects: FabricObject[];
    left: number;
    top: number;
    scaleX = 1;
    scaleY = 1;
    constructor(objects: FabricObject[], opts?: Record<string, unknown>) {
      super(opts);
      this._objects = objects;
      this.left = (opts?.left as number) ?? 0;
      this.top = (opts?.top as number) ?? 0;
    }
    getObjects() { return this._objects; }
    getBoundingRect() { return { width: 200, height: 150 }; }
  }
  class MockShadow extends FabricObject { }
  class MockFabricImage extends FabricObject {
    static fromURL = vi.fn().mockResolvedValue(new MockFabricImage({ width: 100, height: 100 }));
  }
  class MockCanvas extends FabricObject {
    add = vi.fn();
    requestRenderAll = vi.fn();
    sendObjectToBack = vi.fn();
    setActiveObject = vi.fn();
    on = vi.fn();
    off = vi.fn();
  }
  return {
    Rect: MockRect,
    Textbox: MockTextbox,
    Group: MockGroup,
    Shadow: MockShadow,
    FabricImage: MockFabricImage,
    Canvas: MockCanvas,
    FabricObject: FabricObject,
  };
});

import {
  createStickyNote, getStickyData,
  createSnapshotNode, getSnapshotData,
  createExcerptNode, getExcerptData,
  createCodeCardNode, getCodeCardData,
  createKpiCardNode, getKpiCardData,
  createClusterFrame, getClusterFrameData,
  type StickyNoteData, type SnapshotNodeData,
  type ExcerptNodeData, type CodeCardNodeData,
  type KpiCardNodeData, type ClusterFrameData,
} from "../../src/analytics/board/boardNodes";
import { Canvas } from "fabric";

function makeCanvas() { return new Canvas() as unknown as import("fabric").Canvas; }

describe("boardNodes round-trip", () => {
  describe("sticky", () => {
    const data: StickyNoteData = { id: "s1", x: 10, y: 20, width: 200, height: 150, text: "hello", color: "blue" };

    it("getStickyData returns null for non-sticky", () => {
      const group = new Group([], {}) as unknown as import("fabric").Group;
      expect(getStickyData(group)).toBeNull();
    });

    it("round-trips sticky note data", () => {
      const group = createStickyNote(makeCanvas(), data);
      const result = getStickyData(group as unknown as import("fabric").Group);
      expect(result).not.toBeNull();
      expect(result!.id).toBe("s1");
      expect(result!.text).toBe("hello");
      expect(result!.color).toBe("blue");
    });
  });

  describe("snapshot", () => {
    const data: SnapshotNodeData = { id: "sn1", x: 0, y: 0, width: 280, height: 180, title: "Chart", dataUrl: "data:png", viewMode: "frequency", createdAt: 1000 };

    it("getSnapshotData returns null for non-snapshot", () => {
      const group = new Group([], {}) as unknown as import("fabric").Group;
      expect(getSnapshotData(group)).toBeNull();
    });

    it("round-trips snapshot data", async () => {
      const group = await createSnapshotNode(makeCanvas(), data);
      const result = getSnapshotData(group as unknown as import("fabric").Group);
      expect(result).not.toBeNull();
      expect(result!.id).toBe("sn1");
      expect(result!.title).toBe("Chart");
      expect(result!.viewMode).toBe("frequency");
    });
  });

  describe("excerpt", () => {
    const data: ExcerptNodeData = { id: "e1", x: 0, y: 0, width: 260, text: "some text", file: "path/note.md", source: "markdown", location: "L1-5", codes: ["A"], codeColors: ["#f00"], createdAt: 1000 };

    it("round-trips excerpt data", () => {
      const group = createExcerptNode(makeCanvas(), data);
      const result = getExcerptData(group as unknown as import("fabric").Group);
      expect(result).not.toBeNull();
      expect(result!.text).toBe("some text");
      expect(result!.codes).toEqual(["A"]);
    });
  });

  describe("codeCard", () => {
    const data: CodeCardNodeData = { id: "cc1", x: 0, y: 0, codeName: "Emotion", color: "#f00", description: "desc", markerCount: 5, sources: ["markdown"], createdAt: 1000 };

    it("round-trips codeCard data", () => {
      const group = createCodeCardNode(makeCanvas(), data);
      const result = getCodeCardData(group as unknown as import("fabric").Group);
      expect(result).not.toBeNull();
      expect(result!.codeName).toBe("Emotion");
      expect(result!.markerCount).toBe(5);
    });
  });

  describe("kpiCard", () => {
    const data: KpiCardNodeData = { id: "k1", x: 0, y: 0, value: "42", label: "Total", accent: "#00f", createdAt: 1000 };

    it("round-trips kpiCard data", () => {
      const group = createKpiCardNode(makeCanvas(), data);
      const result = getKpiCardData(group as unknown as import("fabric").Group);
      expect(result).not.toBeNull();
      expect(result!.value).toBe("42");
      expect(result!.label).toBe("Total");
    });
  });

  describe("clusterFrame", () => {
    const data: ClusterFrameData = { id: "cl1", x: 0, y: 0, width: 300, height: 200, label: "Group A", color: "rgba(100,100,255,0.1)", codeNames: ["A", "B"] };

    it("round-trips clusterFrame data", () => {
      const group = createClusterFrame(makeCanvas(), data);
      const result = getClusterFrameData(group as unknown as import("fabric").Group);
      expect(result).not.toBeNull();
      expect(result!.label).toBe("Group A");
      expect(result!.codeNames).toEqual(["A", "B"]);
    });
  });
});
```

- [ ] **Step 2: Rodar testes para confirmar que passam**

Run: `npm run test -- --reporter=verbose tests/analytics/boardNodes.test.ts`
Expected: 8+ testes passando

- [ ] **Step 3: Commit**

```bash
git add tests/analytics/boardNodes.test.ts
~/.claude/scripts/commit.sh "test: adiciona testes round-trip para 6 tipos de board node"
```

---

## Chunk 2: Separar node types em arquivos individuais

### Task 3: Extrair stickyNode.ts

**Files:**
- Create: `src/analytics/board/nodes/stickyNode.ts`
- Modify: `src/analytics/board/boardNodes.ts` — remover sticky code, re-exportar de nodes/

- [ ] **Step 1: Criar nodes/stickyNode.ts**

Mover linhas 6-122 do boardNodes.ts: `StickyNoteData`, `STICKY_COLORS`, `DEFAULT_STICKY_COLOR`, `nextNoteId`, `createStickyNote`, `getStickyData`, `setStickyColor`, `enableStickyEditing`.

Usar helpers de `boardNodeHelpers.ts` onde aplicavel:
- `createStickyNote`: substituir `new Rect(...)` por `createCardBg(...)` (nao se aplica — sticky usa cor custom sem shadow padrao)
- `assignNodeProps` para o bloco de property assignment
- `finalizeNode` para o canvas.add + requestRenderAll

- [ ] **Step 2: Atualizar boardNodes.ts para re-exportar de nodes/stickyNode.ts**

- [ ] **Step 3: Rodar testes**

Run: `npm run test -- tests/analytics/boardNodes.test.ts`
Expected: PASS

- [ ] **Step 4: Rodar build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/analytics/board/nodes/stickyNode.ts src/analytics/board/boardNodes.ts
~/.claude/scripts/commit.sh "refactor: extrai stickyNode.ts do boardNodes"
```

### Task 4: Extrair snapshotNode.ts

**Files:**
- Create: `src/analytics/board/nodes/snapshotNode.ts`
- Modify: `src/analytics/board/boardNodes.ts`

Mesmo padrao da Task 3. Mover: `SnapshotNodeData`, `nextSnapshotId`, `createSnapshotNode`, `getSnapshotData`.

Usar helpers: `createCardBg`, `createCardText`, `assignNodeProps`, `finalizeNode`.

- [ ] **Step 1: Criar nodes/snapshotNode.ts usando helpers**
- [ ] **Step 2: Atualizar boardNodes.ts re-exports**
- [ ] **Step 3: Rodar testes + build**
- [ ] **Step 4: Commit**

### Task 5: Extrair excerptNode.ts

**Files:**
- Create: `src/analytics/board/nodes/excerptNode.ts`
- Modify: `src/analytics/board/boardNodes.ts`

Mover: `ExcerptNodeData`, `nextExcerptId`, `createExcerptNode`, `getExcerptData`.

Usar helpers: `createCardBg`, `createCardText`, `SOURCE_BADGE_COLORS`, `assignNodeProps`, `finalizeNode`. Nota: excerpt usa code chips (dots + labels), NAO source badges.

- [ ] **Step 1: Criar nodes/excerptNode.ts usando helpers**
- [ ] **Step 2: Atualizar boardNodes.ts re-exports**
- [ ] **Step 3: Rodar testes + build**
- [ ] **Step 4: Commit**

### Task 6: Extrair codeCardNode.ts

**Files:**
- Create: `src/analytics/board/nodes/codeCardNode.ts`
- Modify: `src/analytics/board/boardNodes.ts`

Mover: `CodeCardNodeData`, `nextCodeCardId`, `createCodeCardNode`, `getCodeCardData`.

Usar helpers: `createCardBg`, `createCardText`, `createSourceBadges`, `assignNodeProps`, `finalizeNode`.

- [ ] **Step 1: Criar nodes/codeCardNode.ts usando helpers**
- [ ] **Step 2: Atualizar boardNodes.ts re-exports**
- [ ] **Step 3: Rodar testes + build**
- [ ] **Step 4: Commit**

### Task 7: Extrair kpiCardNode.ts

**Files:**
- Create: `src/analytics/board/nodes/kpiCardNode.ts`
- Modify: `src/analytics/board/boardNodes.ts`

Mover: `KpiCardNodeData`, `nextKpiCardId`, `createKpiCardNode`, `getKpiCardData`.

- [ ] **Step 1: Criar nodes/kpiCardNode.ts usando helpers**
- [ ] **Step 2: Atualizar boardNodes.ts re-exports**
- [ ] **Step 3: Rodar testes + build**
- [ ] **Step 4: Commit**

### Task 8: Extrair clusterFrameNode.ts

**Files:**
- Create: `src/analytics/board/nodes/clusterFrameNode.ts`
- Modify: `src/analytics/board/boardNodes.ts`

Mover: `ClusterFrameData`, `nextClusterFrameId`, `createClusterFrame`, `getClusterFrameData`.

- [ ] **Step 1: Criar nodes/clusterFrameNode.ts usando helpers**
- [ ] **Step 2: Atualizar boardNodes.ts re-exports**
- [ ] **Step 3: Rodar testes + build**
- [ ] **Step 4: Commit**

### Task 9: Converter boardNodes.ts em barrel re-export

**Files:**
- Modify: `src/analytics/board/boardNodes.ts` — vira barrel (~30 LOC)

- [ ] **Step 1: Reescrever boardNodes.ts como barrel**

```typescript
// src/analytics/board/boardNodes.ts — barrel re-export

export { isStickyNode as isStickyNote, isSnapshotNode, isExcerptNode, isCodeCardNode, isKpiCardNode, isClusterFrameNode as isClusterFrame } from "./boardTypes";

export { type StickyNoteData, STICKY_COLORS, DEFAULT_STICKY_COLOR, nextNoteId, createStickyNote, getStickyData, setStickyColor, enableStickyEditing } from "./nodes/stickyNode";
export { type SnapshotNodeData, nextSnapshotId, createSnapshotNode, getSnapshotData } from "./nodes/snapshotNode";
export { type ExcerptNodeData, nextExcerptId, createExcerptNode, getExcerptData } from "./nodes/excerptNode";
export { type CodeCardNodeData, nextCodeCardId, createCodeCardNode, getCodeCardData } from "./nodes/codeCardNode";
export { type KpiCardNodeData, nextKpiCardId, createKpiCardNode, getKpiCardData } from "./nodes/kpiCardNode";
export { type ClusterFrameData, nextClusterFrameId, createClusterFrame, getClusterFrameData } from "./nodes/clusterFrameNode";
```

- [ ] **Step 2: Rodar testes completos**

Run: `npm run test`
Expected: Todos os 1227+ testes passam

- [ ] **Step 3: Rodar build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/analytics/board/boardNodes.ts src/analytics/board/nodes/
~/.claude/scripts/commit.sh "refactor: boardNodes.ts vira barrel re-export (816 → ~30 LOC)"
```

---

## Chunk 3: Docs e cleanup

### Task 10: Atualizar docs

**Files:**
- Modify: `CLAUDE.md` — atualizar estrutura board/
- Modify: `docs/DEVELOPMENT.md` — atualizar tree do board/

- [ ] **Step 1: Atualizar CLAUDE.md secao board/**

Adicionar:
```
    board/
      boardTypes.ts          — discriminated union types + type guards
      boardNodeHelpers.ts    — factories compartilhadas (cardBg, textbox, badges, theme)
      boardNodes.ts          — barrel re-export dos 6 node types
      nodes/                 — 1 arquivo por node type (stickyNode, snapshotNode, etc.)
      fabricExtensions.d.ts  — ambient types Fabric.js
```

- [ ] **Step 2: Atualizar docs/DEVELOPMENT.md tree**
- [ ] **Step 3: Commit**

---

## Verificacao final

- `npm run build` — zero erros TS
- `npm run test` — todos os testes passam (1227+ existentes + ~12 novos)
- `boardNodes.ts` caiu de 816 LOC para ~30 LOC (barrel)
- Nenhum consumer externo quebrou (boardData.ts e boardView.ts importam de boardNodes.ts que re-exporta tudo)
- 6 arquivos em `nodes/` com ~80-140 LOC cada (focados, legiveis)
- `boardNodeHelpers.ts` ~120 LOC com helpers reusaveis

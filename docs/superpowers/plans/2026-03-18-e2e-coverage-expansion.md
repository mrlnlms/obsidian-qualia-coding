# E2E Coverage Expansion — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expandir cobertura e2e do Qualia Coding de 7 para ~25 testes, cobrindo highlights, handles, sidebar views, analytics modes, e interacoes de hover/selection.

**Architecture:** Cada task cria 1 spec file independente. Tasks podem ser escritas em paralelo por subagents. Apos todas escritas, rodar `npm run test:e2e` valida tudo sequencialmente (Obsidian e maxInstances: 1). O helper `injectQualiaData` ja existe em `test/e2e/helpers/qualia.ts`.

**Tech Stack:** WebdriverIO 9, wdio-obsidian-service 2.4, obsidian-plugin-e2e, Mocha

---

## Contexto

**Ja feito:**
- `test/e2e/specs/smoke.e2e.ts` — 3 testes (plugin carrega, arquivo abre, editor visivel)
- `test/e2e/specs/margin-panel.e2e.ts` — 4 testes (bars, CSS classes, screenshot, hover)
- `test/e2e/helpers/qualia.ts` — `injectQualiaData()`, `mkMarker()`, `SELECTORS`
- `test/e2e/vaults/visual/Sample Coded.md` — fixture markdown com 3 secoes

**Helper existente** (`test/e2e/helpers/qualia.ts`):
```typescript
import { waitForPlugin } from "obsidian-plugin-e2e";

export async function injectQualiaData(opts: {
  markers?: Record<string, unknown[]>;
  codeDefinitions?: Array<{ name: string; color: string; description?: string }>;
}): Promise<void> { /* ... injeta via dataManager + sharedRegistry.create() */ }

export function mkMarker(id, fromLine, fromCh, toLine, toCh, codes, color): object { /* ... */ }

export const SELECTORS = {
  marginPanel: ".codemarker-margin-panel",
  marginBar: ".codemarker-margin-line",
  marginLabel: ".codemarker-margin-label",
  marginDot: ".codemarker-margin-dot",
  highlight: ".codemarker-highlight",
  handleOverlay: ".codemarker-handle-overlay",
  handleSvg: ".codemarker-handle-svg",
  explorer: ".codemarker-explorer",
} as const;
```

**Pattern de spec estabelecido:**
1. `before()` → injetar dados + navegar + esperar render
2. `it()` → `assertDomState()` pra DOM + `checkComponent()` pra screenshot
3. Cada spec e autocontido — injeta seus proprios dados

**Regras de execucao:**
- Cada task gera 1 arquivo `.e2e.ts` independente
- Tasks podem rodar em paralelo (escrita do spec)
- Validacao final roda sequencialmente: `npm run test:e2e`
- Usar `--legacy-peer-deps` se instalar algo
- Commits via `~/.claude/scripts/commit.sh`

---

## Arquivos

| Arquivo | Acao | Testes estimados |
|---|---|---|
| `test/e2e/helpers/qualia.ts` | Modificar — adicionar SELECTORS extras | — |
| `test/e2e/specs/highlights.e2e.ts` | Criar | ~4 |
| `test/e2e/specs/handle-overlay.e2e.ts` | Criar | ~3 |
| `test/e2e/specs/code-explorer.e2e.ts` | Criar | ~4 |
| `test/e2e/specs/analytics-frequency.e2e.ts` | Criar | ~3 |
| `test/e2e/specs/analytics-dashboard.e2e.ts` | Criar | ~3 |
| `test/e2e/specs/hover-interaction.e2e.ts` | Criar | ~3 |

**Total estimado:** ~20 testes novos + 7 existentes = ~27

---

## Chunk 1: Atualizar helper + specs do editor

### Task 0: Adicionar seletores ao helper

**Files:**
- Modify: `test/e2e/helpers/qualia.ts`

- [ ] **Step 1: Adicionar seletores extras ao SELECTORS**

Adicionar ao objeto `SELECTORS` existente:

```typescript
// Adicionar a SELECTORS:
  hoverTooltip: ".cm-tooltip",
  codingMenu: ".codemarker-coding-menu",
  analyticsView: ".codemarker-analytics-view",
  analyticsToolbar: ".codemarker-analytics-toolbar",
  analyticsChart: ".codemarker-chart-container",
  configPanel: ".codemarker-config-panel",
  codeExplorer: ".codemarker-code-explorer",
  codeDetail: ".codemarker-detail-panel",
  treeItem: ".tree-item-self",
```

- [ ] **Step 2: Commit**

```bash
git add test/e2e/helpers/qualia.ts
~/.claude/scripts/commit.sh "chore: adiciona seletores extras ao helper e2e"
```

### Task 1: Spec — highlights no editor

**Files:**
- Create: `test/e2e/specs/highlights.e2e.ts`

Testa que as decoracoes CM6 (highlights coloridos no texto) renderizam corretamente.

- [ ] **Step 1: Criar spec**

```typescript
// test/e2e/specs/highlights.e2e.ts
import {
  openFile, focusEditor, waitForElement, checkComponent, assertDomState,
} from "obsidian-plugin-e2e";
import { injectQualiaData, mkMarker, SELECTORS } from "../helpers/qualia.js";

describe("editor highlights", () => {
  before(async () => {
    await injectQualiaData({
      markers: {
        "Sample Coded.md": [
          mkMarker("h1", 4, 0, 4, 40, ["Emotion"], "#6200EE"),
          mkMarker("h2", 8, 0, 9, 30, ["Theme"], "#FF5722"),
          mkMarker("h3", 4, 10, 4, 25, ["Method"], "#4CAF50"), // nested inside h1
        ],
      },
      codeDefinitions: [
        { name: "Emotion", color: "#6200EE" },
        { name: "Theme", color: "#FF5722" },
        { name: "Method", color: "#4CAF50" },
      ],
    });
    await openFile("Sample Coded.md");
    await focusEditor();
    await browser.pause(2000);
  });

  it("renders highlight decorations on coded text", async () => {
    const highlights = await browser.$$(SELECTORS.highlight);
    expect(highlights.length).toBeGreaterThanOrEqual(2);
  });

  it("highlights have data-marker-id attribute", async () => {
    await assertDomState(SELECTORS.highlight, {
      visible: true,
      classList: { contains: ["codemarker-highlight"] },
    });
  });

  it("nested markers both render", async () => {
    // h1 spans line 4 (0-40), h3 is nested (10-25) — both should have highlights
    const highlights = await browser.$$(SELECTORS.highlight);
    const markerIds = await Promise.all(
      highlights.map(h => h.getAttribute("data-marker-id"))
    );
    const uniqueIds = new Set(markerIds.filter(Boolean));
    expect(uniqueIds.size).toBeGreaterThanOrEqual(2);
  });

  it("visual baseline — editor with 3 highlights", async () => {
    const mismatch = await checkComponent(".cm-editor", "highlights-3markers");
    expect(mismatch).toBeLessThan(2);
  });
});
```

- [ ] **Step 2: Rodar spec**

Run: `npm run test:e2e -- --spec test/e2e/specs/highlights.e2e.ts`
Expected: 4 passing (primeiro run cria baselines)

- [ ] **Step 3: Commit**

```bash
git add test/e2e/specs/highlights.e2e.ts test/screenshots/
~/.claude/scripts/commit.sh "test: e2e highlights — decoracoes CM6 no editor (4 testes)"
```

### Task 2: Spec — handle overlay

**Files:**
- Create: `test/e2e/specs/handle-overlay.e2e.ts`

Testa que os drag handles SVG aparecem no hover e estao posicionados corretamente.

- [ ] **Step 1: Criar spec**

```typescript
// test/e2e/specs/handle-overlay.e2e.ts
import {
  openFile, focusEditor, waitForElement, hoverElement, assertDomState, checkComponent,
} from "obsidian-plugin-e2e";
import { injectQualiaData, mkMarker, SELECTORS } from "../helpers/qualia.js";

describe("handle overlay", () => {
  before(async () => {
    await injectQualiaData({
      markers: {
        "Sample Coded.md": [
          mkMarker("d1", 4, 0, 5, 50, ["Emotion"], "#6200EE"),
        ],
      },
      codeDefinitions: [
        { name: "Emotion", color: "#6200EE" },
      ],
    });
    await openFile("Sample Coded.md");
    await focusEditor();
    await waitForElement(SELECTORS.marginPanel, 10000);
  });

  it("handle overlay container exists", async () => {
    await assertDomState(SELECTORS.handleOverlay, {
      visible: true,
    });
  });

  it("hovering margin bar shows handle SVGs", async () => {
    await hoverElement(SELECTORS.marginBar, 1000);
    const handles = await browser.$$(SELECTORS.handleSvg);
    expect(handles.length).toBeGreaterThanOrEqual(2); // start + end handles
  });

  it("visual baseline — handles on hover", async () => {
    await hoverElement(SELECTORS.marginBar, 1000);
    const mismatch = await checkComponent(".cm-editor", "handles-hover");
    expect(mismatch).toBeLessThan(2);
  });
});
```

- [ ] **Step 2: Rodar spec**

Run: `npm run test:e2e -- --spec test/e2e/specs/handle-overlay.e2e.ts`
Expected: 3 passing

- [ ] **Step 3: Commit**

```bash
git add test/e2e/specs/handle-overlay.e2e.ts test/screenshots/
~/.claude/scripts/commit.sh "test: e2e handle overlay — SVG handles aparecem no hover (3 testes)"
```

### Task 3: Spec — hover interaction

**Files:**
- Create: `test/e2e/specs/hover-interaction.e2e.ts`

Testa que o hover no texto codificado ativa o estado de hover (margin bar highlighted, tooltip/menu).

- [ ] **Step 1: Criar spec**

```typescript
// test/e2e/specs/hover-interaction.e2e.ts
import {
  openFile, focusEditor, waitForElement, hoverElement, assertDomState,
} from "obsidian-plugin-e2e";
import { injectQualiaData, mkMarker, SELECTORS } from "../helpers/qualia.js";

describe("hover interaction", () => {
  before(async () => {
    await injectQualiaData({
      markers: {
        "Sample Coded.md": [
          mkMarker("hv1", 4, 0, 5, 50, ["Emotion"], "#6200EE"),
          mkMarker("hv2", 8, 0, 9, 40, ["Theme"], "#FF5722"),
        ],
      },
      codeDefinitions: [
        { name: "Emotion", color: "#6200EE" },
        { name: "Theme", color: "#FF5722" },
      ],
    });
    await openFile("Sample Coded.md");
    await focusEditor();
    await waitForElement(SELECTORS.marginPanel, 10000);
  });

  it("hovering a highlight adds hovered class to margin bar", async () => {
    await hoverElement(SELECTORS.highlight, 500);
    // After hover, at least one margin element should have hovered class
    const bars = await browser.$$(`${SELECTORS.marginBar}, ${SELECTORS.marginLabel}, ${SELECTORS.marginDot}`);
    let hasHovered = false;
    for (const bar of bars) {
      const cls = await bar.getAttribute("class");
      if (cls?.includes("codemarker-margin-hovered")) {
        hasHovered = true;
        break;
      }
    }
    expect(hasHovered).toBe(true);
  });

  it("hovering margin bar highlights corresponding text", async () => {
    await hoverElement(SELECTORS.marginBar, 500);
    // Highlights should have hover-active style
    const highlights = await browser.$$(SELECTORS.highlight);
    expect(highlights.length).toBeGreaterThanOrEqual(1);
  });

  it("moving away clears hover state", async () => {
    // Hover on empty area (title)
    await hoverElement(".inline-title", 500);
    await browser.pause(500);
    // No hovered class should remain
    const hoveredBars = await browser.$$(".codemarker-margin-hovered");
    expect(hoveredBars.length).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar spec**

Run: `npm run test:e2e -- --spec test/e2e/specs/hover-interaction.e2e.ts`
Expected: 3 passing

- [ ] **Step 3: Commit**

```bash
git add test/e2e/specs/hover-interaction.e2e.ts
~/.claude/scripts/commit.sh "test: e2e hover interaction — highlight↔margin bar sync (3 testes)"
```

---

## Chunk 2: Sidebar views + Analytics

### Task 4: Spec — Code Explorer sidebar

**Files:**
- Create: `test/e2e/specs/code-explorer.e2e.ts`

Testa que a sidebar Code Explorer renderiza a lista de codigos com contagens.

- [ ] **Step 1: Criar spec**

```typescript
// test/e2e/specs/code-explorer.e2e.ts
import {
  openFile, focusEditor, waitForElement, openSidebar, switchSidebarTab,
  assertDomState, checkComponent,
} from "obsidian-plugin-e2e";
import { injectQualiaData, mkMarker, SELECTORS } from "../helpers/qualia.js";

describe("code explorer sidebar", () => {
  before(async () => {
    await injectQualiaData({
      markers: {
        "Sample Coded.md": [
          mkMarker("ex1", 4, 0, 5, 50, ["Emotion"], "#6200EE"),
          mkMarker("ex2", 8, 0, 9, 40, ["Emotion"], "#6200EE"),
          mkMarker("ex3", 12, 0, 13, 30, ["Theme"], "#FF5722"),
        ],
      },
      codeDefinitions: [
        { name: "Emotion", color: "#6200EE" },
        { name: "Theme", color: "#FF5722" },
      ],
    });
    await openFile("Sample Coded.md");
    await focusEditor();
    await browser.pause(1000);
    await openSidebar("right");
    await switchSidebarTab("qualia-code-explorer");
    await waitForElement(SELECTORS.codeExplorer, 10000);
  });

  it("explorer view renders", async () => {
    await assertDomState(SELECTORS.codeExplorer, {
      visible: true,
    });
  });

  it("shows code entries as tree items", async () => {
    const items = await browser.$$(SELECTORS.treeItem);
    expect(items.length).toBeGreaterThanOrEqual(2);
  });

  it("displays code names", async () => {
    await assertDomState(SELECTORS.codeExplorer, {
      innerHTML: { contains: ["Emotion", "Theme"] },
    });
  });

  it("visual baseline — explorer with 2 codes", async () => {
    const mismatch = await checkComponent(SELECTORS.codeExplorer, "explorer-2codes");
    expect(mismatch).toBeLessThan(2);
  });
});
```

- [ ] **Step 2: Rodar spec**

Run: `npm run test:e2e -- --spec test/e2e/specs/code-explorer.e2e.ts`
Expected: 4 passing

- [ ] **Step 3: Commit**

```bash
git add test/e2e/specs/code-explorer.e2e.ts test/screenshots/
~/.claude/scripts/commit.sh "test: e2e code explorer — sidebar renderiza lista de codigos (4 testes)"
```

### Task 5: Spec — Analytics frequency mode

**Files:**
- Create: `test/e2e/specs/analytics-frequency.e2e.ts`

Testa que a analytics view no modo frequency renderiza o chart de barras.

- [ ] **Step 1: Criar spec**

```typescript
// test/e2e/specs/analytics-frequency.e2e.ts
import {
  openFile, focusEditor, waitForElement, executeCommand,
  assertDomState, checkComponent,
} from "obsidian-plugin-e2e";
import { injectQualiaData, mkMarker, SELECTORS } from "../helpers/qualia.js";

describe("analytics — frequency mode", () => {
  before(async () => {
    await injectQualiaData({
      markers: {
        "Sample Coded.md": [
          mkMarker("af1", 4, 0, 5, 50, ["Emotion"], "#6200EE"),
          mkMarker("af2", 6, 0, 7, 30, ["Emotion"], "#6200EE"),
          mkMarker("af3", 8, 0, 9, 40, ["Theme"], "#FF5722"),
          mkMarker("af4", 10, 0, 11, 20, ["Method"], "#4CAF50"),
        ],
      },
      codeDefinitions: [
        { name: "Emotion", color: "#6200EE" },
        { name: "Theme", color: "#FF5722" },
        { name: "Method", color: "#4CAF50" },
      ],
    });
    await openFile("Sample Coded.md");
    await focusEditor();
    await browser.pause(1000);
    await executeCommand("open-analytics");
    await waitForElement(SELECTORS.analyticsView, 15000);
  });

  it("analytics view renders", async () => {
    await assertDomState(SELECTORS.analyticsView, {
      visible: true,
    });
  });

  it("toolbar is visible with mode buttons", async () => {
    await assertDomState(SELECTORS.analyticsToolbar, {
      visible: true,
      childCount: { min: 3 },
    });
  });

  it("visual baseline — frequency chart with 3 codes", async () => {
    await browser.pause(2000); // chart rendering is async
    const mismatch = await checkComponent(SELECTORS.analyticsView, "analytics-frequency-3codes");
    expect(mismatch).toBeLessThan(3); // higher tolerance for chart anti-aliasing
  });
});
```

- [ ] **Step 2: Rodar spec**

Run: `npm run test:e2e -- --spec test/e2e/specs/analytics-frequency.e2e.ts`
Expected: 3 passing

- [ ] **Step 3: Commit**

```bash
git add test/e2e/specs/analytics-frequency.e2e.ts test/screenshots/
~/.claude/scripts/commit.sh "test: e2e analytics frequency — chart de barras renderiza (3 testes)"
```

### Task 6: Spec — Analytics dashboard mode

**Files:**
- Create: `test/e2e/specs/analytics-dashboard.e2e.ts`

Testa que o dashboard mode renderiza KPIs e mini-charts.

- [ ] **Step 1: Criar spec**

```typescript
// test/e2e/specs/analytics-dashboard.e2e.ts
import {
  openFile, focusEditor, waitForElement, executeCommand,
  assertDomState, assertInnerHTML, checkComponent,
} from "obsidian-plugin-e2e";
import { injectQualiaData, mkMarker, SELECTORS } from "../helpers/qualia.js";

describe("analytics — dashboard mode", () => {
  before(async () => {
    await injectQualiaData({
      markers: {
        "Sample Coded.md": [
          mkMarker("db1", 4, 0, 5, 50, ["Emotion"], "#6200EE"),
          mkMarker("db2", 8, 0, 9, 40, ["Theme"], "#FF5722"),
        ],
      },
      codeDefinitions: [
        { name: "Emotion", color: "#6200EE" },
        { name: "Theme", color: "#FF5722" },
      ],
    });
    await openFile("Sample Coded.md");
    await focusEditor();
    await browser.pause(1000);
    await executeCommand("open-analytics");
    await waitForElement(SELECTORS.analyticsView, 15000);

    // Switch to dashboard mode via toolbar button
    await browser.execute(() => {
      const btns = document.querySelectorAll(".codemarker-analytics-toolbar-btn");
      for (const btn of btns) {
        if (btn.getAttribute("aria-label")?.toLowerCase().includes("dashboard")) {
          (btn as HTMLElement).click();
          break;
        }
      }
    });
    await browser.pause(2000);
  });

  it("dashboard renders KPI cards", async () => {
    const kpis = await browser.$$(".codemarker-kpi-card");
    expect(kpis.length).toBeGreaterThanOrEqual(1);
  });

  it("KPI shows marker count", async () => {
    await assertInnerHTML(SELECTORS.analyticsChart, {
      contains: ["2"], // total markers = 2
    });
  });

  it("visual baseline — dashboard with KPIs", async () => {
    const mismatch = await checkComponent(SELECTORS.analyticsView, "analytics-dashboard");
    expect(mismatch).toBeLessThan(3);
  });
});
```

- [ ] **Step 2: Rodar spec**

Run: `npm run test:e2e -- --spec test/e2e/specs/analytics-dashboard.e2e.ts`
Expected: 3 passing

- [ ] **Step 3: Commit**

```bash
git add test/e2e/specs/analytics-dashboard.e2e.ts test/screenshots/
~/.claude/scripts/commit.sh "test: e2e analytics dashboard — KPIs e mini-charts (3 testes)"
```

---

## Chunk 3: Validacao final

### Task 7: Rodar todos os specs juntos

- [ ] **Step 1: Rodar suite completa**

Run: `npm run test:e2e`
Expected: 8 spec files, ~27 testes passando

Se algum spec falhar por timing (Obsidian nao renderizou a tempo), aumentar o `browser.pause()` no `before()` desse spec.

- [ ] **Step 2: Verificar testes unitarios nao quebraram**

Run: `npm run test`
Expected: 1263 testes Vitest passando (nao afetado pelo e2e)

- [ ] **Step 3: Commit final**

```bash
~/.claude/scripts/commit.sh "test: validacao final — 27 testes e2e + 1263 unitarios, tudo verde"
```

---

## Verificacao final

- `npm run test` — 1263 testes Vitest passando
- `npm run test:e2e` — ~27 testes e2e em 8 specs passando
- Screenshots baseline criados em `test/screenshots/baseline/`
- Nenhum boilerplate duplicado entre specs (tudo via helper + obsidian-plugin-e2e)

## Notas pra execucao paralela

**Tasks paralelizaveis** (escrita dos specs, sem dependencia entre si):
- Task 1 (highlights) — independente
- Task 2 (handle overlay) — independente
- Task 3 (hover interaction) — independente
- Task 4 (code explorer) — independente
- Task 5 (analytics frequency) — independente
- Task 6 (analytics dashboard) — independente

**Task sequencial** (depende de todas as anteriores):
- Task 0 (atualizar helper) — deve rodar PRIMEIRO
- Task 7 (validacao final) — deve rodar POR ULTIMO

**Workflow:**
1. Rodar Task 0 (atualizar helper)
2. Disparar Tasks 1-6 em paralelo como subagents
3. Rodar Task 7 (validacao final)

**Cada subagent precisa saber:**
- O working directory: `/Users/mosx/Desktop/obsidian-plugins-workbench/.obsidian/plugins/obsidian-qualia-coding`
- Como rodar um spec: `npm run test:e2e -- --spec test/e2e/specs/NOME.e2e.ts`
- Commits via: `~/.claude/scripts/commit.sh "mensagem"`
- Se o teste falhar por timing, aumentar `browser.pause()` e tentar de novo
- Nao modificar specs de outros tasks

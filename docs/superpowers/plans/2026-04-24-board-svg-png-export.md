# Board SVG/PNG Export Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Project override:** `CLAUDE.md` proíbe git worktrees neste projeto. Trabalhar direto em branch (`git checkout -b feat/board-export`), pular setup de worktree que o skill normalmente pede.

**Goal:** Exportar o Research Board (canvas Fabric tipo Miro) como SVG (vetorial, default) ou PNG (raster 2x, alternativo) via botões no boardToolbar.

**Architecture:** Adiciona módulo puro `boardExport.ts` com `getBoardBoundingBox`, `buildExportFilename`, `exportBoardSvg`, `exportBoardPng` e helper `triggerDownload`. Toolbar ganha 2 ações declarativas ("export-svg", "export-png") e `BoardView.handleAction` roteia para as funções. Zero deps novas — usa `canvas.toSVG()` / `canvas.toDataURL()` nativos do Fabric.js (já dep).

**Tech Stack:** TypeScript strict, Fabric.js 6.9, Vitest + jsdom (mock fabric pattern já estabelecido), Obsidian Notice.

**Trade-off conhecido:** chart snapshots no board são PNGs raster (vêm de `Chart.js.toDataURL` no `addChartToBoard`). No SVG exportado eles saem como `<image>` com PNG base64 embutido — não vetorial. Fora do escopo re-renderizar charts como SVG (Chart.js não suporta nativo). Todos os outros elementos (stickies, arrows, cards, text, drawings) saem vetoriais nativos.

**Escopo LOC:** ~80-100 LOC produção + ~80 LOC testes.

---

## File Structure

### Novos

- `src/analytics/board/boardExport.ts` (~80 LOC)
  - `getBoardBoundingBox(canvas: Canvas): BBox | null` — itera objetos (exceto grid dots que não são Fabric objects; são desenhados via `after:render` direto no ctx, não entram em `getObjects()`) e retorna `{ left, top, width, height }` ou `null` se canvas vazio. Reutiliza algoritmo de `fitContent` em `boardCanvas.ts:180`.
  - `buildExportFilename(format: "svg" | "png", now: Date): string` — retorna `qualia-board-YYYY-MM-DD.svg`.
  - `exportBoardSvg(canvas: Canvas, bbox: BBox): string` — chama `canvas.toSVG({ viewBox: { x, y, width, height } })` passando bbox. Retorna string SVG completa.
  - `exportBoardPng(canvas: Canvas, bbox: BBox, multiplier?: number): string` — chama `canvas.toDataURL({ format: "png", multiplier, left, top, width, height })`. Default multiplier 2 (retina).
  - `triggerDownload(filename: string, href: string): void` — cria `<a>`, seta `download` e `href`, chama `click()`. Usa o mesmo padrão de `analyticsView.ts:402-406`.
  - Padding default: 40px em volta do bbox pra export não ficar colado nas bordas.

- `tests/analytics/boardExport.test.ts` (~80 LOC)

### Modificados

- `src/analytics/board/boardToolbar.ts:50-57` — adicionar 2 entradas na array `actions`:
  ```ts
  { action: "export-svg", icon: "file-code", label: "Export SVG" },
  { action: "export-png", icon: "image", label: "Export PNG" },
  ```
  Inserir **antes** de `save` pro agrupamento ficar: ações de canvas → ações de export → save.

- `src/analytics/views/boardView.ts:174-205` — novo branch em `handleAction`:
  ```ts
  } else if (action === "export-svg") {
    this.exportBoard("svg");
  } else if (action === "export-png") {
    this.exportBoard("png");
  }
  ```
  Adicionar método `exportBoard(format)` privado que:
  1. guarda contra `!this.canvasState`
  2. calcula bbox via `getBoardBoundingBox`
  3. se bbox null → `new Notice("Board is empty — nothing to export")` e retorna
  4. gera conteúdo (svg string ou dataURL png)
  5. pra SVG: `URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }))` → `triggerDownload` → `URL.revokeObjectURL` após 1s
  6. pra PNG: passa dataURL direto ao `triggerDownload`
  7. `new Notice("Exported as {filename}")`

---

## Chunk 1: Implementation

### Task 1: Pure helpers — bbox + filename

**Files:**
- Create: `src/analytics/board/boardExport.ts`
- Test: `tests/analytics/boardExport.test.ts`

- [ ] **Step 1.1: Criar arquivo com tipo BBox e stubs**

```ts
// src/analytics/board/boardExport.ts
import type { Canvas } from "fabric";

export interface BBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export const EXPORT_PADDING = 40;

export function getBoardBoundingBox(canvas: Canvas): BBox | null {
  throw new Error("not implemented");
}

export function buildExportFilename(format: "svg" | "png", now: Date): string {
  throw new Error("not implemented");
}
```

- [ ] **Step 1.2: Escrever testes falhos para `buildExportFilename`**

```ts
// tests/analytics/boardExport.test.ts
import { describe, it, expect } from "vitest";
import { buildExportFilename } from "../../src/analytics/board/boardExport";

describe("buildExportFilename", () => {
  it("formata data como YYYY-MM-DD para SVG", () => {
    const d = new Date("2026-04-24T15:30:00Z");
    expect(buildExportFilename("svg", d)).toBe("qualia-board-2026-04-24.svg");
  });

  it("formata data como YYYY-MM-DD para PNG", () => {
    const d = new Date("2026-04-24T15:30:00Z");
    expect(buildExportFilename("png", d)).toBe("qualia-board-2026-04-24.png");
  });

  it("pad mês/dia com zero", () => {
    const d = new Date("2026-01-05T00:00:00Z");
    expect(buildExportFilename("svg", d)).toBe("qualia-board-2026-01-05.svg");
  });
});
```

- [ ] **Step 1.3: Rodar testes pra confirmar falha**

Run: `npx vitest run tests/analytics/boardExport.test.ts`
Expected: FAIL — "not implemented"

- [ ] **Step 1.4: Implementar `buildExportFilename`**

```ts
export function buildExportFilename(format: "svg" | "png", now: Date): string {
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  return `qualia-board-${yyyy}-${mm}-${dd}.${format}`;
}
```

- [ ] **Step 1.5: Rodar testes — buildExportFilename passa**

Run: `npx vitest run tests/analytics/boardExport.test.ts -t buildExportFilename`
Expected: 3 passing.

- [ ] **Step 1.6: Escrever testes falhos para `getBoardBoundingBox`**

```ts
import { getBoardBoundingBox, EXPORT_PADDING } from "../../src/analytics/board/boardExport";

// Mock Canvas mínimo. getBoundingRect usado abaixo é o Fabric API real.
function makeCanvas(objects: Array<{ left: number; top: number; width: number; height: number }>) {
  return {
    getObjects: () => objects.map(o => ({
      getBoundingRect: () => o,
    })),
  } as unknown as import("fabric").Canvas;
}

describe("getBoardBoundingBox", () => {
  it("retorna null para canvas vazio", () => {
    expect(getBoardBoundingBox(makeCanvas([]))).toBeNull();
  });

  it("retorna bbox com padding para 1 objeto", () => {
    const canvas = makeCanvas([{ left: 100, top: 50, width: 200, height: 80 }]);
    const bb = getBoardBoundingBox(canvas);
    expect(bb).toEqual({
      left: 100 - EXPORT_PADDING,
      top: 50 - EXPORT_PADDING,
      width: 200 + EXPORT_PADDING * 2,
      height: 80 + EXPORT_PADDING * 2,
    });
  });

  it("une bboxes de múltiplos objetos", () => {
    const canvas = makeCanvas([
      { left: 0, top: 0, width: 100, height: 100 },
      { left: 200, top: 150, width: 50, height: 50 },
    ]);
    const bb = getBoardBoundingBox(canvas);
    expect(bb).toEqual({
      left: 0 - EXPORT_PADDING,
      top: 0 - EXPORT_PADDING,
      width: 250 + EXPORT_PADDING * 2,
      height: 200 + EXPORT_PADDING * 2,
    });
  });

  it("aceita coordenadas negativas", () => {
    const canvas = makeCanvas([{ left: -50, top: -30, width: 100, height: 60 }]);
    const bb = getBoardBoundingBox(canvas);
    expect(bb!.left).toBe(-50 - EXPORT_PADDING);
    expect(bb!.top).toBe(-30 - EXPORT_PADDING);
  });
});
```

- [ ] **Step 1.7: Rodar testes pra confirmar falha**

Run: `npx vitest run tests/analytics/boardExport.test.ts -t getBoardBoundingBox`
Expected: FAIL.

- [ ] **Step 1.8: Implementar `getBoardBoundingBox`**

```ts
export function getBoardBoundingBox(canvas: Canvas): BBox | null {
  const objects = canvas.getObjects();
  if (objects.length === 0) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const obj of objects) {
    const br = obj.getBoundingRect();
    if (br.left < minX) minX = br.left;
    if (br.top < minY) minY = br.top;
    if (br.left + br.width > maxX) maxX = br.left + br.width;
    if (br.top + br.height > maxY) maxY = br.top + br.height;
  }

  return {
    left: minX - EXPORT_PADDING,
    top: minY - EXPORT_PADDING,
    width: (maxX - minX) + EXPORT_PADDING * 2,
    height: (maxY - minY) + EXPORT_PADDING * 2,
  };
}
```

- [ ] **Step 1.9: Rodar todos testes do arquivo**

Run: `npx vitest run tests/analytics/boardExport.test.ts`
Expected: todos os testes passam.

- [ ] **Step 1.10: Commit**

```bash
~/.claude/scripts/commit.sh "feat(board): helpers puros de bbox e filename pra export"
```

Nota: esse commit ainda não liga nada no board — só helpers puros. OK ter commit atômico isolado.

---

### Task 2: Export functions (SVG/PNG/trigger)

**Files:**
- Modify: `src/analytics/board/boardExport.ts`
- Modify: `tests/analytics/boardExport.test.ts`

- [ ] **Step 2.1: Escrever testes falhos pra `exportBoardSvg`**

```ts
import { exportBoardSvg, exportBoardPng } from "../../src/analytics/board/boardExport";

describe("exportBoardSvg", () => {
  it("chama canvas.toSVG com viewBox do bbox", () => {
    const toSVG = vi.fn().mockReturnValue("<svg>...</svg>");
    const canvas = { toSVG } as unknown as import("fabric").Canvas;
    const bbox = { left: 10, top: 20, width: 300, height: 200 };

    const result = exportBoardSvg(canvas, bbox);

    expect(toSVG).toHaveBeenCalledWith({
      viewBox: { x: 10, y: 20, width: 300, height: 200 },
      width: 300,
      height: 200,
    });
    expect(result).toBe("<svg>...</svg>");
  });
});

describe("exportBoardPng", () => {
  it("chama canvas.toDataURL com bbox e multiplier default 2", () => {
    const toDataURL = vi.fn().mockReturnValue("data:image/png;base64,AAA");
    const canvas = { toDataURL } as unknown as import("fabric").Canvas;
    const bbox = { left: 10, top: 20, width: 300, height: 200 };

    const result = exportBoardPng(canvas, bbox);

    expect(toDataURL).toHaveBeenCalledWith({
      format: "png",
      multiplier: 2,
      left: 10,
      top: 20,
      width: 300,
      height: 200,
    });
    expect(result).toBe("data:image/png;base64,AAA");
  });

  it("aceita multiplier custom", () => {
    const toDataURL = vi.fn().mockReturnValue("data:...");
    const canvas = { toDataURL } as unknown as import("fabric").Canvas;
    const bbox = { left: 0, top: 0, width: 100, height: 100 };

    exportBoardPng(canvas, bbox, 3);

    expect(toDataURL).toHaveBeenCalledWith(expect.objectContaining({ multiplier: 3 }));
  });
});
```

Adicionar `import { vi } from "vitest";` no topo se ainda não importado.

- [ ] **Step 2.2: Rodar pra confirmar falha**

Run: `npx vitest run tests/analytics/boardExport.test.ts`
Expected: FAIL em exportBoardSvg / exportBoardPng.

- [ ] **Step 2.3: Implementar `exportBoardSvg` e `exportBoardPng`**

```ts
export function exportBoardSvg(canvas: Canvas, bbox: BBox): string {
  return canvas.toSVG({
    viewBox: { x: bbox.left, y: bbox.top, width: bbox.width, height: bbox.height },
    width: bbox.width,
    height: bbox.height,
  });
}

export function exportBoardPng(canvas: Canvas, bbox: BBox, multiplier = 2): string {
  return canvas.toDataURL({
    format: "png",
    multiplier,
    left: bbox.left,
    top: bbox.top,
    width: bbox.width,
    height: bbox.height,
  });
}
```

Se tsc reclamar do tipo de `toSVG`, adicionar em `src/analytics/board/fabricExtensions.d.ts` a extensão do tipo. Verificar o arquivo atual:
- `toSVG(options?: { viewBox?: { x: number; y: number; width: number; height: number }; width?: number; height?: number; suppressPreamble?: boolean }): string`

- [ ] **Step 2.4: Testes passam**

Run: `npx vitest run tests/analytics/boardExport.test.ts`
Expected: todos passam.

- [ ] **Step 2.5: Implementar `triggerDownload`**

```ts
export function triggerDownload(filename: string, href: string): void {
  const link = document.createElement("a");
  link.download = filename;
  link.href = href;
  link.click();
}
```

Teste correspondente:

```ts
describe("triggerDownload", () => {
  it("cria <a> com download e href e clica", () => {
    const click = vi.fn();
    const anchor = { download: "", href: "", click } as unknown as HTMLAnchorElement;
    const spy = vi.spyOn(document, "createElement").mockReturnValue(anchor);

    triggerDownload("foo.svg", "data:...");

    expect(anchor.download).toBe("foo.svg");
    expect(anchor.href).toBe("data:...");
    expect(click).toHaveBeenCalledOnce();
    spy.mockRestore();
  });
});
```

- [ ] **Step 2.6: Rodar tudo — fica verde**

Run: `npx vitest run tests/analytics/boardExport.test.ts`
Expected: 8-9 testes passam.

- [ ] **Step 2.7: tsc limpo**

Run: `npx tsc --noEmit`
Expected: zero erros. Se houver erro de `toSVG`/`toDataURL` não existir no tipo Canvas, adicionar shim em `fabricExtensions.d.ts`:

```ts
// fabricExtensions.d.ts
declare module "fabric" {
  interface Canvas {
    toSVG(options?: {
      viewBox?: { x: number; y: number; width: number; height: number };
      width?: number;
      height?: number;
      suppressPreamble?: boolean;
    }): string;
    toDataURL(options: {
      format: "png" | "jpeg";
      multiplier?: number;
      left?: number;
      top?: number;
      width?: number;
      height?: number;
    }): string;
  }
}
```

Só adicionar o que faltar. Fabric exporta esses métodos em runtime; a questão é se o `.d.ts` publicado cobre todas as opções. Em caso de dúvida, casting local `(canvas as any).toSVG(...)` é aceitável como último recurso.

- [ ] **Step 2.8: Commit**

```bash
~/.claude/scripts/commit.sh "feat(board): funcoes de export SVG/PNG + trigger download"
```

---

### Task 3: Integração toolbar + view

**Files:**
- Modify: `src/analytics/board/boardToolbar.ts`
- Modify: `src/analytics/views/boardView.ts`

- [ ] **Step 3.1: Adicionar 2 ações no boardToolbar**

Em `boardToolbar.ts`, alterar array `actions` (linha 50) pra:

```ts
const actions: Array<{ action: string; icon: string; label: string }> = [
  { action: "delete", icon: "trash-2", label: "Delete" },
  { action: "cluster", icon: "boxes", label: "Auto-group" },
  { action: "zoom-in", icon: "zoom-in", label: "Zoom In" },
  { action: "zoom-out", icon: "zoom-out", label: "Zoom Out" },
  { action: "fit", icon: "maximize-2", label: "Fit" },
  { action: "export-svg", icon: "file-code", label: "Export SVG" },
  { action: "export-png", icon: "image", label: "Export PNG" },
  { action: "save", icon: "save", label: "Save" },
];
```

- [ ] **Step 3.2: Adicionar método `exportBoard` em BoardView**

Após `autoGroupCards` em `boardView.ts`, adicionar:

```ts
private exportBoard(format: "svg" | "png"): void {
  if (!this.canvasState) return;
  const canvas = this.canvasState.canvas;

  const bbox = getBoardBoundingBox(canvas);
  if (!bbox) {
    new Notice("Board is empty — nothing to export");
    return;
  }

  const filename = buildExportFilename(format, new Date());

  try {
    if (format === "svg") {
      const svg = exportBoardSvg(canvas, bbox);
      const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      triggerDownload(filename, url);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } else {
      const dataUrl = exportBoardPng(canvas, bbox);
      triggerDownload(filename, dataUrl);
    }
    new Notice(`Exported as ${filename}`);
  } catch (err) {
    console.error("[qualia-coding] Board export failed:", err);
    new Notice(`Export failed — see console`);
  }
}
```

- [ ] **Step 3.3: Adicionar imports no topo de boardView.ts**

```ts
import { getBoardBoundingBox, buildExportFilename, exportBoardSvg, exportBoardPng, triggerDownload } from "../board/boardExport";
```

- [ ] **Step 3.4: Adicionar branches em `handleAction`**

Em `boardView.ts:174`, logo após o branch `action === "save"`:

```ts
} else if (action === "export-svg") {
  this.exportBoard("svg");
} else if (action === "export-png") {
  this.exportBoard("png");
}
```

- [ ] **Step 3.5: Build + tsc**

Run: `npm run build`
Expected: sucesso, sem erros TS.

Se der erro de tipagem em `toSVG`/`toDataURL`, resolver como descrito em Step 2.7.

- [ ] **Step 3.6: Rodar suite inteira pra garantir que nada quebrou**

Run: `npx vitest run`
Expected: todos os ~1960 testes + novos passam.

- [ ] **Step 3.7: Commit**

```bash
~/.claude/scripts/commit.sh "feat(board): botoes export SVG/PNG no toolbar"
```

---

### Task 4: Validação manual + docs

**Files:**
- Modify: `docs/ROADMAP.md`
- Optional: `docs/TECHNICAL-PATTERNS.md` se surgir pattern reutilizável

- [ ] **Step 4.1: Copiar artefatos pro demo vault**

```bash
cp -p main.js manifest.json styles.css demo/.obsidian/plugins/qualia-coding/
```

- [ ] **Step 4.2: Smoke test no vault workbench**

Abrir Obsidian no vault `/Users/mosx/Desktop/obsidian-plugins-workbench/`. Disable/enable do plugin pra pegar build novo.

Cenários:
1. Board vazio → clicar "Export SVG" → Notice "Board is empty" aparece. Nenhum download.
2. Board com 1 sticky → Export SVG → abrir arquivo baixado em browser ou Inkscape → conferir se está todo, centralizado, com padding.
3. Board com variedade (sticky + arrow + KPI card + code card + desenho livre + chart snapshot) → Export SVG → conferir se tudo aparece. **Chart snapshot deve ser raster embutido (esperado).**
4. Mesmo cenário 3 → Export PNG → abrir num viewer → conferir que é crisp (multiplier 2 = retina).
5. Zoom in/out no board antes do export → confirmar que zoom do viewport **NÃO** afeta export (toSVG/toDataURL com bbox ignora zoom).
6. Board com objetos em coordenadas negativas → export funciona mesmo assim.

- [ ] **Step 4.3: Marcar item #15 como FEITO no ROADMAP**

Em `docs/ROADMAP.md`, na seção "Import/Export — sessão agrupada", trocar:

```
| ROADMAP #15 | PNG/PDF Dashboard composite | PENDENTE |
```

por:

```
| ~~ROADMAP #15~~ | ~~Board Export SVG/PNG~~ | ✅ **FEITO 2026-04-24** — SVG vetorial + PNG 2x via `boardExport.ts`. PDF dispensado (SVG cobre caso vetorial melhor). Chart snapshots ficam raster embutidos no SVG (Chart.js não exporta nativo — fora do escopo). |
```

Atualizar tabela-resumo "📍 Próximos a atacar" se necessário: item 2 agora perdeu um sub-item. Não remover item 2 inteiro — ainda tem tabular CSV export pendente.

- [ ] **Step 4.4: (Se houver pattern novo) anotar em TECHNICAL-PATTERNS**

Se durante implementação surgir gotcha não documentado (ex: quirk do Blob + URL.revokeObjectURL, comportamento do `canvas.toSVG()` com objetos off-viewport), adicionar seção curta em `docs/TECHNICAL-PATTERNS.md`. Caso contrário, skip esse step.

- [ ] **Step 4.5: Commit final de docs**

```bash
~/.claude/scripts/commit.sh "docs: marca ROADMAP #15 como feito + smoke roundtrip do board export"
```

- [ ] **Step 4.6: Merge pra main**

```bash
git checkout main
git merge --no-ff feat/board-export
git branch -d feat/board-export
```

Confirmar com user antes de `git push` — CLAUDE.md diz que push é ação com blast radius e precisa autorização explícita.

---

## Testing Strategy

**Testes unitários (jsdom + vi.mock fabric):**
- `buildExportFilename` — formato, padding de zeros, UTC vs local
- `getBoardBoundingBox` — vazio, 1 obj, múltiplos, coords negativas, padding
- `exportBoardSvg` — chama `canvas.toSVG` com viewBox correto
- `exportBoardPng` — chama `canvas.toDataURL` com bbox + multiplier
- `triggerDownload` — cria anchor e clica

**Testes manuais (smoke test no vault):**
- Board vazio, 1 obj, variedade de tipos, zoom aplicado, coords negativas, formato SVG abre em browser, formato PNG abre em viewer

**O que NÃO testar em jsdom:**
- Output real do `toSVG()` — jsdom não renderiza canvas 2D completo; o teste real é o smoke manual.
- Fidelidade visual dos chart snapshots — é decisão de design (raster embutido), não comportamento testável.

---

## Risks & Mitigations

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| `canvas.toSVG()` com viewBox pode não recortar (pode sempre retornar canvas inteiro) | SVG sai com espaço em branco | Testar manualmente em Step 4.2. Se falhar, remover `viewBox`, gerar SVG inteiro, e recortar via `svgo` ou string manipulation — mas isso é melhoria, não blocker. |
| Chart snapshots com `crossOrigin` bloqueando `toDataURL` | PNG quebra com CORS error | Snapshots vêm do próprio plugin via `canvas.toDataURL("image/png")` no `analyticsView.ts:434` — mesma origem, sem CORS. Testar mesmo assim em Step 4.2. |
| Blob URL vazando memória se export disparado repetidamente | Memory leak leve | `setTimeout(() => URL.revokeObjectURL(url), 1000)` já resolve |
| Grid dots aparecerem no export | Export "sujo" | Grid é desenhado em `after:render` hook direto no ctx 2D, **não é** objeto Fabric. `toSVG()` só serializa `canvas.getObjects()`, então grid é naturalmente omitido. Confirmar em Step 4.2. |
| Objetos fora do bbox (ex: arrow que sai do node) cortados | Export perde pedaços | `EXPORT_PADDING = 40px` em volta. Se ainda cortar, aumentar padding ou usar `getBoundingRect(true)` com `absolute` flag. |
| tsc reclamar de `toSVG`/`toDataURL` com options | Build quebra | Shim em `fabricExtensions.d.ts` (Step 2.7). |

---

## Non-goals (explícitos)

- **PDF export:** descartado — SVG vetorial cobre o caso vetorial melhor; PDF exigiria +130KB gzip de `jspdf` pra zero ganho.
- **Chart snapshots vetoriais:** Chart.js não exporta SVG nativo. Re-renderizar charts como SVG separado seria sessão própria.
- **Salvar export no vault:** user provavelmente quer o arquivo "fora" do vault (pra inserir em paper/slide). Se aparecer pedido, follow-up de ~10 LOC usando `vault.adapter.write` ou `writeBinary`.
- **Múltiplos formatos simultâneos (zip):** YAGNI.
- **Seleção parcial (exportar só objetos selecionados):** YAGNI. Se aparecer pedido, follow-up usa `canvas.getActiveObjects()` em vez de `getObjects()` no bbox.

---

## Completion Criteria

- [ ] 4 tasks com todos steps marcados
- [ ] `npx vitest run` verde (1960+ testes + novos)
- [ ] `npx tsc --noEmit` sem erros
- [ ] `npm run build` sem erros
- [ ] Smoke test passou (Step 4.2) nos 6 cenários
- [ ] ROADMAP #15 marcado como FEITO
- [ ] Branch `feat/board-export` mergeada em main (sem push — aguardar autorização)

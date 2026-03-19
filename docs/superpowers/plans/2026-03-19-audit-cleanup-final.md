# Audit Cleanup Final — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolver os 3 items restantes do audit: fix flaky test patterns, revert scrollDOM position em destroy(), e remover dead CSS.

**Architecture:** Três tasks independentes sem dependências entre si. Cada uma é cirúrgica — nenhuma muda comportamento de runtime (exceto o destroy fix, que é 1 linha).

**Tech Stack:** Vitest, CSS, TypeScript

---

## Chunk 1: Todas as tasks

### Task 1: Fix flaky async patterns em renderChart.test.ts

**Files:**
- Modify: `tests/analytics/renderChart.test.ts:220,293`

O pattern `await new Promise((r) => setTimeout(r, 0)); await new Promise((r) => setTimeout(r, 0));` é frágil — depende de 2 microtask flushes sequenciais. Substituir por `vi.useFakeTimers()` + `vi.advanceTimersByTime()` ou pelo helper `flushPromises()` já existente em `exportCSV.test.ts:456`.

- [ ] **Step 1: Ler o contexto dos testes afetados**

```
tests/analytics/renderChart.test.ts:220 — "creates Chart with data" (frequency)
tests/analytics/renderChart.test.ts:293 — "creates wordCloud Chart after text extraction"
```

Ambos usam `await new Promise((r) => setTimeout(r, 0)); await new Promise((r) => setTimeout(r, 0));` para esperar renders async internos dos modes.

- [ ] **Step 2: Substituir double-setTimeout por vi.advanceTimersByTime**

No `describe('renderFrequencyChart')`, adicionar `beforeEach(() => { vi.useFakeTimers(); })` e `afterEach(() => { vi.useRealTimers(); })` se necessário. Ou, mais simples: criar helper local `flushPromises` como no exportCSV.test.ts e usar `await flushPromises(); await flushPromises();` que é equivalente mas com intent claro.

Approach preferido (mais simples, sem fake timers que podem quebrar Chart.js mock):

```typescript
// Adicionar no topo do arquivo, após os mocks:
async function flushPromises(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
}
```

Substituir linha 220:
```typescript
// ANTES:
await new Promise((r) => setTimeout(r, 0)); await new Promise((r) => setTimeout(r, 0));
// DEPOIS:
await flushPromises(); await flushPromises();
```

Substituir linha 293 (mesma mudança).

- [ ] **Step 3: Rodar testes para verificar**

Run: `npx vitest run tests/analytics/renderChart.test.ts`
Expected: Todos passam.

- [ ] **Step 4: Melhorar assertions do Chart.js mock**

Nos mesmos 2 testes, as assertions só verificam `toHaveBeenCalledOnce()` e `type`. Adicionar validação da estrutura do data:

No teste "creates Chart with data" (frequency, ~linha 221-223):
```typescript
expect(ChartMock).toHaveBeenCalledOnce();
const [, config] = ChartMock.mock.calls[0];
expect(config.type).toBe('bar');
expect(config.data.labels).toBeDefined();
expect(config.data.datasets).toBeDefined();
expect(config.data.datasets.length).toBeGreaterThan(0);
```

No teste "creates wordCloud Chart after text extraction" (~linha 294-296):
```typescript
expect(ChartMock).toHaveBeenCalledOnce();
const [, config] = ChartMock.mock.calls[0];
expect(config.type).toBe('wordCloud');
expect(config.data.labels).toBeDefined();
expect(config.data.datasets).toBeDefined();
```

- [ ] **Step 5: Rodar testes novamente**

Run: `npx vitest run tests/analytics/renderChart.test.ts`
Expected: Todos passam com as assertions mais rigorosas.

- [ ] **Step 6: Commit**

```bash
git add tests/analytics/renderChart.test.ts
commit "test: fix flaky double-setTimeout pattern + assertions mais rigorosas em renderChart"
```

---

### Task 2: handleOverlayRenderer.destroy() reverte scrollDOM position

**Files:**
- Modify: `src/markdown/cm6/handleOverlayRenderer.ts:23,158-161`

O constructor faz `scrollDOM.style.position = 'relative'` (line 34) mas `destroy()` não reverte. Se o editor CM6 não tinha `position: relative` antes, o overlay deixa o scrollDOM modificado permanentemente.

- [ ] **Step 1: Guardar referência ao scrollDOM e position original**

No constructor, salvar o scrollDOM e o valor original de position:

```typescript
// Adicionar campos privados:
private scrollDOM: HTMLElement;
private originalPosition: string;

// No constructor, ANTES de modificar:
constructor(private model: CodeMarkerModel, scrollDOM: HTMLElement) {
    this.scrollDOM = scrollDOM;
    this.originalPosition = scrollDOM.style.position;
    // ... resto do constructor
```

- [ ] **Step 2: Reverter em destroy()**

```typescript
destroy(): void {
    this.handleElements.clear();
    this.overlayEl.remove();
    this.scrollDOM.style.position = this.originalPosition;
}
```

- [ ] **Step 3: Verificar compilação**

Run: `npx tsc --noEmit`
Expected: Zero erros.

- [ ] **Step 4: Rodar testes existentes**

Run: `npx vitest run`
Expected: Todos passam (nenhum teste unitário toca handleOverlayRenderer, mas garantir que nada quebrou).

- [ ] **Step 5: Commit**

```bash
git add src/markdown/cm6/handleOverlayRenderer.ts
commit "fix: handleOverlayRenderer.destroy() reverte scrollDOM.style.position ao valor original"
```

---

### Task 3: Remover dead CSS (.codemarker-icon-double)

**Files:**
- Modify: `styles.css:362-370` (aprox.)

`.codemarker-icon-double` e seus child selectors não são referenciados em nenhum arquivo .ts. São 3 regras (~10 linhas) de código morto.

NOTA: `.codemarker-audio-loading`, `-error`, `.codemarker-video-loading`, `-error` NÃO são dead CSS — são usados via interpolação `${prefix}-loading` em `mediaViewCore.ts:86,215`. Não remover.

- [ ] **Step 1: Localizar e ler as regras**

Grep `icon-double` em styles.css para encontrar as linhas exatas.

- [ ] **Step 2: Remover as 3 regras**

Remover todo o bloco `.codemarker-icon-double` e seus seletores filhos (`.codemarker-icon-double > svg:first-child`, `.codemarker-icon-double > svg:last-child`).

- [ ] **Step 3: Verificar que nenhum .ts referencia a classe**

Run: `grep -r "icon-double" src/` — deve retornar vazio.

- [ ] **Step 4: Commit**

```bash
git add styles.css
commit "chore: remove dead CSS .codemarker-icon-double (3 regras, ~10 linhas)"
```

---

## Verificação final

- [ ] **Run full test suite**: `npx vitest run` — todos passam
- [ ] **Run build**: `npm run build` — zero erros
- [ ] **Atualizar BACKLOG.md**: Marcar items como FEITO, atualizar contagem de !important (se mudou) e métricas
- [ ] **Commit docs**: `git add docs/BACKLOG.md && commit "docs: marca items finais do audit como feitos"`

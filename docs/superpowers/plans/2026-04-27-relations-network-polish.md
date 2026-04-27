# Relations Network Polish — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add hover-focus em nó (edges não-conectadas escurecem ÷3) e filtro de threshold por peso de edge (slider) ao modo Relations Network do Analytics.

**Architecture:** Extrair 2 funções puras (`isEdgeAboveThreshold`, `computeEdgeOpacity`) pra arquivo de helpers testável. Adicionar 1 campo volátil no contexto (`relationsMinEdgeWeight`). Modificar `relationsNetworkMode.ts` pra: consumir helpers, adicionar state local de hover, adicionar slider no painel de config, e resetar hover em eventos de drag/leave.

**Tech Stack:** TypeScript strict, Obsidian plugin API, Vitest + jsdom, esbuild.

**Spec de referência:** `docs/superpowers/specs/2026-04-27-relations-network-polish-design.md`

**Working directory:** `/Users/mosx/Desktop/obsidian-plugins-workbench/.obsidian/plugins/obsidian-qualia-coding/`

**Branch policy:** Per `CLAUDE.md` deste projeto, NÃO criar worktree. Trabalhar em branch normal a partir de `main` (`git checkout -b feat/relations-network-polish`).

**Commit policy:** Per `~/.claude/CLAUDE.md`, usar `~/.claude/scripts/commit.sh "mensagem"` em todos os commits. Nunca `git commit` direto. Conventional commits em português.

---

## Chunk 1: Implementação completa

### Task 1: Setup — branch nova

**Files:** nenhum (apenas git)

- [ ] **Step 1: Criar branch a partir de main**

```bash
git checkout main
git pull --ff-only origin main 2>/dev/null || true
git status
git checkout -b feat/relations-network-polish
```

Expected: branch `feat/relations-network-polish` ativa, working tree limpo (apenas arquivos sem commit pré-existentes do estado inicial: README.v2.md, scripts/safe-mode-baseline/, demo/.obsidian/plugins/qualia-coding/main.js modificado, demo/.obsidian/plugins/qualia-coding/styles.css modificado — esses não fazem parte deste plano, ignorar).

---

### Task 2: Helper `isEdgeAboveThreshold` (TDD)

**Files:**
- Create: `src/analytics/views/modes/relationsNetworkHelpers.ts`
- Create: `tests/analytics/relationsNetworkHelpers.test.ts`

- [ ] **Step 1: Escrever teste falhando**

Criar `tests/analytics/relationsNetworkHelpers.test.ts` com:

```ts
import { describe, it, expect } from 'vitest';
import { isEdgeAboveThreshold } from '../../src/analytics/views/modes/relationsNetworkHelpers';

describe('isEdgeAboveThreshold', () => {
  it('returns true when weight is strictly above minWeight', () => {
    expect(isEdgeAboveThreshold(5, 3)).toBe(true);
  });

  it('returns false when weight is below minWeight', () => {
    expect(isEdgeAboveThreshold(2, 3)).toBe(false);
  });

  it('returns true at boundary (weight === minWeight, inclusivo)', () => {
    expect(isEdgeAboveThreshold(3, 3)).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar pra confirmar que falha**

```bash
npm run test -- relationsNetworkHelpers.test.ts
```

Expected: erro de import (`Cannot find module .../relationsNetworkHelpers`).

- [ ] **Step 3: Criar arquivo de helpers com `isEdgeAboveThreshold`**

Criar `src/analytics/views/modes/relationsNetworkHelpers.ts`:

```ts
export function isEdgeAboveThreshold(weight: number, minWeight: number): boolean {
  return weight >= minWeight;
}
```

- [ ] **Step 4: Rodar pra confirmar que passa**

```bash
npm run test -- relationsNetworkHelpers.test.ts
```

Expected: 3 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/analytics/views/modes/relationsNetworkHelpers.ts tests/analytics/relationsNetworkHelpers.test.ts
~/.claude/scripts/commit.sh "feat(analytics): isEdgeAboveThreshold helper puro"
```

---

### Task 3: Helper `computeEdgeOpacity` (TDD)

**Files:**
- Modify: `src/analytics/views/modes/relationsNetworkHelpers.ts`
- Modify: `tests/analytics/relationsNetworkHelpers.test.ts`

- [ ] **Step 1: Adicionar testes falhando**

Adicionar ao final de `tests/analytics/relationsNetworkHelpers.test.ts` (e atualizar import):

```ts
import { isEdgeAboveThreshold, computeEdgeOpacity } from '../../src/analytics/views/modes/relationsNetworkHelpers';

// ... testes existentes de isEdgeAboveThreshold ...

describe('computeEdgeOpacity', () => {
  // Fórmula base: 0.25 + 0.6 * (weight / maxWeight)
  // weight=5, maxWeight=10 → 0.25 + 0.6 * 0.5 = 0.55

  it('returns base opacity when hoveredNodeIdx is null', () => {
    expect(computeEdgeOpacity(5, 10, { sourceIdx: 0, targetIdx: 1 }, null)).toBeCloseTo(0.55);
  });

  it('returns base opacity when edge connects to hovered source', () => {
    expect(computeEdgeOpacity(5, 10, { sourceIdx: 2, targetIdx: 1 }, 2)).toBeCloseTo(0.55);
  });

  it('returns base opacity when edge connects to hovered target', () => {
    expect(computeEdgeOpacity(5, 10, { sourceIdx: 0, targetIdx: 3 }, 3)).toBeCloseTo(0.55);
  });

  it('returns base / 3 when edge does not touch hovered node', () => {
    expect(computeEdgeOpacity(5, 10, { sourceIdx: 0, targetIdx: 1 }, 7)).toBeCloseTo(0.55 / 3);
  });

  it('scales linearly with weight/maxWeight', () => {
    // weight=10, maxWeight=10 → 0.25 + 0.6 * 1 = 0.85
    expect(computeEdgeOpacity(10, 10, { sourceIdx: 0, targetIdx: 1 }, null)).toBeCloseTo(0.85);
    // weight=0, maxWeight=10 → 0.25 + 0 = 0.25
    expect(computeEdgeOpacity(0, 10, { sourceIdx: 0, targetIdx: 1 }, null)).toBeCloseTo(0.25);
  });
});
```

- [ ] **Step 2: Rodar pra confirmar que falha**

```bash
npm run test -- relationsNetworkHelpers.test.ts
```

Expected: import error em `computeEdgeOpacity`.

- [ ] **Step 3: Adicionar `computeEdgeOpacity` no helpers**

Adicionar em `src/analytics/views/modes/relationsNetworkHelpers.ts`:

```ts
export function computeEdgeOpacity(
  edgeWeight: number,
  maxWeight: number,
  endpoints: { sourceIdx: number; targetIdx: number },
  hoveredNodeIdx: number | null,
): number {
  const baseOpacity = 0.25 + 0.6 * (edgeWeight / maxWeight);
  if (hoveredNodeIdx === null) return baseOpacity;
  const isConnected = endpoints.sourceIdx === hoveredNodeIdx || endpoints.targetIdx === hoveredNodeIdx;
  return isConnected ? baseOpacity : baseOpacity / 3;
}
```

- [ ] **Step 4: Rodar pra confirmar que passa**

```bash
npm run test -- relationsNetworkHelpers.test.ts
```

Expected: 8 tests passed (3 do helper anterior + 5 novos).

- [ ] **Step 5: Commit**

```bash
git add src/analytics/views/modes/relationsNetworkHelpers.ts tests/analytics/relationsNetworkHelpers.test.ts
~/.claude/scripts/commit.sh "feat(analytics): computeEdgeOpacity com hover-focus"
```

---

### Task 4: Adicionar campo `relationsMinEdgeWeight` no contexto

**Files:**
- Modify: `src/analytics/views/analyticsViewContext.ts:68` (após `relationsLevel` — NÃO perto do `minEdgeWeight` da linha 35, que pertence ao Network Graph mode e é threshold de coisa diferente)
- Modify: `src/analytics/views/analyticsView.ts:78` (depois de `relationsLevel`)

- [ ] **Step 1: Adicionar campo na interface do contexto**

Em `src/analytics/views/analyticsViewContext.ts`, localizar a linha 68 (`relationsLevel: 'code' | 'both';`) e adicionar logo abaixo:

```ts
relationsLevel: 'code' | 'both';
relationsMinEdgeWeight: number;  // volátil, default 1
```

- [ ] **Step 2: Inicializar o campo na classe AnalyticsView**

Em `src/analytics/views/analyticsView.ts:78` (depois de `relationsLevel: 'code' | 'both' = 'both';`), adicionar:

```ts
relationsLevel: 'code' | 'both' = 'both';
relationsMinEdgeWeight = 1;
```

- [ ] **Step 3: Verificar typecheck**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 4: Rodar testes pra garantir que nada quebrou**

```bash
npm run test
```

Expected: todos os testes passando (~2228 = baseline 2220 + 8 novos do helper). Se baseline atual difere de 2220 (ex: alguém adicionou testes em main), ajuste a expectativa pra `baseline + 8`. Rode `npm run test` no início da Task 1 pra confirmar baseline.

- [ ] **Step 5: Commit**

```bash
git add src/analytics/views/analyticsViewContext.ts src/analytics/views/analyticsView.ts
~/.claude/scripts/commit.sh "feat(analytics): adiciona relationsMinEdgeWeight no context (default 1, volátil)"
```

---

### Task 5: Wire helpers em `relationsNetworkMode.ts` — filtro + opacity (sem hover-focus ainda)

Esta task tem o objetivo de já consumir os helpers no `redraw()` antes de adicionar event handlers. Isso garante que (a) qualquer regressão é detectada cedo, (b) commits são atômicos.

**Files:**
- Modify: `src/analytics/views/modes/relationsNetworkMode.ts`

- [ ] **Step 1: Adicionar import dos helpers**

No topo do arquivo, junto com os outros imports (após linha 8):

```ts
import { isEdgeAboveThreshold, computeEdgeOpacity } from "./relationsNetworkHelpers";
```

- [ ] **Step 2: Adicionar state local + clamp em `renderRelationsNetwork`**

Em `relationsNetworkMode.ts`, dentro de `renderRelationsNetwork`, ANTES do `// Canvas setup` (linha ~158), adicionar:

```ts
// Calcula peso máximo observado pra normalizar opacity e capar slider
const maxObservedWeight = Math.max(1, ...edges.map(e => e.weight));

// Clamp defensivo: se threshold ficou maior que o novo max (ex: filtros mudaram), reduz
ctx.relationsMinEdgeWeight = Math.min(ctx.relationsMinEdgeWeight, maxObservedWeight);
const minEdgeWeight = ctx.relationsMinEdgeWeight;

// Hover-focus state (será wireado em Task 6)
let hoveredNodeIdx: number | null = null;
```

Nota: `hoveredNodeIdx` declarado aqui já mas não setado por handlers nesta task. Usado pelo `redraw()` neste step. **Importante**: essa closure variable é mutada pelos handlers em Task 6 — as duas tasks compartilham a mesma referência via closure de `renderRelationsNetwork`.

- [ ] **Step 3: Substituir cálculo inline de opacity + adicionar filtro no `redraw()`**

Localizar `relationsNetworkMode.ts:284` — a linha `const opacity = 0.25 + 0.6 * (edge.weight / maxWeight);` (note: a variável atual no código é `maxWeight`, calculada na linha 269 — vamos mantê-la pra não mexer no naming local desnecessariamente; passamos ela pra `computeEdgeOpacity`).

Antes (~linha 280-284):
```ts
for (const se of simEdges) {
  const ni = simNodes[se.si]!;
  const nj = simNodes[se.ti]!;
  const edge = se.edge;
  const thickness = Math.min(1 + edge.weight, 8);
  const opacity = 0.25 + 0.6 * (edge.weight / maxWeight);
  const color = edgeBaseColor.replace("{a}", String(opacity));
```

Depois:
```ts
for (const se of simEdges) {
  if (!isEdgeAboveThreshold(se.edge.weight, minEdgeWeight)) continue;
  const ni = simNodes[se.si]!;
  const nj = simNodes[se.ti]!;
  const edge = se.edge;
  const thickness = Math.min(1 + edge.weight, 8);
  const opacity = computeEdgeOpacity(
    edge.weight,
    maxWeight,
    { sourceIdx: se.si, targetIdx: se.ti },
    hoveredNodeIdx,
  );
  const color = edgeBaseColor.replace("{a}", String(opacity));
```

Justificativa do `continue`: edges abaixo do threshold pulam o loop inteiro (não desenha edge nem arrowhead nem label). Edges contribuem na simulação (que rodou antes deste loop) mas não no draw.

- [ ] **Step 4: Build + typecheck**

```bash
npm run build
```

Expected: build OK, sem erros TS.

- [ ] **Step 5: Rodar testes**

```bash
npm run test
```

Expected: baseline + 8 tests passing (cf. Task 4 Step 4 — confirmar baseline no início).

- [ ] **Step 6: Commit**

```bash
git add src/analytics/views/modes/relationsNetworkMode.ts
~/.claude/scripts/commit.sh "feat(analytics): consome helpers em redraw — filtro e opacity"
```

---

### Task 6: Wire hover-focus events (mousemove, mouseleave, mousedown)

**Files:**
- Modify: `src/analytics/views/modes/relationsNetworkMode.ts`

- [ ] **Step 1: mousedown — resetar hoveredNodeIdx ao iniciar drag**

Localizar bloco `canvas.addEventListener("mousedown", (e) => { ... })` em `relationsNetworkMode.ts:398-416`.

**Antes** (linhas 406-414):
```ts
if (dx * dx + dy * dy <= node.radius * node.radius) {
  draggedIndex = i;
  dragOffsetX = dx;
  dragOffsetY = dy;
  canvas.style.cursor = "grabbing";
  tooltip.style.display = "none";
  e.preventDefault();
  return;
}
```

**Depois** (adicionar reset de `hoveredNodeIdx` antes do `e.preventDefault()`):
```ts
if (dx * dx + dy * dy <= node.radius * node.radius) {
  draggedIndex = i;
  dragOffsetX = dx;
  dragOffsetY = dy;
  canvas.style.cursor = "grabbing";
  tooltip.style.display = "none";
  if (hoveredNodeIdx !== null) {
    hoveredNodeIdx = null;
  }
  e.preventDefault();
  return;
}
```

Justificativa: ao iniciar drag de nó, qualquer foco prévio é limpo. O `redraw()` que vem do `mousemove` durante o drag já vai usar `hoveredNodeIdx = null`. Não precisa chamar `redraw()` aqui — o próximo movimento do drag dispara redraw com estado correto.

- [ ] **Step 2: mousemove — setar/limpar hoveredNodeIdx + redraw em hit/miss em nó**

Localizar bloco `canvas.addEventListener("mousemove", (e) => { ... })` em `relationsNetworkMode.ts:420-482`. Dois sub-edits.

**Sub-edit A — dentro do loop de hit em nó (linhas 435-458):**

**Antes** (trecho do início do bloco hit-em-nó, linha 439):
```ts
if (dx * dx + dy * dy <= node.radius * node.radius) {
  const nd = nodes[i]!;
  const connections = simEdges
    .filter(se => se.si === i || se.ti === i)
    // ...
```

**Depois** (adicionar set + redraw condicional antes de `const nd`):
```ts
if (dx * dx + dy * dy <= node.radius * node.radius) {
  if (hoveredNodeIdx !== i) {
    hoveredNodeIdx = i;
    redraw();
  }
  const nd = nodes[i]!;
  const connections = simEdges
    .filter(se => se.si === i || se.ti === i)
    // ...
```

Lógica: só redraw se o nó hovered mudou (evita redraws spam dentro do mesmo nó).

**Sub-edit B — após o loop de hit em nó, antes do loop de edges (linha ~461):**

**Antes** (transição do loop de nós pro loop de edges):
```ts
		}

		// Check edges
		for (const se of simEdges) {
			// ... existente ...
```

**Depois** (inserir reset de `hoveredNodeIdx` entre os dois loops):
```ts
		}

		// Saiu de qualquer nó — limpa hover-focus se estiver setado
		if (hoveredNodeIdx !== null) {
			hoveredNodeIdx = null;
			redraw();
		}

		// Check edges
		for (const se of simEdges) {
			// ... existente ...
```

- [ ] **Step 3: mouseleave — resetar hoveredNodeIdx**

Localizar `canvas.addEventListener("mouseleave", () => { ... })` em `relationsNetworkMode.ts:484-488`.

Antes:
```ts
canvas.addEventListener("mouseleave", () => {
  endDrag();
  tooltip.style.display = "none";
  canvas.style.cursor = "default";
});
```

Depois:
```ts
canvas.addEventListener("mouseleave", () => {
  endDrag();
  tooltip.style.display = "none";
  canvas.style.cursor = "default";
  if (hoveredNodeIdx !== null) {
    hoveredNodeIdx = null;
    redraw();
  }
});
```

- [ ] **Step 4: Build + typecheck**

```bash
npm run build
```

Expected: build OK.

- [ ] **Step 5: Rodar testes**

```bash
npm run test
```

Expected: baseline + 8 tests passing (cf. Task 4 Step 4 — confirmar baseline no início).

- [ ] **Step 6: Commit**

```bash
git add src/analytics/views/modes/relationsNetworkMode.ts
~/.claude/scripts/commit.sh "feat(analytics): hover-focus em nó — events mousemove/mouseleave/mousedown"
```

---

### Task 7: Adicionar slider "Min weight" em `renderRelationsNetworkOptions`

**Files:**
- Modify: `src/analytics/views/modes/relationsNetworkMode.ts`

- [ ] **Step 1: Computar `maxObservedWeight` + counts dentro de `renderRelationsNetworkOptions`**

Em `relationsNetworkMode.ts:35` (`export function renderRelationsNetworkOptions(ctx: AnalyticsViewContext): void {`).

Após o `section.createDiv` do título e antes do dropdown de Level, adicionar bloco que recomputa edges (necessário pra saber o range do slider):

```ts
export function renderRelationsNetworkOptions(ctx: AnalyticsViewContext): void {
  const section = ctx.configPanelEl!.createDiv({ cls: "codemarker-config-section" });
  section.createDiv({ cls: "codemarker-config-section-title", text: "Relations Network options" });

  // Recomputa edges pra: (a) calcular maxObservedWeight pro slider.max, (b) mostrar count "showing X / Y"
  const allDefs = collectAllDefinitions(ctx);
  const allMarkers = collectAllMarkers(ctx);
  const allEdges = extractRelationEdges(allDefs, allMarkers, ctx.relationsLevel);
  const maxObservedWeight = Math.max(1, ...allEdges.map(e => e.weight));

  // Clamp defensivo (mesmo critério do render principal)
  ctx.relationsMinEdgeWeight = Math.min(ctx.relationsMinEdgeWeight, maxObservedWeight);
  const visibleCount = allEdges.filter(e => e.weight >= ctx.relationsMinEdgeWeight).length;
  const totalEdges = allEdges.length;

  // ... resto do código existente ...
```

- [ ] **Step 2: Adicionar slider DOM após o "Show edge labels" toggle**

Localizar o bloco que adiciona "Show edge labels" (linhas 53-63 originais). Após o `labelRow.addEventListener("click", ...)` e antes do `// suppress unused variable warnings`, adicionar:

```ts
// Min weight slider
const sliderRow = section.createDiv({ cls: "codemarker-config-row" });
sliderRow.createSpan({ text: "Min weight" });
const slider = sliderRow.createEl("input", { type: "range" });
slider.min = "1";
slider.max = String(maxObservedWeight);
slider.value = String(ctx.relationsMinEdgeWeight);
slider.style.marginLeft = "auto";
slider.style.width = "120px";
const sliderLabel = sliderRow.createSpan({ cls: "codemarker-config-slider-label" });
sliderLabel.textContent = `${ctx.relationsMinEdgeWeight} — showing ${visibleCount}/${totalEdges}`;
sliderLabel.style.marginLeft = "8px";
sliderLabel.style.fontSize = "0.85em";
sliderLabel.style.color = "var(--text-muted)";

slider.addEventListener("change", () => {
  ctx.relationsMinEdgeWeight = parseInt(slider.value, 10);
  ctx.scheduleUpdate();
});
```

Justificativa do event `"change"` (não `"input"`): per spec, `scheduleUpdate()` re-roda a simulação completa (200 iter × N²). `"input"` dispararia por pixel arrastado → lag. `"change"` dispara só no release.

- [ ] **Step 3: Build + typecheck**

```bash
npm run build
```

Expected: build OK.

- [ ] **Step 4: Rodar testes**

```bash
npm run test
```

Expected: baseline + 8 tests passing (cf. Task 4 Step 4 — confirmar baseline no início).

- [ ] **Step 5: Commit**

```bash
git add src/analytics/views/modes/relationsNetworkMode.ts
~/.claude/scripts/commit.sh "feat(analytics): slider 'Min weight' com label dinamico no painel de Relations Network"
```

---

### Task 8: Smoke test manual + copy pro demo vault

**Files:**
- Modify: `demo/.obsidian/plugins/qualia-coding/main.js` (artefato copiado)

- [ ] **Step 1: Build production**

```bash
npm run build
```

Expected: `main.js` atualizado na raiz do repo.

- [ ] **Step 2: Copiar artefatos pro demo vault**

```bash
cp -p main.js manifest.json styles.css demo/.obsidian/plugins/qualia-coding/
```

- [ ] **Step 3: Smoke test manual no vault `/Users/mosx/Desktop/obsidian-plugins-workbench/`**

Instruções (executar no Obsidian, não automatizável):

1. Reload do plugin (Cmd+R no Obsidian) ou Settings → Community plugins → toggle Qualia Coding off/on
2. Abrir Analytics view (botão na sidebar do plugin)
3. Trocar pra modo "Relations Network" no dropdown da view
4. **Verificar render inicial**: nós e edges aparecem normalmente, painel de config tem Level + Show edge labels + Min weight slider
5. **Hover em nó**: passar mouse sobre um nó → edges não-conectadas escurecem (∼1/3 do brilho), edges conectadas mantêm opacity
6. **Tirar mouse do nó (em área vazia, sem sair do canvas)**: tudo volta ao normal
7. **Tirar mouse do canvas inteiro**: tudo volta ao normal (mouseleave)
8. **Mexer slider Min weight**: arrastar o slider e soltar → edges abaixo do threshold somem; label atualiza pra "N — showing X / Y"
9. **Voltar slider pra 1**: todas as edges reaparecem
10. **Mexer slider e DEPOIS hover em nó**: ambos efeitos funcionam juntos (filtro escondendo + hover-focus dimming)
11. **Trocar Level (Code-level ↔ Code+Segments)**: slider pode resetar valor se novo `maxObservedWeight` < threshold antigo (clamp defensivo)
12. **Drag de nó com hover-focus ativo**: começar drag de um nó enquanto outro está em hover → focus reseta antes do drag começar (sem dimming residual durante drag)
13. **Slider drag rápido**: arrastar o thumb do slider rapidamente → UI fica fluida (re-render só no release, não por pixel)

Critérios de pass:
- Cenários 5, 6, 7: hover-focus funciona e reseta corretamente
- Cenários 8, 9, 11: filtro funciona e responde a mudanças de range
- Cenários 10, 12: combinações de eventos não criam estados inconsistentes
- Cenário 13: zero lag perceptível durante drag do slider

- [ ] **Step 4: Verificar console limpo**

No DevTools do Obsidian (Cmd+Opt+I), aba Console: nenhum erro vermelho relacionado ao plugin durante os testes.

- [ ] **Step 5: Commit do demo**

```bash
git add demo/.obsidian/plugins/qualia-coding/main.js demo/.obsidian/plugins/qualia-coding/styles.css demo/.obsidian/plugins/qualia-coding/manifest.json
~/.claude/scripts/commit.sh "chore(demo): build pos relations-network-polish"
```

---

### Task 9: Atualizar docs operacionais

**Files:**
- Modify: `docs/ROADMAP.md` (marcar 2 itens como FEITOS na sessão 3)

- [ ] **Step 1: Marcar itens como concluídos no ROADMAP**

Em `docs/ROADMAP.md`, na seção "### 3. Analytics — melhorias" (~linha 197), localizar a tabela de itens. Marcar os dois primeiros itens como concluídos com nota de data (riscar e adicionar ✅ + data, padrão usado em outras concluídas):

Antes:
```
| **Relations Network — hover-focus** | ~45 min | Ao passar cursor sobre um nó, destacar edges que entram/saem dele e escurecer o resto. No loop de draw do `relationsNetworkMode.ts`: dividir opacity por 3 pras edges que não tocam `hoveredNodeIdx` |
| **Relations Network — filtro "N+ aplicações"** | ~30 min | Slider ou input no painel de config: só renderiza edges com `weight >= N`. Threshold no `extractRelationEdges` ou no loop de draw |
```

Depois:
```
| ~~**Relations Network — hover-focus**~~ ✅ 2026-04-27 | ~45 min | Ao passar cursor sobre um nó, destacar edges que entram/saem dele e escurecer o resto. No loop de draw do `relationsNetworkMode.ts`: dividir opacity por 3 pras edges que não tocam `hoveredNodeIdx` |
| ~~**Relations Network — filtro "N+ aplicações"**~~ ✅ 2026-04-27 | ~30 min | Slider ou input no painel de config: só renderiza edges com `weight >= N`. Threshold no `extractRelationEdges` ou no loop de draw |
```

- [ ] **Step 2: Commit do roadmap**

```bash
git add docs/ROADMAP.md
~/.claude/scripts/commit.sh "docs(roadmap): marca relations network hover-focus e filtro N+ como concluidos"
```

---

### Task 10: Push final + sumário

- [ ] **Step 1: Verificar git log do branch**

```bash
git log --oneline main..HEAD
```

Expected: 8 commits novos (um por Task 2..9; Tasks 1 e 10 não geram commit — branch setup e summary).

- [ ] **Step 2: Rodar suite completa de testes uma última vez**

```bash
npm run test
```

Expected: baseline + 8 tests passing (cf. Task 4 Step 4 — confirmar baseline no início).

- [ ] **Step 3: Reportar pro user**

Mensagem ao user com:
- Branch ativa: `feat/relations-network-polish`
- Commits criados (lista)
- Resultado do smoke test (cenários 1-13 com pass/fail)
- Pergunta: merge em main ou abrir PR?

---

## Critérios de aceite

| Item | Verificação |
|------|-------------|
| Helpers puros testados | `npm run test` mostra 8 cases novos passando em `relationsNetworkHelpers.test.ts` |
| Hover-focus funciona | Cenários 5, 6, 7 do smoke test passam |
| Filtro funciona | Cenários 8, 9, 11 do smoke test passam |
| Combinações OK | Cenários 10, 12 do smoke test passam |
| UX fluida | Cenário 13 do smoke test passa (sem lag no slider drag) |
| Build limpo | `npm run build` sem erros, `npx tsc --noEmit` sem erros |
| Suite completa | `npm run test` mostra ~2228 testes passando (2220 + 8 novos) |
| Console limpo | Nenhum erro vermelho relacionado ao plugin no DevTools |
| Docs atualizadas | ROADMAP marca os 2 itens como concluídos |

---

## Notas de execução

- **Tempo estimado total:** 75 min (per ROADMAP) + ~15 min de smoke test manual = ~90 min
- **Skills relevantes:** `obsidian-core` (events DOM), `obsidian-design` (styles do slider — usado `var(--text-muted)`)
- **Testes não cobertos:** view layer (canvas drawing, force simulation, mousemove handlers) — coerente com padrão atual dos 19 outros modes que também não têm teste de view
- **Risco principal:** trabalho em branch direto (sem worktree per CLAUDE.md do projeto). Se houver mudanças concorrentes em `main` durante a sessão, fazer rebase antes de merge

---

## Estado pós-execução

Após Task 10:
- 8 commits novos em `feat/relations-network-polish`
- 2 itens da Sessão 3 do ROADMAP concluídos
- Próximos itens da Sessão 3 ainda pendentes: Analytic Memo View, Code × Metadata, Multi-tab spreadsheet export, edge bundling FDEB
- Decisão pendente após merge: atacar Code × Metadata (próximo item recomendado per discussão original) ou outro item

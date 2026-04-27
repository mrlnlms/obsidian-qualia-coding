# Relations Network — hover-focus + filtro N+ aplicações

**Data:** 2026-04-27
**Sessão:** Analytics — melhorias (#3 ROADMAP)
**Itens cobertos:** 2 dos 6 da sessão (os dois primeiros, ~75 min combinados)

---

## Contexto

`Relations Network` é o modo do Analytics que renderiza códigos como nós e relações como edges em um canvas force-directed. É o modo mais complexo visualmente e o maior arquivo da pasta `modes/` (519 LOC, próximo é 436). Edges curvas-bézier, drag de nó, opacity proporcional ao peso, simulação de 200 iterações na carga.

Dois polishes pequenos faltam pra qualidade de exploração:

1. **Hover-focus**: ao passar o cursor sobre um nó, escurecer edges que não tocam aquele nó pra destacar visualmente as conexões dele.
2. **Filtro "N+ aplicações"**: slider que esconde edges com peso abaixo de um threshold escolhido pelo usuário.

Ambos são canvas-only (sem mexer em data layer, schema ou outros modes).

---

## Decisões de produto

| Tópico | Decisão | Razão |
|--------|---------|-------|
| Hover-focus em nó | Edges não-conectadas escurecem (opacity ÷ 3); nós inalterados | Efeito sutil, foco direcionado, sem reflow visual |
| Hover em edge | Comportamento atual (só tooltip) | Escopo cirúrgico; misturar focus-em-edge com focus-em-nó vira ruído visual |
| UI do filtro | Slider com label dinâmico "Min weight: N — showing X / Y edges" | Feedback imediato de exploração; remove o efeito "puxei e nada mudou" |
| Nós sem edges visíveis (após filtro) | Continuam visíveis no canvas | Filtro é semântico sobre edges, não sobre nós; preserva drag-positions; comportamento previsível |
| Persistência do threshold | Volátil por sessão de view (default 1) | Não é setting — é exploração. Persistir cria estado fantasma |

---

## Arquitetura

Dois deltas independentes no mesmo modo, compartilhando um arquivo de helpers puros (extraídos pra preparar terreno pra próximas iterações como edge bundling).

**Arquivos novos:**
- `src/analytics/views/modes/relationsNetworkHelpers.ts` — funções puras (filtro de threshold, cálculo de opacity com hover focus)
- `tests/analytics/relationsNetworkHelpers.test.ts` — unit tests

**Arquivos alterados:**
- `src/analytics/views/modes/relationsNetworkMode.ts` — consome helpers; adiciona slider e estado de hover-focus
- `src/analytics/views/analyticsViewContext.ts` — campo `relationsMinEdgeWeight` (volátil, default 1)

**Sem mudanças em:** `relationsEngine.ts`, `analyticsView.ts`, `configSections.ts`, `modeRegistry.ts`, settings, `data.json` schema.

### Por que extrair helpers em vez de inline

`relationsNetworkMode.ts` já é o maior dos 20 modes. As 2 funções a extrair são puras (zero DOM/canvas/ctx). `relationsEngine.ts` (data layer) já tem teste isolado em `tests/analytics/relationsEngine.test.ts` — o padrão "lógica pura de relations vai pra arquivo testável" já existe no projeto. Edge bundling (item #6 da mesma sessão, "não prioritário" mas existe na fila) trará helpers de geometria; ter o módulo já criado destrava esse passo sem refator.

---

## Componentes

### `relationsNetworkHelpers.ts` (novo)

```ts
export function isEdgeAboveThreshold(weight: number, minWeight: number): boolean {
  return weight >= minWeight;
}

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

`computeEdgeOpacity` move a fórmula `0.25 + 0.6 * weight/maxWeight` (hoje inline em `relationsNetworkMode.ts:284`) pra dentro do helper — fonte única de verdade.

### Mudanças em `relationsNetworkMode.ts`

**State local na função `renderRelationsNetwork`:**

```ts
let hoveredNodeIdx: number | null = null;
const minEdgeWeight = ctx.relationsMinEdgeWeight ?? 1;
const maxObservedWeight = Math.max(1, ...edges.map(e => e.weight));
```

**No `redraw()` (linhas 272–365):**
- Skip da edge: `if (!isEdgeAboveThreshold(edge.weight, minEdgeWeight)) continue;`
- Opacity: substitui `const opacity = 0.25 + 0.6 * ...` por
  `computeEdgeOpacity(edge.weight, maxWeight, { sourceIdx: se.si, targetIdx: se.ti }, hoveredNodeIdx)`

**No `mousemove` handler (linhas 420–482):**
- Quando detecta nó: setar `hoveredNodeIdx = i` + `redraw()` (antes de retornar com tooltip)
- Quando NÃO detecta nó: se `hoveredNodeIdx !== null`, setar pra `null` + `redraw()`
- Edge hover continua só com tooltip (sem mexer em `hoveredNodeIdx`)

**No `mouseleave`:**
- Adicionar reset: `if (hoveredNodeIdx !== null) { hoveredNodeIdx = null; redraw(); }`

**No `mousedown` (início de drag — linhas 398–416):**
- Adicionar reset: `if (hoveredNodeIdx !== null) { hoveredNodeIdx = null; }` antes do `redraw()` implícito no drag. Razão: arrastar um nó com hover-focus ainda ativo deixaria edges não-conectadas ao nó arrastado dimmed durante o drag — comportamento confuso. Ao começar drag, reseta o foco.

### Mudanças em `renderRelationsNetworkOptions`

Adicionar 3º controle no painel (depois do "Show edge labels"):

```ts
const sliderRow = section.createDiv({ cls: "codemarker-config-row" });
sliderRow.createSpan({ text: "Min weight" });
const slider = sliderRow.createEl("input", { type: "range" });
slider.min = "1";
slider.max = String(maxObservedWeight);
slider.value = String(ctx.relationsMinEdgeWeight ?? 1);
slider.style.marginLeft = "auto";

const labelEl = sliderRow.createSpan({ cls: "codemarker-config-slider-label" });
labelEl.textContent = `${ctx.relationsMinEdgeWeight ?? 1} — showing ${visibleCount}/${totalEdges}`;

slider.addEventListener("change", () => {
  ctx.relationsMinEdgeWeight = parseInt(slider.value, 10);
  ctx.scheduleUpdate();
});
```

`maxObservedWeight` e `visibleCount`/`totalEdges` precisam ser computados na options-render. Razão: `renderRelationsNetworkOptions` e `renderRelationsNetwork` são chamados separadamente pelo `modeRegistry`. Solução: replicar as 2 chamadas (`extractRelationEdges` + count) na options-render — custo é uma reconsulta dos dados (sem efeito colateral, é leitura). Alternativa de cachear no ctx fica fora desse escopo (não justifica a complexidade pra 2 controles).

**Event type**: `"change"` (dispara no release), não `"input"` (dispara por pixel arrastado). Razão: cada disparo re-roda `scheduleUpdate()` → `renderRelationsNetwork` completa, com 200 iterações × N² da simulação force-directed. Em `"input"` o user perceberia lag durante o drag do slider; em `"change"` paga só uma vez no release.

**Clamp defensivo**: ao iniciar a render, se `ctx.relationsMinEdgeWeight > maxObservedWeight` (cenário: user mudou filtro de códigos e o threshold ficou acima do novo max), clamp pra `maxObservedWeight`. Sem isso, slider mostra valor visualmente clampado mas `ctx.relationsMinEdgeWeight` carrega valor inválido até próxima interação.

### Adicionar em `analyticsViewContext.ts`

```ts
relationsMinEdgeWeight: number;  // default 1, volátil por sessão
```

**Nota sobre o `minEdgeWeight` existente** (`analyticsViewContext.ts:35`): já existe um campo `minEdgeWeight` consumido pelo modo Network Graph (coocorrência). NÃO reusar — são threshold de coisas diferentes (Network Graph usa coocorrência de codes, Relations Network usa weight de relações). Reusar carregaria estado entre modos de forma surpreendente. Mode-prefixed `relationsMinEdgeWeight` segue o padrão de `relationsLevel` (linha 68 do mesmo arquivo).

**Inicialização**: campo de classe em `AnalyticsView`, mesmo padrão de `minEdgeWeight = 1` (`analyticsView.ts:25`) e `relationsLevel = 'both'` (`analyticsView.ts:78`):

```ts
relationsMinEdgeWeight = 1;
```

Não persiste em `data.json`.

---

## Data flow

```
USER ARRASTA SLIDER
  ↓
input event → ctx.relationsMinEdgeWeight = N → ctx.scheduleUpdate()
  ↓
renderRelationsNetwork() roda do zero
  ↓
extractRelationEdges() retorna TODAS as edges (helper não filtra na fonte)
  ↓
loop simEdges/draw aplica isEdgeAboveThreshold() — edges abaixo do threshold ficam invisíveis mas existem no array
  ↓
label do slider mostra "Min weight: N — showing X / Y edges"

USER PAIRA EM NÓ
  ↓
mousemove handler detecta nó na posição → hoveredNodeIdx = i → redraw()
  ↓
loop simEdges aplica computeEdgeOpacity() — edges não-conectadas ficam ÷3
  ↓
nós continuam pintados normalmente

USER SAI DO NÓ (movimento do mouse pra área vazia)
  ↓
mousemove sem hit em nó → se hoveredNodeIdx ≠ null, zera + redraw()

USER SAI DO CANVAS
  ↓
mouseleave → endDrag() + tooltip hide + reset hoveredNodeIdx + redraw()
```

### Decisões de fluxo importantes

- **Filtro NÃO afeta `extractRelationEdges`** — fica no view layer (`redraw()`). Razão: simulação roda com posições baseadas no grafo completo. Se filtrasse antes, layout mudaria com cada movimento de slider.
- **Filtro afeta apenas o draw**, não a simulação. Edges abaixo do threshold contribuem pra força de atração que posicionou os nós, mas não aparecem visualmente. Coerente com "filtro semântico = visualização, não estrutura".
- **Slider perde drag-positions ao mexer** — porque dispara `scheduleUpdate()`, igual ao Level dropdown. Aceito: slider é exploração ativa, não fica grudado. Hover-focus continua barato (`redraw()` local sem re-simular).
- **`maxObservedWeight` calculado uma vez por render** — usado pro `slider.max`. Não muda durante o slider drag.

---

## Error handling

- **`edges.length === 0`** — early return existente em `relationsNetworkMode.ts:128` continua valendo. Slider nem é renderizado.
- **`maxObservedWeight === 1`** (todos os edges têm weight 1) — `slider.max = "1"`, slider degenerado. Aceitável: não há nada pra filtrar.
- **`hoveredNodeIdx` aponta pra índice inválido** — não acontece: setado só dentro do loop `for (let i = 0; i < n; i++)` que itera sobre `simNodes`. Reset a `null` no leave/sem-hit.
- **Slider value fora do range** — `parseInt(slider.value, 10)` em range input nativo retorna sempre [min, max]. Sem validação extra.
- **Re-render durante drag de nó** — slider dispara `scheduleUpdate()`. Se user estava arrastando nó simultaneamente, `simNodes[]` é recriado e drag termina. Aceitável (uma ação contra a outra; user só faz uma).
- **`ctx.relationsMinEdgeWeight` ausente em data antiga** — não aplica (campo volátil, default 1, não persiste em `data.json`).

Sem try/catch novos. Sem null-guards defensivos.

---

## Testing

### Unit tests — `tests/analytics/relationsNetworkHelpers.test.ts`

```
describe('isEdgeAboveThreshold')
  - returns true when weight >= minWeight
  - returns false when weight < minWeight
  - returns true at boundary (weight === minWeight)

describe('computeEdgeOpacity')
  - returns base opacity formula when hoveredNodeIdx is null
  - returns base opacity for edge connected to hovered source
  - returns base opacity for edge connected to hovered target
  - returns base / 3 for edge not touching hovered node
  - scales base opacity linearly with weight/maxWeight
```

~8 cases, ~30 LOC. Roda em jsdom sem setup especial.

### Sem testes adicionados pra

- `relationsNetworkMode.ts` — depende de canvas + force simulation, mesma situação dos outros 19 modes (nenhum tem teste de view). Não regredir o padrão atual.
- Slider DOM event — `renderRelationsNetworkOptions` cria elementos via `createEl`; testar exigiria mock pesado de Obsidian containers. Outros controles do mesmo painel (`Level` dropdown, `Show edge labels`) também não têm teste.

### Smoke test manual

Vault `/Users/mosx/Desktop/obsidian-plugins-workbench/`:

1. Abrir Analytics, modo "Relations Network"
2. Hover em nó → edges não-conectadas devem escurecer; sair → tudo volta
3. Mexer slider "Min weight" → edges abaixo do threshold somem; label atualiza "showing X / Y"
4. Voltar slider pra 1 → tudo de volta
5. Mexer slider e depois hover em nó → ambos funcionam juntos
6. Trocar Level (Code-level ↔ Code+Segments) → slider reseta pra 1 (nova render)
7. Iniciar drag de um nó enquanto outro está em hover-focus → focus deve resetar imediatamente (sem dimming residual durante drag)
8. Mexer slider rapidamente — confirmar que re-render só dispara no release (event `"change"`, não `"input"`); UI fluida durante drag do slider

Contagem total esperada: 2220 + 8 = 2228 testes.

---

## Estimativa

ROADMAP estima 75 min (45 min hover-focus + 30 min filtro). Realista, considerando:
- 1 arquivo novo (~30 LOC) + 1 teste novo (~30 LOC)
- ~50 LOC delta em `relationsNetworkMode.ts`
- 1 campo novo em `AnalyticsViewContext`
- Sem migração, sem mudança de schema, sem outros modes afetados

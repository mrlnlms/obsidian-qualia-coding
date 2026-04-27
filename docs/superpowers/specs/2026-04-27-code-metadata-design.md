# Code × Metadata — Design

**Data:** 2026-04-27
**Status:** Design aprovado, pronto pra plano de implementação
**ROADMAP:** §3 Analytics — melhorias (item 2 após Relations Network polish concluído em 2026-04-27)

---

## Contexto

Pesquisa mixed-methods cruza códigos qualitativos com dimensões demográficas/contextuais ("códigos do RQ1 por região", "tema afetivo por idade"). Hoje o Analytics responde a **outra pergunta** com `chiSquareMode`: "este código é específico de um tipo de fonte?" (cruzamento código × source/file). Não há leitura nativa de **distribuição por perfil de caso**.

Com Case Variables já em produção (2026-04-21) e os valores acessíveis via `registry.getValuesForVariable(name)`, abre-se espaço para uma view dedicada que cruza códigos com qualquer variável de caso (text, multitext, number, checkbox, date, datetime).

A view é **descritiva primeiro, estatística como anotação**: pesquisador qualitativo quer ver distribuição (% por linha/coluna, heatmap colorido); estatística (chi²/Cramér's V) fica na coluna lateral, sempre visível mas discreta.

---

## Decisões de design

| # | Decisão | Resposta |
|---|---------|----------|
| 1 | Forma | Modo novo dedicado, não extensão do `chiSquareMode` |
| 2 | Visualização principal | Heatmap (canvas 2D) — linhas = códigos, colunas = valores da variável |
| 3 | Leituras alternativas | Toggle 3 estados: **Contagem** (default) → **% por linha** → **% por coluna**. Z-score e stacked 100% fora |
| 4 | Estatística | Coluna lateral fixa: `χ² · p` ao lado do nome do código. Asterisco quando `p < 0.05`. Sortable. Sem toggle |
| 5 | Variáveis suportadas | Todas (text, multitext, number, checkbox, date, datetime) |
| 6 | Binning de `number` | Quartis automáticos. Sem config UI no v1 |
| 7 | Granularidade de `date`/`datetime` | Auto: range > 2 anos → ano; entre 1 mês e 2 anos → mês; menor → dia |
| 8 | Tratamento de `multitext` | Explode (1 arquivo conta em N colunas). Chi² desabilitado (`—` na coluna) com tooltip "Chi² invalid for multitext" |
| 9 | Arquivos com variável vazia | Coluna especial **"(missing)"**, sempre última, cor neutra. Toggle "Hide missing" no painel |
| 10 | Filtros existentes | Aplicam normalmente (sources, codes, caseVariable filter). Banner discreto se variável escolhida == variável filtrada |
| 11 | Sem variáveis no registry | Empty state com link/sugestão pro side panel |
| 12 | Variável sem valores preenchidos | Empty state explicativo |
| 13 | Cardinalidade alta (>30 valores) | Sem truncar. User filtra se quiser. Sem alarmismo |

---

## Arquitetura

### Arquivos novos

**`src/analytics/data/stats/binning.ts`** — helpers puros:

```ts
export function binNumeric(values: number[]): { bins: string[]; assign: (v: number) => string }
export function binDate(values: Date[]): { bins: string[]; assign: (v: Date) => string }
export function explodeMultitext(value: VariableValue): string[]
```

- `binNumeric`: quartis (Q1, Q2, Q3) → 4 faixas `[min–Q1] (Q1–Q2] (Q2–Q3] (Q3–max]`. Edge: ≤4 valores únicos → categórico literal. Todos iguais → 1 bin
- `binDate`: detecta range → granularidade → string canônica (`2024`, `2024-03`, `2024-03-15`)
- `explodeMultitext`: array → strings; string → 1 elemento; vazio → `[]`

**`src/analytics/data/stats/codeMetadata.ts`** — função pura:

```ts
export interface CodeMetadataResult {
  codes: Array<{ id: string; name: string; color: string }>;
  values: string[];                          // categorias finais (binadas se number/date)
  matrix: number[][];                        // [code × value] = contagem
  rowTotals: number[];                       // por código
  colTotals: number[];                       // por valor
  grandTotal: number;
  hasMissingColumn: boolean;
  variableType: PropertyType;
  isMultitext: boolean;                      // chi² inválido se true
  stats: Array<{
    chiSquare: number;
    df: number;
    pValue: number;
    cramersV: number;
    significant: boolean;
  } | null>;                                  // null por código se isMultitext ou df=0
}

export function calculateCodeMetadata(
  data: ConsolidatedData,
  filters: FilterConfig,
  variableName: string,
  registry: CaseVariablesRegistry,
  options: { includeMissing: boolean }
): CodeMetadataResult
```

Pipeline:
1. `applyFilters(data, filters, registry)` — markers filtrados
2. Discovery dos valores via `registry.getValuesForVariable(variableName)`
3. Binning conforme tipo (`registry.getVariableType(name)` → bin function)
4. Para cada marker: lookup `registry.getVariables(fileId)[variableName]` → bin → coluna alvo. Multitext explode em N colunas; missing → coluna `"(missing)"` se `includeMissing`
5. Build matrix; chi² por código via helper extraído de `inferential.ts`

**`src/analytics/views/modes/codeMetadataMode.ts`** — `ModeEntry`:

- `label`: "Code × Metadata"
- `render`: empty states → `calculateCodeMetadata` → `renderHeatmap(container, result, displayMode)`
- `renderOptions`:
  - Dropdown **Variable** (nomes via `registry.getAllVariableNames()`, filtrado a variáveis com ≥1 valor preenchido)
  - Toggle 3 estados **Display** (Count / % row / % col)
  - Checkbox **Hide missing**
  - Banner condicional "Filtering by `<x>` while using as dimension"
- `exportCSV`: linhas = códigos, colunas = `code, total, <value_1>, …, <value_n>, (missing)?, chi2, df, p, cramers_v`

### Arquivos editados

| Arquivo | Mudança |
|---------|---------|
| `src/analytics/views/modes/modeRegistry.ts` | Registra `'code-metadata'` apontando pro novo `ModeEntry` |
| `src/analytics/views/analyticsViewContext.ts` | Adiciona `codeMetadataVariable: string \| null` e `codeMetadataDisplay: 'count' \| 'pct-row' \| 'pct-col'` e `codeMetadataHideMissing: boolean` |
| `src/analytics/views/analyticsView.ts` | Persistência dos novos estados no `data.json` (mesmo pattern de `sortMode`, `groupBy` etc.) |
| `src/analytics/data/stats/inferential.ts` | Extrai `computeChiSquareForCategories(observed: number[][]): { chi², df, p, cramersV, significant }` puro reutilizável. Mantém comportamento de `calculateChiSquare` idêntico |
| `src/analytics/data/statsEngine.ts` | Re-export de `calculateCodeMetadata` |

### Render do heatmap

Canvas 2D puro (mesmo pattern do `docMatrixMode`):

- **Linhas** = códigos, ordenadas por `total desc` (default), com toggles futuros pra alfa/chi²
- **Colunas** = valores da variável + opcional `(missing)` no fim
- **Célula**: cor via `heatmapColor(normalized)`; texto = valor formatado conforme `displayMode`
- **Coluna lateral** (à direita): `χ² · p` em duas linhas compactas; asterisco se `significant`; `—` se `isMultitext`
- **Hover**: tooltip com (código, valor, contagem, % linha, % col)
- **Click numa célula**: opcional — drill-down como TODO post-v1; v1 não implementa

### Empty states

| Cenário | Mensagem |
|---------|----------|
| `registry.getAllVariableNames()` vazio | "No Case Variables defined. Add them in the side panel." |
| Variável selecionada sem valores em nenhum arquivo | "No files have a value for `<name>`" |
| Filtros eliminam todos markers | "No data after filters" (idem outros modos) |
| Variável com 1 valor único | Renderiza 1 coluna; coluna estatística mostra `—` com aviso "Only one value — no contingency" |

---

## Data flow

```
User abre Analytics → escolhe View Mode = "Code × Metadata"
  ↓
renderOptions monta painel:
  • Dropdown Variable ← registry.getAllVariableNames() filtrado
  • Toggle Display (Count / % row / % col)
  • Checkbox Hide missing
  • Filtros padrão (sources, codes, caseVariable filter) — herdados do config global
  ↓
render(ctx, filters):
  1. variableName = ctx.codeMetadataVariable
  2. Empty state checks
  3. result = calculateCodeMetadata(data, filters, variableName, registry, { includeMissing })
  4. renderHeatmap(container, result, displayMode)
       → coluna lateral chi²/p
  ↓
Mudança de filtro/toggle → ctx.scheduleUpdate() (já existente)
Cache via ConsolidationCache (já existente) cobre o data
  ↓
Export CSV: matriz crua + colunas estatísticas
```

---

## Edge cases

| Caso | Comportamento |
|------|---------------|
| Sem Case Variables | Empty state com link pro side panel |
| Variável sem valores preenchidos | Empty state |
| 0 markers após filtros | "No data after filters" |
| Variável com 1 valor único | 1 coluna; chi² desabilitado (df=0); aviso compacto |
| Multitext | Explode; coluna chi² mostra `—` com tooltip |
| Number sem variação | 1 bin; mesmo tratamento de "1 valor único" |
| Date com range curto | Granularidade dia; sem tratamento especial |
| Variável escolhida == variável filtrada | Banner: "Filtering by `<x>` while using as dimension — only filtered value will appear" |
| Cardinalidade alta (>30) | Renderiza tudo; sem truncar |
| Marker em arquivo sem valor da variável | Coluna `(missing)` (toggleável) |

---

## Testing

### Unit (Vitest + jsdom)

| Arquivo | Cobertura |
|---------|-----------|
| `binning.test.ts` | `binNumeric`: quartis em distribuição uniforme; edge case 1 valor; todos iguais; ≤4 valores únicos → categórico; NaN/null skip. `binDate`: range >2 anos → ano; 1 mês–2 anos → mês; <1 mês → dia. `explodeMultitext`: array, string única, vazio, null |
| `codeMetadata.test.ts` | `calculateCodeMetadata` puro: matriz correta de contagem com fixture conhecido; chi² bate com cross-check externo (R/scipy) num caso 2×3; multitext → `stats[i] = null` e `isMultitext = true`; coluna `(missing)` populada quando arquivo sem valor; `includeMissing: false` exclui coluna; filtros aplicados antes do cálculo |
| `inferential.test.ts` (existente) | Garantir que extração de `computeChiSquareForCategories` mantém output idêntico ao `calculateChiSquare` original (regression) |

### Integration (jsdom DOM)

`codeMetadataMode.test.ts`:
- Render mode com fixture; empty states corretos por cenário
- Toggle display unit re-renderiza com células atualizadas
- Export CSV gera linhas esperadas (header + 1 linha por código + colunas estatísticas)

### Smoke manual obrigatório (memory `feedback_validate_dom_contract`)

Vault `obsidian-plugins-workbench` — após cada chunk de implementação, não só no fim:

- Abrir Analytics → escolher mode "Code × Metadata"
- Selecionar variável de cada tipo (text, number, multitext, date) em sucessão; conferir heatmap renderiza, chi² populado/desabilitado conforme tipo, empty states apropriados
- Alternar Count → % row → % col; conferir células atualizam
- Toggle "Hide missing" com e sem arquivos faltantes
- Conferir banner quando variável escolhida == variável filtrada
- Export CSV; abrir em planilha; conferir colunas batem

Testes verdes ≠ feature funcionando (lição cara): mocks vitest+jsdom validam contrato; runtime real do Obsidian + Chart.js/canvas só aparecem em vault.

---

## Fora do escopo (v1)

- Bins configuráveis pra `number` (config UI de quartis vs Sturges vs manual) — futuro
- Toggle granularidade de `date` (ano / mês / trimestre selecionável) — futuro
- Drill-down ao clicar numa célula (mostrar markers daquela combinação) — futuro
- Z-score como display unit — avançado, baixo retorno
- Stacked bar 100% como visualização alternativa — `% por coluna` no heatmap cobre
- E2E/visual regression — smoke manual + unit suffice (mesmo critério das specs anteriores)

---

## Estimativa

~3-4h. Distribuída como:
- Helpers de binning + extração do chi² puro (~1h)
- `calculateCodeMetadata` + testes (~1h)
- Mode + render heatmap + render options (~1-1.5h)
- Smoke manual + ajustes finais (~0.5h)

---

## Não-impacto

- Analytics existentes (frequency, cooccurrence, evolution, etc.) — sem mudanças
- Export QDPX/CSV global — sem mudanças
- Storage (`data.json`) — apenas 3 campos novos no estado da `AnalyticsView` (mesmo nível dos toggles existentes)
- Performance — mesmo pattern de cache do `docMatrixMode`; sem novos hot paths

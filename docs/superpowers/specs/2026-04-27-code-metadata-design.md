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
| 4 | Estatística | Coluna lateral fixa: `χ² · p` ao lado do nome do código. Asterisco quando `p < 0.05`. Sortable (click no header cicla por col + direção). Sem toggle on/off |
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

> Estrutura `src/analytics/data/` é flat (sem subpasta `stats/`). Todos os módulos estatísticos vivem ao lado de `frequency.ts`, `inferential.ts` etc.

**`src/analytics/data/binning.ts`** — helpers puros:

```ts
export function binNumeric(values: number[]): { bins: string[]; assign: (v: number) => string }
export function binDate(values: Date[]): { bins: string[]; assign: (v: Date) => string }
export function explodeMultitext(value: VariableValue): string[]
```

- `binNumeric`: quartis (Q1, Q2, Q3) → 4 faixas `[min–Q1] (Q1–Q2] (Q2–Q3] (Q3–max]`. Edge: ≤4 valores únicos → categórico literal. Todos iguais → 1 bin
- `binDate`: detecta range → granularidade → string canônica (`2024`, `2024-03`, `2024-03-15`)
- `explodeMultitext`: array → strings; string → 1 elemento; vazio → `[]`

**`src/analytics/data/codeMetadata.ts`** — função pura:

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
2. Tipo da variável via `registry.getType(variableName)` (a API correta — não há `getVariableType`)
3. Discovery dos rótulos de coluna:
   - `registry.getValuesForVariable(variableName)` retorna `VariableValue[]`. Quando o tipo é `multitext`, cada entrada pode ser `string[]` — **flatten obrigatório** para um `Set<string>` antes de gerar colunas
   - Para `number`/`date`/`datetime`, aplicar binning sobre o conjunto numérico/temporal e usar os rótulos de bin como colunas
   - Para `text`/`checkbox`, valor literal vira coluna
   - Coluna especial `"(missing)"` é adicionada no fim se `includeMissing` e existir ao menos 1 marker em arquivo sem valor preenchido
4. Para cada marker: lookup `registry.getVariables(fileId)[variableName]`. Aplica `bin`/`explodeMultitext` → 1 ou mais colunas alvo (multitext incrementa N células)
5. Build matrix `[code × value]`; chi² por código via helper genérico extraído de `inferential.ts` (ver § "Chi² puro reutilizável" abaixo)

**`src/analytics/views/modes/codeMetadataMode.ts`** — `ModeEntry`:

- `label`: "Code × Metadata"
- Acesso à registry: `ctx.plugin.caseVariablesRegistry` (campo já existente no `AnalyticsPluginAPI`, mesmo pattern usado por `analyticsView.ts:323`)
- `render`: empty states → `calculateCodeMetadata` → `renderHeatmap(container, result, displayMode)`
- `renderOptions`:
  - Dropdown **Variable** (nomes via `registry.getAllVariableNames()`, filtrado a variáveis com ≥1 valor preenchido)
  - Toggle 3 estados **Display** (Count / % row / % col)
  - Checkbox **Hide missing**
  - Banner condicional "Filtering by `<x>` while using as dimension"
- `exportCSV`: linhas = códigos, colunas = `code, total, <value_1>, …, <value_n>, (missing)?, chi2, df, p, cramers_v`. Para linhas multitext (chi² desabilitado), as 4 colunas estatísticas saem como string vazia `""` (não `NA`, não `—`) — facilita parse em R/Python sem custom NA handling

### Arquivos editados

| Arquivo | Mudança |
|---------|---------|
| `src/analytics/views/modes/modeRegistry.ts` | Registra `'code-metadata'` apontando pro novo `ModeEntry` |
| `src/analytics/views/analyticsViewContext.ts` | (a) Adiciona `'code-metadata'` no union `ViewMode`; (b) adiciona `codeMetadataVariable: string \| null`, `codeMetadataDisplay: 'count' \| 'pct-row' \| 'pct-col'`, `codeMetadataHideMissing: boolean`, `cmSort: { col: 'total' \| 'name' \| 'chi2' \| 'p'; asc: boolean }` |
| `src/analytics/views/analyticsView.ts` | Persistência dos novos estados no `data.json` (mesmo pattern de `sortMode`, `groupBy` etc.) |
| `src/analytics/data/inferential.ts` | Extrai helper genérico (ver § "Chi² puro reutilizável" abaixo). Refactor preserva comportamento de `calculateChiSquare` byte-identical |
| `src/analytics/data/statsEngine.ts` | Re-export de `calculateCodeMetadata` |

### Chi² puro reutilizável

`calculateChiSquare` atual (`inferential.ts:32`) constrói a tabela 2×K (presente/ausente × categoria) intercalado com a iteração de markers, e usa `N` (total de markers) como denominador. Pra reusar no `codeMetadata` (matriz K×M, sem dicotomia presente/ausente), o cálculo numérico precisa ser extraído em um helper puro genérico:

```ts
export function chiSquareFromContingency(
  observed: number[][]   // R rows × C cols, valores ≥ 0
): {
  chiSquare: number;
  df: number;
  pValue: number;
  cramersV: number;
  significant: boolean;
  expected: number[][];
}
```

**Requisitos do refactor:**

1. **Manter arredondamentos exatos** do `calculateChiSquare` original (`Math.round(e * 100)/100` nos expecteds, `Math.round(chiSq * 1000)/1000` no chi², etc.). Qualquer drift quebra a `inferential.test.ts` existente
2. **Regression test** em `inferential.test.ts`: rodar `calculateChiSquare` com fixtures pré-existentes antes/depois; outputs devem ser bit-idênticos
3. **Implementar primeiro** (chunk 1 da execução), antes de qualquer outro código novo. Smoke test imediato no vault confirma que o painel chi-square existente continua funcionando idêntico

`calculateChiSquare` interno passa a delegar a contagem da tabela 2×K + chamada do helper; `codeMetadata` delega a montagem da tabela K×M + chamada do mesmo helper.

`expected: number[][]` continua sendo retornado pelo helper porque o `chiSquareMode` (existente) consome essa matriz pra renderizar a tabela observed/expected. `codeMetadata` simplesmente descarta esse campo — heatmap não usa expected.

### Render do heatmap

Canvas 2D puro (mesmo pattern do `docMatrixMode`):

- **Linhas** = códigos. Ordenação **default**: `total desc`. Sortable via click no header de linhas: cicla `total desc → total asc → name asc → name desc → χ² desc → χ² asc → p asc → p desc → total desc`. Estado de sort persistido em `ctx.cmSort: { col: 'total' | 'name' | 'chi2' | 'p'; asc: boolean }`
- **Colunas** = valores da variável + opcional `(missing)` no fim
- **Célula**: cor via `heatmapColor(normalized)`; texto = valor formatado conforme `displayMode`
- **Coluna lateral** (à direita): `χ² · p` em duas linhas compactas; asterisco se `significant`; `—` se `isMultitext`
- **Hover**: tooltip com (código, valor, contagem, % linha, % col)
- **Click numa célula**: drill-down (mostrar markers daquela combinação) — fora do escopo v1

### Empty states

| Cenário | Mensagem |
|---------|----------|
| `registry.getAllVariableNames()` vazio | "No Case Variables defined. Add them in the side panel." |
| Variável selecionada sem valores em nenhum arquivo | "No files have a value for `<name>`" |
| Filtros eliminam todos markers | "No data after filters" (idem outros modos) |
| Variável com apenas 1 categoria após binning (1 valor único, ou number sem variação, ou date com 1 ponto no tempo) | Renderiza 1 coluna; coluna estatística mostra `—` com aviso "Only one value — no contingency". Tratamento unificado: o que importa é nº de bins, não tipo da variável |

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
| Variável com apenas 1 categoria após binning (1 valor único, number sem variação, date com 1 ponto) | 1 coluna; chi² desabilitado (df=0); aviso compacto. Tratamento unificado |
| Multitext | Explode; coluna chi² mostra `—` com tooltip |
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
| `codeMetadata.test.ts` | `calculateCodeMetadata` puro: matriz correta de contagem com fixture conhecido; chi² bate com cross-check externo (R/scipy) num caso 2×3; multitext → `stats[i] = null` e `isMultitext = true`; coluna `(missing)` populada quando arquivo sem valor; `includeMissing: false` exclui coluna; filtros aplicados antes do cálculo; flatten de multitext em discovery (input com `string[]` não vira coluna `["a","b"]`, vira colunas `a` e `b`) |
| `inferential.test.ts` (existente) | **Regression bit-idêntica**: `calculateChiSquare` rodado com fixtures pré-existentes antes/depois do refactor produz outputs idênticos ao último decimal armazenado. Incluir teste novo de `chiSquareFromContingency` em isolamento (3×3, 2×4, 1×K com df=0, fixture cross-checked com R/scipy) |

### Integration (jsdom DOM)

`codeMetadataMode.test.ts`:
- Render mode com fixture; empty states corretos por cenário
- Toggle display unit re-renderiza com células atualizadas
- Export CSV gera linhas esperadas (header + 1 linha por código + colunas estatísticas)

### Smoke manual obrigatório (memory `feedback_validate_dom_contract`)

Vault `obsidian-plugins-workbench` — após cada chunk de implementação, não só no fim:

- Abrir Analytics → escolher mode "Code × Metadata"
- Selecionar variável de cada tipo (text, number, multitext, date) em sucessão; conferir heatmap renderiza, chi² populado/desabilitado conforme tipo, empty states apropriados
- Caso de 1 categoria após binning (variável text com 1 valor único, ou number com todos arquivos no mesmo valor): conferir aviso "Only one value — no contingency" e chi² mostrando `—`
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

~3-4h. Distribuída em chunks com smoke checkpoint **a cada um**:

1. **Chi² extraction (chunk de risco)** — extrai `chiSquareFromContingency`, refaz `calculateChiSquare` delegando, regression test bit-idêntico, smoke do chi-square mode no vault. Se aqui passar, o resto é ferramentaria. (~1h)
2. **Binning + `calculateCodeMetadata`** — helpers puros + função consolidada + unit tests com fixture cross-checked. (~1h)
3. **Mode + heatmap + render options** — `codeMetadataMode.ts`, render canvas, dropdown/toggles, persistência, smoke completo no vault com cada tipo de variável. (~1-1.5h)
4. **Polish + ajustes pós-smoke** — empty states, tooltip, banner, CSV export. (~0.5h)

---

## Não-impacto

- Analytics existentes (frequency, cooccurrence, evolution, etc.) — sem mudanças
- Export QDPX/CSV global — sem mudanças
- Storage (`data.json`) — apenas 3 campos novos no estado da `AnalyticsView` (mesmo nível dos toggles existentes)
- Performance — mesmo pattern de cache do `docMatrixMode`; sem novos hot paths

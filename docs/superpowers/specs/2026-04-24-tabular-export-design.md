# Spec — Tabular Export (CSVs zipados) para análise externa

**Data:** 2026-04-24
**Status:** Design aprovado (brainstorming)
**Próximo passo:** Writing-plans (plano de implementação)

---

## Propósito

Permitir que o pesquisador exporte os dados codificados do projeto para consumo em ferramentas externas de análise estatística (R, Python, BI). O caso de uso central: **"não quero usar o Analytics do plugin, baixo e faço no R/tidyverse."**

Esse formato é complementar aos dois exports já existentes:

| Formato | Quem consome | Escopo |
|---|---|---|
| **QDPX** | Outro QDA tool (ATLAS.ti, NVivo, MAXQDA) | Projeto inteiro com arquivos fonte |
| **QDC** | Outro QDA tool (só codebook) | Codebook em REFI-QDA XML |
| **Tabular (novo)** | R, Python, BI | Segmentos + códigos + metadata em CSV relacional flat |

Origem do item: substitui `JSON full export` que vinha no ROADMAP desde 2026-03-03 sem propósito definido (era cargo cult de uma tabela UX antiga). Ver `docs/ROADMAP.md §2` para o contexto.

---

## Escopo — MVP vs não-MVP

**MVP (esta sessão):**
- Export via modal existente de Export (nova opção no dropdown)
- Command palette
- Botão na settings tab
- Zip com até 5 CSVs + README.md embutido
- 2 toggles configuráveis: `Include relations`, `Include shape coords`

**Não-MVP (fora do escopo, anotado em `ROADMAP.md` como Decisão de produto aberta):**
- Import/round-trip do zip tabular de volta pro vault
- Formato Parquet (descartado — tidyverse lê CSV em 1 linha, dataset qualitativo não justifica)
- Configuração de separador/encoding (UTF-8 + vírgula hardcoded, YAGNI)
- Split por engine em múltiplos zips

---

## UX

### Modal de Export existente

O modal atual (`src/export/exportModal.ts`) ganha uma terceira opção no dropdown de formato:

```
Format: [▼ QDPX (full project)      ]
        [  QDC (codebook only)       ]
        [  Tabular (CSV zip)         ]   ← novo
```

Quando `Tabular` está selecionado, a seção dinâmica do modal mostra:

```
☑ Include relations            — adiciona relations.csv ao zip
☑ Include shape coords         — adiciona colunas shape_type/shape_coords
```

Ambos os toggles são `on` por default. O campo `File name` continua funcionando igual (default `qualia-project.zip`, usuário pode renomear).

### Command palette

Nova command:
- `export-tabular` → "Export codes as tabular data (for R/Python)"

Abre o modal com `Tabular` pré-selecionado.

### Settings tab

Novo botão na settings tab: **"Export tabular for external analysis"**. Abre o mesmo modal com `Tabular` pré-selecionado.

### Output

O arquivo `.zip` é criado no **root do vault** via `vault.createBinary`. Consistente com o comportamento do QDPX export atual.

---

## Schema das tabelas

### 1. `segments.csv` — 1 linha por segmento codificado

Consolida os 6 tipos persistidos de marker em 8 `sourceType`s para leitura no R. A projeção é feita no builder no momento do export (o tipo persistido `MarkerType` é 6-valued; o PDF engine tem 2 arrays separados `markers` + `shapes`, e o CSV engine tem `segmentMarkers` + `rowMarkers`, que viram 4 `sourceType`s distintos):

| MarkerType persistido | sourceType no CSV |
|---|---|
| `markdown` | `markdown` |
| `pdf` (texto) | `pdf_text` |
| `pdf` (shape) | `pdf_shape` |
| `image` | `image` |
| `audio` | `audio` |
| `video` | `video` |
| `csv` (segment) | `csv_segment` |
| `csv` (row) | `csv_row` |

Também uma coluna adicional `engine` coarse (6 valores, correspondendo ao `MarkerType` persistido) para facilitar filtros: `filter(engine == "pdf")` pega text e shape juntos sem listar ambos.

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | string | ID interno do plugin |
| `fileId` | string | Path do arquivo no vault |
| `engine` | enum | `markdown` / `pdf` / `image` / `audio` / `video` / `csv` — corresponde ao `MarkerType` persistido |
| `sourceType` | enum | `markdown` / `pdf_text` / `pdf_shape` / `image` / `audio` / `video` / `csv_segment` / `csv_row` — projeção fina |
| `text` | string | Full text quando disponível. Ver seção "Resolução de texto" abaixo. Vazio para shapes e media. CSV quoting padrão — suporta newlines e quotes internos |
| `memo` | string | Memo do segment (vazio se não tem) |
| `createdAt` | ISO 8601 | `2026-04-24T10:32:15Z` |
| `updatedAt` | ISO 8601 | idem |
| `page` | int | PDF só (1-based, consistente com `data-page-number` do viewer) |
| `begin_index`, `begin_offset`, `end_index`, `end_offset` | int | PDF text só |
| `line_from`, `ch_from`, `line_to`, `ch_to` | int | Markdown só |
| `row` | int | CSV só (0-based) |
| `column` | string | CSV só (nome da coluna source) |
| `cell_from`, `cell_to` | int | CSV segment só (offset dentro da célula) |
| `time_from`, `time_to` | ms (int) | Audio/video só. Convertido de segundos no source (`MediaMarker.from/to`) × 1000 + round |
| `shape_type` | enum | `rect` / `ellipse` / `polygon` (quando `Include shape coords` on) |
| `shape_coords` | JSON string | `{"type":"rect","x":10,"y":20,"w":30,"h":40}` (quando `Include shape coords` on). Escala: PDF = 0-100 (`PercentShapeCoords`), image = 0-1 (`NormalizedCoords`). Documentado no README |

**Decisões:**
- `colorOverride` e `color` **não** saem no segment — cor é display concern; análise externa não precisa
- Timestamps em ISO 8601 (padrão R/lubridate `ymd_hms`)
- `text` sem truncamento (full text)

**Resolução de texto:**

- `markdown` e `pdf_text`: marker já tem `text` no data.json (populado no capture / resolvido via anchor no primeiro render)
- `csv_segment`: marker NÃO tem `text` persistido. O orchestrator lê o arquivo CSV via `PapaParse`, extrai `record[column].slice(from, to)`, e passa um `Map<markerId, string>` pro builder. Builder continua função pura
- `csv_row`: marker NÃO tem `text`. Orchestrator extrai o valor inteiro da célula `record[column]` (sem slice) e passa no mesmo Map
- `pdf_shape`, `image`, `audio`, `video`: `text` fica vazio (coords/tempo são o dado)

Falha ao ler CSV (arquivo movido/deletado): warning `"CSV {fileId}: cannot read source for text resolution"`, segments do engine csv saem com `text` vazio.

### 2. `code_applications.csv` — 1 linha por aplicação código × segment

Um segment pode ter N códigos aplicados. Esta tabela normaliza essa relação.

| Coluna | Tipo | Notas |
|---|---|---|
| `segment_id` | string | Foreign key → `segments.id` |
| `code_id` | string | Foreign key → `codes.id` |
| `magnitude` | string (nullable) | Valor da magnitude se configurada no código |

### 3. `codes.csv` — codebook denormalizado

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | string | ID interno |
| `name` | string | Nome do código |
| `color` | string | Hex (ex: `#e74c3c`) |
| `parent_id` | string (nullable) | Foreign key → `codes.id` para hierarquia |
| `description` | string | Description do código (vazio se não tem) |
| `magnitude_config` | JSON string (nullable) | `{type: 'continuous', values: [...]}` do `CodeDefinition.magnitude`. Parseia no R só se quiser |

**Pastas (folders)** do codebook não são exportadas — são organização visual, não afetam análise.

### 4. `case_variables.csv` — long format (1 linha por fileId × variable)

Case Variables são propriedades tipadas por arquivo (mixed-methods). Long format permite join trivial com `segments.csv` via `fileId`.

| Coluna | Tipo | Notas |
|---|---|---|
| `fileId` | string | Foreign key → `segments.fileId` |
| `variable` | string | Nome da propriedade |
| `value` | string | Valor coerced para string (ver "Serialização de valores" abaixo) |
| `type` | enum | `text` / `multitext` / `number` / `date` / `datetime` / `checkbox` (6 valores, match do `PropertyType` persistido) |

**Serialização de valores:**

- `text`, `number`, `date`, `datetime`: stringify direto (`String(value)`)
- `checkbox`: `"true"` / `"false"`
- `multitext`: array serializado como JSON (`JSON.stringify(value)` → `["a","b"]`). User parseia no R com `jsonlite::fromJSON` se precisar
- `null`: string vazia (célula em branco). Row ainda é emitido (semântica: "variável declarada mas valor ausente")

Exemplo no R:
```r
library(tidyverse)
vars <- read_csv("case_variables.csv")

# Pivot pra wide se precisar
vars_wide <- vars %>% pivot_wider(names_from = variable, values_from = value)

# Join com segments
segments %>%
  inner_join(vars %>% filter(variable == "age"), by = "fileId") %>%
  mutate(age = as.numeric(value))

# Parse multitext
vars %>%
  filter(type == "multitext") %>%
  mutate(parsed = map(value, jsonlite::fromJSON))
```

### 5. `relations.csv` — só se `Include relations` on

Relations têm 2 tipos no plugin:

1. **Code-level** (`CodeDefinition.relations`) — relações entre códigos do codebook ("parent-of", "similar-to", "contradicts")
2. **Application-level** (`CodeApplication.relations`) — relações de uma aplicação específica (segment + code) com outro código

A tabela unifica ambos com uma coluna `scope`. Em vez de um composite key string (`{segment_id}:{code_id}`), usa colunas separadas `origin_segment_id` / `origin_code_id` que são nulláveis — joins triviais no R.

| Coluna | Tipo | Notas |
|---|---|---|
| `scope` | enum | `code` (do codebook) ou `application` (de um CodeApplication específico) |
| `origin_code_id` | string | Code id do origin. Preenchido em ambos scopes |
| `origin_segment_id` | string (nullable) | Segment id do origin. Vazio se `scope=code` |
| `target_code_id` | string | Code id do target (sempre code — `CodeRelation.target` é code id por convenção do plugin) |
| `label` | string | "parent-of", "contradicts", etc. Livre (autocomplete no plugin) |
| `directed` | bool | `true` / `false` |

Se `Include relations` está `off`, esta tabela simplesmente não é criada.

**Nota sobre `target`:** `CodeRelation.target` no plugin é um `string` sem discriminador de tipo; por convenção refere-se a um code id. O spec assume isso — se a convenção mudar no futuro (ex: permitir target segment), o builder precisa adicionar uma coluna `target_segment_id`.

### 6. `README.md` — embutido no zip

Gerado no momento do export com:

- Timestamp e versão do plugin
- Descrição de cada tabela + schema detalhado
- Exemplo de código R pra começar:
  ```r
  library(tidyverse)
  segments <- read_csv("segments.csv")
  apps <- read_csv("code_applications.csv")
  codes <- read_csv("codes.csv")

  # Frequência por código (nome resolvido)
  apps %>%
    inner_join(codes, by = c("code_id" = "id")) %>%
    count(name, sort = TRUE)
  ```
  Nota: use `readr::read_csv` (tidyverse) em vez de `read.csv` (base R) — lida melhor com quoting multi-linha.
- Exemplo equivalente em Python/pandas:
  ```python
  import pandas as pd
  segments = pd.read_csv("segments.csv")
  apps = pd.read_csv("code_applications.csv")
  codes = pd.read_csv("codes.csv")

  # Frequência por código
  apps.merge(codes, left_on="code_id", right_on="id")["name"].value_counts()
  ```
- Seção final **Warnings** (se houver)

---

## Arquitetura de módulos

Novo diretório `src/export/tabular/`:

```
src/export/tabular/
  tabularExporter.ts            — orquestrador: data → CSVs → zip
  buildSegmentsTable.ts         — gera segments.csv (consolida 8 sourceTypes)
  buildCodeApplicationsTable.ts — gera code_applications.csv
  buildCodesTable.ts            — gera codes.csv
  buildCaseVariablesTable.ts    — gera case_variables.csv
  buildRelationsTable.ts        — gera relations.csv (opcional)
  csvWriter.ts                  — helper puro (escape, quoting, UTF-8 BOM)
  readmeBuilder.ts              — gera README.md embutido no zip
```

Cada `build*Table.ts` é **função pura** com input tipado e output de `string[][]` (array de rows). Testável isoladamente sem mock de Obsidian.

`csvWriter.ts` recebe rows + header e retorna `string` (CSV inteiro). Escape padrão: aspas duplas em todo valor string, `""` para escape de quote interno, UTF-8 BOM no início.

`tabularExporter.ts` orquestra:

```typescript
export interface TabularExportOptions {
  fileName: string;
  includeRelations: boolean;
  includeShapeCoords: boolean;
}

export interface TabularExportResult {
  fileName: string;
  data: Uint8Array; // zip
  warnings: string[];
}

export async function exportTabular(
  app: App,
  dataManager: DataManager,
  registry: CodeDefinitionRegistry,
  caseVariablesRegistry: CaseVariablesRegistry,
  options: TabularExportOptions,
): Promise<TabularExportResult>;
```

Fluxo:

```
ExportModal.doExport → if (format === 'tabular')
  → tabularExporter.exportTabular(...)
    → buildSegmentsTable(dataManager, includeShapeCoords)
    → buildCodeApplicationsTable(dataManager)
    → buildCodesTable(registry)
    → buildCaseVariablesTable(caseVariablesRegistry)
    → if (includeRelations) buildRelationsTable(registry, dataManager)
    → csvWriter.toCsv(rows) pra cada
    → readmeBuilder.build(options, warnings) → README.md
    → fflate.zipSync({...CSVs, 'README.md': ...}) → Uint8Array
  → vault.createBinary(fileName, zipBuffer)
```

**Modificações em arquivos existentes:**

| Arquivo | Mudança |
|---|---|
| `src/export/exportModal.ts` | (a) Tipo `format` vira `'qdc' \| 'qdpx' \| 'tabular'`. (b) 3ª opção no dropdown. (c) `fileName` substitution no `onChange` trata `tabular` → extensão `.zip` (QDPX/QDC mantêm extensão = format). (d) 2 toggles `Include relations` / `Include shape coords` renderizados só quando `format==='tabular'`. (e) `doExport` branch: se `format==='tabular'`, chama `exportTabular(...)`; senão mantém fluxo `exportProject(...)` existente |
| `src/export/exportCommands.ts` | Nova command `export-tabular`, factory `openExportModal` aceita `'tabular'` como default |
| `src/core/settingTab.ts` | Novo botão "Export tabular for external analysis" que chama `openExportModal(plugin, 'tabular')` |

**Dependências:**
- `fflate` — já no bundle (usado por QDPX)
- Nada novo

---

## Error handling

Princípios: **fail-soft com warnings coletados**, igual ao QDPX exporter existente (`src/export/qdpxExporter.ts`).

**Warnings coletados (não abortam):**

| Cenário | Handling |
|---|---|
| Segment com `codeId` órfão (código deletado mas application ficou) | Skip aplicação, warning. Se TODAS as aplicações de um segment são órfãs, o segment ainda é emitido (memo/metadata podem ter valor analítico) |
| Case variable com tipo inválido | Salva como `text`, warning |
| Shape marker com coords malformado | Skip coords (segment ainda sai com `shape_type`/`shape_coords` vazios), warning |
| Campo de tempo NaN em media marker | Emit segment com `time_from`/`time_to` vazios, warning — não skip (mantém code applications) |
| CSV source não legível pra resolução de texto | Segments do CSV saem com `text` vazio, warning |

**Erros que abortam:**

- Falha ao escrever o zip no vault (full, permission, etc) → propaga exception, modal mostra `Notice` "Export failed: ..."

**Output de warnings:**

- Append na última seção do `README.md` dentro do zip: `## Warnings (N)` + lista
- Notice no Obsidian ao fim: `"Export complete with N warnings (see README inside zip)"`

**Idempotência:** sem cache, sem side-effects no vault além de criar o `.zip`. Re-rodar gera zip idêntico módulo timestamps do runtime.

---

## Testing

**Unit tests** em `tests/export/tabular/`:

| Suite | Cobertura |
|---|---|
| `csvWriter.test.ts` | Escape de vírgula, aspas, newlines, UTF-8 BOM, empty string, null, unicode |
| `buildSegmentsTable.test.ts` | 8 sourceTypes renderizados corretamente (1 fixture por tipo); toggle `includeShapeCoords` on/off |
| `buildCodeApplicationsTable.test.ts` | Multi-code por segment; magnitude presente/ausente; orphan code warning |
| `buildCodesTable.test.ts` | Hierarchy (`parent_id`); colors; `magnitude_config` serializado como JSON válido |
| `buildCaseVariablesTable.test.ts` | Long format; 5 tipos de valor (text/number/date/datetime/checkbox); tipo inválido → warning |
| `buildRelationsTable.test.ts` | Code-level + application-level no mesmo arquivo com `scope` correto; `directed` true/false |
| `tabularExporter.test.ts` | End-to-end: data fixture → zip com CSVs esperados + README |
| `readmeBuilder.test.ts` | Schema doc correto; warnings renderizados; timestamp/versão |

**Pattern de fixture:** DataManager real com `createMockPlugin` (já usado em `tests/core/dataManager.test.ts`). Reuso do pattern.

**Round-trip test:** skip. Import tabular não é goal do MVP (anotado em ROADMAP como Decisão de produto aberta).

**Estimativa de testes:** ~25-35 novos. Contagem total sobe de 1990 → ~2020.

---

## Riscos e mitigações

| Risco | Impacto | Mitigação |
|---|---|---|
| `text` com newlines/quotes quebra parser CSV fraco | Low | UTF-8 BOM + quoting padrão; tidyverse, pandas lidam sem drama. Documentar no README: "usar `read_csv` não `read.csv` no R" (base R tem edge cases) |
| Zip grande (10MB+) com dataset qualitativo | Low | Caso extremo — research qualitativa tipicamente tem < 1MB. fflate comprime bem |
| Usuário edita CSV e tenta reimportar | Medium | Fora de escopo do MVP. README deixa explícito: "read-only export" |
| Coords de shape em escalas diferentes (PDF 0-100, image 0-1) | Low | Documentado no README. Toggle off se usuário não quer |
| Case variable com valor complexo (array, JSON) | Low | Case Variables atuais só suportam valores escalares; não existe caso complexo |

---

## Não-objetivos (explicitados)

- Não é QDPX (não interop com outros QDA tools)
- Não inclui arquivos fonte (PDFs, imagens, áudios) — se precisar, usuário usa QDPX
- Não inclui `color`/`colorOverride` dos segments (display concern)
- Não exporta pastas do codebook (organização visual)
- Não é round-trip — export-only no MVP
- Não configura separador/encoding — UTF-8 + vírgula hardcoded
- Não oferece Parquet (YAGNI pra volume típico)

# CodeMarker Suite — Project Overview

## O que é

CodeMarker é uma suíte de 7 plugins Obsidian para **análise qualitativa e mixed methods** de dados multi-mídia. Permite que pesquisadores codifiquem, anotem e analisem dados em **7 tipos de fonte** — Markdown, CSV, PDF, Imagem, Áudio, Vídeo — usando um sistema unificado de códigos compartilhados entre todos os plugins, com um módulo de Analytics consolidado que opera sobre todos os dados simultaneamente.

**~35,000 linhas de TypeScript + ~4,600 linhas de CSS** distribuídas em 7 plugins.

---

## Os 7 Plugins

### 1. CodeMarker v2 — Markdown (5,300 TS + 717 CSS)
O plugin core. Engine CM6 (CodeMirror 6) completa para codificação de texto em Markdown:
- **Markers**: seleção de texto → criação de marker com códigos do shared registry
- **Decorations**: highlighting colorido por código com transparency layering
- **Handles**: drag-resize de markers (start/end handles visuais)
- **Margin Panel**: painel lateral estilo MAXQDA com brackets, labels, dots e ticks — hover bidirecional (panel ↔ editor)
- **Hover Menu**: tooltip CM6 nativo sobre markers existentes com toggle list de códigos + actions
- **Selection Menu**: tooltip sobre seleção de texto para criar novos markers
- **Smart layering**: `findSmallestMarkerAtPos()` — markers aninhados priorizados por tamanho; interseção parcial por rightmost start
- **Code Explorer**: árvore 3 níveis (Code → File → Segment) com toolbar collapse/expand
- **Code Detail View**: sidebar com 3 modos — lista de todos os códigos, code-focused (cross-file), marker-focused (detalhe)

### 2. CodeMarker CSV — Tabular Data (8,200 TS + 951 CSS)
O maior plugin. Abre arquivos CSV como views nativas usando AG Grid Community:
- **AG Grid integration**: sort, filter, resize, cell editing nativo
- **Dois tipos de marker**: RowMarker (linha inteira) e SegmentMarker (seleção dentro de célula)
- **Segment editor**: abre célula em editor CM6 completo com TODAS as extensões do Markdown (markers, decorations, handles, margin panel, selection/hover menus)
- **Virtual fileIds**: `csv:${file}:${row}:${column}` para isolar markers de cada célula
- **Cell tag chips**: chips coloridos nas células com × para remover código
- **Header tag button**: aplicar código a todas as rows de uma vez
- **Comment column**: toggle dependente do modo de codificação, word-wrap, cell editor dedicado
- **Standalone Editor Registry**: WeakMap para rastrear editors CM6 standalone (não vinculados a files reais do vault)
- **Navigation**: sidebar dispara `codemarker-csv:navigate` → `gridApi.ensureIndexVisible()` + `flashCells()`

### 3. CodeMarker PDF (5,200 TS + 534 CSS)
Codificação sobre a view PDF nativa do Obsidian, sem dependências externas (usa PDF.js embutido):
- **Selection capture**: mouseup → `getTextLayerNode()` + `data-idx` → index/offset exatos no text layer
- **Highlight rendering**: PDF coords (bottom-left origin) → CSS % (top-left) via `placeRectInPage()`; `computeMergedHighlightRects()` adaptado do PDF++ (MIT)
- **Chars-level bounding**: usa `item.chars` do Obsidian com fallback DOM Range para precisão sub-linha
- **Margin Panel Overlay**: panels renderizados em page divs → movidos para overlay externo fora do scroll container (labels não cortados por overflow)
- **Page push**: `scrollContainer.style.marginLeft` encolhe páginas; overlay adapta quando thumbnails abrem/fecham
- **Cross-page detection**: `Notice` se seleção cruza páginas (limitação de design)
- **Double-click em highlight** → popover para editar códigos; single-click → sidebar detail
- **Compat**: Obsidian v1.7.7 (OldTextLayerBuilder) e v1.8.0+ (TextLayerBuilder.textLayer)

### 4. CodeMarker Image (2,800 TS + 564 CSS)
Codificação de regiões em imagens usando Fabric.js:
- **3 shape types**: Rect, Ellipse, Polygon (freeform drawing)
- **Coordenadas normalizadas**: todas 0–1 relativas ao tamanho natural da imagem (resolution-independent)
- **Canvas**: Fabric.js 6.6.1 com region drawing, highlight (glow effect), labels renderizados sobre shapes
- **Auto-open**: interceptor `active-leaf-change` (não `registerExtensions` — conflita com built-in)
- **Coding menu**: floating popover com toggle list + actions sobre regiões selecionadas
- **Sidebar views**: explorer tree 3 níveis + detail view 3 modos

### 5. CodeMarker Audio (2,650 TS + 561 CSS)
Codificação de segmentos temporais em áudio usando WaveSurfer.js v7:
- **WaveSurfer**: RegionsPlugin (colored regions), TimelinePlugin, MinimapPlugin
- **Vertical lanes**: greedy interval sweep em `applyLanes()` para regions sobrepostas
- **Minimap markers**: overlay com divs % posicionadas sobre MinimapPlugin
- **Transport bar**: play/pause, seek, zoom, scroll
- **Memo field**: textarea por marker com pausa de changeListener durante edição
- **Hover bidirecional**: region ↔ sidebar explorer
- **ResizeObserver**: zoom reflow debounced 100ms, try-catch para race condition com audio não carregado
- **Event bridge**: `codemarker-audio:seek` — Analytics → Audio navigation

### 6. CodeMarker Video (2,680 TS + 579 CSS)
Fork do Audio com adaptação para vídeo:
- **Video player**: `<video>` element no topo, waveform sincronizado abaixo
- **WaveSurfer com `media` option**: recebe `HTMLMediaElement` em vez de URL — waveform renderiza a partir do elemento de vídeo
- **Layout**: videoPlayerEl → waveformEl → timelineEl → transport
- **Settings**: `videoFit` (contain/cover) para controle de aspect ratio
- **Resto idêntico ao Audio**: regions, lanes, minimap, transport, memo, sidebars

### 7. CodeMarker Analytics (7,900 TS + 730 CSS)
O módulo de análise consolidada. Consolida dados de **todos os 6 plugins de codificação** e oferece **17 view modes** com **10 engines de análise**:

---

## Analytics — Arquitetura

### Data Pipeline
```
6 Plugins de Codificação
├── codemarker-v2 (data.json)
├── codemarker-csv (data.json)
├── codemarker-pdf (data.json)
├── codemarker-image (data.json)
├── codemarker-audio (data.json)
└── codemarker-video (data.json)
        ↓
dataReader.ts — lê data.json de cada plugin sibling via vault.adapter.read()
        ↓
dataConsolidator.ts — consolidate() → ConsolidatedData
├── UnifiedMarker[] (id, source, file, codes, meta)
├── UnifiedCode[] (name, color, description, sources)
└── sources: { markdown, csv, image, pdf, audio, video }
        ↓
10 Engines de Análise (pure functions, zero side effects)
        ↓
17 View Modes (renderizados em analyticsView.ts — 5,200 LOC)
```

### UnifiedMarker — O tipo central
```typescript
interface UnifiedMarker {
  id: string;
  source: "markdown" | "csv-segment" | "csv-row" | "image" | "pdf" | "audio" | "video";
  file: string;
  codes: string[];
  meta?: {
    row?, column?,           // CSV
    regionType?,             // Image
    fromLine?, toLine?,      // Markdown
    fromCh?, toCh?,          // Markdown (sub-line)
    page?, pdfText?,         // PDF
    audioFrom?, audioTo?,    // Audio (seconds)
    videoFrom?, videoTo?,    // Video (seconds)
    createdAt?               // Timestamp de criação
  };
}
```

### 10 Engines de Análise

#### 1. statsEngine.ts (733 LOC)
Motor principal com 7 funções:
- **`calculateFrequency()`** — contagem de cada código, breakdown por source type e por file
- **`calculateCooccurrence()`** — matrix código × código; diagonal = frequência, off-diagonal = co-ocorrência no mesmo marker. 5 display modes: absolute, percentage, Jaccard, Dice, presence (0/1). 3 sort modes: alpha, frequency, cluster (hierárquico)
- **`calculateDocumentCodeMatrix()`** — matrix documento × código, valores = frequências. Input central para clustering, MCA, MDS, decision tree
- **`calculateEvolution()`** — scatter de códigos por posição normalizada (fromLine/maxLine) dentro de cada file. Mostra distribuição espacial da codificação
- **`calculateTemporal()`** — linha cumulativa de cada código ao longo do tempo real (createdAt). Mostra como a codificação evolui cronologicamente
- **`calculateTextStats()`** — word count, unique words, TTR (type-token ratio), avg words/segment, avg chars/segment. Métricas lexicais por código
- **`calculateLagSequential()`** — Lag Sequential Analysis (LSA). Probabilidades condicionais de transição entre códigos em lag N. Agrupa markers por file, ordena por posição (audioFrom → videoFrom → fromLine → row → page), conta transições, calcula expected frequencies e **z-scores ajustados** (adjusted residuals). Fundamentação: Bakeman & Quera (Ch.12 Routledge)

#### 2. clusterEngine.ts (265 LOC)
Hierarchical clustering completo:
- **`hierarchicalCluster()`** — agglomerative average-linkage. Input: distance matrix. Output: leaf ordering + merge history
- **`buildDendrogram()`** — constrói árvore binária a partir dos merges. Leaf nodes = items originais com label e cor; internal nodes = merges com distance
- **`cutDendrogram()`** — corta dendrograma em threshold de distância → cluster assignments (array de IDs)
- **`calculateSilhouette()`** — Silhouette scores (Rousseeuw 1987). Si = (bi - ai) / max(ai, bi). Score por item + avg global. Fundamentação: Ch.5 Routledge

#### 3. mcaEngine.ts (210 LOC)
Multiple Correspondence Analysis via SVD:
- **`calculateMCA()`** — biplot 2D de códigos e markers
- Pipeline: indicator matrix Z (markers × codes, 0/1) → correspondence matrix P = Z/N → row masses r, column masses c → standardized residuals S = (P - rc') / sqrt(rc') → SVD(S) → eigenvalues, row coordinates F, column coordinates G
- Output: codePoints (x,y), markerPoints (x,y,file,source,codes), eigenvalues, % inertia explicada por eixo
- Dependência: svd-js (lazy import)

#### 4. mdsEngine.ts (264 LOC)
Classical Multidimensional Scaling (Torgerson):
- **`calculateMDS()`** — projeção 2D baseada em distância Jaccard
- 2 modes: **codes** (cluster códigos por marker overlap) e **files** (cluster files por code overlap)
- Pipeline: Jaccard distance matrix → D² → double centering B = -0.5 * H * D² * H → SVD(B) → coordinates X = sqrt(λ) * v
- **Kruskal stress-1**: goodness of fit — `sqrt(Σ(d_orig - d_embed)² / Σd_orig²)`. < 0.1 = bom, < 0.2 = aceitável
- Output: points (x,y,size), stress, % variance por dimensão

#### 5. decisionTreeEngine.ts (313 LOC)
Decision Tree (CHAID-style):
- Input: Document-Code Matrix binarizada + código-alvo como outcome
- Algoritmo: chi-square splitting recursivo, max depth configurável, min node size 5
- Output: tree nodes com split criterion, n, correct/errors, accuracy, child branches
- **Klecka's tau**: (accuracy - a_priori) / (1 - a_priori)
- Lista marker IDs nos endpoints com erros → integração com Text Retrieval para análise qualitativa dos erros
- Fundamentação: Ch.6 (CHAID) + Ch.16 (EDM) do Routledge

#### 6. wordFrequency.ts (139 LOC)
Word cloud engine:
- **`calculateWordFrequencies()`** — tokeniza texto dos segmentos extraídos, filtra stopwords, retorna top N palavras
- Stopwords: PT (57 palavras) + EN (78 palavras), configurável (pt/en/both)
- Output: word, count, codes associados, source types
- Ignora segmentos de imagem (sem texto)

#### 7. textExtractor.ts (228 LOC)
Extração de texto de todas as fontes:
- **MD**: lê arquivo, split lines, slice por ch offsets (sub-line precision)
- **CSV segment**: parseCsv() embutido, localiza célula por row+column, aplica offsets
- **CSV row**: célula inteira ou join de todas as colunas
- **PDF**: usa `meta.pdfText` direto (PdfMarker já armazena texto capturado)
- **Audio/Video**: `formatTime(from) – formatTime(to)` como representação textual
- **Image**: retorna `"[image region]"`
- File cache para performance em batch extraction

#### 8-10. Suporte (dataReader, dataConsolidator, dataTypes)
- **dataReader.ts** (35 LOC): `readPluginData()` genérica — lê `data.json` de cada plugin sibling
- **dataConsolidator.ts** (272 LOC): `consolidate()` — normaliza markers de 6 plugins em `UnifiedMarker[]`, merge code definitions, detect available sources
- **dataTypes.ts** (168 LOC): tipos TypeScript para todo o sistema

### 17 View Modes

| # | Mode | O que mostra | Engine |
|---|---|---|---|
| 1 | **Dashboard** | KPI cards (codes, markers, files, sources) + thumbnails clicáveis de cada view | — |
| 2 | **Frequency** | Bar chart de frequência de códigos, breakdown por source | calculateFrequency |
| 3 | **Co-occurrence** | Heatmap código × código com 5 display modes (absolute, %, Jaccard, Dice, presence) | calculateCooccurrence |
| 4 | **Graph** | Grafo force-directed de co-ocorrência com edge labels e min weight filter | calculateCooccurrence |
| 5 | **Doc-Matrix** | Heatmap documento × código com sort alpha/total | calculateDocumentCodeMatrix |
| 6 | **Evolution** | Scatter de códigos por posição normalizada no documento, filtro por file | calculateEvolution |
| 7 | **Temporal** | Linha cumulativa de cada código ao longo do tempo real (createdAt) | calculateTemporal |
| 8 | **Text Retrieval** | Cards com texto extraído, agrupados por código ou file, search, badges por source | TextExtractor |
| 9 | **Word Cloud** | Nuvem de palavras dos segmentos codificados, filtro por stopwords PT/EN | calculateWordFrequencies |
| 10 | **Text Stats** | Métricas lexicais por código: word count, unique words, TTR, avg words/segment | calculateTextStats |
| 11 | **ACM (MCA)** | Biplot 2D de códigos e markers via SVD, toggle markers/labels, % inertia | calculateMCA |
| 12 | **MDS** | Projeção 2D de códigos ou files por Jaccard distance, Kruskal stress, toggle labels | calculateMDS |
| 13 | **Dendrogram** | Dendrograma hierárquico com cut-line, cluster assignments, silhouette | clusterEngine |
| 14 | **Lag Sequential** | Heatmap de transições entre códigos em lag N, z-scores ajustados | calculateLagSequential |
| 15 | **Polar Coords** | Mapa vetorial quadrante (ativação/inibição prospectiva/retrospectiva) | derivado da LSA |
| 16 | **Chi-square** | Teste de independência entre código e variáveis categóricas | chi-square |
| 17 | **Decision Tree** | Árvore de decisão CHAID com accuracy, tau, error analysis via Text Retrieval | decisionTreeEngine |

### Config Panel (compartilhado por todas as views)
- **Source filter**: checkboxes para MD, CSV-seg, CSV-row, Image, PDF, Audio, Video
- **Code filter**: search + select all/none + checkboxes com swatch colorido e contagem
- **Min frequency**: filtro de frequência mínima para inclusão
- **View-specific**: sort mode, display mode, group-by, lag number, MDS mode, stopwords lang, etc.

### Source Badges (7 cores distintas)
| Source | Badge | Cor |
|---|---|---|
| Markdown | MD | #42A5F5 (azul) |
| CSV Segment | CSV | #66BB6A (verde) |
| CSV Row | ROW | #81C784 (verde claro) |
| Image | IMG | #FFA726 (laranja) |
| PDF | PDF | #EF5350 (vermelho) |
| Audio | AUD | #AB47BC (roxo) |
| Video | VID | #00ACC1 (cyan) |

---

## Shared Registry — O backbone

Arquivo: `.obsidian/codemarker-shared/registry.json`

**CodeDefinitions compartilhadas entre todos os 7 plugins** (6 de codificação + Analytics lê). Cada plugin tem uma cópia idêntica de `sharedRegistry.ts`:

```typescript
interface CodeDefinition {
  name: string;
  color: string;
  description?: string;
  paletteIndex: number;
  createdAt: number;
  updatedAt: number;
}
```

- **Merge strategy**: shared ganha se `updatedAt` mais recente; `nextPaletteIndex = max(local, shared)`
- **Sync**: todos os plugins sync no `load()` e `save()`
- Criar código no Audio → aparece automaticamente no PDF, CSV, Markdown, Image, Video e Analytics

---

## Fundamentação Acadêmica

Toda a arquitetura de análise é informada por **10 capítulos** do *Routledge Reviewer's Guide to Mixed Methods Analysis* (2021, Onwuegbuzie & Johnson):

| Capítulo | Técnica | Status no Analytics |
|---|---|---|
| Ch.1 | Inter-respondent matrix, quantitizing, legitimação | ✅ Doc-Code Matrix, Frequency |
| Ch.2 | FATM (Factor Analysis Topic Modeling), EFA | 🔲 Topic Modeling planejado |
| Ch.5 | Cluster Analysis (Jaccard, dendrograma, silhouette) | ✅ clusterEngine completo |
| Ch.6 | CHAID (árvore de decisão chi-square) | ✅ decisionTreeEngine |
| Ch.7 | Multiple Linear Regression com dados quantitizados | 💡 Logistic Regression conceitual |
| Ch.8 | SEM (Path Analysis, CFA, Latent Variables) | 💡 Além do roadmap atual |
| Ch.12 | Diachronic Analysis (LSA, Polar Coords, T-Patterns) | ✅ LSA + Polar Coords |
| Ch.14 | Qualitizing (Magnitude Coding, Analytic Memos) | 🔲 Memo universal planejado |
| Ch.16 | Ethnographic Decision Models (EDM) | ✅ Decision Tree view |
| Ch.23 | Joint Display (integração quali-quanti visual) | 🔲 Joint Display planejado |
| Ch.24 | Case Comparison Table (sorting iterativo) | 🟡 CSV Viewer já é uma |

Além da fundamentação acadêmica, um **protótipo Python** (`transcript-analyser-prototype`, ~12,400 LOC) serviu como playground para técnicas de NLP que informam features futuras: sentiment analysis, contradiction detection, linguistic patterns, topic modeling via LDA, concept networks, narrative blocks, storyline generation, hypothesis templates.

---

## Números

| Métrica | Valor |
|---|---|
| Plugins | 7 |
| TypeScript | ~35,000 LOC |
| CSS | ~4,600 LOC |
| Engines de análise | 10 |
| View modes (Analytics) | 17 |
| Source types | 7 |
| Chapters acadêmicos estudados | 10 |
| Features implementadas | 16/38 mapeadas (42%) |
| Features parciais | 3/38 (8%) |
| Features planejadas | 12/38 (32%) |
| Features conceituais | 7/38 (18%) |

---

## Stack Técnica

| Plugin | Deps principais |
|---|---|
| v2 (Markdown) | CodeMirror 6 (via Obsidian) |
| CSV | AG Grid Community v33+, PapaParse |
| PDF | Zero deps (PDF.js via Obsidian nativo) |
| Image | Fabric.js 6.6.1 |
| Audio | WaveSurfer.js v7 (Regions, Timeline, Minimap) |
| Video | WaveSurfer.js v7 (media option) |
| Analytics | Chart.js (lazy), svd-js |

Build: `npm run build` (tsc -noEmit + esbuild) em cada plugin.

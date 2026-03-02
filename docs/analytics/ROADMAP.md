# CodeMarker Analytics — Roadmap

## Estado atual (Feb 2026)
- Dashboard com 6 KPIs + 16 mini-thumbnails clicáveis
- **17 ViewModes** — see list below
- **7 fontes de dados**: Markdown, CSV (segment + row), Image, PDF, Audio, Video
- Export PNG/CSV por view
- **6 engines**: statsEngine, clusterEngine, mcaEngine, mdsEngine, wordFrequency, decisionTreeEngine

### 17 ViewModes
1. Dashboard — KPIs + clickable thumbnails
2. Frequency Bars — Chart.js horizontal bars, group by source/file
3. Co-occurrence Matrix — canvas heatmap, 5 display modes (absolute/percentage/jaccard/dice/presence), 3 sort modes (alpha/frequency/cluster)
4. Network Graph — force-directed canvas, configurable edge weights
5. Document-Code Matrix — files × codes heatmap
6. Code Evolution — swim lanes by document position
7. Text Retrieval — extracted segments, group by code/file, search + navigate
8. Word Cloud — chartjs-plugin-wordcloud, stop words EN/PT/both
9. MCA Biplot — Multiple Correspondence Analysis (codes × sources), SVD
10. MDS Map — Multidimensional Scaling (Jaccard distance, codes/files modes)
11. Temporal Analysis — cumulative coding evolution over real time (createdAt)
12. Text Statistics — TTR, vocabulary, avg words/chars per code, sortable table
13. Dendrogram + Silhouette — hierarchical clustering tree with cut-line, silhouette quality plot (codes/files mode)
14. Lag Sequential Analysis — transition probability heatmap, z-scores, significance markers (lag 1-5)
15. Polar Coordinates — prospective/retrospective z-scores (Sackett 1979), 4-quadrant scatter, significance circle
16. Chi-Square Tests — independence tests code×source or code×file, sortable table with χ², p-value, Cramér's V
17. Decision Tree — CHAID chi-square splitting, Bonferroni correction, Klecka's tau, error analysis + Text Retrieval

---

## Concluído

### ~~1. Text Retrieval~~ ✅
`TextExtractor` com cache de leitura, extração sub-line (fromCh/toCh), parser CSV embutido, texto direto do `PdfMarker.text`. UI com toolbar (search + group toggle), seções colapsáveis, cards com source badge/file link/location/text/chips, click-to-navigate.

### ~~2. Word Cloud~~ ✅
`wordFrequency.ts` com stop words EN + PT, min word length e max words configuráveis. Usa `chartjs-plugin-wordcloud`.

### ~~3. MCA Biplot~~ ✅
`mcaEngine.ts` — indicator matrix (codes × sources), SVD, inertia por dimensão. Skip de dimensões triviais (eigenvalue < 1e-10).

### ~~4. MDS Map~~ ✅
`mdsEngine.ts` — Classical Torgerson MDS via eigendecomposition. Jaccard distance entre códigos (shared markers) ou arquivos (shared codes). Kruskal stress-1.

### ~~5. Jaccard / Dice~~ ✅
Co-occurrence matrix com 5 display modes: absolute, percentage, jaccard index, dice coefficient, presence. Valores 0-1 com heatmap normalizado.

### ~~6. Análise Temporal~~ ✅
`calculateTemporal()` — filtra markers com `createdAt`, agrupa por código, contagem acumulativa. Chart.js line chart com `chartjs-adapter-date-fns`. Propagação de `createdAt` em todas as 7 fontes no consolidator.

### ~~7. Cluster Analysis~~ ✅
`clusterEngine.ts` — agglomerative hierarchical clustering (average linkage) usando Jaccard distance. Reordena co-occurrence matrix agrupando códigos similares. 3 modos de sort: alphabetical, frequency, cluster.

### ~~8. Text Statistics~~ ✅
`calculateTextStats()` em `statsEngine.ts` — type-token ratio, vocabulário único, comprimento médio por código. Tabela HTML sortable com TTR bars. Usa `TextExtractor.extractBatch()`.

### ~~9. Dendrogram + Silhouette~~ ✅
`buildDendrogram()`, `cutDendrogram()`, `calculateSilhouette()` em `clusterEngine.ts`. Canvas: dendrograma horizontal com cut-line slider + silhouette barras. Dois modos: codes (Jaccard co-occurrence) e files (Jaccard shared codes). Avg silhouette score com interpretação.

### ~~10. Lag Sequential Analysis~~ ✅
`calculateLagSequential()` em `statsEngine.ts` — probabilidade condicional código X → código Y em lag 1-5. Heatmap divergente azul/branco/vermelho com z-scores ajustados. Células |z| > 1.96 marcadas significativas (p < 0.05). Ordenação por posição no documento (fromLine, row, page, audioFrom, videoFrom).

### ~~11. Polar Coordinate Analysis~~ ✅
`calculatePolarCoordinates()` em `statsEngine.ts` — combina z-scores prospectivos e retrospectivos via Zsum/√N (Sackett, 1979) para lags 1-N. Scatter plot 4 quadrantes (ativação/inibição mútua), círculo de significância r=1.96, focal code selector, tooltip detalhado.

### ~~12. Chi-Square Independence Tests~~ ✅
`calculateChiSquare()` em `statsEngine.ts` — contingency table código × (source ou file), chi-square com Wilson-Hilferty approximation para p-value. Tabela sortable com χ², df, p-value, Cramér's V, asteriscos de significância.

### ~~13. Decision Tree (CHAID)~~ ✅
`decisionTreeEngine.ts` — CHAID-style classification tree com chi-square splitting e Bonferroni correction. Binariza Document-Code Matrix: um código como outcome, demais como predictors. DOM-based tree rendering (nodes como cards), métricas (accuracy, a priori, Klecka's tau), error analysis com link para Text Retrieval. Config: outcome dropdown + max depth slider.

---

## Próximos passos — por prioridade

### 1. Médio prazo / Impacto
- **Cross-source Comparison** — painel comparativo: mesmos códigos se comportam igual em markdown vs CSV vs PDF? Métricas por fonte.

### 2. Code Groups / Categorias hierárquicas
Agrupar códigos em categorias (ex: "Emoções" → alegria, tristeza, raiva). Hoje os códigos são flat. Com grupos, as visualizações ganham uma dimensão — frequency por grupo, co-occurrence entre grupos, etc.

### 3. Análises cruzadas mais profundas
- **Code overlap analysis** — quais códigos se sobrepõem no texto (compartilham região textual, não só co-ocorrem no marker)
- **Código × metadados** — se CSV tem colunas de metadata (gênero, idade, etc.), cruzar com códigos

### 4. Exportação avançada
- Export do dashboard inteiro (PDF/PNG composto)
- Export para QDPX (formato interoperável entre QDA tools)
- Export para planilha com múltiplas abas

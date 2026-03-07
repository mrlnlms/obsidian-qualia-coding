# Qualia Coding — Market Research (Março 2026)

> Pesquisa de mercado do ecossistema CAQDAS. Preços verificados, features reais, posicionamento. Base para definir proposta de valor.

---

## Panorama do Mercado

- **Tamanho**: USD 1.2 bilhões (2024), projetado USD 1.9 bi até 2032. CAGR 6%.
- **Consolidação**: Lumivero agora é dona do NVivo **E** do ATLAS.ti (adquirido set/2024). Os #1 e #2 sob o mesmo guarda-chuva corporativo. MAXQDA (VERBI GmbH) é o último grande independente.
- **Tendência**: AI features sendo adicionadas a todos os tools — mas de forma "bolted on", não como repensamento da experiência.

---

## Concorrentes Diretos — Preços Verificados

### NVivo (Lumivero)

| Licença | Preço |
|---------|-------|
| Student | $130/ano |
| Academic | $520/ano |
| Commercial | $1,005/ano |
| AI Assistant (add-on) | +$250/ano |
| Transcription | $30/hora |

**Formatos**: Text, PDF, Audio, Video, Image, Survey (Qualtrics/SurveyMonkey), Social Media (Twitter/Facebook/YouTube), Email (Outlook), Bibliography (Zotero/EndNote).

**AI/ML**: Auto-coding (noun phrases → themes), sentiment analysis (-1 a +1), AI summaries (v15.3). Sem topic modeling built-in. AI Assistant é add-on pago ($250/ano).

**Posição**: Dominante em academia há 30+ anos. "O SPSS da pesquisa qualitativa." Escolha padrão institucional.

**Reclamações**: Lento com projetos grandes, difícil gerenciar 100+ codes, curva de aprendizado íngreme, suporte técnico fraco, Mac support historicamente ruim.

### ATLAS.ti (Lumivero desde set/2024)

| Licença | Preço |
|---------|-------|
| Student (cloud) | $5/mês |
| Student (desktop) | $51-99/ano |
| Academic | $110/ano |
| Commercial (perpetual) | $670 |

**Formatos**: Text, PDF, Audio, Video, Image, Survey (Excel import). Transcription built-in.

**AI/ML**: AI Coding (OpenAI), Intentional AI Coding, AI Suggested Codes, AI Summaries, Conversational AI (ChatGPT Q&A sobre seus dados), Paper Search (200M+ artigos). Claims "reduz trabalho manual em 90%" — não verificado independentemente.

**Posição**: #2 em academia. Forte na Europa/Alemanha. Feature set de AI mais agressivo dos legacy tools. Dependência heavy de OpenAI levanta concerns de privacidade.

### MAXQDA (VERBI GmbH — independente)

| Licença | Preço |
|---------|-------|
| Student | ~$253/ano |
| Academic (3 anos) | EUR 600 |
| Commercial (3 anos) | EUR 1,440 |
| AI Transcription | EUR 49 (5h) |
| AI Assist Premium | EUR 120/ano |

**Formatos**: Text, PDF, Audio, Video, Image, Survey (Excel/SPSS), Social Media, Focus Groups, Geographic data.

**AI/ML**: AI Coding com critérios user-defined, AI New Code Suggestions, AI Subcode Suggestions, AI Summaries (customizáveis), AI Chat, AI Translation. Prompts transparentes e editáveis.

**Visual Coding (Margin Bars)**: O diferencial visual do MAXQDA — "coding stripes" coloridas na margem esquerda. Cada código = barra colorida. Overlap = barras paralelas. Labels no meio do bracket. Coluna redimensionável. Mostra memos, comments, timestamps. **Essa é a feature mais diretamente comparável ao margin panel do Qualia Coding.**

**Posição**: #3 legacy, forte em Europa continental. Melhor suporte a mixed methods. Último grande player independente (não adquirido pela Lumivero).

### Dedoose

| Licença | Preço |
|---------|-------|
| Student | $12.95/mês ativo |
| Individual | $17.95/mês ativo |
| Small Group (2-5) | $15.95/user/mês ativo |

**"Active month billing"**: só cobra nos meses que você faz login.

**Diferencial**: 100% cloud/SaaS, mixed methods focus, colaboração real-time built-in, menor barreira de entrada para times.

**Limitações**: Sem modo offline, AI features limitadas vs concorrentes, storage de mídia custa extra, já teve incidentes de perda de dados.

### Taguette (Open Source)

**Preço**: Grátis (AGPL-3.0). Hosted ou self-hosted.

**O que faz**: Importa PDF/Word/TXT/HTML/EPUB. Highlight + tag. Export. Colaboração via server.

**O que NÃO faz**: Sem audio, video, imagem. Sem nested codes. Sem drag-and-drop. Sem AI. Sem sentiment. Sem visualizações. Sem survey integration. Sem memos. Essencialmente "highlight and tag text" — nada mais.

### QDA Miner (Provalis Research)

| Licença | Preço |
|---------|-------|
| Academic (perpetual) | $310 |
| Commercial (perpetual) | $1,600 |
| + WordStat bundle (academic) | $565 |

**Diferencial**: Licenças perpétuas (não subscription). AI com múltiplos LLMs (OpenAI, Gemini, Claude, Mistral, DeepSeek, Ollama offline). Code Similarity Search via supervised ML.

### Quirkos

| Licença | Preço |
|---------|-------|
| Student (cloud) | $5/mês |
| Perpetual (offline) | $69 lifetime |
| Commercial | $23/mês |

**Visual**: Códigos como "bubbles" coloridas — drag text onto bubbles. Tamanho cresce com conteúdo. Sem AI. Text only.

---

## Open Source

| Tool | Formatos | AI | Destaque |
|------|----------|----|---------|
| **QualCoder** | Text, Image, Audio, Video | Sim (multi-LLM, Ollama offline, prompts transparentes) | O mais feature-complete open-source. Python/Qt6. |
| **Taguette** | Text only | Não | Mínimo. Bom pra projetos de aula. |
| **Quadro** (Obsidian plugin) | Markdown only | Não | Coding via wikilinks. Unit = parágrafo (sem word-level). Sem overlap. Sem multimedia. |

**QualCoder é o concorrente open-source mais relevante.** v3.8 (jan 2026), ativo, suporta multimedia, AI com prompts editáveis e modelos locais.

---

## Comparativo Geral

| Tool | Preço mín. | AI | Multi-format | Open Source | Offline | Obsidian |
|------|-----------|-----|-------------|-------------|---------|----------|
| NVivo | $130/ano | Sim (pago) | 7+ formatos | Não | Sim | Não |
| ATLAS.ti | $5/mês | Sim (OpenAI) | 6+ formatos | Não | Sim | Não |
| MAXQDA | ~$253/ano | Sim | 7+ formatos | Não | Sim | Não |
| Dedoose | $12.95/mês | Limitado | 4 formatos | Não | Não | Não |
| QDA Miner | $310 perpétuo | Sim (multi-LLM) | Text + Image | Não | Sim | Não |
| Quirkos | $69 perpétuo | Não | Text only | Não | Sim | Não |
| Taguette | Grátis | Não | Text only | Sim | Sim | Não |
| QualCoder | Grátis | Sim | 4 formatos | Sim | Sim | Não |
| Quadro | Grátis | Não | Markdown only | Sim | Sim | Sim |
| **Qualia Coding** | **Grátis** | **Não (ainda)** | **7 formatos** | **Sim (MIT)** | **Sim** | **Sim** |

---

## Validação das Claims Existentes

### Claim 1: "NVivo e Atlas.ti são manuais e caras"

**Parcialmente válida.** São caras (NVivo $520+/ano academic, ATLAS.ti $110+/ano). Mas "manuais" não é mais 100% verdade — ambos têm AI coding, auto-coding, sentiment analysis. A experiência core ainda é manual (selecionar texto → aplicar código), mas AI está reduzindo o trabalho manual significativamente. ATLAS.ti claims 90% de redução (não verificado).

### Claim 2: "Ferramentas como NVivo e Atlas.ti não fazem ML"

**Desatualizada.** Em 2024, isso era parcialmente verdade. Em 2026, NVivo tem auto-coding + sentiment + AI assistant, ATLAS.ti tem AI Coding (OpenAI) + Conversational AI, MAXQDA tem AI Coding + Chat + Translation. Até o QDA Miner suporta múltiplos LLMs. A claim precisa ser reformulada.

### Claim 3: "CAQDAS moderno com twist: combina quali tradicional com ML/NLP"

**Relevante para o Qualia Python, menos para o plugin Obsidian.** O plugin Obsidian não tem ML/NLP — tem analytics estatísticas (chi-square, MDS, MCA, clustering). A combinação quali+quanti via analytics é o diferencial real, não ML.

---

## O que Pesquisadores Realmente Reclamam

1. **Custo**: "$1,000+ pra software de highlight text" é sentimento comum. Shift pra subscription piora.
2. **Performance**: Todos os legacy tools são lentos com projetos grandes.
3. **Curva de aprendizado**: Semanas a meses para proficiência. Muitos nunca usam a maioria das features.
4. **Lock-in de dados**: Formatos proprietários dificultam troca de tool ou preservação de acesso.
5. **Mac**: Historicamente ruim em todos os tools.
6. **UIs sobrecarregadas**: Tools tentam fazer tudo, resultando em interfaces poluídas.
7. **AI "bolted on"**: Workflow fundamental ainda é manual; AI é overlay, não repensamento.
8. **Colaboração**: Afterthought na maioria (exceto Dedoose e ATLAS.ti Cloud).
9. **Multilingual**: Fraco para scripts não-latinos, RTL.
10. **Consolidação corporativa**: Lumivero dona de NVivo + ATLAS.ti gera preocupação sobre pricing futuro.

---

## AI em QDA — O que é Real vs Marketing

### Real
- AI transcription funciona bem (todos oferecem)
- AI summaries de segmentos codificados economizam tempo
- Code suggestion acelera coding exploratório inicial
- Sentiment analysis em dados estruturados (reviews, surveys) produz resultados úteis

### Marketing
- "Reduz trabalho manual em 90%" — não verificado
- Auto-coding com LLMs é inconsistente para análise temática e coding nuançado
- "AI-powered qualitative analysis" implica que AI entende significado — na realidade são pattern-matching

### Acadêmicamente Contestado
Paper de 2025: *"We Reject the Use of Generative Artificial Intelligence for Reflexive Qualitative Research"* (Jowsey, Braun, Clarke, Lupton, Fine — Qualitative Inquiry). Argumenta que GenAI é fundamentalmente incapaz do meaning-making que pesquisa qualitativa requer.

Consenso pragmático: AI útil como "thinking companion", mas tratá-la como substituto da análise humana undermines qualitative inquiry.

---

## Insights para Posicionamento do Qualia Coding

### O que o Qualia Coding é ÚNICO em fazer

1. **Único QDA tool que vive dentro do Obsidian** — dados ficam no vault do pesquisador, não em formato proprietário
2. **7 formatos com código unificado** — igual aos tools de $500+/ano, mas grátis e open source
3. **19 analytics views com fundamentação acadêmica** — MCA, MDS, Lag Sequential, Polar Coordinates, Decision Tree. Nenhum open-source tem isso.
4. **Research Board** — nenhum concorrente (nem commercial) tem canvas freeform para síntese
5. **Margin bars estilo MAXQDA** — o feature mais desejado de QDA visual, implementado em open source

### O que NÃO é diferencial (mais)
- "Open source" sozinho não basta — QualCoder também é e suporta multimedia + AI
- "Gratuito" não basta — Taguette e QualCoder também são
- "Anti-NVivo" como posicionamento é raso — NVivo tem 30 anos de institucionalização

### Onde o mercado está vulnerável
- **Lumivero consolidação** — pesquisadores preocupados com pricing futuro sob monopólio
- **Lock-in de dados** — Obsidian vault = markdown files = zero lock-in
- **Curva de aprendizado** — Qualia Coding herda a familiaridade do Obsidian
- **Academics leaving academia** — enfrentam pricing cliff, precisam de alternativa
- **Mixed methods** — MAXQDA é o melhor nisso, mas custa EUR 600+/3 anos

---

---

## Benchmark: Mixed Methods

### Built-in Statistics — Onde o Qualia Coding não tem par

| Feature | NVivo | ATLAS.ti | MAXQDA | Dedoose | QualCoder | **Qualia Coding** |
|---------|-------|----------|--------|---------|-----------|-------------------|
| Chi-square | Não | Não | Sim | Sim | Não | **Sim (Bonferroni adj.)** |
| Cluster analysis | Sim (sem silhouette) | Não | Sim | Não | Não | **Sim (Jaccard + silhouette)** |
| MDS | Não | Não | Não | Não | Não | **Sim (Torgerson + Kruskal stress)** |
| MCA | Não | Não | Não | Não | Não | **Sim (SVD biplot)** |
| Decision tree (CHAID) | Não | Não | Não | Não | Não | **Sim (chi-square splits, Klecka's tau)** |
| Lag sequential | Não | Não | Não | Não | Não | **Sim (z-scores, Sackett 1979)** |
| Polar coordinates | Não | Não | Não | Não | Não | **Sim (Zinn angles, max lag)** |
| Network graph | Sim | Sim | Sim | Não | Não | **Sim (force-directed, edge weights)** |
| Word cloud | Sim | Sim | Sim | Não | Sim | **Sim (EN + PT stopwords)** |
| Intercoder reliability | Sim | Sim | Sim | Sim | Sim | **Não** |

**5 views EXCLUSIVAS** (nenhum concorrente oferece built-in): MCA Biplot, MDS Map, Lag Sequential, Polar Coordinates, CHAID Decision Tree. Pesquisadores atualmente precisam exportar para R/SPSS para essas análises.

### Multi-Format — Coding cross-format num só projeto

| Formato | NVivo | ATLAS.ti | MAXQDA | Dedoose | QualCoder | **Qualia Coding** |
|---------|-------|----------|--------|---------|-----------|-------------------|
| Text/Markdown | Sim | Sim | Sim | Sim | Sim | **Sim** |
| PDF | Sim | Sim | Sim | Sim | Sim | **Sim (text + shapes)** |
| Audio | Sim | Sim | Sim | Sim | Sim | **Sim (WaveSurfer regions)** |
| Video | Sim | Sim | Sim | Sim (MP4 only) | Sim | **Sim (player + waveform)** |
| Image | Sim | Sim | Sim | Sim | Sim | **Sim (Fabric.js regions)** |
| Spreadsheet | Sim (datasets) | Sim (survey import) | Sim (Excel) | Sim | Parcial | **Sim (AG Grid, cell-level coding)** |
| Parquet | Não | Não | Não | Não | Não | **Sim (único no mercado)** |
| Cross-format queries | Sim | Sim | Sim | Sim | Limitado | **Sim (19 views unificam todos os engines)** |

### Quantitizing (Quali → Quanti)

| Feature | Melhor tool | Qualia Coding |
|---------|------------|---------------|
| Code frequencies exportáveis | Todos | **Sim (Frequency Bars, CSV export)** |
| Co-occurrence matrix | MAXQDA (melhor UX) | **Sim (5 modos: abs, %, Jaccard, Dice, presence)** |
| Cross-tab codes × demographics | MAXQDA Stats (chi-square, Cramer's V) | **Parcial — Source Comparison + Chi-Square. Falta case variables.** |

### Qualitizing (Quanti → Quali)

| Feature | Melhor tool | Qualia Coding |
|---------|------------|---------------|
| Import survey data (closed + open) | MAXQDA (SurveyMonkey, Qualtrics) | **Sim via CSV/Parquet — code cells de open-ended** |
| Link demographics to segments | Dedoose (descriptor fields) | **Não — sem sistema de case variables** |
| Document variables (metadata) | NVivo (classification system) | **Não — files são a unit of analysis** |

### Integration / Joint Display

| Feature | Melhor tool | Qualia Coding |
|---------|------------|---------------|
| Joint display tables | **MAXQDA** (Interactive Quote Matrix, Creswell worksheet) | **Funcional equivalente via Doc-Code Matrix, mas sem framing metodológico explícito** |
| Visualization codes × groups | Dedoose (4D Bubble Plot) | **Source Comparison + MCA Biplot + MDS Map** |
| Mixed methods matrices | MAXQDA | **Doc-Code Matrix + Co-occurrence Matrix** |

### Export / Interoperabilidade

| Feature | NVivo | ATLAS.ti | MAXQDA | **Qualia Coding** |
|---------|-------|----------|--------|-------------------|
| SPSS | Sim | Sim | Sim | **Não** |
| Excel | Sim | Sim | Sim | **Não (JSON only)** |
| REFI-QDA (QDPX) | Sim | Sim | Sim | **Não** |
| CSV per-view | — | — | — | **Sim (Analytics export)** |
| PNG per-chart | — | — | — | **Sim** |

### Scorecard Resumido

| Dimensão | NVivo | ATLAS.ti | MAXQDA | Dedoose | **Qualia Coding** |
|----------|-------|----------|--------|---------|-------------------|
| Quantitizing | Forte | Forte | **Muito forte** | Forte | **Forte (stats), Gap (demographics)** |
| Qualitizing | Muito forte | Forte | **Muito forte** | Muito forte | Moderado (CSV ok, sem case vars) |
| Joint Display | Forte | Moderado | **Muito forte** | Forte | Moderado (equivalentes funcionais) |
| Statistics built-in | Moderado | Básico | Forte | Moderado | **Muito forte — 5 views EXCLUSIVAS** |
| Multi-format | Muito forte | Muito forte | Muito forte | Forte | **Muito forte + Parquet** |
| Export / Interop | Muito forte | Muito forte | Muito forte | Moderado | **Fraco (JSON, CSV/PNG per-view)** |

### Gaps Estratégicos para Fechar

1. **Case/Document Variables** — Adicionar metadata por documento desbloquearia cross-tab codes × demographics (o workflow core de mixed methods "joint display").
2. **REFI-QDA (QDPX) Export/Import** — Crítico para credibilidade acadêmica e portabilidade.
3. **Export CSV/Excel/SPSS** — No mínimo exportar code frequencies, co-occurrence, Doc-Code Matrix como CSV/Excel.
4. **Intercoder Reliability** — Cohen's kappa ou Krippendorff's alpha. Esperado por reviewers.

---

## Fontes

- [Lumivero NVivo Product Page](https://lumivero.com/product/nvivo/)
- [Usercall NVivo Pricing Guide 2025](https://www.usercall.co/post/nvivo-software-pricing-how-much-does-it-really-cost-in-2025)
- [ATLAS.ti AI Coding](https://atlasti.com/ai-coding-powered-by-openai)
- [ATLAS.ti Student Licenses](https://atlasti.com/student-licenses)
- [Lumivero Acquires ATLAS.ti](https://atlasti.com/lumivero-acquires-atlas-ti)
- [MAXQDA Official Pricing](https://www.maxqda.com/pricing)
- [MAXQDA AI Assist](https://www.maxqda.com/products/ai-assist)
- [Dedoose Pricing](https://www.dedoose.com/pricing/pricing-subscriptions)
- [Provalis QDA Miner Order Page](https://provalisresearch.com/order/)
- [QDA Miner 2025 What's New](https://provalisresearch.com/products/qualitative-data-analysis-software/qda-miner-whats-new/)
- [Quirkos Licences](https://www.quirkos.com/licences.html)
- [QualCoder GitHub](https://github.com/ccbogel/QualCoder)
- [Obsidian Quadro](https://github.com/chrisgrieser/obsidian-quadro)
- [Taguette NYU Guide](https://guides.nyu.edu/QDA/Taguette)
- [Verified Market Research - CAQDAS Market](https://www.verifiedmarketresearch.com/product/qualitative-data-analysis-software-market/)
- [Jowsey et al. 2025 - Rejecting GenAI for Reflexive Qual Research](https://journals.sagepub.com/doi/full/10.1177/10778004251401851)
- [Surrey University AI Tools for QDA](https://www.surrey.ac.uk/computer-assisted-qualitative-data-analysis/qual-ai/ai-tools-qda)

# Analise Comparativa — Qualia Coding vs Mercado QDA (2026-03-19)

> Pesquisa de mercado atualizada com dados de 2025-2026. Foco em posicionamento real, nao em competicao direta.

---

## O mercado em 2026

### Tier 1 — Enterprise ($$$)

| Tool | Preco | Plataforma | Formatos | Analytics | AI |
|------|-------|-----------|----------|-----------|-----|
| NVivo | ~EUR1.100/ano comercial, ~EUR90/ano estudante | Desktop + cloud | Texto, PDF, audio, video, datasets, social media | Query builder, matrix coding, cluster analysis | AI Assistant (sumarios, sugestao de codigos, sentimento) |
| ATLAS.ti | $5-670 (estudante a comercial) | Desktop + cloud | Texto, PDF, audio, video, imagens, geo, survey | Co-occurrence, network views, concept maps | Opinion Mining, NER, focus group auto-coding |
| MAXQDA | EUR850-1.600 | Desktop | Texto, PDF, audio, video, datasets, survey | Stats module (separado), MAXMaps, mixed methods | AI Assist integrado |

### Tier 2 — Acessivel

| Tool | Preco | Plataforma | Limitacoes |
|------|-------|-----------|-----------|
| Dedoose | ~$18/mes (ativo) | Web | Cobra storage de midia extra. Analytics limitado |
| Dovetail | Free → enterprise | Web | Mais UX research que academico. Pricing opaco |
| Quirkos | ~$25/mes | Desktop | Interface visual (bolhas). Sem analytics avancado |

### Tier 3 — Open source/gratis

| Tool | Formatos | Limitacoes |
|------|----------|-----------|
| QualCoder 3.8 | Texto, PDF, audio, video, imagens | UI tosca. Funcional mas sem polish. AI experimental |
| Taguette | So texto | Muito limitado |
| Quadro (Obsidian) | So markdown | Sem multimedia, sem analytics, sem visualizacoes. Usa wikilinks pra codificar |

---

## Onde Qualia Coding se posiciona

### Diferenciais exclusivos (gratis, ninguem mais oferece)

| Diferencial | Concorrencia mais proxima |
|------------|--------------------------|
| 19 analytics modes (MCA, MDS, CHAID, Polar, Lag Sequential) | MAXQDA Stats module (EUR400 add-on) tem algumas. MCA/MDS/CHAID ninguem tem built-in |
| Parquet support | Nenhum CAQDAS suporta |
| Research Board (canvas freeform) | Conceito existe no ATLAS.ti (networks) e MAXQDA (MAXMaps), mas nenhum tem canvas livre com sticky notes + snapshots + excerpts |
| 7 formatos (markdown, PDF, CSV, Parquet, image, audio, video) | NVivo e ATLAS.ti cobrem mais formatos, mas custam >EUR1.000/ano |
| Local-first, vault = dados, zero lock-in | So QualCoder e Taguette sao local. Nenhum e vault-based |
| Margin bars estilo MAXQDA | MAXQDA cobra EUR600+. Nenhum open source tem |

### Gaps vs concorrentes comerciais

| Gap | Quem tem | Impacto |
|-----|----------|---------|
| Code Hierarchy | Todos os Tier 1 | **Alto** — sem isso nao fecha o ciclo QDA |
| Export (CSV, QDPX) | Todos os Tier 1 + QualCoder | **Alto** — pesquisador precisa levar dados pra fora |
| Case Variables | NVivo, ATLAS.ti, MAXQDA, Dedoose | **Alto** — mixed methods nao funciona sem |
| Intercoder Reliability | NVivo, ATLAS.ti, MAXQDA | **Medio** — peer reviewers esperam |
| AI-assisted coding | NVivo, ATLAS.ti, MAXQDA, QualCoder 3.8 | **Medio** — tendencia forte, mas controversial em QDA academico |
| Collaboration | Dedoose, Dovetail, ATLAS.ti Cloud | **Baixo** — Obsidian e single-user por natureza |

### Vs Quadro (unico concorrente direto no Obsidian)

| | Quadro | Qualia Coding |
|---|--------|--------------|
| Formatos | So markdown | 7 (md, PDF, CSV, Parquet, image, audio, video) |
| Codificacao | Wikilinks entre arquivos | Inline highlights com margin bars |
| Analytics | Zero (usa Graph View do Obsidian) | 19 modes dedicados |
| Visualizacoes | Nenhuma | Chart.js, Research Board, Decision Tree, MCA, MDS... |
| Abordagem | Grounded Theory puro, text-only | Multi-format, mixed methods |
| Maturidade | v1.28, estavel | Em desenvolvimento, 1503 testes |

Nao e competicao direta. Quadro trata QDA como linking entre notas. Qualia Coding trata como workbench analitico completo.

---

## Avaliacao honesta

### Pontos fortes reais

- **Analytics e o killer feature.** Nenhum tool gratis (e poucos pagos) oferecem MCA, MDS, CHAID, Polar Coordinates, Lag Sequential built-in. Nivel de paper metodologico
- **7 formatos com coding unificado** e competitivo com Tier 1
- **Local-first no Obsidian** resolve a queixa #1 de pesquisadores: vendor lock-in e custo
- **Codebase maduro** (1503 testes, TypeScript strict, zero debt critica) e raro em open source QDA

### Pontos fracos reais

- **Sem Code Hierarchy** o plugin nao completa o ciclo basico de QDA (codigo → categoria → tema)
- **Sem export** os dados morrem no vault. Pesquisador nao pode citar, compartilhar, ou usar em outro tool
- **Single-user** por natureza do Obsidian. Em 2026, colaboracao e esperada
- **Sem AI** — tendencia forte, todos os Tier 1 adicionaram. Mas ha resistencia academica a AI coding
- **Onboarding inexistente** — fase dev

### Posicionamento natural

Qualia Coding nao compete com NVivo/ATLAS.ti diretamente. Ocupa o espaco entre "nao tenho dinheiro pra MAXQDA" e "QualCoder e feio demais". E o **QDA gratis que nao parece gratis**, dentro de um app que pesquisadores ja conhecem.

Publico ideal: pesquisador qualitativo/mixed methods que ja usa Obsidian, nao tem budget institucional pra Tier 1, e quer analytics avancados sem aprender R/Python.

### Estrategia "garrafa no mar"

Nao e sobre vender. E sobre estar la quando o pesquisador precisar. A ferramenta fala por si — quem acha nao larga. O pesquisador adota uma pratica, a pratica vira metodo, o metodo vira capitulo de dissertacao. O plugin cresce junto.

---

## Fontes

- [ATLAS.ti Pricing 2026](https://www.usercall.co/post/atlas-ti-pricing-guide-2025-plans-costs-and-key-differences)
- [Top 5 QDA Tools 2026](https://www.usercall.co/post/top-5-qualitative-data-analysis-software-tools)
- [NVivo Pricing 2026](https://www.usercall.co/post/nvivo-software-pricing-how-much-does-it-really-cost-in-2025)
- [MAXQDA Pricing 2026](https://www.usercall.co/post/maxqda-pricing-guide-2025-plans-costs-and-add-ons-explained)
- [Dedoose Pricing 2026](https://www.usercall.co/post/dedoose-pricing-guide-2025-plans-costs-intelligent-comparison)
- [Quadro GitHub](https://github.com/chrisgrieser/obsidian-quadro)
- [Free QDA Software 2026](https://www.quirkos.com/blog/post/free-qualitative-data-analysis-software/)
- [AI in QDA 2025](https://lumivero.com/resources/blog/state-of-ai-in-qualitative-research/)
- [Best AI QDA Tools 2026](https://thecasehq.com/best-ai-tools-for-qualitative-data-analysis-in-2026/)
- [QDA Comparison 2026](https://skimle.com/blog/qualitative-data-analysis-tools-complete-comparison)

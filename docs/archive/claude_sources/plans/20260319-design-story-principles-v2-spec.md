# Design Spec: DESIGN-STORY.md + DESIGN-PRINCIPLES v2

## Context

O Qualia Coding tem documentação técnica sólida (CLAUDE.md, ARCHITECTURE.md, TECHNICAL-PATTERNS.md) e uma v1 de Design Principles (562 LOC, reverse-engineered do código). Porém falta a camada mais profunda: **por que** essas decisões foram tomadas — a fundamentação teórica em mixed analysis, as referências visuais (MAXQDA, Dovetail), e a trajetória que transformou um marcador de texto num QDA cross-media com 19 ViewModes analíticos.

Além disso, a v1 não reflete os patterns do refactor de março 2026 (drawToolbarFactory, baseSidebarAdapter, marginPanelLayout, handleOverlayRenderer + dragManager, SidebarModelInterface 17 métodos).

## Deliverables

Dois documentos em `docs/pm/product/`:

1. **DESIGN-STORY.md** — documento novo. Narrativa do "porquê" com tom de case study
2. **DESIGN-PRINCIPLES.md** — evolução da v1 com patches do refactor + link pro DESIGN-STORY

A v1 atual é renomeada para `DESIGN-PRINCIPLES-v1.md` (arquivo histórico).

### Idioma
- **DESIGN-STORY.md**: inglês (mesma audiência da v1: community, contributors, pesquisadores internacionais). Citações em português mantidas no original com tradução entre parênteses quando necessário.
- **DESIGN-PRINCIPLES.md** (v2): inglês (continuidade da v1).

## Materiais-fonte

| Material | Localização | Papel |
|----------|-------------|-------|
| Ecossistema doc | `/Users/mosx/Desktop/qualia/ecossistema-qualia-historia-e-cases.md` | História real, mapeamento DIME, cases, vibecoding |
| Foundations.md | `/Users/mosx/Desktop/Mixed methods/Foundations.md` | Fundamentação teórica (~60 fontes, ~3100 linhas) |
| DESIGN-PRINCIPLES v1 | `docs/pm/product/DESIGN-PRINCIPLES.md` | Base para v2 (code evidence, timing, anti-patterns) |
| Codebase atual | `src/` | Evidências atualizadas pós-refactor |

---

## Document 1: DESIGN-STORY.md

### Tom e voz

- Misto: seções narrativas em 1ª pessoa (turning points), seções conceituais em 3ª pessoa
- Case study: conta a jornada, mostra decisões, fundamenta com teoria
- Acessível mas fundamentado: cita Onwuegbuzie, Sandelowski, Rodrigues onde relevante, sem rigor de paper
- Não é README marketing nem paper acadêmico — é a ponte entre ambos

### Estrutura

#### Seção 1: Abertura (1ª pessoa)
- A visão: MAXQDA-level coding dentro do Obsidian, sem sujar uma nota
- Referências já na cabeça: experiência prática com MAXQDA (margin panel, segmentos) + Dovetail (popover menu)
- O gap: ferramentas QDA profissionais são bancos de dados isolados; plugins Obsidian existentes são single-format e sujam markdown
- ~200-300 palavras

#### Seção 2: As 3 trilhas convergentes (misto 1ª/3ª)

**Trilha de referências visuais:**
- MAXQDA: margin panel (column allocation, label collision avoidance), seleção de segmentos
- Dovetail: popover menu (two-mode logic, suggestions, progressive disclosure)
- Não foi pesquisa — era vivência de uso como pesquisador e designer

**Trilha técnica:**
- Spans HTML para marcação → limitação (suja markdown) → pivotou pro menu popover
- Descobriu CM6 via Cursor → implementou seleção + movimentação de decorações
- Desbloqueio: prova de que "notes stay clean" era tecnicamente viável
- Esse gate liberou a ambição de qualidade profissional

**Trilha teórica:**
- Menu de ações levantou a pergunta: "quais métodos usam codificação como input?"
- Deep research (~60 fontes, múltiplas IAs como ferramenta de pesquisa)
- Descoberta do Routledge Reviewer's Guide to Mixed Methods Analysis (Onwuegbuzie & Johnson, 2021)
- Consolidação no Foundations.md
- Escopo explodiu: de marcador de texto → QDA completo com analytics
- ~400-500 palavras total (as 3 trilhas)

#### Seção 3: Transformação de dados como coração do design (3ª pessoa)

Centro conceitual do documento. Mixed analysis (não mixed methods) como framework.

**Conceitos-chave a apresentar:**
- Crossover mixed analysis: aplicar técnicas de uma tradição (quanti) a dados de outra (quali)
- O continuum quantitização ↔ qualitização como espectro, não binário
- Fórmula 1+1=1 (Onwuegbuzie, 2017): integração completa, não justaposição
- Meta-inferências como "montagem cinematográfica" (Denzin & Lincoln via Rodrigues)

**Mapeamento DIME → ViewModes** (curado do ecossistema doc):

| Nível DIME | ViewModes (representativos) | Conceito |
|------------|-----------|----------|
| Descriptive | frequency, word-cloud, text-stats | Quantitização básica — contagem, frequência, riqueza lexical |
| Inferential | chi-square, lag-sequential | Testes de independência e sequencialidade |
| Measurement | MCA, MDS, TTR | Crossover analysis — técnicas quanti em dados quali |
| Exploratory | dendrogram, decision-tree, polar-coords | Classificação multivariada |

> Nota: Esta tabela destaca ViewModes representativos por nível DIME. O mapeamento completo (19 ViewModes) está no ecossistema doc e não precisa ser reproduzido aqui — o DESIGN-STORY é narrativa, não referência exaustiva.

**Princípios derivados:**
- "Qualia processa — quem interpreta é o pesquisador" (meta-agregação / não-reinterpretação)
- Text retrieval ao lado das visualizações = caminho de volta ao qualitativo sempre presente
- Métricas de qualidade visíveis (stress, inércia, p-value) = transparência metodológica
- Research Board como joint display — espaço de meta-inferências

~500-600 palavras

#### Seção 4: A MCA como fio condutor (1ª pessoa)

A mesma técnica em 5 contextos ao longo de anos:
1. TCC ESPM — MCA pra personas em design
2. Sicredi — MCA no R sobre repositório de insights → "Territórios de Experiência"
3. DeepVoC — MCA de segmentação com 23k feedbacks NPS
4. qualia-coding — MCA implementada do zero em TypeScript, client-side
5. Foundations.md — fundamentação teórica de por que MCA é legítima em dados qualitativos

O ciclo completo: quali → quanti → quali de novo.
De uso experimental sem fundamentação → reconhecimento teórico no Routledge.

~300-400 palavras

#### Seção 5: Decisões de design que carregam epistemologia (3ª pessoa)

Curado dos cases no ecossistema doc:

| Decisão de design | Epistemologia |
|-------------------|---------------|
| Filtro por source type | Triangulação cross-media como interação |
| Text retrieval ao lado das visualizações | Caminho de volta ao qualitativo sempre presente |
| Research Board como canvas livre | "Quem interpreta é o pesquisador, não a ferramenta" |
| Códigos com cores consistentes em todas as views | Continuidade cognitiva |
| Obsidian como plataforma | Análise dentro do fluxo de trabalho, local-first |
| Client-side sem backend | Decisão de produto: privacidade, zero dependências |
| Métricas de qualidade expostas (stress, inércia, p-value) | Transparência metodológica |
| Não automatizar interpretação | Ferramenta amplifica, não substitui (Dey, 1993 via Rodrigues) |

Decisões de NÃO fazer:
- Não fez backend (privacidade + simplicidade)
- Não usou D3 (bundle size)
- Não escondeu métricas de qualidade (pesquisador precisa avaliar)
- Não automatizou codificação (responsabilidade interpretativa é humana)

~300-400 palavras

#### Seção 6: O ecossistema (3ª pessoa, breve)

- Qualia Core (Python, API REST) — motor agnóstico de transformação
- qualia-coding (TypeScript, Obsidian) — interface do pesquisador
- Foundations.md — fundamentação teórica (~60 fontes)
- Link pro `ecossistema-qualia-historia-e-cases.md` como documento completo
- Diagrama do ecossistema é opcional — texto descritivo suficiente. Se incluir, usar bloco de código simples (como no ecossistema doc), não Mermaid

~150-200 palavras

#### Seção 7: Referências e influências

- Routledge Reviewer's Guide to Mixed Methods Analysis (Onwuegbuzie & Johnson, 2021)
- Dovetail — interaction design do popover
- MAXQDA — margin panel, visual coding patterns
- Rodrigues (2007) — bricoleur metodológico, autor brasileiro
- Sandelowski (2000) — combinações no nível das técnicas
- Dickinson (2021) — Correspondence Analysis como crossover
- Saldaña (2020) — codificação afetiva, Excel como playground
- Foundations.md — link direto

**Tamanho total estimado: ~1800-2400 palavras (~300-400 linhas)**

---

## Document 2: DESIGN-PRINCIPLES.md (v2)

### Mudanças em relação à v1

#### Abertura
- Adiciona link pro DESIGN-STORY.md: "Para o contexto teórico e a jornada de design que fundamenta estes princípios, ver [DESIGN-STORY.md](DESIGN-STORY.md)"
- Remove o label "(v1)" adicionado anteriormente

#### Seção 1 — Design Values
- Adiciona §1.5 "Transformação de dados como princípio de design"
  - Mixed analysis como framework que informou o analytics engine
  - Referência breve ao continuum quantitização ↔ qualitização
  - Aponta pro DESIGN-STORY §3 pra aprofundamento
  - ~100-150 palavras

#### Seção 2 — Core Principles (atualizações de evidência)
- §2.4 Unified but Modular: adiciona `drawToolbarFactory` (PDF+Image compartilham toolbar via factory)
- §2.5 Graceful State Management: adiciona `baseSidebarAdapter` listener deduplication (Map previne heap leaks)
- §2.6 Smooth Transitions: destaca variação de timing por domínio (markdown 200ms grace vs PDF 300ms grace — encoded domain knowledge, não valor arbitrário)
- Novo §2.11 "Separation of Concerns por responsabilidade": `handleOverlayRenderer` (rendering/positioning) vs `dragManager` (state transitions); `marginPanelLayout` como algoritmo puro sem DOM

#### Seção 5 — Cross-Engine Consistency
- Adiciona `drawToolbarFactory` como pattern de consistência PDF+Image
- Atualiza contagem SidebarModelInterface (confirma 17, já está correto na v1)
- §5.3 Type Guards: atualiza referências de `unifiedExplorerView.ts:150-168` / `unifiedDetailView.ts:175-193` para `markerResolvers.ts` (type guards foram extraídos pra arquivo dedicado no refactor)

#### Seção 6 — Design History
- Adiciona §6.6 "O refactor de março 2026": 6 arquivos splitados, 1334 testes do zero, 0 erros tsc, harness e2e publicado. Marca o momento em que a base técnica ficou blindada.

#### O que NÃO muda
- Tabelas de timing, opacity, z-index (já corretas)
- Anti-patterns (todos válidos)
- CSS namespacing (regra intacta)
- Cross-references com CLAUDE.md e ARCHITECTURE.md
- Seções 3 (Visual Design System), 4 (Interaction Patterns) — intactas

### Renomeação de arquivos e header cleanup

**Sequência:**
1. Renomear `DESIGN-PRINCIPLES.md` → `DESIGN-PRINCIPLES-v1.md`
2. No arquivo renomeado (`v1.md`): atualizar o forward-ref link de `DESIGN-PRINCIPLES-v2.md` para `DESIGN-PRINCIPLES.md` (corrigir link quebrado)
3. Criar novo `DESIGN-PRINCIPLES.md` (v2) como cópia da v1 com patches aplicados

**Header do novo DESIGN-PRINCIPLES.md (v2):**
```markdown
# Qualia Coding — Design Principles

> For the theoretical foundations and design journey behind these principles, see [DESIGN-STORY.md](DESIGN-STORY.md).

> Reverse-engineered from ~28K LOC across 7 engines...
```
(Remove o label "(v1)", remove a nota de forward-ref da v1, adiciona link pro DESIGN-STORY)

---

## Verification

### DESIGN-STORY.md
1. Toda afirmação factual rastreável ao ecossistema doc ou Foundations.md
2. Mapeamento DIME completo e correto (cross-check com ecossistema doc §54-99)
3. Tom consistente: 1ª pessoa nas narrativas, 3ª nas conceituais
4. Nenhuma citação acadêmica sem fonte (autor, ano, página quando disponível)
5. Links cruzados: grep DESIGN-STORY em DESIGN-PRINCIPLES.md e vice-versa — ambos retornam match

### DESIGN-PRINCIPLES.md (v2)
1. Todo princípio rastreável a código real (file:line ou pattern)
2. Nenhum princípio aspiracional — apenas o que EXISTE
3. Evidências de código atualizadas pro estado pós-refactor
4. Cross-check com CLAUDE.md "reglas invioláveis"
5. Link funcional pro DESIGN-STORY

---

## Implementation notes

- Ordem de execução: DESIGN-STORY primeiro (documento novo), depois DESIGN-PRINCIPLES v2 (patches na v1)
- DESIGN-STORY é curadoria de material existente, não criação do zero
- DESIGN-PRINCIPLES v2 são edits cirúrgicos na v1, não rewrite
- Ambos vivem em `docs/pm/product/`

# Estudo Arquitetural: Evolução do CodeMarker v2

## Pra que serve esse documento

Estudo de possibilidades e registro de decisões arquiteturais do plugin. Não é um plano de implementação — é uma análise para embasar decisões.

Partes 1-5 cobrem os desafios iniciais (visual multi-código, Code Explorer).
Partes 6-9 cobrem a expansão para plataforma QDA completa (dados fora do vault, projetos, leaf view).

---

## Parte 1: O Estado Atual

### Modelo de Dados

```
Marker {
    id, fileId,
    range: { from: {line, ch}, to: {line, ch} },
    color: string,      ← UMA cor fixa por marker
    codes: string[],     ← N códigos nesse marker
}

Storage: Map<fileId, Marker[]> → data.json
```

**O que já funciona bem:**
- Um marker acumula N códigos (`codes: string[]`)
- `findOrCreateMarkerAtSelection()` reutiliza marker com range exato
- Toggle no menu liga/desliga código num marker
- Marker é auto-deletado quando `codes.length === 0`
- Sobreposição parcial detectada por `getMarkersInRange()`

**O que não existe:**
- Identidade visual por código (tudo é `marker.color`)
- Painel para explorar códigos
- Navegação "código → trechos"
- Indicação visual de quantos códigos tem num trecho

---

## Parte 2: O Desafio Visual — Múltiplos Códigos no Mesmo Trecho

### Por que é difícil

O problema fundamental: **cor é 1 dimensão, mas códigos são N dimensões**. Não existe forma perfeita de mostrar N informações categóricas sobre o mesmo pixel de tela. Toda solução é um compromisso.

### Como ferramentas QDA profissionais resolvem

| Ferramenta | Abordagem | Limitação |
|-----------|-----------|-----------|
| **ATLAS.ti** | Barras coloridas na margem esquerda (1 barra por código) | Funciona até ~8 códigos. Depois vira poluição visual. |
| **NVivo** | Faixas coloridas (stripes) na margem direita | Similar, mas comprime com muitos códigos |
| **MAXQDA** | Barras de cor na margem + tooltip no hover | Combina visual passivo (margem) + ativo (hover) |
| **Dedoose** | Highlight colorido + ícone no início do trecho | Ícone polui o texto em documentos densos |
| **Taguette** | Highlight simples + lista lateral | Depende 100% da lista — sem visual no texto |

**Padrão da indústria:** Nenhuma resolve com "só cor de fundo". Todas usam **margem/gutter** como espaço extra pra informação visual.

### Opções para o CodeMarker

#### A. Cor por Código (refactor do modelo)

**Conceito:** Cada código tem uma cor fixa. Um trecho com 3 códigos mostra 3 layers de cor (opacity blending).

**Modelo novo necessário:**
```typescript
interface CodeDefinition {
    name: string;
    color: string;       // cor fixa deste código
    createdAt: number;
}

// Registry global (não no marker)
codesRegistry: Map<string, CodeDefinition>

// Marker perde o campo color — herda dos códigos
interface Marker {
    id, fileId, range,
    codes: string[],     // referência ao registry
    // color removido ou mantido como override
}
```

**Impacto no build de decorações:**
- Hoje: 1 `Decoration.mark()` por marker
- Novo: 1 `Decoration.mark()` por **código no marker**
- Um marker com 3 códigos gera 3 decorações sobrepostas
- CM6 renderiza como spans aninhados com cores blendadas

**Tradeoffs:**

| Prós | Contras |
|------|---------|
| Cada código é visualmente identificável | Refactor significativo do modelo de dados |
| Consistente em todo o vault | Com 4+ códigos, cores viram sopa visual |
| Base necessária pro Code Explorer | Migration de dados existentes |
| Padrão da indústria | `data.json` precisa de novo formato |

**Risco de longo prazo:** Se o usuário tiver 20 códigos, paleta de cores precisa ser gerenciada. Cores parecidas são indistinguíveis. Precisa de algoritmo de geração de cores com contraste mínimo.

#### B. Barras na Margem (Gutter Markers)

**Conceito:** O highlight de fundo mantém UMA cor (a do código primário ou mistura). Na margem esquerda do editor, cada código aparece como uma **barra vertical colorida fina**.

```
   ┊ ┊    Texto do documento com highlight
   ↑ ↑
   │ └─ Código "TODO" (vermelho)
   └─── Código "REVIEW" (azul)
```

**Implementação CM6:** `Decoration.line()` com classes CSS ou `gutter()` extension.

**Tradeoffs:**

| Prós | Contras |
|------|---------|
| Não polui o texto | Margem fica estreita com 5+ códigos |
| Padrão ATLAS.ti/MAXQDA | Implementação CM6 mais complexa (gutter extension) |
| Escala melhor que cores sobrepostas | Precisa de lógica de layout (empilhamento) |
| Independente da cor de fundo | Conflita com gutters existentes (line numbers) |

**Risco de longo prazo:** Obsidian já usa a margem esquerda para line numbers e fold indicators. Adicionar mais elementos pode conflitar.

#### C. Indicadores Inline Mínimos

**Conceito:** Manter visual simples (1 cor de fundo), mas adicionar micro-indicadores no texto:

- **Badge no início:** `[3]` ou `●●●` mostrando contagem
- **Underline colorido:** Cada código adicional = 1 underline com cor diferente
- **Dot indicators:** Pequenos pontos coloridos no início do highlight

**Tradeoffs:**

| Prós | Contras |
|------|---------|
| Implementação simples (Decoration.widget) | Badge polui texto em documentos densos |
| Não precisa de refactor do modelo | Underline limitado a ~3-4 cores |
| Funciona com o modelo atual | Dots são pequenos demais para cores distinguíveis |

#### D. Hover Tooltip + Visual Mínimo

**Conceito:** O texto mostra apenas o highlight normal. Ao hover, um tooltip mostra a lista completa de códigos com suas cores.

```
[hover] → ┌──────────────┐
          │ ● REVIEW      │
          │ ● TODO        │
          │ ● CRITICAL    │
          └──────────────┘
```

**Implementação:** CM6 `hoverTooltip` extension.

**Tradeoffs:**

| Prós | Contras |
|------|---------|
| Zero poluição visual | Informação 100% escondida |
| Funciona com qualquer qtd de códigos | Usuário precisa hover cada trecho |
| Implementação simples | Não permite "scan visual" do documento |
| Não precisa de refactor | Não substitui necessidade do Code Explorer |

### Análise Combinatória

As opções não são mutuamente exclusivas. As combinações mais fortes:

| Combinação | Resultado |
|-----------|-----------|
| **A + D** | Cor por código (passivo) + hover tooltip (ativo). Mais completa. |
| **B + D** | Barras na margem (passivo) + hover tooltip (ativo). Estilo MAXQDA. |
| **A + C** | Cor por código + badge de contagem. Informativo mas pode poluir. |
| **D sozinho** | Mínimo viável. Hover resolve tudo. Depende do Code Explorer pro resto. |

**Minha opinião:** D sozinho é o caminho mais pragmático pra começar. É rápido de implementar, não requer refactor, e o Code Explorer (Parte 3) resolve o problema de "ver todos os códigos" sem depender de indicadores visuais. A e B podem vir depois como refinamento.

---

## Parte 3: Code Explorer — Onde Mostrar Códigos

### O que o usuário precisa

1. **Ver todos os códigos** que existem no vault
2. **Ver quantos trechos** cada código tem
3. **Clicar num código** → listar os trechos
4. **Clicar num trecho** → navegar até ele no editor
5. **Ver contexto** do trecho sem navegar (preview)
6. **Filtrar/buscar** códigos por nome
7. **(futuro)** Agrupar códigos em categorias/hierarquias

### Opções de UI

#### Opção 1: Sidebar Panel (ItemView)

**O que é:** Um painel lateral persistente, como File Explorer ou Outline do Obsidian.

**API:** `ItemView` → `registerView()` → `workspace.getRightLeaf()`

```
┌─ Code Explorer ──────────────────┐
│ 🔍 [Filter...]                   │
├──────────────────────────────────┤
│ ▼ REVIEW (5)               🟣   │
│   ├ "trecho importan..." Plan:12 │  ← click navega
│   ├ "outro trecho..."  Notes:45  │
│   └ "mais um..."       Draft:8   │
│ ▶ TODO (3)              🔴       │
│ ▶ CRITICAL (1)          🟡       │
│ ▶ leitica meu amor (2) 🟢       │
├──────────────────────────────────┤
│ 6 codes · 11 segments            │
└──────────────────────────────────┘
```

**Implementação:** ~200-300 linhas. Usa `contentEl` do `ItemView`, cria DOM manual ou usa componentes Obsidian (`Setting`, etc).

**Reatividade:** Precisa de um event system — quando um marker muda, o sidebar atualiza. Opções:
- Obsidian `Events` (pub/sub) — plugin emite, sidebar escuta
- Re-render periódico (simples mas wasteful)
- `Workspace.on('active-leaf-change')` + manual refresh

**Tradeoffs:**

| Prós | Contras |
|------|---------|
| Padrão Obsidian (familiar) | Ocupa espaço lateral permanente |
| Sempre visível durante edição | Implementação mais complexa (~300 LOC) |
| Pode ser arrastado, redimensionado | Precisa de event system para reatividade |
| Suporta tree view, scroll, hover | Layout responsivo para painéis estreitos |
| Pode ter header actions (botões) | |

#### Opção 2: Modal sob Demanda

**O que é:** Um dialog que abre com command palette ou hotkey.

**API:** `Modal` → `open()`/`close()`

**Implementação:** ~100-150 linhas. Mais simples que sidebar.

**Tradeoffs:**

| Prós | Contras |
|------|---------|
| Não ocupa espaço permanente | Precisa abrir toda vez |
| Simples de implementar | Não acompanha edições em tempo real |
| Pode ser maior que sidebar | Bloqueia interação com editor |
| Boa para busca/filtro rápido | Não é "always-on" |

#### Opção 3: Hybrid (Sidebar + Quick Switcher)

**Conceito:** Sidebar para navegação completa. Quick switcher (como Obsidian's) para acesso rápido a um código específico.

O quick switcher seria um `SuggestModal<CodeDefinition>`:
```
Cmd+Shift+C → [digite código...] → seleciona → navega ao primeiro trecho
```

**Tradeoffs:**

| Prós | Contras |
|------|---------|
| Melhor de dois mundos | Mais código para manter |
| Quick switcher é ~50 linhas | Dois UIs para mesma informação |
| Padrão Obsidian power users | |

### Análise de Longo Prazo

| Feature Futura | Sidebar | Modal | Quick Switcher |
|---------------|---------|-------|----------------|
| Drag-and-drop para reordenar códigos | ✅ Natural | ❌ | ❌ |
| Hierarquia de códigos (categorias) | ✅ Tree view | ⚠️ Possível | ❌ |
| Renomear código (propaga para markers) | ✅ Inline edit | ✅ | ❌ |
| Merge dois códigos | ✅ Drag onto | ✅ | ❌ |
| Exportar códigos (CSV, JSON) | ✅ Header action | ✅ | ❌ |
| Estatísticas (frequência, co-ocorrência) | ✅ Seção dedicada | ✅ | ❌ |
| Filtrar editor por código | ✅ Toggle visibility | ⚠️ | ✅ |

**Conclusão:** Sidebar é o investimento certo para longo prazo. Modal/Quick Switcher são bons complementos mas não substituem.

---

## Parte 4: Dependências e Ordem

### Grafo de dependências

```
                    ┌─────────────────┐
                    │ CodeDefinition  │
                    │ Registry        │ ← BASE DE TUDO
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
     ┌────────────┐  ┌────────────┐  ┌────────────┐
     │ Decorações │  │   Code     │  │   Menu     │
     │ por código │  │  Explorer  │  │  mostra    │
     │ (visual)   │  │ (sidebar)  │  │  cores     │
     └────────────┘  └────────────┘  └────────────┘
              │              │              │
              ▼              ▼              ▼
     ┌────────────┐  ┌────────────┐  ┌────────────┐
     │  Gutter    │  │ Hierarchy  │  │  Cor no    │
     │  bars      │  │ (códigos   │  │  toggle    │
     │ (margem)   │  │  em grupo) │  │            │
     └────────────┘  └────────────┘  └────────────┘
```

**O CodeDefinition Registry é a fundação.** Sem ele, nada mais faz sentido — não dá pra ter cor por código, nem listar códigos no explorer, nem mostrar cor no menu.

### Roadmap sugerido (não é plano — é mapa de possibilidades)

**Fase 0 — Quick Win:** ✅ Concluída
- Hover tooltip no highlight (Opção D da Parte 2)
- Mostra lista de códigos ao hover sobre qualquer highlight
- Implementado em `hoverMenuExtension.ts`

**Fase 1 — Fundação:** ✅ Concluída
- CodeDefinition Registry (`src/models/codeDefinitionRegistry.ts`)
- Migration automática: extrair códigos dos markers existentes → registry
- Paleta de 12 cores categóricas com contraste mínimo
- Menu Approach C: toggle mostra bolinha de cor ao lado do nome
- Shared registry cross-plugin (`.obsidian/codemarker-shared/registry.json`)

**Fase 1+ — Margin Panel:** ✅ Concluída
- `marginPanelExtension.ts` (539 LOC) — barras MAXQDA-style na margem
- Hover bidirecional (panel ↔ editor) via `setHoverEffect`
- Labels clicáveis → abrem Code Detail sidebar

**Fase 2 — Code Explorer + Detail:** ✅ Concluída
- `CodeExplorerView` — árvore 3 níveis: Code → File → Segment, toolbar com collapse/expand
- `CodeDetailView` — 3 modos: lista, code-focused, marker-focused
- Navegação integrada: label click → sidebar, sidebar click → scroll no editor
- `getAllMarkers()` para contagem cross-file

**Fase 2+ — Plugins Sibling:** ✅ Concluída
- **codemarker-csv** — qualitative coding em CSV via AG Grid + segment editor CM6
- **codemarker-pdf** — qualitative coding em PDF via highlight overlays (adaptado de PDF++ MIT)
- **codemarker-analytics** — 7 visualizações (dashboard, frequency, co-occurrence, network, doc-matrix, evolution, text retrieval) consolidando dados dos 3 plugins

**Fase 3 — Visual Evolution:** Pendente
- Decorações por código (não por marker) no editor
- Sobreposição visual com opacity blending

**Fase 4 — Projetos + Workspace:** Pendente
- Workspace global + projetos nomeados (ver Partes 7-8)
- Persistência em arquivos separados
- Seletor de projeto na leaf view

**Fase 5 — Power Features:** Pendente
- Hierarquia de códigos (categorias/grupos)
- Memos analíticos
- Filtrar editor por código (mostrar/esconder highlights)
- Quick switcher (Cmd+Shift+C)
- Exportação (CSV, JSON, REFI-QDA)

---

## Parte 5: Riscos e Considerações

### Performance
- **Markers por arquivo:** Hoje O(n) linear scan. Com 500+ markers por arquivo, `getMarkersInRange()` fica lento. Considerar indexação espacial (interval tree) na Fase 3+.
- **Decorações:** Muitas decorações = mais DOM nodes. CM6 é eficiente, mas 1000+ decorações por viewport podem degradar scroll.
- **Sidebar refresh:** Re-render do tree view em cada keystroke é wasteful. Debounce de 300ms+ necessário.

### Compatibilidade
- **data.json migration:** Qualquer mudança no modelo precisa de migration path. Nunca perder dados do usuário.
- **Obsidian updates:** `(item as any).dom` é hack. `ItemView` API é estável mas pode mudar.
- **Mobile:** Sidebar funciona diferente em mobile Obsidian. Testar.

### UX
- **Overwhelm visual:** Com 20 códigos e highlights por todo o documento, o editor vira carnaval. Precisa de "toggle visibility" por código.
- **Onboarding:** Usuário novo vê tela vazia no Code Explorer. First-use experience importa.
- **Conflito com outros plugins:** Highlighter, Comments, etc. podem colidir visualmente.

---

## Parte 6: Decisão Estratégica — Dados Fora das Notas

### O problema

A marcação no editor é só a **entrada de dados**. O grosso do trabalho de QDA acontece depois: gerenciar a árvore de códigos, ver frequências, cruzar categorias, comparar documentos, exportar matrizes. Se tudo isso fica dentro das notas ou em dezenas de arquivos sidecar, o vault vira uma zona — especialmente pra quem usa Obsidian pra outras coisas além da pesquisa.

**Como ATLAS.ti e MaxQDA resolvem:** trabalham com um "projeto" que é essencialmente um banco de dados. Os documentos originais ficam referenciados, mas toda a camada analítica vive no projeto, não nos documentos.

### O que precisa viver fora das notas

| Camada | Descrição | Relação com notas |
|--------|-----------|-------------------|
| **Codebook** | Árvore de códigos com hierarquia, cores, descrições, memos | Nenhuma — é o coração da análise |
| **Segments** | Mapeamento "trecho do arquivo X, posição 150-200, código Y" | Referencia arquivo por path |
| **Memos** | Anotações analíticas sobre códigos, documentos, relações | Independente das notas |
| **Relações/Metadata** | Links entre códigos, sets de documentos, variáveis de caso | Metadados sobre notas, não dentro delas |
| **Resultados** | Matrizes de coocorrência, frequências, queries salvas | Output analítico |

### Decisão: notas ficam 100% limpas

As decorações CM6 já resolvem a visualização sem tocar no Markdown. O arquivo de projeto concentra toda a inteligência analítica. O vault continua sendo um vault de notas.

### Impacto técnico

**Hoje:** Tudo em `data.json` via `plugin.loadData()/saveData()` — settings + markers misturados, códigos são strings soltas.

**Futuro:** Arquivos próprios via `vault.adapter.read/write`. Abandona a API padrão do Obsidian, mas ganha controle sobre estrutura, caching e separação de concerns.

**SQLite vs JSON:** SQLite é possível no Electron, mas quebra mobile Obsidian e complica distribuição no community plugins. JSON + índices in-memory é mais pragmático. Migrar se necessário quando escala justificar.

---

## Parte 7: Arquitetura de Projetos — Global + Nomeados

### Conceito

```
Global Workspace (sempre existe, implícito)
├── Codebook Global
│   ├── Motivação
│   ├── Barreira
│   ├── Percepção
│   └── Satisfação
├── Segmentos avulsos
└── Memos livres

Projeto: "Mestrado - Entrevistas"
├── Codebook do Projeto (herda do global + códigos próprios)
│   ├── Motivação       ← referência ao global
│   ├── Barreira        ← referência ao global
│   └── Cat. Emergente  ← só deste projeto
├── Documentos associados
│   ├── Entrevista01.md
│   └── Entrevista02.md
├── Variáveis de caso
├── Queries salvas
└── Memos do projeto

Projeto: "Doutorado - Grupos Focais"
├── Codebook do Projeto
│   ├── Motivação          ← mesma referência global
│   └── Dinâmica de Grupo  ← específico
├── ...
```

### Projeto global como estado zero

O pesquisador não precisa criar um "projeto" antes de fazer qualquer coisa. O fluxo natural:

1. Instala o plugin, abre uma nota, seleciona um trecho
2. Cria o código "Motivação" ali na hora → cai no global automaticamente
3. Depois, com 15 códigos e 3 entrevistas codificadas, pensa "preciso organizar"
4. Cria projeto "Pesquisa Mestrado", associa documentos e códigos

Análogo a como o Obsidian funciona: notas soltas primeiro, pastas depois.

### Código compartilhado entre projetos

"Motivação" existe uma vez no global. Projetos referenciam. Mudança de cor ou descrição reflete em todo lugar. Mas um projeto pode ter códigos que só fazem sentido naquele contexto.

Pesquisadores frequentemente reutilizam códigos entre pesquisas — é uma biblioteca que cresce ao longo da carreira.

### Estrutura de arquivos proposta

```
.obsidian/plugins/codemarker/
├── workspace.json          ← índice global + lista de projetos
├── codebook.json           ← codebook global
├── segments-global.json    ← segmentos sem projeto
├── projects/
│   ├── mestrado/
│   │   ├── project.json    ← config, documentos, variáveis
│   │   ├── codebook.json   ← códigos específicos + refs ao global
│   │   └── segments.json   ← segmentos deste projeto
│   └── doutorado/
│       ├── project.json
│       ├── codebook.json
│       └── segments.json
```

### Modelo de dados expandido

```typescript
interface Workspace {
    activeProject: string | null;  // null = global
    projects: {
        id: string;
        name: string;
        created: string;
        documents: string[];       // paths no vault
    }[];
    settings: { /* ... */ };
}

interface Code {
    id: string;
    name: string;
    color: string;
    description?: string;
    parentId?: string;             // hierarquia
    scope: 'global' | string;     // 'global' ou projectId
    memo?: string;
    createdAt: number;
}

interface Segment {
    id: string;
    fileId: string;                // path relativo no vault
    from: number;
    to: number;
    codeIds: string[];
    memo?: string;
    weight?: number;               // relevância
    created: string;
}

interface QDAProject {
    id: string;
    name: string;
    created: string;
    codebook: { codes: Code[]; codeGroups: CodeGroup[]; };
    segments: Segment[];
    memos: Memo[];
    documentVariables: { fileId: string; variables: Record<string, any>; }[];
    savedQueries: SavedQuery[];
}
```

---

## Parte 8: Leaf View — Interface de Análise

### Por que leaf view

O menu flutuante CM6 resolve a *entrada* de dados (marcar + atribuir código). Mas toda a camada analítica precisa de espaço próprio — como um software de verdade. Não tem como enfiar codebook hierárquico, text retrieval, matrizes e memos num tooltip.

### Layout proposto

```
┌─────────────────────────────────────────────────────────────────┐
│  [Global ▾]  CodeMarker                              [⚙] [📤]  │
├──────────────────┬──────────────────────────────────────────────┤
│                  │                                              │
│  Codebook        │  [Segments] [Matrix] [Documents]            │
│  ──────────      │                                              │
│  🔍 Filter...    │  Segments for "Motivação" (5)               │
│                  │  ─────────────────────────────               │
│  ▼ Motivação (5) │  "trecho importante sobre..."  Plan.md:12   │
│  ▼ Barreira  (3) │  "outro trecho relevante..."   Notes.md:45  │
│  ▶ Percepção (1) │  "mais um exemplo de..."       Draft.md:8   │
│  ▶ Satisfação(2) │                                              │
│                  │                                              │
│  ──────────      │                                              │
│  + New Code      │                                              │
│                  ├──────────────────────────────────────────────┤
│                  │  Memo: Este código captura as motivações     │
│                  │  intrínsecas dos participantes...            │
│                  │                                              │
├──────────────────┴──────────────────────────────────────────────┤
│  6 codes · 11 segments · Global Workspace                       │
└─────────────────────────────────────────────────────────────────┘
```

**Áreas:**
- **Sidebar esquerda:** Codebook em árvore. Seletor Global/Projeto no topo. Quando no global, mostra todos os códigos. Quando num projeto, indica quais vieram do global.
- **Área central:** Tabs — text retrieval (segmentos por código), matriz de coocorrência, visão de documentos com marcações.
- **Painel inferior:** Memos, propriedades do código selecionado, estatísticas rápidas.

### Implementação

- API: `ItemView` → `registerView()` → `workspace.getLeaf()` (pode ser tab central ou sidebar)
- Reatividade: event system pub/sub — plugin emite ao mudar markers, view escuta e atualiza
- DOM: manual ou framework leve. Obsidian não oferece reactive components nativamente.

---

## Parte 9: Roadmap Consolidado

### Grafo de dependências atualizado

```
                    ┌─────────────────┐
                    │ CodeDefinition  │
                    │ Registry        │ ← BASE DE TUDO
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
     ┌────────────┐  ┌────────────┐  ┌────────────┐
     │ Decorações │  │   Leaf     │  │   Menu     │
     │ por código │  │   View     │  │  mostra    │
     │ (visual)   │  │ (análise)  │  │  cores     │
     └────────────┘  └────────────┘  └────────────┘
              │              │              │
              ▼              ▼              ▼
     ┌────────────┐  ┌────────────┐  ┌────────────┐
     │  Gutter    │  │ Projetos + │  │  Cor no    │
     │  bars      │  │ Workspace  │  │  toggle    │
     └────────────┘  └────────────┘  └────────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ Power Features  │
                    │ Queries, Export │
                    │ Memos, Vars     │
                    └─────────────────┘
```

### Fases

**Fase 0 — Quick Win:** ✅ Concluída
- Hover tooltip sobre highlights (`hoverMenuExtension.ts`)

**Fase 1 — Fundação (CodeDefinition Registry):** ✅ Concluída
- `CodeDefinition` interface + registry (`codeDefinitionRegistry.ts`)
- Migration automática dos dados existentes
- Paleta de 12 cores categóricas
- Menu mostra cor do código no toggle
- Shared registry cross-plugin (`.obsidian/codemarker-shared/registry.json`)

**Fase 1+ — Margin Panel MAXQDA:** ✅ Concluída
- Barras coloridas na margem (`marginPanelExtension.ts`, 539 LOC)
- Hover bidirecional panel ↔ editor
- Labels clicáveis → Code Detail sidebar

**Fase 2 — Code Explorer + Detail View:** ✅ Concluída
- `CodeExplorerView` (árvore 3 níveis) + `CodeDetailView` (3 modos)
- Navegação integrada: margem → sidebar → editor
- `getAllMarkers()` para contagem cross-file

**Fase 2+ — Ecossistema Multi-formato:** ✅ Concluída
- **codemarker-csv** — AG Grid + segment editor CM6 completo
- **codemarker-pdf** — highlights sobre PDF nativo (PDF.js), sidebar views, shared registry
- **codemarker-analytics** — 7 views de análise consolidando markdown + CSV + image + PDF

**Fase 3 — Visual Evolution:** Pendente
- Decorações por código (N decorações sobrepostas)
- Opacity blending
- Gutter bars (opcional)

**Fase 4 — Projetos + Persistência:** Pendente
- Workspace global + projetos nomeados
- Persistência em arquivos separados
- Migration de `data.json`
- Seletor de projeto na leaf view

**Fase 5 — Power Features:** Pendente
- Hierarquia de códigos (categorias/grupos)
- Memos analíticos
- Variáveis de caso por documento
- ~~Queries (coocorrência, frequência, text retrieval)~~ → movido para codemarker-analytics
- Toggle visibility por código no editor
- Quick switcher (Cmd+Shift+C)
- Exportação (CSV, JSON, REFI-QDA)

### Riscos adicionais

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| `vault.adapter` vs `loadData` | Concorrência, caching manual | Camada de abstração própria |
| Escopo cresce pra ATLAS.ti | Meses de trabalho, complexidade | Fases incrementais, valor por fase |
| Leaf view DOM sem framework | Código de UI verboso | Avaliar framework leve ou componentes reutilizáveis |
| Herança global→projeto | Complexidade de merge/sync | Modelo simples: referência por ID, sem deep copy |

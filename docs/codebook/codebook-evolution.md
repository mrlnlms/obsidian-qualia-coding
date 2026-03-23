# Codebook Evolution — Qualia Coding

**Tipo:** Documento intermediario (superseded)
**Status:** Superseded por design spec
**Data:** 2026-03-22
**Origem:** Vision document (2026-03-21) + Hierarchy plan (2026-03-02) + decisoes de sessao (2026-03-22)

---

## Referencia principal

> **Este documento foi superseded pelo design spec refinado:**
> [`docs/superpowers/specs/2026-03-22-codebook-evolution-design.md`](../superpowers/specs/2026-03-22-codebook-evolution-design.md)
>
> O design spec incorpora todas as decisoes deste documento + refinamentos:
> - Fase C (migracao codes[]) antes da Fase A (hierarquia) — sem dados legados, sem migracao
> - Sem `aggregate` no CodeDefinition — agregacao e comportamento de visualizacao
> - Relacoes em dois niveis (codigo-level + segmento-level)
> - Detail View evolui para Codebook Panel com navegacao stack-based
> - Merge Modal, drag-drop com toggle Reorganizar/Merge
> - Magnitude com picker fechado, labels de relacao livres com autocomplete
>
> **Para implementacao, consultar o design spec. Este documento e mantido como historico.**

---

## Sobre este documento (historico)

Primeira consolidacao da visao do codebook com decisoes de implementacao. Serviu como base para o design spec final.

---

## Principios

**O software nao tem jurisdicao sobre a estrutura analitica do pesquisador.**
Sem caps de profundidade, sem validacoes paternalistas. O pesquisador que esta no nivel 6 da hierarquia sabe exatamente o que esta fazendo.

**Hierarquia e o pensamento analitico materializado.**
A estrutura do codebook reflete o estado atual da teoria emergente. Reorganizar a hierarquia *e* fazer analise.

**Magnitude e hierarquia sao planos ortogonais.**
Hierarquia vive no codigo — estrutura do codebook. Magnitude vive no marker — o momento em que codigo encontra segmento. Os dois evoluem independentemente.

**O marker e um objeto de primeira classe.**
O momento em que um codigo e aplicado a um segmento nao e um link simples. E uma entidade com propriedades proprias — magnitude, memo, anotador, contexto.

**Codebook como artefato vivo.**
Nasce simples durante a codificacao aberta, cresce e se consolida durante a axial e seletiva. O sistema suporta esse ciclo de vida sem friccao.

**Visualizacoes sao projecoes, nao editores.**
Network View, treemap, sunburst — sao renderizacoes do `registry`. A fonte de verdade e sempre o `data.json`.

---

## Estado atual do modelo de dados

### Codigo (hoje)

```json
{
  "id": "code_frustracao",
  "name": "Frustracao com Ferramentas",
  "color": "#34f4ce",
  "description": "Momentos de frustracao explicita com ferramentas de trabalho",
  "paletteIndex": 1,
  "createdAt": 1772845000000,
  "updatedAt": 1774113712332
}
```

### Marker (hoje)

```json
{
  "id": "m01_frustracao1",
  "fileId": "Entrevista P01 - Maria.md",
  "range": { "from": { "line": 12, "ch": 0 }, "to": { "line": 14, "ch": 45 } },
  "codes": ["Frustracao com Ferramentas"],
  "text": "A parte mais frustrante e quando...",
  "memo": "",
  "createdAt": 1772845300000,
  "updatedAt": 1772845300000
}
```

O que temos:
- `registry.definitions` — dicionario flat, sem hierarquia
- Markers referenciam codigos pelo `name` (string)
- `codes[]` e array de strings — suporta multiplos codigos no mesmo segmento
- `memo` existe como campo opcional em todos os markers (BaseMarker)
- `description` existe em CodeDefinition
- 6 engines (markdown, PDF, CSV/Parquet, image, audio, video) com adapters unificados
- Sidebar com 2 views (Explorer 3 niveis + Detail 3 modos) via UnifiedModelAdapter
- 1548 testes, 0 tsc errors, cache incremental, divida tecnica zerada

---

## Evolucao do modelo de dados (visao completa)

### Codigo (destino)

```json
{
  "id": "code_frustracao",
  "name": "Frustracao com Ferramentas",
  "color": "#34f4ce",
  "description": "Momentos de frustracao explicita com ferramentas de trabalho",
  "paletteIndex": 1,
  "createdAt": 1772845000000,
  "updatedAt": 1774113712332,

  "parentId": null,
  "folder": null,
  "aggregate": false,
  "mergedFrom": [],
  "childrenOrder": [],

  "magnitude": {
    "type": null,
    "values": []
  },

  "relations": []
}
```

Todos os campos novos sao opcionais com defaults seguros (null, false, []). Dados antigos funcionam sem migracao — tudo e backward-compatible no registry.

### Marker (destino)

```json
{
  "id": "m01_frustracao1",
  "fileId": "Entrevista P01 - Maria.md",
  "range": { "from": { "line": 12, "ch": 0 }, "to": { "line": 14, "ch": 45 } },
  "codes": [
    { "codeId": "code_frustracao", "magnitude": "ALTA" }
  ],
  "text": "A parte mais frustrante e quando...",
  "memo": "",
  "createdAt": 1772845300000,
  "updatedAt": 1772845300000
}
```

A mudanca em `codes[]` — de array de strings para array de objetos — e a evolucao estrutural que desbloqueia magnitude e referencia estavel por id. Requer migracao de schema.

### Avaliacao de impacto da migracao codes[]

`marker.codes` e referenciado em ~110 pontos nos 6 engines, adapters, views e analytics. O refactoring (2026-03-16 a 2026-03-20) isolou cada engine no seu model com `addCode`/`removeCode`, unificou sidebar via adapters, e centralizou analytics em funcoes puras. O trabalho de migracao e **mecanico** (find-and-replace guiado por TypeScript), nao arquitetural:

- Tipo em BaseMarker: 1 lugar
- addCode/removeCode em cada model: 5 arquivos, ~5 linhas cada
- rename/delete no baseSidebarAdapter: 1 arquivo
- Leituras nas views: `.codes[0]` → `.codes[0].codeId`
- Filtros no analytics: `.includes(name)` → `.some(c => c.codeId === id)`
- Funcao de migracao no DataManager: converte formato antigo pro novo

---

## Sequencia de implementacao

Cada fase e independente e shippable. Nenhuma fase quebra dados existentes.

### Fase A — Hierarquia (registry only, markers intocados)

**Campos novos no CodeDefinition:** `parentId`, `childrenOrder`, `mergedFrom`, `aggregate`

**Nao depende de nada. Nao muda markers, engines ou analytics.**

#### A1. Data Model (~60 LOC)

`src/core/types.ts` — adicionar campos:
```typescript
export interface CodeDefinition {
    // ... campos existentes ...
    parentId?: string;        // id do pai — undefined = top-level
    childrenOrder?: string[]; // ordem manual dos filhos
    mergedFrom?: string[];    // audit trail de merges
    aggregate?: boolean;      // incluir markers dos filhos em queries
}
```

`src/core/codeDefinitionRegistry.ts` — novos metodos:
```typescript
getRootCodes(): CodeDefinition[]
getChildren(parentId: string): CodeDefinition[]
getAncestors(id: string): CodeDefinition[]
getDescendants(id: string): CodeDefinition[]
getDepth(id: string): number
getHierarchicalList(): Array<{ def: CodeDefinition; depth: number }>
setParent(id: string, parentId: string | undefined): boolean  // com validacao anti-ciclo
```

Modificar `create()`: aceitar `parentId?` opcional.
Modificar `update()`: aceitar `parentId` em changes.
Modificar `delete()`: filhos orfaos viram root (`parentId = undefined`).

#### A2. Code Form Modal (~25 LOC)

`src/core/codeFormModal.ts`:
- Dropdown "Parent code" entre Color e Description
- Lista todos os codigos exceto self e descendentes (anti-ciclo)
- `onSave` passa `parentId`

#### A3. Explorer View — arvore hierarquica (~50 LOC)

`src/core/baseCodeExplorerView.ts`:

Arvore atual (3 niveis):
```
Code → File → Segment
```

Nova arvore (4 niveis quando ha hierarquia):
```
Parent Code (contagem agregada quando colapsado, direta quando expandido)
  └─ Child Code
       └─ File
            └─ Segment
```

- `renderTree()`: usar `getRootCodes()` como nivel 0
- Para cada root, chamar `getChildren(id)` e renderizar sub-tree recursiva
- Codigos sem filhos: mantem layout atual (Code → File → Segment)
- Collapse/expand em todos os niveis

#### A4. Detail View — breadcrumbs (~20 LOC)

`src/core/baseCodeDetailView.ts`:

**List mode**: usar `getHierarchicalList()` com indentacao visual por depth.

**Code-focused mode**: breadcrumb no header quando codigo tem pai:
```
← Barreiras > Custo > Custo por usuario
   12 segments across 3 files
```
Cada ancestral no breadcrumb e clicavel (navega pro code-focused desse pai).

#### A5. Operacoes avancadas

**Merge** — N codigos fundidos em 1:
- Todos os markers dos codigos-fonte sao reatribuidos ao destino
- Codigos-fonte removidos do registry
- `mergedFrom` do destino registra os ids fundidos (audit trail)

**Split** — 1 codigo vira pai de N filhos novos:
- Markers existentes precisam ser redistribuidos pelo pesquisador

**Promote** — mover para top-level: `parentId: undefined`

**Aggregate** — quando `true`, queries incluem markers de todos os descendentes recursivamente.

**Contagem**:
- Direta: markers onde este codigo esta aplicado diretamente
- Agregada: markers deste codigo + todos os descendentes
- Explorer colapsado: exibe agregada. Expandido: exibe direta. Detail: exibe os dois.

#### A6. CSS (~15 LOC)

```css
.codemarker-hierarchy-indent   { padding-left: 16px; }
.codemarker-hierarchy-indent-2 { padding-left: 32px; }
.codemarker-hierarchy-indent-3 { padding-left: 48px; }

.codemarker-breadcrumb           { display: inline-flex; gap: 4px; color: var(--text-muted); font-size: var(--font-ui-small); }
.codemarker-breadcrumb-separator { opacity: 0.5; }
.codemarker-breadcrumb-item      { cursor: pointer; }
.codemarker-breadcrumb-item:hover { color: var(--text-normal); }
```

#### O que NAO muda na Fase A

- `BaseMarker.codes: string[]` — markers intocados
- Engine models (markdown, PDF, CSV, image, audio, video) — zero mudancas
- Analytics — enhancement futuro (agregar por pai)
- `SidebarModelInterface` — hierarquia vive no registry
- Serializacao — `toJSON()`/`fromJSON()` ja serializa todos os campos automaticamente
- **Coding popover** — lista permanece flat com busca fuzzy. Hierarquia nao afeta o ato de codificar

#### Verificacao

1. `npm run build` — 0 erros tsc
2. `npm run test` — todos passam
3. Criar codigo "Emocoes", criar "Alegria" com parent "Emocoes"
4. Explorer: "Emocoes" aparece como pai com "Alegria" indentado abaixo
5. Detail code-focused: breadcrumb "Emocoes > Alegria"
6. Deletar "Emocoes" → "Alegria" vira root
7. Dados antigos (sem parentId): todos aparecem como root, zero erros

---

### Fase B — Pastas Virtuais (registry only)

**Campo novo no CodeDefinition:** `folder`
**Campo novo no registry:** `folders` (dicionario)

**Independente da hierarquia. Um codigo pode ter pai E estar numa pasta — dois eixos ortogonais.**

#### Schema

```json
"registry": {
  "definitions": { ... },
  "folders": {
    "folder_abc123": {
      "id": "folder_abc123",
      "name": "Framework Teorico",
      "createdAt": 1772845000000
    }
  }
}
```

CodeDefinition ganha: `folder?: string` (id da pasta, null = raiz).

#### Principio

Pastas sao containers organizacionais sem significado analitico. Nao afetam hierarquia, aggregate, queries ou nenhuma operacao de analise. Sao gavetas.

#### Interface

Segue paradigma do File Explorer do Obsidian — metafora ja conhecida, zero custo de aprendizado.

Distincao visual clara entre pasta (icone de pasta) e codigo-pai (chevron de expand) — porque mover para uma pasta nao e reparentar na hierarquia.

#### O que NAO muda na Fase B

- Markers, engines, analytics, popover — nada
- Hierarquia — independente

---

### Fase C — Migracao de codes[] (breaking change controlada)

**Mudanca em BaseMarker:** `codes: string[]` → `codes: CodeApplication[]`

```typescript
interface CodeApplication {
  codeId: string;        // referencia por id (estavel)
  magnitude?: string;    // valor de magnitude (opcional)
}
```

#### Migracao

Funcao no DataManager que converte formato antigo:
```
"codes": ["Frustracao"]
→
"codes": [{ "codeId": "code_frustracao", "magnitude": null }]
```

Resolve nome → id via registry no momento da migracao.

#### Impacto (mecanico, nao arquitetural)

| Camada | Arquivos | Mudanca |
|--------|----------|---------|
| Tipo | `types.ts` | `codes: CodeApplication[]` |
| Models (5x) | `codeMarkerModel`, `pdfCodingModel`, `csvCodingModel`, `imageCodingModel`, `mediaCodingModel` | `addCode`/`removeCode` recebem `codeId` em vez de name |
| Base adapter | `baseSidebarAdapter.ts` | rename por id (trivial), delete por id |
| Views | explorer, detail renderers | `.codes[0]` → `.codes[0].codeId`, resolve nome via registry |
| Analytics | funcoes puras em `data/` | `.includes(name)` → `.some(c => c.codeId === id)` |
| Popover | `codingPopover.ts` | `addCode` passa id em vez de name |

TypeScript guia 100% — mudar o tipo e o compilador aponta todos os pontos.

#### Consequencia

Com `codeId` no marker, rename de codigo nao precisa mais propagar para markers (hoje `renameCode()` percorre todos). O id e estavel.

---

### Fase D — Magnitude (depende de C)

**Campo novo no CodeDefinition:** `magnitude: { type, values }`
**Campo novo no marker (via CodeApplication):** `magnitude?: string`

> Saldana, *The Coding Manual for Qualitative Researchers*, Cap. 14.

#### Principio

Magnitude e uma propriedade do **marker** — nao do codigo. E o momento em que o pesquisador decide que aquele segmento tem uma intensidade, direcao ou avaliacao.

```
Codigo:   Frustracao  ──── (hierarquia, relacoes)
               │
Markers:  segmento A  →  { codeId: "code_frustracao", magnitude: "ALTA" }
          segmento B  →  { codeId: "code_frustracao", magnitude: "BAIXA" }
          segmento C  →  { codeId: "code_frustracao" }   ← sem magnitude, valido
```

#### Tipo de variavel

O pesquisador declara o tipo. O sistema deduz o que e analiticamente valido.

| Tipo | Exemplo | Operacoes validas |
|------|---------|------------------|
| `nominal` | POSITIVO / NEUTRO / NEGATIVO | Frequencia, moda, distribuicao |
| `ordinal` | BAIXA / MEDIA / ALTA | Frequencia, mediana, ordenacao |
| `continuous` | 0.0 – 1.0 | Media, desvio padrao, tudo acima |
| `null` | — | Sem magnitude neste codigo |

`values: []` vazio → campo livre. `values: ["BAIXA", "MEDIA", "ALTA"]` → picker com sugestoes (aceita texto livre).

#### UI no popover

Secao colapsavel no coding popover, mesmo pattern do Memo existente (`renderMemoSection`):

```
[Search or create code...]
─────────────────────────
[●] Toggle  Codigo A        →
[●] Toggle  Codigo B        →
Browse all codes...
─────────────────────────
▸ Memo
▸ Magnitude                   ← so aparece se o codigo tem magnitude definida
─────────────────────────
⊕ Add New Code
```

**Feature toggle nas settings do plugin** — pesquisador pode desligar magnitude no popover se nao usar. Se incomodar, desliga. Se a feature inteira nao fizer sentido, remove sem dor porque esta isolada atras de um toggle.

#### Conexao com mixed methods

Ao declarar o tipo de variavel, o pesquisador cria uma variavel pronta para analise estatistica. O dado qualitativo nasce com a estrutura do quantitativo. Export direto para R, Python, SPSS.

---

### Fase E — Relacoes entre Codigos (independente de C/D)

**Campo novo no CodeDefinition:** `relations: CodeRelation[]`

#### Principio

Alem da hierarquia (pai/filho), codigos podem ter relacoes semanticas — causalidade, contradicao, precedencia. Um codigo tem um unico pai, mas pode ter multiplas relacoes com multiplos codigos.

#### Schema

```typescript
interface CodeRelation {
  type: string;       // "is cause of", "correlates with", etc.
  target: string;     // id do codigo alvo
}
```

#### Tipos de relacao

| Categoria | Tipos |
|-----------|-------|
| Causal | is cause of, resulted in, influences |
| Estrutural | is part of, is a, is property of |
| Associativa | correlates with, is associated with, contradicts |
| Facilitativa | facilitates, hinders, is strategy for |
| Temporal | precedes, follows, occurs during |
| Custom | o pesquisador define |

#### Declarativas vs. emergentes

**Declarativas** — pesquisador define. Refletem teoria.
**Emergentes** — sistema detecta co-ocorrencia estatistica (ja implementado no analytics). Sao sugestoes. Co-ocorrencia e dado empirico. Relacao causal e interpretacao. O sistema nao confunde os dois.

#### UI no popover

Mesma abordagem de magnitude — secao colapsavel:

```
▸ Memo
▸ Magnitude
▸ Relations                   ← so aparece quando relevante
```

**Feature toggle nas settings** — mesma logica de magnitude. Pesquisador pode desligar se nao usa.

#### UI no Detail View

Secao colapsavel no code-focused mode, listando relacoes declaradas com tipo e codigo alvo clicavel.

#### Visualizacao

**Network View** no analytics — grafo de relacoes declaradas + co-ocorrencias emergentes. E projecao do registry, nao editor.

---

## Interface consolidada

### Coding Popover (todos os engines)

O popover e o ponto de contato mais frequente. Prioridade absoluta: velocidade.

```
[Search or create code...]              ← busca fuzzy, Enter cria novo
─────────────────────────
[●] Toggle  Codigo A        →           ← lista FLAT sempre, mesmo com hierarquia
[●] Toggle  Codigo B        →              (pesquisador digita e acha, nao navega arvore)
[●] Toggle  Codigo C        →
Browse all codes...                     ← abre FuzzySuggestModal
─────────────────────────
▸ Memo                                  ← colapsavel, padrao existente
▸ Magnitude                             ← colapsavel, toggle nas settings (Fase D)
▸ Relations                             ← colapsavel, toggle nas settings (Fase E)
─────────────────────────
⊕ Add New Code
🗑 Delete Segment
```

**Decisoes:**
- Hierarquia NAO afeta o popover — lista e flat com busca fuzzy
- Pastas NAO aparecem no popover — sao organizacao, nao codificacao
- Magnitude e Relations seguem pattern do Memo (secao colapsavel `renderMemoSection`)
- Magnitude so aparece se o codigo aplicado tem `magnitude.type != null`
- Ambos sao feature toggles nas settings — desliga sem impacto

### Code Explorer (sidebar esquerda)

**Visao com hierarquia + pastas:**
```
[Collapse All] [Collapse Files] [Search]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📁 Framework Teorico
  [●] Motivacao (12)
  [●] Barreira (8)

▼ [●] Emocoes (42)                     ← codigo-pai com chevron
    [●] Alegria (15)                    ← codigo-filho indentado
    [●] Frustracao (27)
      ▼ entrevista-01.md (10)           ← arquivo
          "eu sinto que nao..."         ← segmento
          "a pressao no trabalho..."

▼ [●] Comportamento (18)
    [●] Evitacao (8)
    [●] Confronto (10)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
5 codigos · 72 segmentos
```

Distincao visual: pasta (icone) vs codigo-pai (chevron de expand).
Contagem: agregada quando colapsado, direta quando expandido.

### Code Detail (sidebar direita)

**Code-focused mode com hierarquia:**
```
← Emocoes > Frustracao                  ← breadcrumb clicavel
━━━━━━━━━━━━━━━━━━━━━━━━
[●] Frustracao com Ferramentas
━━━━━━━━━━━━━━━━━━━━━━━━
Descricao
[textarea editavel]

Hierarquia
  Pai: Emocoes                          ← clicavel
  Filhos: (nenhum)

Magnitude                               ← so se definido
  Tipo: ordinal
  Valores: BAIXA, MEDIA, ALTA

Relacoes                                ← so se existirem
  → is cause of: Abandono
  ↔ correlates with: Custo

Segmentos (27)
  • entrevista-01.md: "eu sinto que..." [reveal]
  ...

Segmentos por arquivo
  ▼ entrevista-01.md (10)
    ...

Audit trail
  Criado: 2026-03-01
  mergedFrom: [code_irritacao, code_raiva]

[Excluir "Frustracao"]
```

### Context Menu (Code Explorer)

```
Rename
Add child code
New folder
─────────────────────
Move to...
Promote to top-level
Move to folder...
─────────────────────
Merge with...
Split into subcodes
─────────────────────
Toggle aggregate
Change color
Edit description
Set magnitude...
─────────────────────
View all markers
─────────────────────
Delete...
```

---

## Analytics (consequencias)

As fases desbloqueiam visualizacoes incrementalmente:

| Fase | Desbloqueia |
|------|-------------|
| A (hierarquia) | Treemap / Sunburst por hierarquia, aggregate queries |
| B (pastas) | Nada — pastas nao tem significado analitico |
| C (migracao) | Referencia estavel por id, rename sem propagacao |
| D (magnitude) | Distribuicao de magnitudes, export mixed methods, Code x Magnitude matrix |
| E (relacoes) | Network View (declarativas + emergentes) |

**Export mixed methods** (apos Fase D):
```
arquivo           | Frustracao_magnitude | Satisfacao_magnitude
P01 - Maria.md    | ALTA                 | BAIXA
P02 - Carlos.md   | MEDIA                | MEDIA
```

Tipo declarado informa nivel de mensuracao da coluna. Export direto para R, Python, SPSS.

---

## Questoes em aberto

**Pasta: id no registry (proposto) vs string simples?**
Id e mais robusto (rename de pasta trivial). String e mais legivel em data.json. Decisao: id no registry (consistente com CodeDefinition).

**Magnitude: picker automatico ou opt-in?**
Quando `values` esta definido, abre picker automaticamente ao aplicar o codigo? Ou o pesquisador acessa explicitamente? Picker automatico e mais consistente mas interruptivo no fluxo rapido. Decisao adiada — testar com hierarquia primeiro.

**Aggregate: default false (proposto).**
Pesquisadores top-down provavelmente querem `true` nos niveis altos. Testar na pratica.

**Relacoes: direcao por tipo?**
"is cause of" e direcional. "correlates with" e simetrica. Definir defaults por tipo.

**Co-ocorrencia: threshold pra sugestao?**
Se dois codigos co-ocorrem em X% dos markers, sugerir relacao? Pode ser util ou perturbador. Testar na pratica.

---

## Abordagens metodologicas suportadas

O sistema nao distingue — nao ha diferenca tecnica entre um codigo criado antes ou durante a codificacao.

**Bottom-up (indutivo / GT):** codebook nasce vazio, hierarquia emerge por merge e reparenting progressivo.

**Top-down (dedutivo):** codebook criado antes da codificacao a partir de framework teorico.

**Misto:** o mais comum na pratica.

---

## Referencias

- Saldana, J. (2021). *The Coding Manual for Qualitative Researchers* (4a ed.). SAGE.
- Friese, S. (2019). *Qualitative Data Analysis with ATLAS.ti*. SAGE.
- Mortelmans, D. (2025). *Doing Qualitative Data Analysis with NVivo*. Springer.
- Onwuegbuzie, A. J. & Teddlie, C. (2003). A framework for analyzing data in mixed methods research. *Handbook of Mixed Methods*. SAGE.
- NVivo Manual — QSR/Lumivero
- MAXQDA Online Manual 2022/2024
- ATLAS.ti 9/22/23 Windows Manual

# Codebook Evolution — Design Spec

**Data:** 2026-03-22
**Status:** Aprovado
**Origem:** codebook-evolution.md (visao) + sessao de brainstorming (refinamento)

---

## Principios

1. **O software nao tem jurisdicao sobre a estrutura analitica do pesquisador.** Sem caps de profundidade, sem validacoes paternalistas.
2. **Hierarquia e o pensamento analitico materializado.** Reorganizar a hierarquia *e* fazer analise.
3. **Magnitude e hierarquia sao planos ortogonais.** Hierarquia vive no codigo. Magnitude vive no marker.
4. **O marker e um objeto de primeira classe.** Entidade com propriedades proprias — magnitude, memo, relacoes.
5. **Codebook como artefato vivo.** Nasce simples na codificacao aberta, cresce e se consolida na axial e seletiva.
6. **Visualizacoes sao projecoes, nao editores.** Network View, treemap, sunburst — renderizacoes do registry. Fonte de verdade e sempre o data.json.

---

## Modelo de Dados

### CodeDefinition (destino)

```typescript
interface CodeDefinition {
  // existentes
  id: string;
  name: string;
  color: string;
  description?: string;
  paletteIndex: number;
  createdAt: number;
  updatedAt: number;

  // hierarquia (Fase A)
  parentId?: string;
  childrenOrder?: string[];
  mergedFrom?: string[];

  // pastas virtuais (Fase B)
  folder?: string;

  // magnitude (Fase D)
  magnitude?: {
    type: 'nominal' | 'ordinal' | 'continuous' | null;
    values: string[];   // vazio = sem valores definidos, preenchido = picker fechado
  };

  // relacoes codigo-level (Fase E)
  relations?: Array<{
    label: string;       // livre, com autocomplete das ja usadas no projeto
    target: string;      // id do codigo alvo
    directed: boolean;   // true = direcional, false = simetrica
  }>;
}
```

### CodeApplication (substitui string em codes[])

```typescript
interface CodeApplication {
  codeId: string;
  magnitude?: string;     // valor atribuido ao segmento (picker fechado)
  relations?: Array<{     // relacoes segmento-level
    label: string;
    target: string;       // id do codigo alvo (qualquer do registry)
    directed: boolean;
  }>;
}
```

### BaseMarker (migrado)

```typescript
interface BaseMarker {
  markerType: MarkerType;
  id: string;
  fileId: string;
  colorOverride?: string;
  memo?: string;
  createdAt: number;
  updatedAt: number;
  codes: CodeApplication[];   // era string[]
}
```

### Folders no registry

```typescript
// dentro de QualiaData.registry
folders: Record<string, {
  id: string;
  name: string;
  createdAt: number;
}>;
```

Todos os campos novos sao opcionais com defaults seguros (null, false, []).

### Decisoes de modelo

- **Sem `aggregate` no CodeDefinition.** Agregacao e comportamento de visualizacao, nao propriedade do codigo.
- **Sem codigo de migracao.** Produto nao lancado, sem dados legados. Dados de teste recriados na estrutura nova.
- **Referencia por id** (CodeApplication.codeId) elimina propagacao de rename para markers.

---

## Sequencia de Implementacao

### Fase C (primeira) — Migracao de codes[]

`codes: string[]` → `codes: CodeApplication[]`

Trabalho mecanico guiado pelo TypeScript:
- Tipo em BaseMarker: 1 lugar
- addCode/removeCode em cada model: 5 arquivos
- rename/delete no baseSidebarAdapter: 1 arquivo
- Leituras nas views: `.codes[0]` → `.codes[0].codeId`
- Filtros no analytics: `.includes(name)` → `.some(c => c.codeId === id)`

Resultado: referencia por id, rename atomico, base pronta para tudo que vem depois.

### Fase A — Hierarquia

Campos: `parentId`, `childrenOrder`, `mergedFrom`

Registry ganha metodos:
- `getRootCodes()`, `getChildren(parentId)`, `getAncestors(id)`, `getDescendants(id)`
- `getDepth(id)`, `getHierarchicalList()`
- `setParent(id, parentId)` com validacao anti-ciclo

Code Form Modal: dropdown "Parent code" (exclui self + descendentes).
Explorer: arvore hierarquica com collapse/expand.
Detail: breadcrumbs clicaveis.
Merge e drag-drop (ver secao Interacao).

Delete de codigo-pai: filhos viram root (`parentId = undefined`).

### Fase B — Pastas Virtuais

Campo: `folder` no CodeDefinition. `folders` no registry.

Pastas sao containers organizacionais sem significado analitico. Nao afetam hierarquia, aggregate, queries ou analytics. Um codigo pertence a uma pasta (nao multiplas).

Metafora do File Explorer do Obsidian. Distincao visual: pasta (icone) vs codigo-pai (chevron).

### Fase D — Magnitude

Campo no CodeDefinition: `magnitude: { type, values }`
Campo no CodeApplication: `magnitude?: string`

Tipos de variavel: nominal, ordinal, continuous, null.
Picker fechado — valores declarados sao os unicos permitidos. Se quer adicionar valor, vai na definicao do codigo.

UI: secao colapsavel no popover (pattern do Memo). Toggle nas settings controla visibilidade no popover.

Conexao mixed methods: tipo declarado informa nivel de mensuracao. Export direto para R, Python, SPSS.

### Fase E — Relacoes

Dois niveis:
- **Codigo-level:** `CodeDefinition.relations` — declaracao teorica.
- **Segmento-level:** `CodeApplication.relations` — interpretacao ancorada no dado.

Label livre com autocomplete das ja usadas no projeto. Sem tipos predefinidos.

Pontos de entrada:
- **Codigo-level:** Detail View (code-focused mode)
- **Segmento-level:** Popover (secao colapsavel) + side panel do marker (nivel 3 da view)

Toggle nas settings esconde a secao Relations do popover. A feature continua acessivel no side panel do marker e no Detail View.

Target de relacao: qualquer codigo do registry, com possibilidade de criar novo ali mesmo. Nao precisa estar no mesmo segmento.

---

## Navegacao e Interacao

### View Unica (Codebook Panel)

O Detail View atual evolui para uma view com navegacao stack-based (push/pop) e breadcrumb. Tres niveis:

**Nivel 1 — Codebook (raiz)**

Todos os codigos + pastas + hierarquia. Drag-drop para reorganizar. Busca fuzzy. Footer com contagens.

Elementos:
- Busca
- Toggle reorganizar/merge
- Arvore: pastas (icone) + codigos com hierarquia (chevron)
- Botoes: New Code, New Folder

Contagem: colapsado = agregado; expandido = direto em cada nivel. Hover/tooltip para breakdown completo ("X diretos, Y subcodigos, Z total").

**Nivel 2 — Codigo (page)**

Click num codigo → drill-down. Breadcrumb: `← Codebook` ou `← [Pai]`.

Conteudo:
- Nome editavel (inline) + cor
- Descricao (textarea)
- Hierarquia: pai (clicavel), filhos (listados)
- Magnitude config (tipo + valores) — colapsavel, so se configurado
- Relacoes codigo-level — colapsavel, so se existirem. + Add relation
- Segmentos (contagem: "X diretos · Y com filhos")
  - Lista flat com `↗` para reveal no documento
  - Click no segmento = drill-down para nivel 3
- Segmentos por arquivo (colapsavel)
- Audit trail (criado em, mergedFrom)
- Acoes: Merge with..., Delete

**Nivel 3 — Segmento (page)**

Click num segmento → drill-down. Breadcrumb: `← [Codigo]`.

Conteudo:
- Arquivo de origem + `↗` reveal
- Trecho (blockquote)
- Chips dos codigos aplicados (click → navega pra page desse codigo)
- Memo (textarea) — colapsavel
- Magnitude por codigo (picker, so para codigos com magnitude definida) — colapsavel
- Relacoes segmento-level (label + target + add) — colapsavel
- Color override
- Delete segment

### Separacao de acoes no segmento

- **Click no segmento** (na lista do nivel 2) = drill-down para nivel 3 (page do segmento)
- **Icone `↗`** = reveal no documento (navega pro editor, abre arquivo)

O pesquisador pode revisar segmentos no Detail sem que o editor fique pulando de documento.

### Explorer (mantem)

Explorer continua existindo como view de navegacao. Arvore: Codigo → Arquivo → Segmento. Click no segmento navega pro documento.

### Context Menu (botao direito no codigo — nivel 1)

```
Rename
Add child code
────────────────
Move to...
Promote to top-level
Move to folder...
────────────────
Merge with...
────────────────
Change color
Edit description
Set magnitude...
────────────────
Delete...
```

### Drag-drop

Toggle no topo do Codebook panel: `[Reorganizar | Merge]`

- **Reorganizar (default):** drag = reparentar. Drop em codigo = tornar filho. Drop em pasta = mover pra pasta. Drop em raiz = promote.
- **Merge (toggle ativo):** drag em cima de outro codigo = merge (abre modal de confirmacao).

Feedback visual diferente por modo (indentacao vs highlight). Merge mode auto-desliga apos operacao.

### Merge Modal

Acessivel via context menu ("Merge with...") ou drag no merge mode.

```
┌─ Merge into "Raiva" ──────────────────┐
│                                        │
│ Add codes to merge:                    │
│ [Search codes...              ]        │
│                                        │
│ Will be merged:                        │
│   x Agressividade (5) — Comportamento  │
│   x Irritacao (3) — Reacoes            │
│                                        │
│ Destination:                           │
│   Name: [Raiva____________]            │
│   Parent: [Emocoes v]  o Top-level     │
│                                        │
│ 18 segments will be reassigned.        │
│                                        │
│              [Cancel]  [Merge]         │
└────────────────────────────────────────┘
```

O pesquisador escolhe nome destino, pai, e ve impacto. `mergedFrom` registra ids dos codigos fundidos.

---

## Coding Popover

Sem mudanca estrutural. Lista flat com busca fuzzy — hierarquia e pastas nao afetam.

```
[Search or create code...]
─────────────────────────
[*] Toggle  Codigo A        →
[*] Toggle  Codigo B        →
Browse all codes...
─────────────────────────
> Memo                          colapsavel
> Magnitude                     colapsavel, toggle nas settings
> Relations                     colapsavel, toggle nas settings
─────────────────────────
+ Add New Code
x Delete Segment
```

Magnitude: picker fechado com valores do codigo.
Relations: label livre + busca de target (qualquer codigo, pode criar novo).

---

## Analytics (consequencias)

| Fase | Desbloqueia |
|------|-------------|
| C (codes[]) | Referencia por id, rename atomico |
| A (hierarquia) | Treemap/Sunburst hierarquico, toggle "Agregar hierarquia" |
| B (pastas) | Nada — sem significado analitico |
| D (magnitude) | Distribuicao de magnitudes, export mixed methods |
| E (relacoes) | Network View (codigo + segmento) |

### Network View

- Nos = codigos (cor do registro)
- Arestas solidas = relacoes codigo-level (espessura por co-ocorrencia)
- Arestas tracejadas = relacoes segmento-level (espessura por quantidade de segmentos)
- Toggle no toolbar: "Code-level | Code + Segments"
- Hover/click na aresta mostra detalhes
- Quando a mesma relacao existe nos dois niveis, aresta unica fundida com indicador visual

### Contagem hierarquica

- **Explorer colapsado:** agregado
- **Explorer expandido:** direto em cada nivel
- **Detail:** sempre explicito ("X diretos · Y com filhos")
- **Analytics:** toggle "Agregar hierarquia" no config panel (default off)

### Export mixed methods (Fase D)

```
arquivo           | Frustracao_magnitude | Satisfacao_magnitude
P01 - Maria.md    | ALTA                 | BAIXA
P02 - Carlos.md   | MEDIA                | MEDIA
```

Tipo declarado informa nivel de mensuracao da coluna.

---

## Settings do plugin

Novos toggles:
- **Magnitude no popover** (on/off) — esconde secao, nao desliga feature
- **Relations no popover** (on/off) — esconde secao, nao desliga feature

---

## Referencias

- Saldana, J. (2021). *The Coding Manual for Qualitative Researchers* (4a ed.). SAGE.
- Friese, S. (2019). *Qualitative Data Analysis with ATLAS.ti*. SAGE.
- Mortelmans, D. (2025). *Doing Qualitative Data Analysis with NVivo*. Springer.
- Onwuegbuzie, A. J. & Teddlie, C. (2003). A framework for analyzing data in mixed methods research. *Handbook of Mixed Methods*. SAGE.

# Qualia Coding — Vision Document

**Tipo:** Documento de Visão  
**Status:** Exploratório / Em construção  
**Data:** 2026-03-21  
**Plugin:** obsidian-qualia-coding

---

## Sobre este documento

Este é um documento de visão — não um PRD, não um spec de implementação. Seu papel é capturar o produto inteiro como deveria ser quando maduro, sem restrições de escopo ou fases. As ideias aqui podem levar meses ou anos para se materializar. O PRD de cada feature específica deriva deste documento.

---

## O modelo atual

Antes de qualquer visão, o ponto de partida real. O plugin persiste tudo num único `data.json` com a seguinte estrutura:

```
data.json
├── registry
│   └── definitions         → dicionário de códigos (flat, por id)
└── [tipo de mídia]
    └── markers             → segmentos codificados, organizados por tipo
        markdown / csv / image / pdf / audio / video
```

### Código (hoje)

```json
"code_frustração": {
  "id": "code_frustração",
  "name": "Frustração com Ferramentas",
  "color": "#34f4ce",
  "paletteIndex": 1,
  "createdAt": 1772845000000,
  "updatedAt": 1774113712332
}
```

### Marker (hoje)

```json
{
  "id": "m01_frustração1",
  "fileId": "Entrevista P01 - Maria.md",
  "range": { "from": {...}, "to": {...} },
  "codes": ["Frustração com Ferramentas"],
  "text": "A parte mais frustrante é quando...",
  "memo": "opcional",
  "createdAt": 1772845300000,
  "updatedAt": 1772845300000
}
```

Observações sobre o modelo atual:
- `registry.definitions` é um dicionário flat — sem hierarquia, sem magnitude, sem relações
- Markers referenciam códigos pelo `name` — estado atual intencional
- Markers têm estrutura diferente por tipo de mídia: `range` para markdown, `coords` para imagem, timestamps `from/to` para vídeo/áudio, `page + beginIndex` para PDF
- `memo` existe como campo opcional no marker
- `codes[]` é array de strings — suporta múltiplos códigos no mesmo segmento

---

## 01. Princípios

**O software não tem jurisdição sobre a estrutura analítica do pesquisador.**
Sem caps de profundidade, sem validações paternalistas. O pesquisador que está no nível 6 da hierarquia sabe exatamente o que está fazendo.

**Hierarquia é o pensamento analítico materializado.**
Não é cosmética. A estrutura do codebook reflete o estado atual da teoria emergente. Reorganizar a hierarquia *é* fazer análise.

**Magnitude e hierarquia são planos ortogonais.**
Hierarquia vive no código — estrutura do codebook. Magnitude vive no marker — o momento em que código encontra segmento. Os dois evoluem independentemente.

**O marker é um objeto de primeira classe.**
O momento em que um código é aplicado a um segmento não é um link simples. É uma entidade com propriedades próprias — magnitude, memo, anotador, contexto. Isso é o que permite mixed methods.

**Codebook como artefato vivo.**
Nasce simples durante a codificação aberta, cresce e se consolida durante a axial e seletiva. O sistema suporta esse ciclo de vida sem fricção.

**Visualizações são projeções, não editores.**
Network View, treemap, sunburst — são renderizações do `registry`. A fonte de verdade é sempre o `data.json`. Isso elimina duplicação e garante consistência.

---

## 02. Evolução do Schema

### Código (visão)

```json
"code_frustração": {
  "id": "code_frustração",
  "name": "Frustração com Ferramentas",
  "color": "#34f4ce",
  "paletteIndex": 1,
  "createdAt": 1772845000000,
  "updatedAt": 1774113712332,

  "parent": null,          // id do código pai — null = top-level
  "folder": null,          // pasta virtual — null = raiz
  "aggregate": false,      // inclui markers dos filhos em queries?
  "description": "",       // definição operacional do código
  "mergedFrom": [],        // audit trail de merges
  "childrenOrder": [],     // ordem manual dos filhos

  "magnitude": {
    "type": null,          // "nominal" | "ordinal" | "continuous" | null
    "values": []           // valores sugeridos — vazio = campo livre
  },

  "relations": []          // relações semânticas com outros códigos
}
```

### Marker (visão)

```json
{
  "id": "m01_frustração1",
  "fileId": "Entrevista P01 - Maria.md",
  "range": { "from": {...}, "to": {...} },
  "codes": [
    {
      "codeId": "code_frustração",
      "magnitude": "ALTA"  // opcional
    }
  ],
  "text": "A parte mais frustrante é quando...",
  "memo": "",
  "createdAt": 1772845300000,
  "updatedAt": 1772845300000
}
```

A mudança em `codes[]` — de array de strings para array de objetos — é a evolução estrutural central que desbloqueia magnitude e referência estável por id.

---

## 03. Hierarquia de Códigos

### Princípio

A hierarquia é a taxonomia do codebook. O pesquisador organiza códigos em estruturas de abstração crescente — do código próximo ao dado até o tema central.

### Profundidade

Ilimitada. O campo `parent` aponta para o `id` de qualquer outro código. O sistema valida apenas que o movimento não cria um ciclo. Nenhuma outra restrição.

### Exemplo de estrutura no registry

```json
"code_barreiras":  { "parent": null,            ... },
"code_custo":      { "parent": "code_barreiras", ... },
"code_custo_user": { "parent": "code_custo",     ... },
"code_custo_time": { "parent": "code_custo",     ... },
"code_lockin":     { "parent": "code_barreiras", ... }
```

Renderizado no Explorer:
```
Barreiras de Adoção
  Custo de Ferramentas
    Custo por usuário
    Custo total do time
  Lock-in / Vendor Lock
```

### Operações

**Criar** — código novo, top-level ou filho. Pode existir sem nenhum marker — códigos organizacionais são válidos.

**Renomear** — atualiza `name` no registry. Com a migração de `codes[]` para objetos com `codeId`, rename não afeta os markers.

**Mover (reparent)** — atualiza `parent` no código movido. Validação anti-ciclo. Nenhuma outra restrição.

**Merge** — N códigos fundidos em 1. Todos os markers dos códigos-fonte são reatribuídos ao destino. Os códigos-fonte são removidos do registry. `mergedFrom` do destino registra os ids fundidos — audit trail para rastreabilidade metodológica.

**Split** — 1 código vira pai de N filhos novos. Markers existentes precisam ser redistribuídos pelo pesquisador.

**Promote** — mover para top-level: `parent: null`.

**Aggregate** — quando `true`, queries nesse código incluem markers de todos os descendentes recursivamente.

### Contagem

- **Direta:** markers onde este código está aplicado diretamente
- **Agregada:** markers deste código + todos os descendentes

Quando colapsado no Explorer: exibe agregada. Quando expandido: exibe direta. No Detail: exibe os dois.

### Abordagens metodológicas

O sistema não distingue — não há diferença técnica entre um código criado antes ou durante a codificação.

**Bottom-up (indutivo / GT):** codebook nasce vazio, hierarquia emerge por merge e reparenting progressivo.

**Top-down (dedutivo):** codebook criado antes da codificação a partir de framework teórico.

**Misto:** o mais comum na prática.

---

## 04. Pastas Virtuais

### Princípio

Pastas são containers organizacionais sem significado analítico. Não afetam hierarquia, aggregate, queries ou nenhuma operação de análise. São gavetas.

Um código pode estar numa pasta E ter um pai na hierarquia — dois eixos completamente independentes:

```
Pasta "Framework Teórico"
  Motivação              (parent: null)          ← top-level, mas numa pasta
  Barreira               (parent: "code_exp")    ← tem pai, E está numa pasta
```

### Implementação

Campo `folder` no código — referência ao id da pasta. `null` para raiz. Exclusivo: um código está em uma pasta ou na raiz.

Pastas vivem num dicionário próprio no registry:

```json
"registry": {
  "definitions": { ... },
  "folders": {
    "folder_abc123": {
      "id": "folder_abc123",
      "name": "Framework Teórico",
      "createdAt": ...
    }
  }
}
```

### Interface

Segue exatamente o paradigma do File Explorer do Obsidian — metáfora já conhecida, zero custo de aprendizado. O Explorer do Qualia renderiza pastas e códigos com a mesma lógica visual.

Distinção visual clara entre pasta (ícone 📁) e código-pai (chevron de expand) — porque mover para uma pasta não é reparentar na hierarquia.

---

## 05. Magnitude

> Saldaña, *The Coding Manual for Qualitative Researchers*, Cap. 14.

### Princípio

Magnitude é uma propriedade do **marker** — não do código, não da hierarquia. É o momento em que o pesquisador decide que aquele segmento tem uma intensidade, direção ou avaliação que vale registrar.

```
Código:   Frustração  ──── (hierarquia, relações)
               │
Markers:  segmento A  →  { codeId: "code_frustração", magnitude: "ALTA" }
          segmento B  →  { codeId: "code_frustração", magnitude: "BAIXA" }
          segmento C  →  { codeId: "code_frustração" }   ← sem magnitude, válido
```

### Tipo de variável como decisão central

O pesquisador declara o **tipo da variável**. O sistema deduz o que é analiticamente válido.

| Tipo | Exemplo | Operações válidas |
|------|---------|------------------|
| `nominal` | `POSITIVO / NEUTRO / NEGATIVO` | Frequência, moda, distribuição |
| `ordinal` | `BAIXA / MÉDIA / ALTA` | Frequência, mediana, ordenação |
| `continuous` | `0.0 – 1.0` | Média, desvio padrão, tudo acima |
| `null` | — | Sem magnitude neste código |

Essa declaração é uma decisão metodológica que o pesquisador já tomou antes de abrir o Qualia. O sistema apenas a registra e respeita.

### Valores: livres ou sugeridos

`values: []` vazio → campo de texto livre na aplicação do código.  
`values: ["BAIXA", "MÉDIA", "ALTA"]` → UI oferece picker. Ainda aceita texto livre — a lista é sugestão, não validação.

### Abordagens metodológicas

**Top-down:** pesquisador define tipo e values antes de codificar.  
**Bottom-up:** pesquisador não define nada. Aplica magnitude livremente no marker. Formaliza a escala depois, quando os padrões emergiram.

### Conexão com mixed methods

Ao declarar o tipo de variável, o pesquisador cria uma variável pronta para análise estatística. O dado qualitativo nasce com a estrutura do quantitativo. Não é uma feature adicional — é uma consequência direta do modelo de dados.

---

## 06. Relações entre Códigos

### Princípio

Além da hierarquia estrutural (pai/filho), códigos podem ter relações semânticas — causalidade, contradição, precedência, correlação. Um código tem um único pai, mas pode ter múltiplas relações com múltiplos outros códigos.

### Relações são declarativas, não visuais

O pesquisador declara relações no registry. A Network View é gerada automaticamente — não é um editor, é uma projeção. Fonte de verdade sempre no `data.json`.

### Schema

```json
"relations": [
  { "type": "is cause of",    "target": "code_abandono" },
  { "type": "correlates with","target": "code_custo"    }
]
```

### Tipos de relação

| Categoria | Tipos |
|-----------|-------|
| Causal | is cause of, resulted in, influences |
| Estrutural | is part of, is a, is property of |
| Associativa | correlates with, is associated with, contradicts |
| Facilitativa | facilitates, hinders, is strategy for |
| Temporal | precedes, follows, occurs during |
| Custom | o pesquisador define |

### Declarativas vs. emergentes

**Declarativas** — o pesquisador define. Refletem teoria.

**Emergentes** — o sistema detecta co-ocorrência estatística entre códigos nos markers. São sugestões. Co-ocorrência é dado empírico. Relação causal é interpretação. O sistema não confunde os dois.

---

## 07. Interface

### Arquitetura de três painéis

```
┌─────────────┬──────────────────────┬──────────────┐
│   EXPLORER  │       EDITOR         │    DETAIL    │
│  (esquerda) │      (centro)        │   (direita)  │
│             │                      │              │
│ Hierarquia  │  Documento ativo     │  Detalhe do  │
│ + pastas    │  + codificação       │  código      │
│             │                      │  selecionado │
└─────────────┴──────────────────────┴──────────────┘
```

Três painéis simultâneos. Sidebar redimensionável — o pesquisador controla o espaço.

### Code Explorer (painel esquerdo)

Responsabilidade única: estrutura de códigos, navegação e reorganização.

- Pastas no topo, seguidas de códigos top-level sem pasta
- Mostra **somente códigos** — nunca markers
- Expand/collapse por nó, Collapse All / Expand All global
- Drag pelo handle ⋮⋮ → reparent (sobre código), reorder (entre códigos), mover para pasta (sobre pasta)
- Click no label → abre Detail
- Right-click → context menu
- Filter/search no topo
- Contagem de markers ao lado (direta quando expandido, agregada quando colapsado)
- Indentação adaptativa nos níveis mais profundos

### Code Detail (painel direito)

Detalhe completo de um código. Seções colapsáveis, view única sem abas.

- **Name** — editável in-place
- **Description** — definição operacional
- **Color** — picker com propagação opcional para filhos
- **Hierarchy context** — pai → código atual → filhos diretos
- **Magnitude** — tipo de variável e values sugeridos
- **Relations** — relações declaradas
- **Markers** — lista de markers com este código, toggle List / By File
- **Memo** — anotações analíticas
- **Audit trail** — timestamps, `mergedFrom`

Click num marker → editor scrolla e destaca. Hover → highlight bidirecional.

### Editor (painel central)

Documento Obsidian com camada de codificação sobreposta.

- Coding stripes na margem indicam markers
- Click num stripe → abre Detail do código
- Seleção de texto → menu de codificação
- Magnitude editável inline após aplicação

### Context menu

```
Rename
Add child code
New folder
─────────────────────
Move to…
Promote to top-level
Move to folder…
─────────────────────
Merge with…
Split into subcodes
─────────────────────
Toggle aggregate
Change color
Edit description
Set magnitude…
─────────────────────
View all markers
─────────────────────
Delete…
```

---

## 08. Analytics

Consequência natural do modelo de dados — não feature isolada.

### Queries

- Todos os markers de um código (com ou sem aggregate)
- Markers de um código com magnitude específica
- Markers onde dois códigos co-ocorrem
- Distribuição de magnitudes por código por arquivo/participante

### Export para mixed methods

```
arquivo           | Frustração_magnitude | Satisfação_magnitude
P01 - Maria.md    | ALTA                 | BAIXA
P02 - Carlos.md   | MÉDIA                | MÉDIA
```

O tipo declarado informa o nível de mensuração da coluna. Export direto para R, Python, SPSS.

### Visualizações

- **Treemap / Sunburst** — volume relativo por código e filhos
- **Code × File matrix** — frequência de cada código em cada arquivo
- **Co-occurrence matrix** — frequência de co-ocorrência entre pares
- **Network View** — grafo de relações declaradas + co-ocorrências emergentes
- **Magnitude distribution** — histograma por código, participante, tema

---

## 09. Questões em Aberto

**Migração de `codes[]` de strings para objetos**
Mudança de `"codes": ["Frustração"]` para `"codes": [{"codeId": "...", "magnitude": null}]`. É o passo que desbloqueia magnitude e referência por id. Precisa de função de migração do schema.

**Pasta: string simples ou id no registry?**
`folder: "framework-teorico"` como string direta vs `folder: "folder_abc123"` com dicionário de pastas no registry. String simples é mais legível mas complica rename de pasta. Id no registry é mais robusto.

**Magnitude: picker automático ou opt-in?**
Quando `values` está definido, abre picker automaticamente ao aplicar o código? Ou o pesquisador acessa magnitude explicitamente após a aplicação? Picker automático é mais consistente mas mais interruptivo no fluxo rápido.

**Aggregate: opt-in ou opt-out?**
Default `false` proposto. Pesquisadores top-down provavelmente querem `true` nos níveis altos. Vale default diferente por nível?

**Relações: direcionadas por default?**
"is cause of" é direcional. "correlates with" é simétrica. O sistema exige que o pesquisador especifique a direção ou tem defaults por tipo de relação?

**Co-ocorrência: quando e como sugerir?**
Se dois códigos co-ocorrem em X% dos markers, sugerir relação? Com que threshold? Pode ser útil ou perturbador dependendo do momento da análise.

---

## Referências

- Saldaña, J. (2021). *The Coding Manual for Qualitative Researchers* (4ª ed.). SAGE.
- Friese, S. (2019). *Qualitative Data Analysis with ATLAS.ti*. SAGE.
- Mortelmans, D. (2025). *Doing Qualitative Data Analysis with NVivo*. Springer.
- Onwuegbuzie, A. J. & Teddlie, C. (2003). A framework for analyzing data in mixed methods research. *Handbook of Mixed Methods*. SAGE.
- NVivo Manual — QSR/Lumivero
- MAXQDA Online Manual 2022/2024
- ATLAS.ti 9/22/23 Windows Manual

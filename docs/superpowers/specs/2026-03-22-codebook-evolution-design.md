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
  // ausente = sem magnitude neste codigo. Presente = magnitude configurada.
  magnitude?: {
    type: 'nominal' | 'ordinal' | 'continuous';
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
    target: string;       // id do codigo alvo — qualquer codigo do registry, NAO precisa estar aplicado ao mesmo segmento
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
- `SidebarModelInterface` e `AdapterModel`: atualizar assinaturas (deleteCode, renameCode passam a usar id). `renameCode` nos models torna-se desnecessario — rename e atomico no registry.
- rename/delete no baseSidebarAdapter: 1 arquivo
- Leituras nas views: `.codes[0]` → `.codes[0].codeId`
- Filtros no analytics: `.includes(name)` → `.some(c => c.codeId === id)`

Resultado: referencia por id, rename atomico, base pronta para tudo que vem depois.

### Fase A — Hierarquia

Campos: `parentId`, `childrenOrder`, `mergedFrom`

Registry ganha metodos:
- `getRootCodes()`, `getChildren(parentId)`, `getAncestors(id)`, `getDescendants(id)`
- `getDepth(id)`, `getHierarchicalList()`
- `setParent(id, parentId)` com validacao anti-ciclo + atualiza `childrenOrder` do novo pai (append) e do antigo pai (remove)

Code Form Modal: dropdown "Parent code" (exclui self + descendentes).
Explorer: arvore hierarquica com collapse/expand.
Detail: breadcrumbs clicaveis.
Merge e drag-drop (ver secao Interacao).

Delete de codigo-pai: filhos viram root (`parentId = undefined`).

### Fase B — Pastas Virtuais

Campo: `folder` no CodeDefinition. `folders` no registry.

Pastas sao containers organizacionais sem significado analitico. Nao afetam hierarquia, aggregate, queries ou analytics. Um codigo pertence a uma pasta (nao multiplas).

Metafora do File Explorer do Obsidian. Distincao visual: pasta (icone) vs codigo-pai (chevron).

Pasta tem context menu proprio: Rename, Delete. Ao deletar pasta, codigos perdem campo `folder` e voltam pra raiz (unfolder).

### Fase D — Magnitude

Campo no CodeDefinition: `magnitude: { type, values }`
Campo no CodeApplication: `magnitude?: string`

Tipos de variavel: nominal, ordinal, continuous. Campo `magnitude` ausente = sem magnitude neste codigo.
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
[*] Toggle  Codigo A        →      ← seta expande inline: magnitude picker + relacoes deste codigo neste marker
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
- Quando a mesma relacao existe nos dois niveis (mesmo `label` + `target` + `directed`), aresta unica fundida com indicador visual

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

## REFI-QDA (QDPX) — Alinhamento e Mapeamento

### Sobre o padrao

O **REFI-QDA** (Rotterdam Exchange Format Initiative) e o formato padrao de interoperabilidade entre ferramentas QDA. Criado em 2016 na KWALON Conference (Erasmus University Rotterdam), com representantes de ATLAS.ti, MAXQDA, NVivo, Dedoose, f4analyse, QDA Miner, Quirkos e Transana. Licenca MIT.

Define dois formatos:
- **QDC** (Codebook exchange) — so codigos e hierarquia
- **QDPX** (Project exchange) — projeto completo com sources, codings, notes, links

### Estrutura do arquivo QDPX

Um `.qdpx` e um **ZIP** contendo:

```
project.qdpx/
    project.qde          ← XML principal (schema: urn:QDA-XML:project:1.0)
    sources/
        {guid}.pdf       ← arquivos fonte com GUID como nome
        {guid}.txt
        {guid}.png
        {guid}.mp4
```

Namespaces XML:
- Codebook: `urn:QDA-XML:codebook:1.0`
- Project: `urn:QDA-XML:project:1.0`

### Estrutura do XML (project.qde)

```xml
<Project name="..." origin="Qualia Coding 1.0"
    creationDateTime="2026-03-22T10:00:00Z"
    xmlns="urn:QDA-XML:project:1.0">
  <Users>...</Users>
  <CodeBook>...</CodeBook>
  <Variables>...</Variables>
  <Cases>...</Cases>
  <Sources>...</Sources>
  <Notes>...</Notes>
  <Links>...</Links>
  <Sets>...</Sets>
  <Graphs>...</Graphs>
  <Description>...</Description>
</Project>
```

Todos os filhos sao opcionais (`minOccurs="0"`).

### Codebook — hierarquia por nesting

```xml
<CodeBook>
  <Codes>
    <Code guid="..." name="Emocoes" isCodable="true" color="#ff6600">
      <Description>Codigos sobre emocoes</Description>
      <Code guid="..." name="Alegria" isCodable="true" color="#33cc33">
        <Description>Momentos de alegria</Description>
      </Code>
      <Code guid="..." name="Frustracao" isCodable="true" color="#ff0000"/>
    </Code>
  </Codes>
</CodeBook>
```

Atributos do Code:
| Atributo | Tipo | Obrigatorio | Notas |
|----------|------|-------------|-------|
| `guid` | GUID | Sim | UUID |
| `name` | string | Sim | Nome do codigo |
| `isCodable` | boolean | Sim | `false` = pasta/grupo, `true` = pode ser aplicado |
| `color` | RGB | Nao | `#RRGGBB` |

Hierarquia = `<Code>` dentro de `<Code>`. Pastas = `isCodable="false"`.

### Coded Segments — Selection + Coding

Coding e **dois niveis**: primeiro define o **Selection** (regiao no source), depois anexa **Coding** com `<CodeRef>`:

**Texto (markdown):**
```xml
<TextSource guid="..." name="Entrevista P01.txt"
    plainTextPath="internal://{guid}.txt">
  <PlainTextSelection guid="..." name="trecho selecionado"
      startPosition="139" endPosition="195"
      creatingUser="..." creationDateTime="...">
    <Coding guid="..." creatingUser="..." creationDateTime="...">
      <CodeRef targetGUID="{code-guid}"/>
    </Coding>
    <Coding guid="...">
      <CodeRef targetGUID="{another-code-guid}"/>
    </Coding>
  </PlainTextSelection>
</TextSource>
```

`startPosition`/`endPosition` = offsets Unicode codepoints, 0-based.
Multiplos `<Coding>` no mesmo Selection = multiplos codigos no segmento.

**PDF:**
```xml
<PDFSource guid="..." name="Paper.pdf"
    path="internal://{guid}.pdf">
  <PDFSelection guid="..." page="0"
      firstX="335" firstY="367"
      secondX="485" secondY="420">
    <Coding guid="...">
      <CodeRef targetGUID="{code-guid}"/>
    </Coding>
  </PDFSelection>
</PDFSource>
```

Coordenadas: `page` (0-based), `firstX/firstY` e `secondX/secondY` em **PDF points** a partir do **bottom-left** do media box.

**Imagem:**
```xml
<PictureSource guid="..." name="foto.jpg"
    path="internal://{guid}.jpg">
  <PictureSelection guid="..."
      firstX="267" firstY="1"
      secondX="992" secondY="720">
    <Coding guid="...">
      <CodeRef targetGUID="{code-guid}"/>
    </Coding>
  </PictureSelection>
</PictureSource>
```

Coordenadas: `firstX/firstY` = upper-left, `secondX/secondY` = lower-right, em **pixels**.

**Audio:**
```xml
<AudioSource guid="..." name="entrevista.m4a"
    path="internal://{guid}.m4a">
  <AudioSelection guid="..." begin="16176" end="45358">
    <Coding guid="...">
      <CodeRef targetGUID="{code-guid}"/>
    </Coding>
  </AudioSelection>
</AudioSource>
```

**Video:**
```xml
<VideoSource guid="..." name="sessao.mp4"
    path="internal://{guid}.mp4">
  <Transcript plainTextPath="internal://{guid}.txt">
    <SyncPoint guid="..." timeStamp="0" position="0"/>
    <SyncPoint guid="..." timeStamp="2260" position="20"/>
  </Transcript>
  <VideoSelection guid="..." begin="16176" end="45358">
    <Coding guid="...">
      <CodeRef targetGUID="{code-guid}"/>
    </Coding>
  </VideoSelection>
</VideoSource>
```

Audio/video: `begin`/`end` em **milissegundos** (inteiros).

### Links (relacoes)

```xml
<Links>
  <Link guid="..." name="causa"
      direction="OneWay"
      color="#000000"
      originGUID="{source-guid}"
      targetGUID="{target-guid}"/>
</Links>
```

`direction`: `Associative` | `OneWay` | `Bidirectional`.
Links conectam **quaisquer dois objetos** por GUID (codigos, sources, selections, notes).

### Variables e Cases (metadata)

```xml
<Variables>
  <Variable guid="..." name="Idade" typeOfVariable="Integer"/>
  <Variable guid="..." name="Genero" typeOfVariable="Text"/>
</Variables>

<Cases>
  <Case guid="..." name="Participante 01">
    <VariableValue>
      <VariableRef targetGUID="{var-guid}"/>
      <IntegerValue>25</IntegerValue>
    </VariableValue>
    <SourceRef targetGUID="{source-guid}"/>
  </Case>
</Cases>
```

Tipos de variavel: `Text`, `Boolean`, `Integer`, `Float`, `Date`, `DateTime`.

### Notes/Memos

```xml
<Notes>
  <Note guid="..." name="Observacao" creatingUser="..." creationDateTime="...">
    <PlainTextContent>Texto do memo aqui</PlainTextContent>
  </Note>
</Notes>
```

Memos sao entidades separadas, referenciadas via `<NoteRef targetGUID="..."/>` em qualquer elemento (Project, Code, Source, Selection, Coding).

### Sets (grupos)

```xml
<Sets>
  <Set guid="..." name="Framework Teorico">
    <MemberCode targetGUID="{code-guid}"/>
    <MemberCode targetGUID="{code-guid}"/>
  </Set>
</Sets>
```

Sets podem conter mix de `<MemberCode>`, `<MemberSource>`, `<MemberNote>`.

### Mapeamento Qualia Coding → REFI-QDA

| Qualia Coding | REFI-QDA | Conversao |
|---------------|----------|-----------|
| `CodeDefinition.id` | `Code@guid` | Direto (UUID) |
| `CodeDefinition.name` | `Code@name` | Direto |
| `CodeDefinition.color` | `Code@color` | Direto (#RRGGBB) |
| `CodeDefinition.description` | `Code > Description` | Direto |
| `CodeDefinition.parentId` (hierarquia) | `Code` nesting | Direto — filho dentro do pai |
| `CodeDefinition.folder` (pasta virtual) | `Code@isCodable="false"` ou `Set` | Pasta = Code com `isCodable=false`, ou Set |
| `CodeDefinition.relations` | `Link` | `label` → `Link@name`, `directed` → `Link@direction`, `target` → `Link@targetGUID` |
| `CodeApplication.codeId` | `Coding > CodeRef@targetGUID` | Direto |
| `CodeApplication.magnitude` | `VariableValue` em Case/Source | Sem equivalente direto. Exportar como Variable attached to Selection |
| `CodeApplication.relations` (segmento-level) | `Link` entre Selection e Code | `originGUID` = Selection guid, `targetGUID` = Code guid |
| Markdown marker (line/ch range) | `PlainTextSelection` (startPosition/endPosition) | Converter line:ch → offset Unicode codepoint |
| PDF marker (page, rect) | `PDFSelection` (page, firstX/Y, secondX/Y) | Converter coords — REFI mede do bottom-left em PDF points |
| Image marker (NormalizedCoords) | `PictureSelection` (firstX/Y, secondX/Y) | Desnormalizar: multiplicar por largura/altura em pixels |
| Audio/Video marker (startTime/endTime) | `AudioSelection`/`VideoSelection` (begin/end) | Converter pra milissegundos inteiros |
| CSV markers | **Sem equivalente** | Custom: exportar como texto extraido, ou ignorar no QDPX |
| `BaseMarker.memo` | `Note` + `NoteRef` no Selection | Criar Note, referenciar via NoteRef no Selection |
| `BaseMarker.colorOverride` | Nao suportado | Perda aceitavel (cor vem do Code) |

### Conversoes que precisam de atencao

1. **Markdown line:ch → offset codepoint**: precisa ler o conteudo do arquivo pra calcular offset absoluto
2. **PDF coords**: Qualia usa sistema proprio (top-left?), REFI usa bottom-left em PDF points. Precisa da altura da pagina pra converter Y.
3. **Image coords**: Qualia normaliza 0-1, REFI usa pixels. Precisa das dimensoes da imagem.
4. **CSV**: nao tem equivalente no REFI. Opcoes: (a) ignorar, (b) exportar conteudo da celula como texto + Note
5. **Magnitude**: pode ir como `Variable` no REFI, mas perde a associacao segmento-codigo. Melhor documentar como limitacao.

### Ferramentas que suportam REFI-QDA

| Ferramenta | Import | Export |
|------------|--------|--------|
| ATLAS.ti | Sim | Sim |
| MAXQDA | Sim | Sim |
| NVivo | Sim | Sim |
| Dedoose | Sim | Sim |
| f4analyse | Sim | Sim |
| QDA Miner | Sim | Sim |
| Quirkos | Sim | Sim |
| Transana | Sim | Sim |

### Recursos

| Recurso | URL |
|---------|-----|
| Site oficial | https://www.qdasoftware.org/ |
| Spec PDF v1.5 | https://openqda.github.io/refi-tools/docs/standard/REFI-QDA-1-5.pdf |
| GitHub (schemas + tools) | https://github.com/openqda/refi-tools |
| Codebook.xsd | https://github.com/openqda/refi-tools/blob/main/docs/schemas/codebook/v1.0/Codebook.xsd |
| Project.xsd | https://github.com/openqda/refi-tools/blob/main/docs/schemas/project/v1.0/Project.xsd |
| ponte (TypeScript, cria QDPX) | https://github.com/enricllagostera/ponte |
| pyqdpx (Python, processa QDPX) | https://github.com/DEpt-metagenom/pyqdpx |

### Paralelismo com as fases

O export/import REFI-QDA pode ser desenvolvido em paralelo com as fases A-E. Cada fase adiciona mais campos ao mapeamento:

| Apos fase | O que o QDPX export ganha |
|-----------|--------------------------|
| C (codes[]) | Export basico: codigos flat + segmentos de todos os engines |
| A (hierarquia) | Codebook com nesting hierarquico |
| B (pastas) | Pastas como `isCodable="false"` ou Sets |
| D (magnitude) | Variables associadas a selections |
| E (relacoes) | Links entre codigos e entre selections/codigos |

---

## Referencias

- Saldana, J. (2021). *The Coding Manual for Qualitative Researchers* (4a ed.). SAGE.
- Friese, S. (2019). *Qualitative Data Analysis with ATLAS.ti*. SAGE.
- Mortelmans, D. (2025). *Doing Qualitative Data Analysis with NVivo*. Springer.
- Onwuegbuzie, A. J. & Teddlie, C. (2003). A framework for analyzing data in mixed methods research. *Handbook of Mixed Methods*. SAGE.
- REFI-QDA Standard v1.5. https://www.qdasoftware.org/
- OpenQDA refi-tools. https://github.com/openqda/refi-tools

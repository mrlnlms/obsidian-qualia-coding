# REFI-QDA Import (QDC + QDPX) — Design Spec

**Data:** 2026-03-22
**Status:** Aprovado
**Dependencia:** Fase C concluida (markers usam CodeApplication[] com codeId)

---

## Escopo v1

### Inclui
- Import QDC (codebook only) — codigos com hierarquia, cores, descricoes
- Import QDPX (projeto completo) — codigos + sources + coded segments + memos
- 5 source types: TextSource → markdown, PDFSource, PictureSource, AudioSource, VideoSource
- Source files extraidos do ZIP pro vault (pasta `imports/{project-name}/`)
- Conversao de coordenadas inversa ao export (offsets → line:ch, pixels → normalized, ms → seconds)
- Conflito de codigos: modal com opcao merge por nome ou criar separados (sufixo "imported")
- Memos: Note → marker.memo (segmento), description (codigo), ou arquivo .md (memos livres/documento/projeto)
- Entry points: command palette + botao no analytics view

### Nao inclui (backlog)
- **CSV/tabular reconstruction** — QDPX nao preserva estrutura tabular. Survey data chega como TextSource. Backlog: detectar pattern de survey (1 doc por respondente) e oferecer conversao pra CSV.
- **Variables/Cases** — metadata demografica do QDPX. Backlog: importar como frontmatter ou CSV de metadata.
- **Sets** — grupos do QDPX. Backlog: importar como pastas virtuais (Fase B).
- **Graphs** — visualizacoes do QDPX. Ignorar.

---

## Arquitetura

### Modulo: `src/import/` (novo)

```
src/import/
  qdcImporter.ts      — parse XML do codebook, popular registry
  qdpxImporter.ts     — orquestra import completo (ZIP → vault)
  xmlParser.ts        — helpers pra parse XML (extract elements, attributes)
  coordConverters.ts  — conversao inversa de coords por engine
  importModal.ts      — modal de import (conflitos, opcoes)
  importCommands.ts   — registra commands na palette
```

### Fluxo de dados

```
Command/Botao
    ↓
File picker (usuario seleciona .qdpx ou .qdc)
    ↓
Parse XML (codebook + sources + selections + notes)
    ↓
Deteccao de conflitos (codigos com nomes duplicados)
    ↓
importModal (resolver conflitos + opcoes)
    ↓
Execucao:
  1. Importar codigos pro registry (com hierarquia se presente)
  2. Extrair source files pro vault (imports/{project-name}/)
  3. Converter TextSource → .md (com frontmatter)
  4. Criar markers em cada engine com coords convertidas
  5. Importar memos (marker.memo, description, ou .md avulso)
    ↓
Notice("Import concluido: X codigos, Y sources, Z segments")
```

---

## Modal de Import

### Passo 1: File picker

File picker nativo do Obsidian (ou input type=file) pra selecionar `.qdpx` ou `.qdc`.

### Passo 2: Preview + opcoes

```
┌─ Import REFI-QDA ───────────────────────┐
│                                          │
│ File: projeto-atlas.qdpx                 │
│ Origin: ATLAS.ti 23.0                    │
│                                          │
│ Found:                                   │
│   12 codes (3 with hierarchy)            │
│   45 coded segments                      │
│   8 source files                         │
│   5 memos                                │
│                                          │
│ ─────────────────────────────────────── │
│ (so aparece se ha conflitos)             │
│                                          │
│ ⚠ 3 codes already exist:               │
│   Frustracao, Alegria, Custo             │
│                                          │
│   ○ Merge (use existing codes)           │
│   ○ Create separate (suffix "imported")  │
│                                          │
│ ─────────────────────────────────────── │
│                                          │
│ ☑ Keep original source files             │
│   (.docx, .txt alongside .md)            │
│                                          │
│              [Cancel]  [Import]          │
└──────────────────────────────────────────┘
```

- Preview mostra contagem de codigos, segments, sources, memos
- Conflitos so aparecem se existirem
- Toggle de source files originais (default off)

---

## Conversao de Sources

### TextSource → Markdown

Cada `TextSource` do QDPX gera um `.md` no vault:

```markdown
---
imported_from: "QDPX"
original_name: "Interview P01.docx"
original_guid: "57C6099B-..."
origin_software: "ATLAS.ti 23.0"
import_date: "2026-03-22"
---

Conteudo plain text da entrevista aqui...
```

Conversao de posicoes: `startPosition`/`endPosition` (offset Unicode codepoint) → `{ line, ch }` percorrendo o texto.

Se toggle "Keep original source files" ativo, copia tambem o `.docx` e `.txt` originais pra mesma pasta.

### PDFSource → PDF

Copia PDF pro vault. Cria markers:

**PlainTextSelection no PDF:**
- Requer `<Representation plainTextPath="...">` no PDFSource — o texto extraido do PDF
- Ler o plain text, usar `startPosition`/`endPosition` pra localizar o trecho
- Pra mapear pra `PdfMarker` (`beginIndex`/`beginOffset`/`endIndex`/`endOffset`), precisa reconstruir o mapeamento span-by-span do PDF text layer. Isso requer parsear o PDF pra obter a estrutura de text items e seus offsets
- Se o mapeamento span nao for viavel, alternativa: criar marker com `text` extraido do plain text e offsets aproximados
- Se `<Representation>` ausente: skip text selections com warning

**PDFSelection (rects) — sempre shape tipo `rect`:**
- REFI so exporta retangulos. Import sempre cria `PdfShapeMarker` com `shape: 'rect'`
- Converter PDF points (bottom-left origin) → `RectCoords {type: 'rect', x, y, w, h}` normalizado:
  ```
  x = firstX / pageWidth
  y = 1 - (secondY / pageHeight)    // inverter Y (bottom-left → top-left)
  w = (secondX - firstX) / pageWidth
  h = (secondY - firstY) / pageHeight
  ```
- Page height/width obtidos via PDF metadata

### PictureSource → Image

Copia imagem pro vault. Cria `ImageMarker`:
- REFI so exporta retangulos. Import sempre cria `shape: 'rect'`
- Converter pixels → `NormalizedRect {type: 'rect', x, y, w, h}`:
  ```
  x = firstX / imageWidth
  y = firstY / imageHeight
  w = (secondX - firstX) / imageWidth
  h = (secondY - firstY) / imageHeight
  ```
- Dimensoes da imagem obtidas ao ler o arquivo. Se ilegivel: skip markers com warning

### AudioSource / VideoSource → Audio / Video

Copia arquivo pro vault. Cria `MediaMarker`:
- `begin`/`end` (ms inteiro) → `from`/`to` (seconds float): `value / 1000`

---

## Conversao de Coordenadas (inversa do export)

| Engine | REFI → Qualia | Calculo |
|--------|---------------|---------|
| Markdown | offset codepoint → line:ch | Percorrer texto contando linhas e chars |
| PDF text | offset no plain text → beginIndex/endIndex/offsets | Mapear via texto extraido do PDF |
| PDF shapes | PDF points (bottom-left) → normalized (0-1) | Y invertido, dividir por page dimensions |
| Image | pixels → normalized (0-1) | Dividir por dimensoes da imagem |
| Audio/Video | ms (int) → seconds (float) | `value / 1000` |

### Edge cases
- PDF sem Representation (plain text): skip text selections, warning no log
- Imagem corrompida/ilegivel: skip markers, warning
- Offsets fora do range do texto: skip selection, warning
- Source file ausente no ZIP (path `relative://`): tentar resolver como caminho relativo ao vault. Se nao encontrado, skip source com warning
- ZIP corrompido ou sem `project.qde`: erro imediato com Notice explicativo

### Regras gerais de criacao de markers

- **Timestamps:** usar `creationDateTime` do REFI (Selection e Coding) pra `createdAt`/`updatedAt` do marker. Se ausente, usar timestamp atual.
- **Color:** markers markdown precisam de `color: string`. Usar cor do primeiro codigo aplicado (via registry). Se nenhum codigo, usar cor default da paleta.
- **Um Selection = um marker:** cada `<PlainTextSelection>`, `<PDFSelection>`, `<PictureSelection>`, `<AudioSelection>` ou `<VideoSelection>` gera um marker. Multiplos `<Coding>` filhos = multiplos `CodeApplication` no mesmo marker.
- **Import sempre cria `shape: 'rect'`** para PDF shapes e Image — REFI so suporta retangulos.

---

## Import de Codigos

### Hierarquia

Codigos nested no XML → `parentId` no `CodeDefinition`. Respeitando a arvore:

```xml
<Code name="Emocoes">
  <Code name="Alegria"/>     → parentId = id de Emocoes
  <Code name="Frustracao"/>  → parentId = id de Emocoes
</Code>
```

`isCodable="false"` no QDPX indica pasta/grupo. No Qualia, criar como codigo normal (todo codigo e codificavel). Se Fase B (pastas) estiver feita, pode mapear pra pasta virtual.

### Cores e descricoes

- `Code@color` → `CodeDefinition.color` (direto, #RRGGBB)
- `Code > Description` → `CodeDefinition.description` (direto)

### Conflitos

Quando codigo importado tem mesmo nome que existente:

**Merge:** markers do QDPX sao vinculados ao codigo existente via `codeId`. GUIDs do QDPX sao mapeados pro id existente.

**Separar:** cria codigo novo com nome "{nome} (imported)". Cor e descricao do importado. Markers vinculados ao novo codigo.

Decisao do usuario via modal, aplicada a todos os conflitos.

### Mapeamento de GUIDs

Tabela interna `Map<qdpxGuid, qualiaId>` construida durante import. Cada `<CodeRef targetGUID="...">` nos Selections e resolvido via essa tabela.

---

## Import de Memos

### Mapeamento por contexto

| NoteRef em | Destino no Qualia |
|------------|-------------------|
| Selection (segmento) | `marker.memo` |
| Code | `CodeDefinition.description` (se ja existe, concatena com `\n\n--- Imported memo ---\n` como separador) |
| Project | Arquivo .md em `imports/{project}/memos/` |
| Source | Arquivo .md em `imports/{project}/memos/` |
| Solto (sem ref) | Arquivo .md em `imports/{project}/memos/` |

### Memos como arquivos .md

Memos que nao tem destino direto no Qualia viram markdown com frontmatter:

```markdown
---
type: memo
linked_to: "document"
linked_guid: "57C6099B-..."
linked_name: "Interview P01.docx"
author: "Maria Silva"
created: "2026-03-15T10:00:00Z"
imported_from: "QDPX"
---

Este documento apresenta padroes consistentes de
frustracao com ferramentas digitais...
```

Preserva tipo, vinculo, autor, datas. Futuro sistema de memos do Qualia pode consumir esses arquivos.

---

## Entry Points

### Commands (palette)

```typescript
plugin.addCommand({
  id: 'import-qdpx',
  name: 'Import project (QDPX)',
  callback: () => openImportFilePicker(app, dataManager, registry, 'qdpx')
});

plugin.addCommand({
  id: 'import-qdc',
  name: 'Import codebook (QDC)',
  callback: () => openImportFilePicker(app, dataManager, registry, 'qdc')
});
```

### Botao no analytics

Ao lado do botao de export, icone de import. Click abre file picker → modal.

---

## Topico futuro: Sistema de Memos

O import revela um gap significativo no Qualia comparado com ATLAS.ti, NVivo e MAXQDA:

| Conceito | Concorrentes | Qualia atual |
|----------|-------------|--------------|
| Memo no segmento | Entidade linkada (titulo, autor, tipo) | campo string `marker.memo` |
| Memo no codigo | Entidade linkada | campo string `description` |
| Memo no documento | Sim | Nao existe |
| Memo de projeto | Sim | Nao existe |
| Memo livre (analitico) | Sim | Nao existe |
| Memo tipado (analitico, metodologico, teorico) | Sim | Nao |
| Memo codificavel | Sim (memo pode receber codigos) | Nao |
| Memo formatado | Rich text | Plain text |

**Recomendacao:** planejar sistema de memos como feature futura. O import v1 preserva memos como .md com frontmatter — quando o sistema existir, esses arquivos ja tem metadata pra migrar. Esse topico deve ser levantado como item de roadmap em breve.

---

## Compatibilidade com fases futuras

| Fase concluida | O que o import ganha |
|----------------|---------------------|
| C (feita) | Import basico funcional — codigos flat + segmentos 5 engines |
| A (hierarquia) | Import preserva nesting do codebook |
| B (pastas) | `isCodable="false"` → pasta virtual |
| D (magnitude) | Parse magnitude de Notes prefixados `[Magnitude: X]` |
| E (relacoes) | `<Link>` → CodeDefinition.relations |

---

## Referencias

- REFI-QDA Standard v1.5: https://www.qdasoftware.org/
- Project.xsd: https://github.com/openqda/refi-tools/blob/main/docs/schemas/project/v1.0/Project.xsd
- QualCoder refi.py (implementacao referencia): https://github.com/ccbogel/QualCoder/blob/master/src/qualcoder/refi.py
- pyqdpx (samples QDPX): https://github.com/DEpt-metagenom/pyqdpx

# REFI-QDA Export (QDC + QDPX) — Design Spec

**Data:** 2026-03-22
**Status:** Aprovado
**Dependencia:** Fase C concluida (markers usam CodeApplication[] com codeId)

---

## Escopo v1

### Inclui
- Export QDC (codebook only) — codigos com hierarquia, cores, descricoes
- Export QDPX (projeto completo) — codigos + sources + coded segments + memos
- 5 engines: markdown, PDF, image, audio, video
- Entry points: command palette + botao no analytics view
- Modal pre-export: formato (QDC/QDPX), toggle "Include source files", nome do arquivo
- Memos: cada marker com memo gera `<Note>` + `<NoteRef>` no Selection
- Description: `CodeDefinition.description` → `<Code><Description>`
- Hierarquia: se Fase A feita, codigos nested no XML; senao, flat

### Nao inclui (backlog)
- **CSV markers** — formato REFI-QDA nao suporta dados tabulares. Disclaimer no modal. Backlog: exportar conteudo das celulas como TextSource com headers de contexto (Row N, colunas).
- **Import QDPX/QDC** — feature futura separada
- **Magnitude** — sem equivalente direto no REFI. Variable do REFI e por documento, nao por segmento+codigo. Opcao futura: prefixar magnitude no Note do memo (`[Magnitude: ALTA]\nTexto do memo`).
- **Relacoes** (codigo-level e segmento-level) — depende Fase E. Mapeamento futuro: `<Link>` com `originGUID`/`targetGUID`/`direction`.
- **Pastas virtuais como Sets** — depende Fase B. Mapeamento futuro: `<Set>` com `<MemberCode>`.

---

## Arquitetura

### Modulo novo: `src/export/`

```
src/export/
  qdcExporter.ts      — gera XML do codebook (QDC)
  qdpxExporter.ts     — orquestra o export completo (QDPX)
  xmlBuilder.ts       — helpers pra construir XML (escaping, formatacao)
  coordConverters.ts  — conversao de coords por engine (PDF, Image)
  exportModal.ts      — modal pre-export (formato, toggle sources, nome)
  exportCommands.ts   — registra commands na palette + botao no analytics
```

### Fluxo de dados

```
Command/Botao
    ↓
exportModal (formato, incluir sources?, nome do arquivo)
    ↓
qdpxExporter.export(dataManager, registry, vault, options)
    ↓
  1. qdcExporter.buildCodebook(registry) → XML do codebook
  2. Para cada engine (exceto CSV): ler markers, converter coords, gerar Selections + Codings
  3. Para cada marker com memo: gerar Note + NoteRef
  4. Montar project.qde (XML completo)
  5. Empacotar ZIP (project.qde + sources/ se internal)
    ↓
Salvar .qdpx no vault
    ↓
Notice("Export concluido: projeto.qdpx")
```

Para QDC: pula os passos 2-5, salva XML direto como `.qdc`.

### Dependencias

- `DataManager` — acesso aos dados de todos os engines
- `CodeDefinitionRegistry` — codigos, hierarquia (se disponivel)
- `Vault` adapter do Obsidian — ler arquivos fonte
- Lib ZIP: JSZip ou fflate (avaliar no plano de implementacao)

---

## Modal de Export

```
┌─ Export REFI-QDA ──────────────────────┐
│                                        │
│ Format:                                │
│   ○ QDPX (projeto completo)           │
│   ○ QDC (codebook only)               │
│                                        │
│ ─────────────────────────────────────  │
│ (so aparece quando QDPX selecionado)   │
│                                        │
│ ☑ Include source files                 │
│   Embeds files in the archive.         │
│   Uncheck for smaller export.          │
│                                        │
│ ⚠ CSV segments will not be included   │
│   (REFI-QDA does not support tabular   │
│    data)                               │
│                                        │
│ ─────────────────────────────────────  │
│ File name: [qualia-project_______.qdpx]│
│                                        │
│              [Cancel]  [Export]         │
└────────────────────────────────────────┘
```

- Warning do CSV so aparece se o projeto tem CSV markers
- QDC selecionado: esconde opcoes de sources, muda extensao pra `.qdc`
- Arquivo salvo na raiz do vault
- Notice do Obsidian ao concluir

---

## Conversao de Coordenadas

### Markdown
- Qualia: `{ from: { line, ch }, to: { line, ch } }`
- REFI: `startPosition` / `endPosition` (offset Unicode codepoint, 0-based)
- Conversao: ler conteudo do arquivo, calcular offset absoluto a partir de line:ch

### PDF
- Qualia: `page`, rect com coords do viewer (top-left origin)
- REFI: `page` (0-based), `firstX/firstY`, `secondX/secondY` em PDF points (bottom-left origin)
- Conversao: inverter eixo Y usando altura da pagina

### Image
- Qualia: `NormalizedCoords` (0-1)
- REFI: pixels (`firstX/firstY`, `secondX/secondY`)
- Conversao: multiplicar por dimensoes da imagem em pixels

### Audio/Video
- Qualia: `startTime` / `endTime` (segundos, float)
- REFI: `begin` / `end` (milissegundos, inteiro)
- Conversao: `Math.round(seconds * 1000)`

### CSV
- Nao exporta na v1. Disclaimer no modal.

---

## XML Generation

### Encoding e formato

UTF-8, XML declaration `<?xml version="1.0" encoding="utf-8"?>`.

### GUIDs

Reutilizar `CodeDefinition.id` e `BaseMarker.id` como GUIDs. Se nao forem UUID validos, gerar UUID v4 com mapeamento (id original → UUID gerado) pra manter consistencia interna.

### QDC output

```xml
<?xml version="1.0" encoding="utf-8"?>
<CodeBook xmlns="urn:QDA-XML:codebook:1.0">
  <Codes>
    <Code guid="..." name="Emocoes" isCodable="true" color="#ff6600">
      <Description>Codigos sobre emocoes</Description>
      <Code guid="..." name="Alegria" isCodable="true" color="#33cc33"/>
      <Code guid="..." name="Frustracao" isCodable="true" color="#ff0000"/>
    </Code>
  </Codes>
</CodeBook>
```

Hierarquia: codigos com `parentId` sao nested dentro do pai. Sem `parentId` = top-level.
`isCodable`: sempre `true` (todos os codigos do Qualia sao codificaveis).

### QDPX — project.qde

```xml
<?xml version="1.0" encoding="utf-8"?>
<Project name="[vault name]" origin="Qualia Coding [version]"
    creationDateTime="[ISO 8601]"
    xmlns="urn:QDA-XML:project:1.0">

  <CodeBook>
    <!-- reutiliza qdcExporter.buildCodebook() -->
  </CodeBook>

  <Sources>
    <!-- Markdown -->
    <TextSource guid="..." name="Entrevista P01.md"
        plainTextPath="internal://{guid}.txt">
      <PlainTextSelection guid="..." name="trecho"
          startPosition="139" endPosition="195"
          creationDateTime="...">
        <Coding guid="..." creationDateTime="...">
          <CodeRef targetGUID="{code-guid}"/>
        </Coding>
        <NoteRef targetGUID="note_{marker-id}"/>
      </PlainTextSelection>
    </TextSource>

    <!-- PDF -->
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

    <!-- Image -->
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

    <!-- Audio -->
    <AudioSource guid="..." name="entrevista.m4a"
        path="internal://{guid}.m4a">
      <AudioSelection guid="..." begin="16176" end="45358">
        <Coding guid="...">
          <CodeRef targetGUID="{code-guid}"/>
        </Coding>
      </AudioSelection>
    </AudioSource>

    <!-- Video -->
    <VideoSource guid="..." name="sessao.mp4"
        path="internal://{guid}.mp4">
      <VideoSelection guid="..." begin="16176" end="45358">
        <Coding guid="...">
          <CodeRef targetGUID="{code-guid}"/>
        </Coding>
      </VideoSelection>
    </VideoSource>
  </Sources>

  <Notes>
    <Note guid="note_{marker-id}" name="Memo: {label}"
        creationDateTime="...">
      <PlainTextContent>{memo text}</PlainTextContent>
    </Note>
  </Notes>
</Project>
```

### Multiplos codigos por segmento

Um `<Selection>` com multiplos `<Coding>`, cada um com seu `<CodeRef>`. Mapeamento direto do `CodeApplication[]`.

### Memos

Para cada marker com `memo !== ""`:
1. Gerar `<Note>` no bloco `<Notes>` com `guid="note_{markerId}"`
2. Adicionar `<NoteRef targetGUID="note_{markerId}"/>` dentro do `<Selection>`

### Source files no ZIP

Quando "Include source files" ativo:
- Gerar UUID para cada arquivo fonte
- Copiar arquivo para `sources/{uuid}.{ext}` dentro do ZIP
- Referenciar como `internal://{uuid}.{ext}` no XML

Quando desativado:
- Referenciar como `relative://path/to/file.ext` (relativo ao vault)

Para markdown: exportar conteudo como `.txt` (REFI espera plain text, nao markdown syntax).

---

## Entry Points

### Commands (palette)

```typescript
plugin.addCommand({
  id: 'export-qdpx',
  name: 'Export project (QDPX)',
  callback: () => new ExportModal(app, dataManager, registry, 'qdpx').open()
});

plugin.addCommand({
  id: 'export-qdc',
  name: 'Export codebook (QDC)',
  callback: () => new ExportModal(app, dataManager, registry, 'qdc').open()
});
```

### Botao no analytics

No toolbar do `analyticsView.ts`, ao lado do botao CSV existente:
- Icone de export (download ou share)
- Click abre o mesmo `ExportModal`

---

## Compatibilidade com fases futuras

| Fase concluida | O que o export ganha |
|----------------|---------------------|
| C (feita) | Export basico funcional — codigos flat + segmentos 5 engines |
| A (hierarquia) | Codebook com nesting `<Code>` hierarquico |
| B (pastas) | Pastas como `<Set>` com `<MemberCode>` |
| D (magnitude) | Magnitude prefixada no Note: `[Magnitude: ALTA]\n{memo}` |
| E (relacoes) | `<Link>` com `originGUID`/`targetGUID`/`direction` entre codigos |

O export detecta automaticamente quais campos existem (ex: `parentId` presente → nesting; ausente → flat).

---

## Referencias

- REFI-QDA Standard v1.5: https://www.qdasoftware.org/
- Project.xsd: https://github.com/openqda/refi-tools/blob/main/docs/schemas/project/v1.0/Project.xsd
- Codebook.xsd: https://github.com/openqda/refi-tools/blob/main/docs/schemas/codebook/v1.0/Codebook.xsd
- Spec PDF v1.5: https://openqda.github.io/refi-tools/docs/standard/REFI-QDA-1-5.pdf
- ponte (TypeScript, cria QDPX): https://github.com/enricllagostera/ponte

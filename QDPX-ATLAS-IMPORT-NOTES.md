# Atlas.ti QDPX PDF Import Notes

Contexto consolidado em 2026-08-04 para retomar o trabalho sem refazer o levantamento.

## Fixture principal

- Vault real: `/Users/mosx/Desktop/obsidian-plugins-workbench/`
- Plugin repo: `/Users/mosx/Desktop/obsidian-plugins-workbench/.obsidian/plugins/obsidian-qualia-coding/`
- QDPX de teste: `/Users/mosx/Desktop/obsidian-plugins-workbench/QUALIA-QDPX/QDPX Tests/UnifiedDevOps Selective Coding ITE5 ICA.qdpx`
- Materiais de investigacao movidos para: `/Users/mosx/Desktop/obsidian-plugins-workbench/QUALIA-QDPX/investigacao-import-atlas-qdpx/`

## Resultado do import observado

Preview do modal:

- Origin: `ATLAS.ti 26.0.1 33971 , macOS Version 26.5 (Build 25F71)`
- Found: `25 codes, 408 segments, 10 sources, 6 memos, 20 relations`

Auditoria do `data.json` apos import:

- `203` `PdfMarker` textuais
- `0` `PdfShapeMarker`
- A maioria dos markers fica pendente com `beginIndex/beginOffset/endIndex/endOffset = 0`

Os `408 segments` do preview nao significam necessariamente 408 markers finais. O QDE do Atlas.ti traz pares `PDFSelection` + `PlainTextSelection` para muitas quotations; o importer atual pareia/deduplica esses GUIDs e cria marker textual unico.

## Entendimento atual

O problema atual nao e mais "o importer cria shapes em vez de texto". O codigo atual ja prefere `PdfMarker` textual quando ha `PDFSelection.name` ou offsets textuais, e so usa shape fallback para selecoes sem `name`.

O problema que resta e re-anchoring textual:

1. O QDPX do Atlas.ti informa PDF, pagina e texto aproximado/truncado da selection.
2. O Qualia precisa converter isso em indices exatos da text layer do PDF.js no Obsidian.
3. `resolvePendingIndices()` tenta buscar o texto do marker na pagina renderizada.
4. Para muitos markers, a busca falha e o marker continua pendente, entao nenhum highlight aparece.

## Por que a busca falha

O texto exportado pelo Atlas.ti e o texto renderizado pelo PDF.js podem divergir:

- whitespace e quebras diferentes;
- selecoes truncadas com reticencias;
- caracteres invalidos como `�`;
- ligaduras/glyphs extraidos de forma diferente em PDFs academicos;
- ordem textual diferente em PDFs de duas colunas.

`normalize('NFKC')` ou busca literal nao bastam quando a corrupcao ja virou ASCII aparentemente valido, como sequencias estranhas de `f`.

## Nao solucao

Converter quotations textuais em retangulos/shapes nao e a solucao correta.

Isso ate poderia desenhar uma regiao visual aproximada, mas muda a semantica do dado: a marcacao deixa de ser uma ancora textual e vira uma forma grafica. Para coding de PDF academico, o comportamento esperado e preservar highlights textuais.

## Proximo passo tecnico recomendado

Antes de alterar o algoritmo, instrumentar diagnostico:

- quando `resolvePendingIndices()` falhar, registrar arquivo, pagina, marker id, tamanho do texto procurado, inicio do texto procurado e tamanho do texto da pagina;
- expor contagem de markers resolvidos vs pendentes por arquivo;
- evitar spam no console com logs agregados por pagina/arquivo.

Depois implementar fallback de matching aproximado, preferencialmente page-aware:

1. Buscar direto.
2. Buscar com whitespace normalizado.
3. Buscar por prefixo limpo quando o Atlas truncou com reticencias.
4. Buscar fuzzy com tolerancia controlada.
5. Gravar indices reais somente quando houver match suficientemente confiavel.

O smoke real precisa abrir PDFs importados no Obsidian, nao apenas rodar Vitest.

## Comandos uteis

Limpar estado antes de novo import:

```bash
npm run qdpx:reset:dry-run
npm run qdpx:reset
```

Auditar markers PDF apos import:

```bash
node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync('data.json','utf8')); const pdf=d.pdf||{}; const markers=pdf.markers||[]; const shapes=pdf.shapes||[]; const by={}; for(const m of markers){(by[m.fileId]??={markers:0,shapes:0,pages:new Set(),pending:0,withText:0}).markers++; by[m.fileId].pages.add(m.page); if(m.beginIndex===0&&m.beginOffset===0&&m.endIndex===0&&m.endOffset===0) by[m.fileId].pending++; if(m.text) by[m.fileId].withText++;} for(const s of shapes){(by[s.fileId]??={markers:0,shapes:0,pages:new Set(),pending:0,withText:0}).shapes++; by[s.fileId].pages.add(s.page);} console.log('total text markers',markers.length); console.log('total shapes',shapes.length); for(const [file,v] of Object.entries(by).sort()){console.log(JSON.stringify({file,markers:v.markers,shapes:v.shapes,pending:v.pending,withText:v.withText,pages:[...v.pages].sort((a,b)=>a-b)}));}"
```

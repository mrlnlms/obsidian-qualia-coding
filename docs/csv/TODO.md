# CodeMarker CSV — TODO & Oportunidades

## Suporte a Parquet

### Contexto
Parquet é formato columnar binário, 5-12x menor que CSV, parse mais rápido, leitura seletiva de colunas. Ideal para datasets grandes (50k+ rows) comuns em pesquisa.

### Biblioteca: hyparquet
- ~9 KB min+gzip, zero dependências, JavaScript puro
- Output: `Record<string, any>[]` — exatamente o que AG Grid espera
- API: `parquetReadObjects({ file, columns?, rowStart?, rowEnd? })`
- Schema tipado: INT32, FLOAT, DOUBLE, BOOLEAN, BYTE_ARRAY → column filters automáticos
- Leitura seletiva de colunas (só decodifica o que pedir)
- npm: `hyparquet` (v1.25+)

### Tarefas de implementação

- [ ] **Instalar hyparquet**: `npm install hyparquet hyparquet-compressors`
- [ ] **Parsing layer**: criar `parseTabularFile()` unificado em `csvCodingView.ts`
  - `if (file.extension === 'parquet')` → `vault.adapter.readBinary()` + `parquetReadObjects()`
  - `else` → `vault.read()` + `Papa.parse()` (atual)
  - Retorno unificado: `{ headers, rows, types? }`
- [ ] **Registrar extensão**: adicionar `'parquet'` ao `registerExtensions(['csv', 'parquet'], ...)`
- [ ] **Column types**: usar schema do Parquet para setar `agNumberColumnFilter` em colunas numéricas
- [ ] **Read-only mode**: desabilitar edição de células originais para arquivos Parquet (binário, sem `Papa.unparse`)
- [ ] **Leitura binária**: usar `vault.adapter.readBinary(file.path)` → `ArrayBuffer` → hyparquet async file wrapper
- [ ] **Testar**: abrir .parquet no Obsidian → verifica grid, coding columns, segment editor, sidebar views

### Notas
- CodingModel não muda — markers são index-based (row/column), independem do formato fonte
- Shared registry, sidebar views, CM6 segment editor funcionam sem alteração
- Coding columns (cod-seg, cod-frow, comment) são salvas no `data.json`, não no arquivo fonte
- Estimativa: ~15-20 linhas de mudança no parser + instalação da dep

### Performance esperada (50K rows, 20 cols)

| Métrica | CSV | Parquet |
|---|---|---|
| Tamanho no disco | ~25 MB | ~2-5 MB |
| Parse speed | ~200-500ms | ~100-300ms |
| Memória heap | ~50-80 MB | ~15-30 MB |
| Leitura parcial | Impossível | Sim (column-selective) |

---

## Outras oportunidades

### Memo universal (Saldaña Ch.14)
- [ ] Adicionar campo `memo?: string` ao `SegmentMarker` e `RowMarker`
- [ ] UI: textarea expansível no popover de coding / célula de comment
- [ ] Integração com Analytic Memo View no Analytics plugin

### Magnitude Coding (Saldaña Ch.14)
- [ ] Campo `magnitude?: string` no marker (intensidade/direção/avaliação)
- [ ] Chip visual diferenciado para markers com magnitude (e.g., badge "HIGH" ao lado do código)
- [ ] Filtro no Analytics por magnitude dentro de um código

### Code → Theme Hierarchy (Saldaña Ch.14)
- [ ] Campo `theme?: string` no CodeDefinition (shared registry)
- [ ] Agrupamento por tema no CsvCodeExplorerView (nível extra na árvore)
- [ ] Filtro por tema nas coding columns

### Export melhorado
- [ ] Export CSV com coding columns incluídas (merge dados originais + códigos)
- [ ] Export Parquet (via hyparquet-writer ou conversão para CSV)

### Performance para datasets muito grandes
- [ ] Lazy loading com `rowStart`/`rowEnd` do hyparquet (pagination de row groups)
- [ ] AG Grid Server-Side Row Model para datasets 100k+ rows
- [ ] Column-selective loading: só carregar colunas visíveis inicialmente

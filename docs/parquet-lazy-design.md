# Parquet/CSV Lazy Loading — Design Doc

**Status:** ✅ **FASE 6 COMPLETA — todas as 7 fases entregues 2026-05-03/04.** Doc preservado como referência arquitetural / post-mortem; não é mais decisão pendente.

**Auto-cleanup OPFS no fechamento de arquivo** (decisão pós-Slice E, 2026-05-04): comportamento default escolhido pelo user — disco previsível > re-open instant. Cache só existe enquanto arquivo está aberto numa leaf.

**Onde está implementado:**
- DuckDB+Worker bootstrap: `src/csv/duckdb/duckdbBootstrap.ts` + `wasmAssets.ts` (com gzip lifecycle pós-Slice D)
- OPFS streaming: `src/csv/duckdb/opfs.ts`
- RowProvider + Infinite Row Model: `src/csv/duckdb/duckdbRowProvider.ts` + `src/csv/csvCodingView.ts:setupLazyMode`
- Pre-populate startup: `src/csv/prepopulateMarkerCaches.ts`
- Export resolver: `src/csv/resolveExportTexts.ts`
- QDPX `<qualia:TabularSource>`: `src/export/qdpxExporter.ts:buildTabularSourceXml` + `src/import/qdpxImporter.ts:createTabularMarker` (round-trip)
- Manage cache UI + checklist de testes manuais: `src/core/settingTab.ts` + `docs/MANUAL-TESTS-FASE-6.md`

**Audiência atual:** quem for atacar feature derivada (LLM provider, Whisper transcription) — pra reusar a infra DuckDB+Worker+OPFS sem redescobrir as armadilhas (§14 spike findings, §6 pontos cegos validados).

---

## TL;DR

Plugin trava ao abrir parquet/CSV grande (>50MB parquet, >100MB CSV). Hoje só tem **size guard** (banner "Load anyway") como mitigação. Pra fechar o gap de verdade, a única solução técnica viável é **DuckDB-Wasm bundle inline (~6.4 MB)** + **OPFS** pra leitura parcial + **AG Grid Infinite Row Model**.

**Custo:** main.js cresce de 2.5 MB → ~9 MB (faixa Excalidraw), storage em disco dobrado por arquivo aberto (vault + cópia OPFS), **~13-15 sessões** de trabalho.

**Ganho:** parquet/CSV grande deixa de travar, ganha SQL completo (sort/filter/search/aggregate/batch coding por predicate).

**Estratégia de execução:** 7 fases incrementais em main, atrás de feature flag até a última. **Não é branch longa, não é clone separado.**

**Refactor é grande:** identidade de row precisa virar `sourceRowId` estável (Fase 0), `getMarkerText` async + adapter precisa virar batch resolver (Fase 1), cópia inicial precisa ser streaming via Node `fs` pra não materializar arquivo todo na RAM no cold start (Fase 3). `tabularExporter` entra no escopo (lazy QDPX precisa de streaming também). `textExtractor` (analytics word cloud) é coberto via query SQL DuckDB nativa (UNNEST + GROUP BY) — UX uniforme em lazy/eager.

---

## 1. Contexto e premissa

### 1.1 Status no ROADMAP

Hoje o ROADMAP.md tem `Parquet lazy loading` marcado como **contingente ao LLM coding**. A lógica original:

- Sem LLM coding, codificar 500k rows manualmente é fora do escopo humano → ninguém abre parquet gigante de verdade no Qualia.
- Com LLM coding, codificar 500k rows vira possível → parquet gigante vira caso de uso central de mixed methods.

**Decisão atual (esta discussão):** atacar Parquet lazy **antes** de LLM coding. Motivo: tirar o gap técnico do caminho pra que LLM coding nasça assumindo "arquivo grande funciona", sem cap arbitrário.

**Reforço (review cruzado do `qualia-fit.md`):** revisores identificaram independentemente que **Fase 0 (sourceRowId estável)** é pré-requisito não só de parquet lazy, mas também de **LLM coding em tabular** (batch review, diff entre runs, anchoring estável após sort/filter). O ROI da Fase 0 é dual-purpose — destrava parquet grande **e** destrava LLM em tabular. Mesmo se parquet lazy fosse adiado, sourceRowId valeria por si só.

### 1.2 Calibração empírica do problema (bench 2026-04-24)

| Type | Size (MB) | Peak RSS | Peak Heap | Multiplier RSS |
|------|-----------|----------|-----------|----------------|
| csv | 56.9 | 389 MB | 319 MB | 6.8x |
| csv | 75.8 | 560 MB | 485 MB | 7.4x |
| parquet | 76.9 | 755 MB | 381 MB | **9.8x** |
| parquet | 78.1 | 1405 MB | 1026 MB | **18.0x** |
| csv | 148.4 | 1060 MB | 977 MB | 7.1x |
| parquet | 172.5 | 1390 MB | 3470 MB | 8.1x |
| csv | 230.1 | 1600 MB | 1514 MB | 7.0x |
| parquet | 296.6 | 1464 MB | 3556 MB | 4.9x |
| csv | 388.5 | 2658 MB | 2534 MB | 6.8x |
| 2 parquets | — | — | — | ❌ OOM |

**Conclusão empírica:** parquet decode tem multiplier RSS ~5-18x. CSV tem ~7x. Em 50 MB parquet, esperado ~250-900 MB RSS. Mitigação atual (size guard) já cobre o crash; gap remanescente é "abrir arquivo grande funcionando".

---

## 2. Caminho da decisão (alternativas consideradas e descartadas)

Vale documentar o caminho porque outro LLM (ou eu mesmo no futuro) pode questionar a decisão final. Pra cada alternativa: por que foi cogitada, por que foi descartada.

### 2.1 Opção A — "Sort/filter só no buffer carregado"

**Ideia:** AG Grid Infinite Row Model + sort/filter aplicados só nos rows que estão em memória.

**Descartada:** UX confusa. Usuário vê "ordenado por idade decrescente" mas tem rows desordenadas embaixo (as que não foram carregadas ainda). É inconsistência visível.

### 2.2 Opção B — "Desabilitar sort/filter em modo lazy"

**Ideia:** AG Grid Infinite Row Model com sort/filter de header desabilitados visualmente.

**Descartada parcialmente:** elimina UX confusa mas perde funcionalidade. Mais grave: **mata o caso de uso de batch coding por filter** ("aplicar code em todas as rows onde região = Sul"), que é o caso de uso central pra parquet grande. Sem filter, esse workflow não existe.

Solução parcial proposta nesta discussão: **batch coding modal explícito** com predicate builder (coluna + operador + valor) ao invés de filter visual. Funciona com hyparquet streaming (scan colunar de uma coluna sem carregar arquivo todo). Mas: cobre só **aplicação** de codes em batch, **não cobre revisão** ("encontre todas as rows que receberam code X com confidence < 0.7"). Pra revisão pós-LLM, predicate builder isolado é insuficiente — precisa de SQL completo.

### 2.3 Opção C — "DuckDB-Wasm como query engine"

**Ideia:** trazer DuckDB-Wasm como engine de leitura tabular. SQL completo, scan colunar com pushdown, filter/sort em arquivo grande sem carregar tudo.

**Trade-off:**
- Bundle: WASM ~6.4 MB (vs main.js atual 2.5 MB)
- Dependência: 1 lib grande adicional (~50 MB unpacked em `node_modules`)
- Complexidade: WASM em Web Worker, OPFS pra leitura parcial

**Inicial:** rejeitada por causa do tamanho.

**Reconsiderada após pesquisa real:**
- Excalidraw (referência de plugin grande Obsidian): main.js de 8.4 MB. Ninguém reclama.
- DuckDB-Wasm bundle inline → main.js fica ~9 MB. Mesma faixa.
- Tamanho saiu como ponto de inflexão real.

**Decisão final:** Opção C. A única que cobre **revisão** pós-LLM além de aplicação. Custo é aceitável.

### 2.4 Opção D (não considerada) — esperar

Adiar até LLM coding entrar e refazer a decisão. **Rejeitada** por estratégia: se LLM coding nasce assumindo "arquivo pequeno", a feature herda cap arbitrário e revisar arquivo grande nunca funciona. Investir na infra antes do consumidor (LLM) é mais barato a longo prazo.

---

## 3. Decisão técnica final

### 3.1 Stack

| Componente | Versão / Detalhe |
|---|---|
| Query engine | `@duckdb/duckdb-wasm` bundle EH (single-threaded, sem requisito COI) |
| Tamanho WASM | ~6.4 MB (bundle EH oficial) |
| File access | OPFS via `BROWSER_FSACCESS` protocol |
| Worker | Web Worker via Blob URL (esbuild loader `binary` → `URL.createObjectURL(new Blob([...]))`) |
| Grid | AG Grid Community Infinite Row Model (free) |
| esbuild target | `es2020` (já compatível) |

### 3.2 Por que cada escolha

| Escolha | Por quê |
|---|---|
| Bundle EH (não COI) | COI exige headers `Cross-Origin-Embedder-Policy: require-corp` + `Cross-Origin-Opener-Policy: same-origin`. Obsidian Electron renderer não setta. EH funciona sem isso, single-threaded. Pra single-user, single-thread é suficiente. |
| Bundle EH (não MVP) | EH adiciona WebAssembly exception handling. Mensagens de erro melhores, leve ganho de performance. Suportado em todos os browsers que Obsidian roda. |
| OPFS (não NODE_FS) | NODE_FS do duckdb-wasm só funciona no bundle Node.js standalone. Plugin Obsidian usa bundle browser → fs direto está fora. Sobra OPFS. |
| Inline base64 vs separate file | Plugin Obsidian via Community Plugins distribui exatamente 3 arquivos: `main.js`, `manifest.json`, `styles.css`. Outros arquivos no GitHub release são ignorados pelo instalador. Logo o WASM precisa estar **dentro do main.js** (loader `binary` do esbuild — bytes literais, não base64 que infla 33%). |
| AG Grid Infinite Row Model (não Server-Side) | Server-Side Row Model é Enterprise ($999/dev/ano). Infinite é free e suficiente. |

### 3.3 Bundle distribuído

Plugins Obsidian via Community Plugins recebem exatamente:
- `main.js`
- `manifest.json`
- `styles.css`

Nada mais. Outros arquivos no release são ignorados. Logo:
- WASM 6.4 MB → embed via esbuild loader `binary` → vira `Uint8Array` literal dentro do main.js
- Worker JS → mesma coisa
- Runtime: `new Blob([wasmBytes], {type: 'application/wasm'})` → `URL.createObjectURL(blob)` → `db.instantiate(blobUrl)`

main.js final: ~9 MB. Excalidraw é 8.4 MB. Faixa OK.

---

## 4. Como funciona o OPFS sync

### 4.1 O que é OPFS

**Origin Private File System** é storage do Chromium, escondido do usuário, persistente entre sessões. Localização real:
- macOS: `~/Library/Application Support/obsidian/IndexedDB/...`
- Windows: `%APPDATA%\obsidian\IndexedDB\...`
- Linux: `~/.config/obsidian/IndexedDB/...`

Não aparece no Finder/Explorer. APIs JS dedicadas (`FileSystemFileHandle`, `FileSystemSyncAccessHandle`) com **leitura parcial** (`read(buffer, offset, length)`).

### 4.2 Por que precisa cópia

DuckDB-Wasm em browser context tem 4 formas de ler arquivo:

| Forma | Funciona em plugin? |
|---|---|
| `BUFFER` (carrega tudo na RAM) | ✅ mas defeats the purpose — volta o crash |
| `HTTP` (fetch + Range) | ❌ plugin não tem servidor HTTP |
| `NODE_FS` (lê do disco direto) | ❌ só no bundle Node.js, plugin usa bundle browser |
| `BROWSER_FSACCESS` (OPFS) | ✅ **única opção real** |

OPFS aceita leitura parcial. Vault adapter do Obsidian só dá leitura inteira. Daí: cópia uma vez vault → OPFS, depois DuckDB lê só os pedaços que precisa do OPFS.

### 4.3 Flow concreto (cópia streaming, NÃO `readBinary`)

**Crítico:** a cópia inicial NÃO usa `vault.adapter.readBinary()`. Isso materializaria o arquivo todo na RAM (500 MB de pico só na cópia, antes do DuckDB começar). Em vez disso, usa **streaming via Node `fs`** em chunks de ~1 MB:

```
PRIMEIRA VEZ abrindo dados.parquet (500 MB):

Vault                            OPFS (interno do Chromium)
~/Documents/MeuVault/           ~/Library/Application Support/
└── dados.parquet (500 MB)       obsidian/IndexedDB/...
         │                        └── qualia/<hash>/dados.parquet
         │                                ▲
         │      Node fs.createReadStream  │  FileSystemSyncAccessHandle.write
         └────► chunk 1MB ────────────────┘
                chunk 1MB
                chunk 1MB
                ...
              (uma vez, ~1-3s SSD, 5-10s HDD; pico de RAM: ~1 MB)
```

**Implementação:**
- `vault.adapter.getFullPath(file.path)` → caminho absoluto no SO
- `fs.createReadStream(absPath, {highWaterMark: 1024 * 1024})` em Electron renderer (plugins Obsidian têm `require('fs')` em desktop)
- Pra cada chunk, `FileSystemSyncAccessHandle.write(chunk, {at: offset})` no OPFS
- `await stream.close()` quando termina

**Por que streaming:** Obsidian `vault.adapter` só expõe leitura inteira (`readBinary` retorna `ArrayBuffer` do arquivo todo). Esse caminho não escala. Plugin é desktop-only (`isDesktopOnly: true`), então Node `fs` em renderer é o caminho real.

### 4.4 Quando re-copia

| Cenário | Ação |
|---|---|
| Primeira abertura do arquivo | Cópia completa |
| Reabertura (mesmo mtime) | Pula cópia, usa OPFS direto |
| `mtime` mudou (arquivo editado fora) | Refaz cópia |
| Arquivo deletado do vault | Limpa OPFS daquele arquivo |
| Plugin desabilitado pelo usuário | Limpa OPFS inteiro do plugin (heurística — ver §6.3) |
| Plugin recarregado (hot-reload) | Mantém OPFS |

### 4.5 Custo

- **Storage dobrado:** 500 MB no vault + 500 MB no OPFS = 1 GB total. **Trade-off aceito.**
- **Tempo cold start (cópia inicial):** I/O puro, proporcional. SSD ~1-3s, HDD 5-10s para 500 MB. Progress bar **detalhada** (% + bytes copiados / total + ETA estimado). Sem isso, usuário acha que travou em arquivo grande.
- **Memória RAM (cold start, durante cópia):** ~1 MB pico (chunk size). Streaming via Node `fs` evita materializar o arquivo. **Sem isso, primeira abertura de parquet 500 MB = 500 MB de RAM antes do DuckDB começar — defeats the purpose.**
- **Memória RAM (após cópia, modo lazy operacional):** bounded ~200-500 MB independente do tamanho do arquivo. DuckDB lê do OPFS em chunks via `FileSystemSyncAccessHandle.read(buffer, {at: offset})`.

### 4.6 Namespace OPFS

OPFS é por **origem** (Obsidian inteiro), não por plugin. Múltiplos vaults compartilham mesma origem → precisa namespace pra evitar collision:

- Path no OPFS: `qualia/<sha1(vaultId + filePath)>/dados.parquet`
- `sha1` do path resolve também o problema de **long path > 260 chars no Windows** (limite do filesystem).

---

## 5. Tabela de tradeoff: hoje vs depois

### 5.1 Tamanho

| Métrica | Hoje | Depois |
|---|---|---|
| `main.js` | 2.5 MB | ~9.0 MB |
| `styles.css` | 128 KB | 128 KB |
| Build time (esbuild prod) | ~1s | ~3-5s |
| Memória runtime (idle) | normal | normal (WASM lazy-loaded) |
| Memória runtime (parquet aberto, modo lazy operacional) | proporcional ao arquivo | bounded ~200-500 MB |
| Memória runtime (cold start, durante cópia inicial) | n/a (carrega tudo) | ~1 MB pico (streaming chunked) |
| Storage por arquivo lazy aberto | só vault | vault + cópia OPFS (dobrado) |

### 5.2 Código

| Categoria | Hoje | Depois |
|---|---|---|
| `src/csv/` (engine) | 1.880 LOC | 1.880 + ~1.100 novos |
| `csvCodingModel.ts` | 283 LOC com `rowDataCache: Map` | 283 ± 30 LOC, troca pra `RowProvider` |
| `csvCodingView.ts` | 308 LOC AG Grid client-side | 308 + ~50 LOC, switch lazy/eager |
| `getMarkerText()` em 7 arquivos | sync `string \| null` | async `Promise<string \| null>` |
| `tabularExporter.ts` | papaparse, lê tudo | streaming via DuckDB |
| `textExtractor.ts` | papaparse | mantém papaparse (analytics em arquivo pequeno) |
| `esbuild.config.mjs` | 35 linhas | ~50 linhas (loader binary) |
| Testes | 2438 em jsdom | + mocks DuckDB-Wasm |

### 5.3 Dependências

| Pacote | Hoje | Depois |
|---|---|---|
| `@duckdb/duckdb-wasm` | ❌ | ✅ adiciona |
| `papaparse` | ✅ usado em 3 lugares | ✅ continua (textExtractor + tabularExporter, escrita) |
| `hyparquet` | ✅ leitura parquet | ❌ remove (DuckDB cobre) |
| `hyparquet-compressors` | ✅ | ❌ remove |
| `ag-grid-community` | ✅ | ✅ idem (Infinite Row Model é Community) |

### 5.4 Capacidades

| Feature | Hoje (eager) | Depois (eager <50MB) | Depois (lazy >50MB) |
|---|---|---|---|
| Abrir parquet 500MB | ❌ trava/crash | ✅ | ✅ ~1-3s |
| Abrir CSV 200MB | ⚠️ size guard | ✅ | ✅ |
| Codificar célula/row | ✅ | ✅ | ✅ |
| Tag chips, action btn | ✅ | ✅ | ✅ |
| Sort header | ✅ client-side | ✅ client-side | ✅ via SQL |
| Filter header | ✅ client-side | ✅ client-side | ✅ via SQL |
| Search global | ✅ | ✅ | ✅ via SQL `LIKE` |
| **Batch coding por predicate** | ❌ | ✅ novo (SQL) | ✅ novo (SQL) |
| **Aggregations** (count by code, etc) | manual | possível | possível |
| QDPX export | ✅ | ✅ | ✅ streaming |

---

## 6. Pontos cegos validados

### 6.1 Web Workers + WASM em plugin Obsidian — ✅ funciona

- Forum thread oficial confirma ([Forum 81040](https://forum.obsidian.md/t/can-plugins-use-web-worker/81040))
- Precedente: `obsidian-smart-vault` usa WASM em Worker via Blob URL ([Forum 103577](https://forum.obsidian.md/t/wasm-in-obsidian-plugin/103577))
- Pattern: esbuild target ES2020+ (já temos ✅), loader `binary` pro `.wasm`, Worker via Blob URL

### 6.2 CSP — ✅ não bloqueia

- WASM precisa diretiva `wasm-unsafe-eval` na CSP
- Obsidian Electron renderer não bloqueia. WASM funciona em outros plugins (`obsidian-smart-vault`).

### 6.3 OPFS cleanup ao desinstalar — solucionável em camadas

`onunload()` é chamado em:
- Plugin desabilitado pelo usuário
- Plugin recarregado (hot-reload)
- Plugin desinstalado (delete da pasta) — **pode não rodar antes do delete**, depende do timing

Estratégia em camadas:

| Cenário | Detecção | Ação |
|---|---|---|
| Desabilitação via UI | `app.plugins.enabledPlugins.has(this.manifest.id) === false` no onunload | Limpa OPFS automático |
| Reload normal | Plugin ainda em `enabledPlugins` | Mantém OPFS (cache reusado) |
| Desinstalação real (delete pasta) | Falha se onunload não rodou | Próxima reinstalação detecta OPFS órfão via flag versionada → limpa |
| Comando manual | Setting + comando "Qualia: Clear lazy cache" | User-triggered |
| Arquivo deletado do vault | File event listener | Remove só aquele arquivo |
| `mtime` mudou | Check no abrir | Re-copia |

### 6.4 Cross-platform (Windows/macOS/Linux) — ✅ idêntico

Tudo é Chromium do Electron. Sem código platform-specific. Detalhes:
- Excalidraw (8.4 MB com WASM-like footprint) roda nas três plataformas sem reclamação
- OPFS: idem em todas. Persiste em `%APPDATA%`/`Library/Application Support`/`.config`
- File paths: `app.vault.adapter` abstrai (`/` vs `\`)
- Long path > 260 chars no Windows: mitigado por hash do namespace OPFS (§4.6)
- Antivirus: improvável virar bloqueio (plugins WASM existem há anos sem relatos sistêmicos)

### 6.5 Hot-reload + WASM — gerenciável

Plugin reload descarta a classe mas WASM compilado pode persistir. Cleanup necessário em `onunload`:
- `worker.terminate()`
- `URL.revokeObjectURL(blobUrl)`
- `db.terminate()` (DuckDB-Wasm async API)

Sem isso, vazamento agressivo. Com isso, controlado.

### 6.6 Tests jsdom — precisa mock

2438 testes em jsdom. DuckDB-Wasm Worker não roda em jsdom. Estratégia: mock funcional do `@duckdb/duckdb-wasm` em `tests/setup.ts` que retorna fixtures pra cenários cobertos. ~1 sessão de infra.

### 6.7 Sem precedente público de DuckDB-Wasm em plugin Obsidian

- Único material relevante encontrado é o blog post da MotherDuck sobre Obsidian RAG, mas usa DuckDB-Wasm em **web app separada**, não dentro do plugin.
- Risco: bug específico do contexto Obsidian sem precedente mapeado.
- Mitigação: cada uma das peças (WASM, Worker, OPFS, Blob URL) tem precedente isolado em plugins existentes. Risco é integração, não componente.

### 6.8 Memory ceiling 2GB do WASM

WebAssembly 32-bit pointer → DuckDB-Wasm tem teto de ~2GB de memória interna. Parquet 5GB não cabe nem com lazy. Documentar como limitação e mostrar erro claro.

### 6.9 Cold start memory peak — pegado no review do Codex

**Risco original (no draft inicial deste doc):** afirmava "memória bounded ~200-500 MB independente do tamanho do arquivo". Falso pra primeira abertura. `vault.adapter.readBinary()` carrega arquivo inteiro na RAM antes do OPFS persistir → parquet 500 MB = 500 MB de pico mesmo em modo lazy.

**Mitigação:** cópia streaming via Node `fs.createReadStream` (§4.3). Pico de RAM durante cópia: ~1 MB.

**Por que importa:** sem essa mitigação, modo lazy resolve operação contínua mas falha no momento mais crítico (cold start de arquivo grande). User abre parquet 1 GB → trava igual antes na cópia → conclui que lazy mode "não funciona".

### 6.10 Identidade de row em sort/filter SQL — pegado no review do Codex

**Problema:** schema atual `CsvMarker` persiste por `fileId + row: number + column: string`. `row` é índice posicional físico do arquivo. Em modo lazy com sort SQL, "row 123" na grid após `ORDER BY` não é mais row física 123 — marker fica apontando pra row errada.

Hoje o flow assume índice bruto:
- `csvSidebarAdapter.ts:32` chama `getMarkerText(m)` por `marker.row`
- AG Grid usa `getRowNode(\`${rowIdx}\`)` e `getDisplayedRowAtIndex(rowIdx)` no client-side row model
- Navegação `revealMarker → ensureNodeVisible(rowIdx)` assume row física

**Mitigação:** introduzir `sourceRowId: number` estável via DuckDB virtual column `ROW_NUMBER() OVER()`. Marker persiste `sourceRowId`, não `row`. Pra navegação após sort, query `SELECT row_number() OVER() AS displayRow WHERE __source_row = X` resolve onde a row está visualmente.

**Trabalho:** Fase 0 dedicada (§8). Migração one-shot do vault workbench (sem backcompat conforme CLAUDE.md).

**Dual-purpose (review cruzado do `qualia-fit.md`):** sourceRowId também é pré-requisito de **LLM coding em tabular** — batch review precisa de identidade estável pra fazer diff entre runs ("LLM rodou em N rows na primeira vez, M na segunda — quais batem?"), e anchoring estável pra UI mostrar "essa sugestão é pra esta row específica" mesmo após sort. Logo essa fase entrega valor pra **dois futuros**, não só pra parquet lazy.

### 6.11 Adapter sync→async não é só "await no consumer" — pegado no review do Codex

**Problema original (no draft inicial):** afirmava que refator `getMarkerText` async era "5 linhas de await em cada consumer".

**Realidade:** `csvSidebarAdapter.ts:32` chama `model.getMarkerText(m)` síncrono e **pré-computa `markerText` no objeto** que vai pro sidebar. Em modo lazy isso quebra: 1000 markers × 1 query SQL sequencial = lentidão extrema.

**Mitigação:** adapter precisa virar **batch resolver**:
- Coleta todos os `sourceRowId` de markers de um arquivo
- Query única: `SELECT __source_row, content FROM data WHERE __source_row IN (1, 2, 3, ...)`
- Retorna `Map<sourceRowId, content>` que o adapter consulta sincronamente

**Trabalho:** Fase 1 cresce de 1 → 1.5-2 sessões. Não é só mudança de assinatura.

---

## 7. Refator necessário

### 7.1 Cross-cutting tipo 1: Schema `CsvMarker.row` → `sourceRowId` (Fase 0)

**Por quê:** §6.10. Sort/filter SQL invalida índice posicional.

| Arquivo | Mudança | LOC |
|---|---|---|
| `csv/csvCodingTypes.ts` | `row: number` → `sourceRowId: number` no `CsvMarker` | 5 |
| `csv/csvCodingModel.ts` | CRUD usa `sourceRowId`; resolve para row física via DuckDB query (ou cache em modo eager) | ~40 |
| `csv/csvCodingMenu.ts` | Cria marker com `sourceRowId` injetado pela grid | ~20 |
| `csv/csvCodingView.ts` | Injeta `__source_row` virtual column ao popular grid (eager: ROW_NUMBER local; lazy: DuckDB) | ~30 |
| `csv/views/csvSidebarAdapter.ts` | Navegação resolve `sourceRowId` → displayRow atual | ~15 |
| `export/qdpx/...` | Export persiste `sourceRowId` (round-trip estável) | ~20 |
| Migração `data.json` | Script one-shot que abre o vault workbench, transforma `row` → `sourceRowId` (mesma posição inicialmente), apaga código de migração | ~50 (descartável) |

**Total: ~180 linhas em 6 arquivos + script one-shot. Migração assumindo zero usuários.**

### 7.2 Cross-cutting tipo 2: `getMarkerText` async + adapter batch resolver (Fase 1)

**Por quê:** §6.11. Adapter pré-computa `markerText` síncrono — em lazy mode, isso vira N queries SQL sequenciais.

| Arquivo | Mudança | LOC |
|---|---|---|
| `core/baseCodeDetailView.ts` | Interface base vira `Promise<string \| null>` | 10 |
| `core/detailMarkerRenderer.ts` | Adiciona `await` no consumer + loading state | 15 |
| `core/unifiedDetailView.ts` | Adiciona `await` | 5 |
| `pdf/pdfCodingModel.ts` | Retorna `Promise.resolve(text)` (mantém contrato sync original) | 3 |
| `media/mediaCodingModel.ts` | Idem | 3 |
| `csv/csvCodingModel.ts` | Implementa async via RowProvider | 50 |
| `csv/views/csvSidebarAdapter.ts` | **Batch resolver:** coleta sourceRowIds, query única, popula `Map<sourceRowId, content>` antes de montar sidebar | ~80 |

**Total: ~165 linhas em 7 arquivos.** Refator de contrato + restructuring do adapter. **Não é só mudança de assinatura.**

### 7.3 Localizado (mexe num arquivo só)

| Arquivo | Mudança | LOC |
|---|---|---|
| `csv/csvCodingModel.ts` | `rowDataCache` → `RowProvider` | ~50 |
| `csv/csvCodingView.ts` | switch eager/lazy no setup AG Grid + injeção `__source_row` | ~80 |
| `export/tabular/tabularExporter.ts` | streaming via DuckDB pra arquivos lazy (Codex review §4) | ~100 |
| `esbuild.config.mjs` | loaders binary + worker plugin | ~15 |

### 7.4 Adição (módulos novos, isolados)

| Diretório | Conteúdo | LOC novo |
|---|---|---|
| `src/csv/lazy/` | `RowProvider`, threshold detection, streaming reader | ~400 |
| `src/csv/duckdb/` | Worker bootstrap, DuckDB wrapper, OPFS sync streaming via Node fs | ~600 |
| `src/csv/batch/` | Batch coding modal + predicate builder + worker scan | ~300 |
| `src/csv/cache-ui/` | Modal "Manage lazy cache" (lista arquivos cacheados, tamanhos, botão remove) | ~150 |

**Total novo: ~1.450 LOC. Total mudado: ~590 LOC em 13 arquivos.**

### 7.5 Out-of-scope explícito

- ~~`src/analytics/data/textExtractor.ts` fora de escopo~~ — revisado 2026-05-03: word cloud em modo lazy é coberto via query SQL DuckDB (UNNEST + GROUP BY + LIMIT) com streaming aggregation nativo. Mais barato que o caminho atual (read CSV inteiro pra string em JS). UX uniforme em lazy/eager. Filtro de stop words PT/EN é gap conhecido (vale pra ambos os modos) — **diferido**: entra junto com revisão da UI do Analytics, não no escopo deste design doc.
- **AI staging por aplicação** (suggested/accepted/rejected per-marker) — não é deste doc. Pertence ao `qualia-fit.md` (LLM coding spec). O batch coding modal da Fase 5 é **prompt-target** (predicate filtra rows pro LLM consumir), não **review UI** (que precisa de estado por aplicação no marker, ainda inexistente). Confundir os dois é erro fácil — anotado aqui pra fronteira ficar clara.
- **Audit trail por aplicação AI** (eventos `marker_ai_suggested / accepted / rejected`) — também ortogonal. Audit log atual é por mutações de codebook (codeId-level), não por aplicações de code em markers. Trabalho de schema novo, fora do escopo.

---

## 8. Estratégia de execução: 7 fases incrementais

**Não fazer:**
- Branch longa de 13-15 sessões → merge hell vs main
- Clone separado em outro vault → divergência de tests, bugfix duplicado
- Worktree → proibido pelo CLAUDE.md (hot-reload do plugin depende do path)

**Fazer:** fatiar em 7 fases, cada uma 1-2 sessões, entrando em main com flag desabilitada até a última.

| Fase | Entrega | Sessões | Visível? | Risco merge |
|---|---|---|---|---|
| **0. Source row ID estável** ✅ FEITA 2026-05-04 | Schema `CsvMarker.row → sourceRowId`, migração one-shot do vault workbench, 8 arquivos plugin + 3 externos + 2 scripts. 2490 testes verdes. | 1-2 | ❌ schema muda, comportamento idêntico em modo eager | 🟢 cross-cutting mas auto-contido em `csv/` |
| ~~**1. Refator `getMarkerText` async + adapter batch resolver**~~ **DIFERIDA — entra dentro da Fase 4** | ~~Interface async + 7 consumers + sidebar adapter restructured pra batch~~ Em modo eager (atual), `getMarkerText` sync da `rowDataCache` em memória funciona — async sem consumer real é refactor antecipado. Quando Fase 4 (RowProvider lazy real) chegar, async entra com consumer existente; cascata fica concentrada onde o uso justifica. Decisão tomada 2026-05-04 alinhada à regra "don't refactor for hypothetical future requirements" do CLAUDE.md. | — | — | — |
| **2. DuckDB-Wasm bootstrap** | Worker + esbuild loaders binary + Blob URLs + **2 shims do §14.5.1 já validados** + lifecycle (terminate em unload). Interface `RowProvider` esqueleto (impl real fica pra Fase 4). **Pattern reutilizável** pra LLM provider (Ollama, OpenAI/Anthropic) e Whisper transcription — Fase 2 entrega infraestrutura compartilhada, não específica de DuckDB | 2 | ❌ código adicionado, não chamado | 🟢 só adiciona arquivos novos |
| **3. OPFS sync layer (streaming via Node fs)** | Cópia chunked, namespace via hash, mtime check, cleanup heurístico | 2 | ❌ código adicionado, não chamado | 🟢 só adiciona arquivos novos |
| **4. RowProvider impl real + Infinite Row Model + (ex-Fase 1) async refactor** | Lazy mode atrás de feature flag (`enableLazyTabular: false`). **Inclui o refactor async absorvido da Fase 1**: nesta fase já existe consumer real (DuckDB query) que justifica `getMarkerText: Promise<...>` + adapter batch resolver. Cascata acontece com motivo. | 2.5-3 (era 2 + 1.5 da Fase 1 = 3.5; com integração concentrada cai pra 2.5-3) | ❌ flag off | 🟡 cross-cutting (atravessa core/) mas com consumer real motivando |
| **5. Batch coding modal via SQL** | Predicate builder + worker scan. **Schema do predicate builder deve ser extensível** — mesma estrutura (`coluna + operador + valor` → SQL → row indices) será input do LLM batch coding em tabular ("LLM, sugira codes em todas as rows onde sentimento = negativo"). Não é só aplicação manual em escala — é prompt-target | 1-2 | ⚠️ aparece se flag on | 🟢 isolado em `csv/batch/` |
| **6. Habilitar flag + QDPX/tabularExporter streaming + UI Manage Cache + mocks DuckDB-Wasm + cleanup tests** | Flag default `true`, threshold 50 MB, progress bar detalhada (% + bytes + ETA) | 2.5-3 | ✅ usuário sente | 🟡 pequena |

### 8.1 Pré-requisitos

**Convert-to-note ✅ mergeado.** Fase 0 ✅ feita. Próxima a atacar: **Fase 2** (DuckDB bootstrap).

### 8.2 Vantagens do fatiamento

- Sem branch longa
- PRs pequenos
- Convert-to-note (e outras features) podem rodar entre fases
- Risco distribuído: bug em fase 4 não trava fase 1 que já tá em main há semanas
- Pode pausar entre fases se LLM coding precisar entrar antes
- Main fica em estado funcional sempre

---

## 9. Decisões cravadas (sessão 2026-05-03)

Todas as decisões abaixo foram cravadas em revisão com Marlon em 2026-05-03. Próxima sessão pega isso e ataca a spec da Fase 0 direto, sem reabrir esses pontos.

**Regra geral cravada:** detalhe técnico de implementação **nunca** vira setting do usuário. Settings são pra preferência de fluxo, não pra constante interna. Quando aparecer "expor em settings depois se houver demanda" — descartar. Modo lazy/eager é detalhe técnico — usuário não precisa saber qual está ativo.

1. **Threshold de lazy mode** — fixo `50 MB parquet, 100 MB CSV`, hardcoded. Base empírica: §1.2 (bench 2026-04-24) — multiplier RSS 5-18x em parquet, ~7x em CSV; 2 parquets > 75 MB já dão OOM. Sem setting, agora ou depois.
2. **OPFS namespace** — hash de `(vaultId + filePath)`. Resolve long-path Windows; debuggability via tooling de inspeção, não via path legível.
3. **Sort/filter header em modo lazy** — ativo via SQL DuckDB. Decisão original já consolidada em §2.2 (Opção B descartada por matar batch coding por filter, caso central).
4. **Search global do AG Grid em lazy** — ativo via SQL `LIKE`. Mesmo critério da #3 — UX uniforme em lazy/eager.
5. **QDPX export de arquivo lazy** — streaming completo via DuckDB pra dentro do zip writer. Sem aviso "abra em modo eager pra exportar" (workaround quebrado de UX).
6. **Feature flag** — constante hardcoded durante dev (Fases 1-5) pra alternar caminho novo vs antigo. **Nunca** vira setting do usuário. Quando bake-in tá pronto na Fase 6, lazy é o default e o código antigo é deletado.
7. **`sourceRowId` strategy** — `ROW_NUMBER() OVER()` persistido como `__source_row`. Justificativa em §6.10 + §7.1 (parquet bem formado tem ordem determinística; alternativas hash/PK são caras ou raras). Premissa cravada.
8. **`textExtractor` em modo lazy** — coberto via query SQL DuckDB (UNNEST + GROUP BY + LIMIT). Streaming aggregation nativo, mais barato que o caminho atual (read CSV inteiro em JS). Filtro de stop words PT/EN diferido (entra com revisão da UI do Analytics, fora do escopo deste design).
9. **Mocks DuckDB-Wasm em jsdom** — interface TS `RowProvider` que abstrai "buscar rows" (DuckDB é uma implementação, mock é outra). Testes consomem a interface mockada, não tocam DuckDB. Suite separado de integração roda DuckDB real e pula em jsdom.

---

## 10. Riscos e mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| DuckDB-Wasm bug específico contexto Obsidian (sem precedente) | Médio | Alto | Cada peça (WASM, Worker, OPFS) tem precedente isolado. Bug é integração, debugável. |
| Performance single-thread decepciona em arquivo muito grande | Médio | Médio | EH bundle é single-thread por necessidade (sem COI). Aceitar — query 1-3s vs 200ms é diferença viável. |
| OPFS quota exceeded em arquivo > 1-2GB | Baixo | Médio | Detect quota exceeded e mostrar mensagem clara. UI "Manage Cache" (Fase 6) permite remover arquivos cacheados. |
| Hot-reload memory leak | Baixo | Baixo | Cleanup explícito em onunload (Fase 2). |
| Sync vault↔OPFS edge cases (rename, delete externo) | Médio | Baixo | File event listeners + mtime check. |
| ~~Refator async cascateando pra arquivos não previstos~~ **RESOLVIDO POR SEQUÊNCIA** | ~~Alto (Codex review)~~ | ~~Médio~~ | Decisão 2026-05-04: Fase 1 (refactor async) diferida; absorvida na Fase 4 quando consumer real (DuckDB lazy) existir. Cascata fica concentrada onde o uso justifica, não antecipada. |
| `sourceRowId` instável em parquet com ordem não determinística | Baixo | Alto | `ROW_NUMBER() OVER()` assume ordem consistente. Documentar que parquet escrito com múltiplos workers paralelos pode dar `sourceRowId` diferente entre aberturas. Mitigação: persistir `__source_row` no metadata do arquivo cacheado (parquet sidecar) na primeira abertura. |
| Build time aumenta significativamente | Baixo | Baixo | +2-4s em prod build. Watch dev mode quase inalterado. |
| UX progress bar insuficiente em cold start de arquivo grande | Médio (Gemini review) | Médio | Progress bar detalhada: % + bytes copiados / total + ETA estimado. Sem isso, user acha que travou. |
| Mocks DuckDB-Wasm tomam mais que 1 sessão | Médio (Gemini review) | Baixo | Buffer 1-2 sessões na Fase 6. Estratégia em camadas (interface mockável + suite integração separada). |

---

## 11. Estimativa final

**11-13 sessões** distribuídas em 6 fases (Fase 1 absorvida na Fase 4 — decisão 2026-05-04). Pode oscilar pra 14-16 se mocks de DuckDB-Wasm forem mais complexos que o previsto.

| Fase | Trabalho | Sessões |
|---|---|---|
| **0** ✅ | Source row ID estável + migração one-shot vault workbench | 1-2 (feito 2026-05-04) |
| ~~**1**~~ | ~~Refator getMarkerText async + adapter batch resolver~~ — **diferida pra Fase 4** | — |
| **2** | Worker bootstrap + esbuild loaders + Blob URLs + lifecycle + 2 shims (§14.5.1) | 2 |
| **3** | OPFS sync streaming via Node fs (cópia, invalidação, namespace via hash, mtime) | 2 |
| **4** | RowProvider impl real + AG Grid Infinite Row Model + threshold + **async refactor concentrado aqui** | 2.5-3 |
| **5** | Batch coding modal via SQL | 1-2 |
| **6** | Habilitar flag + QDPX/tabularExporter streaming + UI Manage Cache + mocks DuckDB-Wasm + cleanup tests + progress bar detalhada | 2.5-3 |
| **Total** | | **11-13** (era 13-15 antes de absorver Fase 1 → 4) |

---

## 12. Referências

- [DuckDB-Wasm GitHub](https://github.com/duckdb/duckdb-wasm)
- [DuckDBDataProtocol enum](https://shell.duckdb.org/docs/enums/index.DuckDBDataProtocol.html)
- [What do COI and EH mean? (issue #629)](https://github.com/duckdb/duckdb-wasm/issues/629)
- [Obsidian Forum: Can plugins use Web Worker?](https://forum.obsidian.md/t/can-plugins-use-web-worker/81040)
- [Obsidian Forum: WASM in Obsidian Plugin](https://forum.obsidian.md/t/wasm-in-obsidian-plugin/103577)
- [DuckDB-Wasm Deploying docs](https://duckdb.org/docs/current/clients/wasm/deploying_duckdb_wasm)
- [Excalidraw 2.22.1 release (referência de bundle size)](https://github.com/zsviczian/obsidian-excalidraw-plugin/releases/tag/2.22.1)
- ROADMAP.md §"Parquet lazy loading" — calibração empírica e decisão original
- CLAUDE.md §"STATUS: EM DESENVOLVIMENTO — ZERO USUÁRIOS" — premissa de ausência de backcompat

---

## 14. Spike findings (2026-05-03)

Antes de virar a spec da Fase 0, foi feito um spike isolado num plugin separado (`qualia-spike-duckdb` no mesmo workbench) pra validar 3 premissas críticas do design contra o ambiente real (Electron Obsidian Worker + arquivos reais do `safe-mode-test/`). Resultado: **as 9 decisões de §9 se sustentam**, com 2 achados técnicos obrigatórios pra Fase 2 e um adendo na Fase 4.

### 14.1 Massa de teste

Cópia de `~/Desktop/local-workbench/REVIEW/QUALIA SURVEY BACKUPS/...` pra `safe-mode-test/`:

| Arquivo | Tamanho | Rows | Uso |
|---|---|---|---|
| `consolidated_enriched.parquet` | 73 MB | 661 k | Premise A (single-source) |
| `CLUBE-W2_dist-base.parquet` | 28 MB | 637 k | Premise B (eager) |
| `CLUBE-W1_dist-base.parquet` | 78 MB | 1.74 M | Premise B (médio) |
| `Distribution_history_MERGED_2024-12-09_2025-11-27.parquet` | **297 MB** | **2.38 M** | Premise A patológico (concatenated) + Premise B grande |
| `Distribution_history_2025-02-03 _ 2025-05-27.csv` | **387.5 MB** | 998 k | Premise C (OPFS streaming) |

### 14.2 Premise A — `ROW_NUMBER()` stability

**Pergunta:** sourceRowId via `ROW_NUMBER() OVER ()` é determinístico entre aberturas, mesmo em parquet escrito por concatenação/multi-worker? (§6.10 + §10 listavam isso como risco "Baixo / Alto").

**Método:** registra parquet via DuckDB → `CREATE TABLE _run1 AS SELECT row_number() OVER() AS source_row, hash(t) AS row_hash FROM read_parquet(...)` → drop + re-register → mesma query em `_run2` → `JOIN ON source_row` + comparar `row_hash`.

**Resultado:**

| Arquivo | Rows | Run 1 | Run 2 | Verdict |
|---|---|---|---|---|
| 73 MB single-source | 661 k | 2.4s | 1.1s | ✅ STABLE (0 divergent) |
| **297 MB MERGED (patológico)** | 2.38 M | 2.4s | 2.3s | ✅ **STABLE (0 divergent)** |

**Conclusão:** premissa #7 de §9 confirmada empiricamente. Risco residual de §10 (parquet multi-worker) coberto pelo MERGED. Sidecar parquet (mencionado em §10) **não é necessário** na Fase 0 — fica como mitigação latente caso aparecer parquet realmente patológico no futuro.

### 14.3 Premise B — sourceRowId latency

**Pergunta:** `SELECT display_row FROM (...row_number() OVER (ORDER BY ...) ... WHERE source_row=X)` é responsivo o suficiente pra scroll-to-row em modo lazy?

**Método:** 100 lookups aleatórios por arquivo em 2 patterns: (a) direct lookup `WHERE source_row=X` (caso eager simples), (b) sorted scroll-to-row CTE (caso lazy + sort ativo do user).

**Resultado:**

| Tamanho | Rows | Build | Direct p95 | **Sorted p50/p95/p99** |
|---|---|---|---|---|
| 28 MB | 637 k | 0.9s | 1.1ms | 27 / 27 / 43 ms |
| 78 MB | 1.74 M | 1.9s | 1.4ms | 74 / 85 / 137 ms |
| 297 MB | 2.38 M | 5.9s | 5.8ms | **103 / 125 / 214 ms** |

**Conclusão:**
- Direct lookup é trivial (sub-2ms). Click numa row visível na grid não tem overhead.
- Sorted scroll-to-row escala linear com row count. Em 297 MB chegamos a p95=125ms, p99=214ms. **Aceitável mas não imediato** — perceptível como latência se for frequente.
- **Adendo pra Fase 4:** quando user aplica sort, pre-compute o mapping `__source_row → display_row` em uma table auxiliar (custo: 1× scan, equivalente ao build de 5.9s no 297 MB). Scroll-to-row vira O(1) lookup. Mapping invalidado ao mudar sort. Sem isso, p99 de 214ms é a cauda do worst-case.

### 14.4 Premise C — OPFS streaming sem pico de RAM

**Pergunta:** §4.3 do design crava cópia inicial via Node `fs.createReadStream` em chunks de 1MB → `FileSystemWritableFileStream.write` no OPFS, com pico de RAM ~1MB. §6.9 era o risco mais crítico (cold start de arquivo grande). Funciona?

**Método:** copy do CSV de 387.5 MB para OPFS, samplando `performance.memory.usedJSHeapSize` a cada chunk. Depois, registra o `FileSystemFileHandle` via `BROWSER_FSACCESS` no DuckDB e roda `SELECT COUNT(*)`.

**Resultado:**

| Métrica | Resultado |
|---|---|
| Copy time (387.5 MB, 388 chunks) | **1.18s** (328 MB/s) |
| Heap antes | 291.1 MB |
| **Heap pico durante copy** | **291.1 MB** (Δ = **0.0 MB**) |
| Heap depois | 291.1 MB |
| DuckDB `COUNT(*)` via BROWSER_FSACCESS | 998 k rows / 1.48s |

**Conclusão:** §6.9 sobre-validado. `for await` do Node `ReadStream` libera cada chunk pro GC imediatamente após o write — heap nem flutua. `BROWSER_FSACCESS` em Electron Obsidian Worker funciona, sem precedente público anterior. Premissa do design 100% confirmada.

### 14.5 Achados obrigatórios pra implementação

#### 14.5.1 Dois shims no Worker bootstrap (Fase 2)

Sem precedente documentado em plugin Obsidian. **Sem esses dois patches o WASM nem instancia.** Devem entrar como código non-skip da Fase 2:

```js
// Shim 1: js-sha256 (transitivo do duckdb-wasm) detecta ambiente Node
// dentro do Electron Worker porque `process` global existe e
// `process.type !== "renderer"`. Faz o source usar `Buffer` inexistente
// → "Cannot read properties of undefined (reading 'from')".
// Mutar process.type direto não funciona — é read-only em Electron Worker.
// Solução: substitui `self.process` inteiro via Object.defineProperty antes
// do source rodar.
try {
  Object.defineProperty(self, 'process', {
    value: { type: 'renderer', versions: {}, env: {} },
    writable: true, configurable: true
  });
} catch (e) { try { self.process = undefined; } catch (e2) {} }

// Shim 2: DuckDB tenta `new Request(url)` + `fetch(url)` em
// `WebAssembly.instantiateStreaming` → `Request is not defined` no Worker
// do Electron renderer. O source tem fallback pra XMLHttpRequest se
// `WebAssembly.instantiateStreaming` for undefined. Forçamos o fallback.
try {
  Object.defineProperty(WebAssembly, 'instantiateStreaming', {
    value: undefined, writable: true, configurable: true
  });
} catch (e) {}
```

Esses shims são pre-pended ao source do worker antes de criar o `Blob([source])` que vira a URL do `new Worker(blobUrl)`. Não funcionam via `importScripts` wrapper nem mutação direta — testado.

#### 14.5.2 Adendo Fase 4: pre-compute display_row mapping ao aplicar sort

Quando user muda critério de sort em modo lazy:
1. Build table auxiliar `_display_map` com `(source_row, display_row)` resultado do `row_number() OVER (ORDER BY <user_sort>)`. Custo único: 1× scan da fonte.
2. Scroll-to-row consulta `_display_map` direto: `SELECT display_row FROM _display_map WHERE source_row = X`. Custo: O(1).
3. Mapping invalidado ao mudar sort.

Sem isso, navegação tem cauda de p99 ~200ms em arquivo grande. Com isso, scroll-to-row é instantâneo.

#### 14.5.3 Throughput de cópia validado

SSD entrega ~330 MB/s. Pra arquivo de 1 GB: ~3s de copy esperado. Progress bar detalhada (§4.5) ainda é necessária pra arquivos > 2 GB ou disco HDD — UX assume linear scaling.

### 14.6 O que o spike NÃO cobriu (riscos remanescentes)

- **Concorrência** — múltiplos arquivos lazy abertos ao mesmo tempo. WASM 32-bit pointer tem teto de ~2GB (§6.8). Aparece só em uso real.
- **Hot-reload em ciclo** — testado na sessão (boot/teardown único). Vazamento de Worker/Blob URLs em N reloads não foi medido.
- **Quota OPFS exceeded** — disco cheio durante copy. Mitigação está em §6.3 (UI Manage Cache).
- **Plugin Obsidian disabled enquanto query roda** — race entre teardown e onMessage do worker.

Esses ficam como riscos da Fase 6 (UI Manage Cache + cleanup tests + flag enable).

---

## 13. Histórico de revisões

| Data | Revisor | Mudanças |
|---|---|---|
| 2026-04-30 | Claude (sessão original) | Primeira versão consolidando discussão técnica |
| 2026-04-30 | Gemini CLI (review) | Validou stack + 3 ajustes: UI Manage Cache, mocks 1-2 sessões, progress bar detalhada |
| 2026-04-30 | Codex (review) | 4 ajustes técnicos críticos: source row ID estável (Fase 0), adapter batch resolver (Fase 1 expandida), cópia streaming via Node fs (substitui readBinary), tabularExporter incluído / textExtractor out-of-scope. Estimativa 11-12 → 13-15 sessões. |
| 2026-04-30 | Cross-review com `qualia-fit.md` | 4 anotações de fronteira: (1) Fase 0 sourceRowId é **dual-purpose** (parquet lazy + LLM tabular); (2) Fase 2 Worker pattern é **infra reutilizável** (DuckDB + LLM provider + Whisper); (3) Fase 5 batch coding modal é **prompt-target** pro LLM, não só aplicação manual; (4) AI staging por aplicação + audit trail por aplicação são **out-of-scope** (pertencem ao qualia-fit). |
| 2026-05-03 | Marlon (review #9 do §9) | Decisão #8 invertida: `textExtractor` (word cloud) entra em modo lazy via SQL DuckDB (UNNEST + GROUP BY) — UX uniforme em lazy/eager. Justificativa antiga ("vira nuvem de stop-words") era hedge defensivo. Stop words filter diferido pra revisão da UI do Analytics. |
| 2026-05-03 | Marlon (cravar §9 inteiro) | 9 decisões cravadas (não mais "pendentes"). Regra geral: detalhe técnico nunca vira setting do usuário ("settings depois se houver demanda" descartado como hedge). #1 threshold hardcoded sem setting; #3, #4 sort/filter/search via SQL (já decidido em §2.2); #5 streaming completo no QDPX; #6 feature flag é constante de dev, não setting; #7 sourceRowId via `ROW_NUMBER()` cravado; #9 mocks via interface `RowProvider` + suite de integração separado. Próxima sessão ataca spec da Fase 0 direto. |
| 2026-05-03 | Spike (Marlon + Claude) | Validação empírica das 3 premissas críticas em plugin separado (`qualia-spike-duckdb` no workbench). **Resultados em §14.** A: ROW_NUMBER stable em parquet patológico MERGED 297MB · B: sorted scroll-to-row p95=125ms em 297MB → adendo Fase 4 (pre-compute display_row mapping) · C: OPFS streaming via Node fs com heap Δ=0MB · 2 shims obrigatórios pra Worker em Electron descobertos (process fake + nuke instantiateStreaming) — entram como código non-skip da Fase 2. §9 inteiro permanece cravado. |
| 2026-05-04 | Fase 0 mergeada + Fase 1 diferida | Fase 0 (sourceRowId) ✅ feita e mergeada. Decisão imediatamente após: **Fase 1 diferida pra ser absorvida pela Fase 4**. Justificativa: em modo eager (atual), `getMarkerText` sync funciona porque `rowDataCache` está em memória — async sem consumer real é refactor antecipado, contra a regra do CLAUDE.md "don't refactor for hypothetical future requirements". Cascata (~12-15 arquivos atravessando `core/`) ficaria sem motivação concreta agora. Quando Fase 4 chegar com `RowProvider` real lendo de DuckDB, async vira necessário e o refactor acontece com consumer existente justificando. Risco "Refator async cascateando" do §10 marcado como **resolvido por sequência**. Total recalibrado 13-15 → 11-13 sessões. Próximo passo: Fase 2 (DuckDB bootstrap). |

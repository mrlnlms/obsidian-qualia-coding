# Manual tests — Fase 6 (Parquet/CSV lazy loading)

Checklist de testes manuais para validar os 5 slices da Fase 6 num vault real.
Os testes integration cobrem a lógica de domínio; este doc cobre o que só dá pra
ver com Obsidian rodando + arquivos reais.

> **Pré-requisito**: build atualizado em `main.js` (rode `npm run build` se ainda
> não está). Reload do plugin (Settings → Community plugins → toggle off/on)
> garante que mudanças hot-reload-only não interfiram.

## Slice A — Open / reveal / labels redondos

### A.1 Open de CSV pequeno (eager direto, sem popup)
- [ ] Abre um `.csv` com menos de 100 MB (ex: `items.csv`)
- [ ] Carrega direto, sem mostrar popup "Lazy / Eager / Cancel"
- [ ] Grid AG aparece com headers + rows visíveis

### A.2 Open de parquet grande (lazy direto, sem popup)
- [ ] Abre um `.parquet` com mais de 50 MB (ex: `safe-mode-test/consolidated_enriched.parquet`)
- [ ] Carrega via lazy mode (banner "Copying to lazy cache..." aparece)
- [ ] Sem popup pedindo escolha de modo
- [ ] Após copy + boot, grid AG aparece com `lazy mode` badge no infobar

### A.3 Reveal de marker em parquet lazy
- [ ] Codifica algum marker num parquet aberto em lazy mode
- [ ] Fecha o parquet (file-leaf ou Ctrl+W)
- [ ] No sidebar/Code Detail, clica `file-search` icon ao lado do marker
- [ ] Parquet reabre, scrolla **vertical** pra row alvo
- [ ] Scrolla **horizontal** até a coluna do marker
- [ ] Célula alvo dá um **flash** visual (highlight breve com fade)
- [ ] Se a row está no fim do dataset (>50 mil), o flash pode levar 1–2s pra
      aparecer (pageblock async) — espere antes de declarar bug

### A.4 Pre-populate de labels no startup
- [ ] Antes de abrir qualquer CSV/parquet, abre o painel Code Explorer ou Code Detail
- [ ] Markers em arquivos CSV/parquet **não-abertos** mostram **conteúdo da célula** como label (ex: `PEDRO HARRY`, `Excellent qualitative...`)
- [ ] Apenas markers em arquivos lazy SEM cache OPFS caem no fallback `Row X · Column`
- [ ] Sem erros no console (warning de papaparse "Duplicate headers found and renamed" é benigno e vem de dentro da lib)

### A.5 Tolerância a CSV malformado
- [ ] Abre um CSV com colunas extras em alguma linha (ex: `Distribution_history_*.csv`)
- [ ] DuckDB carrega normalmente, mostra warning no console mas grid renderiza
- [ ] Coluna numérica/timestamp com valor "false" mid-arquivo não trava o open

---

## Slice B — Exports lazy-aware

### B.1 Tabular CSV export com markers em parquet
**Pré-condição**: ter pelo menos 1 marker codificado num arquivo `.parquet`.

- [ ] Abre Settings → Qualia Coding → "Tabular export for external analysis" → `Open export dialog`
- [ ] Confirma exportação com `qualia-project.zip` (ou nome customizado)
- [ ] Abre o zip resultante, extrai `segments.csv`
- [ ] **Verifica**: linha do marker em parquet tem coluna `text` **preenchida** com o conteúdo da célula
- [ ] Antes do fix dessa fase, essa coluna vinha em branco silenciosamente

### B.2 QDPX export com `Include sources`
- [ ] Abre Settings → Qualia Coding → "Export project (QDPX)"
- [ ] Confirma `Include source files` ligado
- [ ] Exporta, abre o `.qdpx` (renomeia pra `.zip` ou usa `unzip` direto)
- [ ] **Verifica**:
  - [ ] Pasta `sources/` contém o `.parquet` ou `.csv` codificado (`<guid>.parquet`)
  - [ ] `project.qde` (XML) tem `<qualia:TabularSource ...>` com filhas `<qualia:CellSelection>`
  - [ ] `<Project>` root declara `xmlns:qualia="urn:qualia-coding:extensions:1.0"`
  - [ ] Outros tipos (PDF/áudio/vídeo) continuam saindo como antes

### B.3 QDPX export sem `Include sources`
- [ ] Mesmo fluxo, mas desliga `Include source files`
- [ ] Zip resultante NÃO tem `sources/` pra CSV/parquet
- [ ] `project.qde` ainda tem `<qualia:TabularSource>` mas com `path="relative://..."`

### B.4 RAM em export de arquivo grande
- [ ] Codifica markers num parquet/CSV >100 MB
- [ ] Roda Tabular CSV export
- [ ] Open Activity Monitor / htop em paralelo: pico de RAM do Obsidian deve ficar comportado (não duplicar/triplicar o tamanho do file). Antes do fix, papaparse no arquivo inteiro inflava 5–18×.

---

## Slice C — Progress bar + Manage cache UI

### C.1 Progress bar com ETA durante cold copy
**Pré-condição**: parquet/CSV >50 MB que **nunca** foi aberto na sessão (ou foi limpo do cache em C.3).

- [ ] Abre o arquivo
- [ ] Banner mostra "Copying to lazy cache · X% — N.N / T.T MB · ETA Ms" durante a cópia
- [ ] ETA aparece **depois** dos primeiros ~250ms (estimativa nos primeiros frames é ruidosa)
- [ ] ETA some quando atinge 100%

### C.2 Settings UI "Lazy cache (large CSV/parquet)"
- [ ] Abre Settings → Qualia Coding → scroll até a seção "Lazy cache"
- [ ] Lista mostra **quantos** arquivos estão cached + **MB total**
- [ ] Cada entry tem: path original do vault, tamanho, "last sync" timestamp, botão `Clear`
- [ ] Se nenhum arquivo cached, mostra "No cached files."

### C.3 Clear individual + Clear all
- [ ] Botão `Clear` numa entry remove só aquela do OPFS (mensagem Notice confirma)
- [ ] Lista re-renderiza removendo a entry
- [ ] Botão `Clear all` (warning vermelho) limpa tudo, mostra Notice "Cleared N cached files"
- [ ] Após clear, abre o mesmo parquet → recopia pro OPFS (cold start de novo, com progress bar)

### C.4 Auto-cleanup ao fechar arquivo (default behavior)
**Comportamento**: ao fechar a leaf de um arquivo lazy, o OPFS daquele arquivo é wipado automaticamente. Disco fica previsível — sem cache invisível crescendo.

- [ ] Abre um parquet lazy → confirma na lista de Settings que aparece como cached
- [ ] Fecha a leaf (Ctrl+W ou X no tab)
- [ ] Volta em Settings → "Lazy cache" → entry **sumiu** da lista
- [ ] Reabrir o mesmo parquet → cold start de novo (progress bar aparece)
- [ ] Edge case: 2 leaves abertos com mesmo arquivo → fechar UMA mantém OPFS (refcount). Fechar a última remove.
- [ ] Botões `Clear individual` / `Clear all` ainda funcionam como rede de segurança pra órfãos de crash

---

## Slice D — Bundle compress (49 MB → 14.2 MB)

### D.1 DuckDB ainda boota após gzip
- [ ] Reload do plugin (toggle off/on em Settings → Community plugins)
- [ ] Abre qualquer parquet/csv lazy
- [ ] Sem erro "WASM instantiation failed" no console
- [ ] Tempo de boot perceptível? Custo do gunzip é ~10–30ms one-shot — não bloqueia UI

### D.2 Tamanho do bundle distribuído
- [ ] `ls -la main.js` deve mostrar arquivo de ~14 MB (era 49 MB antes)
- [ ] Plugin instala e carrega normal num vault novo

---

## Slice E — Round-trip QDPX (export → import)

### E.1 Re-import de QDPX exportado
**Pré-condição**: ter feito B.2 (QDPX export com `Include sources` ligado), com pelo menos 1 marker em CSV/parquet.

- [ ] Em outro vault (ou após `Clear all data` do plugin no atual), abre Settings → "Import REFI-QDA project"
- [ ] Seleciona o `.qdpx` exportado
- [ ] Confirma import. Notice mostra contagem de markers importados
- [ ] **Verifica**:
  - [ ] CSV/parquet original aparece no vault (`Imported QDPX/<filename>`)
  - [ ] Markers reaparecem no Code Explorer com mesmo código + memo + magnitude
  - [ ] Abre o arquivo: markers em sidebar com excerpt do conteúdo
  - [ ] Reveal de marker funciona (scrolla pra row + flash)

### E.2 Round-trip preserva segment vs row marker
- [ ] No QDPX exportado, segment markers têm `qualia:from` / `qualia:to`
- [ ] Row markers não têm `qualia:from` / `qualia:to`
- [ ] Após reimport, segment marker tem `from`/`to` (excerpt da cell), row marker abrange a célula inteira

---

## Bugs conhecidos / não tratados nesta fase

- **"Duplicate headers found and renamed"** — papaparse warning interno (vem de dentro do worker, não dá pra silenciar). Aparece quando o CSV tem colunas com mesmo nome.
- **Round-trip de markers em parquet sem `Include sources`** — sem o source bundle, o reimporter ainda cria os markers, mas o arquivo não fica no vault destino. Marker fica órfão até o user manualmente colocar o parquet original lá.
- **CSVs com encoding não-UTF8** — papaparse default lê como UTF-8. CSVs em latin-1/cp1252 caem no fallback de DuckDB que é mais tolerante.

---

## Próximo bump de versão

Quando o checklist acima passar inteiro, vale tagear release. Sugestão:
- **0.2.0** (minor) — capability shift: lazy automatic + QDPX embedding + bundle 49→14MB
- **0.1.3** (patch) se preferir conservador

Bump em `manifest.json`, `versions.json`, `package.json`, atualiza `CHANGELOG.md`,
push tag — `.github/workflows/release.yml` cuida do GitHub Release.

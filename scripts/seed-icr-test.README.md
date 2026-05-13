# Seed ICR test — corpus completo de smoke

Massa sintética cravada em **4 engines** (markdown, csv, audio, video) pra smoke completo de Compare Coders **sem precisar codar nada à mão**.

Estratégia: **hard reset** do coding (coders, codes, markers) + cria arquivos `_icr-test/*` próprios (transcript.md, survey.csv, audio-sample.mp3, video-sample.mp4). Settings do plugin (audio/video viewState, theme, comparisons salvas) ficam preservados.

Visão de futuro (2026-05-13): cenários com α/κ esperado calculável servem de ground truth pra **benchmark de LLM coder automático**. Mesma convenção `_seed_<thematic>_*` deve ser adotada em outros seeds futuros.

## Comandos

```bash
# Popula corpus (idempotente — pode rodar várias vezes)
npm run seed:icr-test

# Zera coding (mantém arquivos físicos e settings)
npm run seed:icr-test:clean

# Preview sem persistir
node scripts/seed-icr-test.mjs --dry-run
```

⚠️ **FECHE OBSIDIAN antes de rodar.** Plugin ativo sobrescreve `data.json` com snapshot em memória.

## O que é criado

### 3 coders sintéticos
- Coder A (`_seed_icr_test_coder_a`)
- Coder B (`_seed_icr_test_coder_b`)
- Coder C (`_seed_icr_test_coder_c`) — habilita teste de Fleiss N=3

### 4 códigos (paleta cravada)
| ID | Nome | Cor |
|----|------|-----|
| `_seed_icr_test_code_tema_a` | Tema A | azul `#5B9BD5` |
| `_seed_icr_test_code_tema_b` | Tema B | laranja `#ED7D31` |
| `_seed_icr_test_code_tema_c` | Tema C | verde `#70AD47` |
| `_seed_icr_test_code_tema_d` | Tema D | roxo `#7030A0` |

### 4 arquivos owned em `_icr-test/`
- `transcript.md` — texto P&R sintético (20 linhas)
- `survey.csv` — 5 rows (id, respondent, comment, categoria)
- `audio-sample.mp3` — cópia de `notes-for-anything/smoke/song-renamed.mp3` (359s)
- `video-sample.mp4` — cópia de `notes-for-anything/smoke/clip.mp4` (11s)

### 34 markers em 15 cenários

#### Markdown — 9 markers (4 cenários) em `transcript.md`

| Cenário | Coders | Posição (line, ch) | Códigos | O que valida |
|---------|--------|-------------------|---------|--------------|
| **M1** full agreement | A, B | line 4, ch 3–50 | A / A | Cohen κ=1 base. R1 resposta. |
| **M2** boundary diff | A, B | A: line 8, ch 3–100<br>B: line 8, ch 20–90 | A / A | overlap parcial em chars. R2 resposta. |
| **M3** Fleiss N=3 code diff | A, B, C | line 12, ch 3–80 | B / C / B | Fleiss κ com 3 coders, 1 discordante. R3 resposta. |
| **M4** multi-label | A, B | line 16, ch 3–60 | {A, B} / {A} | δ_jaccard vs δ_nominal. R4 resposta. |

#### CSV — 4 markers (2 cenários) em `survey.csv`

| Cenário | Tipo | Coders | Posição | Códigos | O que valida |
|---------|------|--------|---------|---------|--------------|
| **CSV1** segment full | segment | A, B | row 0, col `comment`, chars 0–50 | A / A | Cohen char-level em célula. Comment da Ana. |
| **CSV2** row code diff | row | A, B | row 1, col `categoria` | A / B | Cohen categorical row-level. Categoria do Bruno. |

#### Audio — 12 markers (6 cenários) em `audio-sample.mp3` (359.92s)

| Cenário | Coders | Posição (s) | Códigos | O que valida |
|---------|--------|-------------|---------|--------------|
| **C1** full agreement | A, B | [10.0, 20.0) | A / A | α=1 em qualquer resolução |
| **C2** partial overlap | A, B | A: [30.0, 40.0)<br>B: [35.0, 45.0) | A / A | 5s common em 10s spans |
| **C3** **sub-segundo** | A, B | A: [60.0, 60.5)<br>B: [60.6, 61.0) | A / A | **gap #2**: 1s mostra agreement falso, ≥100ms mostra real |
| **C4** **sub-100ms** | A, B | A: [120.05, 120.15)<br>B: [120.07, 120.13) | A / A | **gap #2**: só visível em 10ms |
| **C5** code diff | A, B | [180.0, 200.0) | A / **D** | overlap espacial perfeito, códigos diferentes; ativa Tema D |
| **C6** **sparse coding** | A, B | [300.0, 305.0) | A / A | **gap #1b**: 5s coded em 359s — MediaSourceSize provider testa P_o real |

#### Video — 9 markers (4 cenários) em `video-sample.mp4` (11.82s)

| Cenário | Coders | Posição (s) | Códigos | O que valida |
|---------|--------|-------------|---------|--------------|
| **V1** full agreement | A, B | [1.0, 2.5) | A / A | Cohen κ=1 base temporal (azul) |
| **V2** partial overlap | A, B | A: [3.0, 5.0)<br>B: [4.0, 6.0) | **B / B** | overlap parcial 1s em 2s spans (laranja) |
| **V3** sub-segundo | A, B | A: [6.5, 6.8)<br>B: [6.9, 7.2) | A / A | gap #2 — visível ≥100ms |
| **V4** Fleiss N=3 code diff | A, B, C | [7.5, 9.0) | **C / D / C** | Fleiss κ temporal com discordante (verde/roxo/verde) |

## Cobertura de coeficientes × distâncias

| Coeficiente | Cenários que validam |
|-------------|----------------------|
| **Cohen κ** | M1, M2, CSV1, CSV2, C1, C2, C5, V1, V2, V3 |
| **Fleiss κ N=3** | **M3** (markdown) + **V4** (video) |
| **α nominal** | todos N≥2 |
| **α com δ_jaccard / δ_MASI** | **M4** (multi-label markdown) |
| **α-binary** | M2 (boundary), C2/C3/C4 (sub-segundo), C6 (sparse) |
| **cu-α** | M2, C2 (regiões boundary, intersection coders) |

## Smoke step-by-step

1. **Feche Obsidian** se aberto
2. `npm run seed:icr-test`
3. Reabra Obsidian
4. Abra `_icr-test/transcript.md` → veja 9 markers coloridos (azul A, laranja B, verde C)
5. Abra `_icr-test/survey.csv` → 2 segment markers em row 0 + 2 row markers em row 1
6. Abra `_icr-test/audio-sample.mp3` → 12 regions na waveform
7. Abra `_icr-test/video-sample.mp4` → 4 regions
8. **Open Compare Coders view** (palette)
9. Default scope: 3 coders + 4 codes + 4 engines automaticamente

### Validação dos gaps

**Gap #2 — resolução temporal:**
- Toggle chip `[1s] [100ms] [10ms]` no toolbar
- `1s → 100ms`: α deve **DIMINUIR** (C3 + V3 ganham disagreement real)
- `100ms → 10ms`: α deve **DIMINUIR MAIS** (C4 ganha disagreement nas extremidades)

**Gap #1b — MediaSourceSize:**
- Foque escopo em `audio` só
- Observe métricas de α/κ
- Cenário C6 (sparse coding 5s/359s) faz o background ∅ pesar nas métricas — efeito visível em α-binary e cu-α

**Fleiss N=3:**
- Habilite escopo só com `markdown` engine
- Veja Fleiss κ computado (precisa N≥3)
- Compare com Cohen κ pairwise (matriz 3×3) — Fleiss deveria dar valor médio aproximado

**Multi-label / δ alternativo:**
- Foque em M4 (line 16 do transcript)
- Toggle chip `δ:` no toolbar (`Jaccard` vs `MASI` vs `nominal`)
- α com Jaccard deve diferir do nominal (M4 tem set assimétrico {A,B} vs {A})

## Reversibilidade

### Cleanup parcial (manter arquivos físicos, zerar coding)
```bash
npm run seed:icr-test:clean
```

### Rollback completo (restaurar estado anterior ao seed)
```bash
# Achar backup mais recente
ls -t obsidian-qualia-coding/data_synthetic_bak/data.json.pre-seed-icr-test.*.bak | head -1

# Copiar sobre data.json (FECHE OBSIDIAN primeiro)
cp obsidian-qualia-coding/data_synthetic_bak/data.json.pre-seed-icr-test.<timestamp>.bak \
   .obsidian/plugins/obsidian-qualia-coding/data.json
```

### Deletar arquivos físicos
```bash
rm -rf _icr-test/
```

## Limites conhecidos

- **PDF e Image:** não cobertos nesta versão. Cenário separado pra cada (PDF exige parse de pdfjs com offsetIndex/endIndex; image exige bbox coords com IoU controlado).
- **Audit log:** zerado no hard reset. Se você tinha histórico relevante, restore via backup.
- **Source hashes:** zerado — caches de hash são reconstruídos no próximo open dos arquivos.
- **Sub-10ms:** mismatch de C4 é 20ms nas extremidades. Pra demonstrar caso "≤10ms é fronteira do snap-to-int", veria `SNAP_EPS=1e-9` em `src/core/icr/textRange.ts`.

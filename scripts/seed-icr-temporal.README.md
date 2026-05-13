# Seed ICR temporal — cenários cravados

Massa sintética pra validar **Gap #2** (resolução temporal parametrizável: 1s/100ms/10ms) e **Gap #1b** (`MediaSourceSize` provider) entregues no release 0.6.1.

Cada cenário é desenhado com **números conhecidos** — α/κ esperado é calculável pela fórmula canônica Krippendorff (2018, cap. 11). Serve também como **ground truth pra benchmark futuro de LLM coder** (visão de futuro 2026-05-13).

## Como rodar

```bash
# Seed (idempotente — pode rodar várias vezes)
npm run seed:icr-temporal

# Dry-run (mostra sem persistir)
node scripts/seed-icr-temporal.mjs --dry-run

# Reverter (remove APENAS entries com prefixo _seed_icr_temporal_*)
npm run seed:icr-temporal:clean
```

⚠️ **FECHE OBSIDIAN antes de rodar.** Plugin ativo pode sobrescrever `data.json` com snapshot em memória. Reabra após terminar.

## O que é criado

- **2 coders sintéticos:** "Seed Coder A" (id `_seed_icr_temporal_coder_a`), "Seed Coder B" (id `_seed_icr_temporal_coder_b`)
- **2 códigos sintéticos:** "Seed Tema A" (azul `#5B9BD5`), "Seed Tema B" (laranja `#ED7D31`)
- **2 arquivos copiados pra raiz do vault:** `_icr-test/audio-sample.mp3` (359s), `_icr-test/video-sample.mp4` (11s)
- **18 markers temporais** distribuídos em 9 cenários (6 audio + 3 video)

Backup automático do `data.json` em `obsidian-qualia-coding/data_synthetic_bak/data.json.pre-seed-icr-temporal.<timestamp>.bak`.

## Cenários audio (`_icr-test/audio-sample.mp3`, 359s)

| Cenário | Coder A | Coder B | Códigos | O que valida |
|---------|---------|---------|---------|--------------|
| **C1** | [10.0, 20.0)s | [10.0, 20.0)s | tema-A / tema-A | Full agreement perfeito — α=1 em qualquer resolução |
| **C2** | [30.0, 40.0)s | [35.0, 45.0)s | tema-A / tema-A | Partial overlap (5s common em 10s spans) — visível em todas resoluções |
| **C3** | [60.0, 60.5)s | [60.6, 61.0)s | tema-A / tema-A | **Sub-segundo disagreement** — 1s mostra agreement falso, ≥100ms mostra real |
| **C4** | [120.05, 120.15)s | [120.07, 120.13)s | tema-A / tema-A | **Sub-100ms disagreement nas extremidades** — só visível em 10ms |
| **C5** | [180.0, 200.0)s | [180.0, 200.0)s | tema-A / **tema-B** | Code disagreement (overlap espacial perfeito, códigos diferentes) |
| **C6** | [300.0, 305.0)s | [300.0, 305.0)s | tema-A / tema-A | **Sparse coding** — testa `MediaSourceSize` provider (P_o com 359s real vs 305s max-range inflado) |

### Comportamento esperado por resolução

**Em `1s` (default ATLAS.ti):**
- C3 e C4 viram tick `[60,61)` e `[120,121)` — **falso agreement total** (ambos coders no mesmo tick)
- α aparente mais alto que real (sub-segundo invisível)

**Em `100ms`:**
- C3: A=`[600, 605)`, B=`[606, 610)` → **disagreement real visível** (ticks disjuntos)
- C4: A=`[1200, 1202)`, B=`[1200, 1202)` → **ainda agreement** (snap-to-int absorve diferença <100ms)
- α menor que em 1s (C3 ganha penalty); C4 continua "ok"

**Em `10ms`:**
- C3: idem, ticks bem separados
- C4: A=`[12005, 12015)`, B=`[12007, 12013)` → **disagreement nas extremidades** (4 ticks de mismatch)
- α menor ainda que em 100ms (C4 ganha penalty)

## Cenários video (`_icr-test/video-sample.mp4`, 11s)

| Cenário | Coder A | Coder B | Códigos | O que valida |
|---------|---------|---------|---------|--------------|
| **V1** | [1.0, 3.0)s | [1.0, 3.0)s | tema-A / tema-A | Full agreement |
| **V2** | [4.0, 7.0)s | [5.5, 8.5)s | tema-A / tema-A | Partial overlap 1.5s common |
| **V3** | [9.0, 9.5)s | [9.6, 10.0)s | tema-A / tema-A | Sub-segundo — visível ≥100ms |

## Como validar visualmente

1. **Reload Obsidian** (Cmd+R) após rodar o seed
2. Abra **Compare Coders** (palette: "Compare Coders")
3. Configure escopo:
   - **Engines:** audio + video (chips filter)
   - **Coders:** "Seed Coder A" + "Seed Coder B"
   - **Códigos:** "Seed Tema A" + "Seed Tema B"
4. Encontre o chip **"resolução temporal: [1s] [100ms] [10ms]"** no toolbar (aparece só quando audio/video no escopo)
5. **Sequência de validação:**
   - Marque `1s` → observe valores α / κ (Cohen, Fleiss, etc.)
   - Marque `100ms` → α deve **DIMINUIR** (C3/V3 ganham disagreement)
   - Marque `10ms` → α deve **DIMINUIR MAIS** (C4 ganha disagreement)
   - Se α aumentar entre `1s → 100ms`, há bug
6. **Para validar Gap #1b** (MediaSourceSize): compare métricas COM o plugin instalado (que tem `MediaSourceSize` ativo) vs valores manuais — `totalUnits` interno deve refletir 359s, não 305s

## Convenção de naming (importante pra LLM downstream)

Todos os IDs criados começam com `_seed_icr_temporal_`:

```
_seed_icr_temporal_coder_a / _coder_b
_seed_icr_temporal_code_tema_a / _code_tema_b
_seed_icr_temporal_audio_c1_a / _c1_b / _c2_a / ... / _c6_b   (12 audio markers)
_seed_icr_temporal_video_v1_a / _v1_b / ... / _v3_b           (6 video markers)
```

**Cleanup é sempre safe** (filtra por prefixo, não toca dados do user). Convenção replicável: outros seeds devem usar `_seed_<thematic>_*`.

## Limites conhecidos

- **Sub-100ms (C4):** o snap-to-int (epsilon 1e-9) em `extractMediaRange` absorve diferenças muito pequenas — pra demonstrar fielmente o effect 100ms→10ms precisamos de mismatch >5ms nas extremidades. C4 tem 20ms cada extremidade (-0.02s no início, +0.02s no fim).
- **`MediaSourceSize` provider:** lê duração via `HTMLMediaElement.duration` com timeout 5s. Se o vault tiver arquivos de mídia muito lentos pra carregar metadata, pode fallback pra `max(range.to)`. Pra validar P_o real, conferir devtools console que o provider retornou 359s pra audio + 11s pra video.
- **Snap epsilon e cenários micro:** mudar `SNAP_EPS` em `src/core/icr/textRange.ts` afeta C4. Documentar se mudar.

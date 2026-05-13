# ICR pra coding temporal (audio/video) — methodology

> **Audiência:** pesquisador escrevendo seção de métodos em paper, ou avaliando se o plugin é defendable pra publicação.
>
> **Status:** stable, refletindo implementação Slice 1/Fase 2 (`textRange.ts:extractMediaRange` + `coefficients/*` compartilhados).
>
> **Spec autoritativo:** `docs/superpowers/specs/2026-05-09-icr-compare-coders-design.md` (Fase 2 — audio/video)
>
> **Companion docs:** `docs/ICR-METHODOLOGY.md` (bbox 2D), `docs/ICR-SET-VALUED-METHODOLOGY.md` (multi-código por região), `docs/ICR-LINEAR-METHODOLOGY.md` (markdown/PDF/CSV segment), `docs/ICR-CATEGORICAL-METHODOLOGY.md` (CSV cod row).

---

Este documento descreve o algoritmo de Inter-Coder Reliability (ICR) implementado no plugin Qualia Coding pras duas engines temporais: **audio** e **video**. Markers em ambos os casos representam um intervalo `[from, to)` na timeline do arquivo, medido em segundos. O motor κ as trata uniformemente — o `markerType` apenas identifica o tipo de mídia pra fins de scoping.

## Como funciona, em uma página

Quando você roda Compare Coders sobre markers de audio ou video de N codificadores, o plugin executa:

1. **Normaliza** cada marker pra um `TextRange = (fileId, locator, from, to)`, onde `locator ∈ {'audio', 'video'}` e os bounds são **inteiros em segundos**. Conversão: `from_int = ⌊from⌋`, `to_int = ⌈to⌉` (arredondamento conservador — cobre todo segmento parcial).
2. **Explode** cada marker pra um conjunto de segundos individuais. Pra `from=10.3, to=15.7`, gera 6 unidades — os segundos 10, 11, 12, 13, 14 e 15. Cada segundo vira a **unidade analítica** do κ.
3. **Universo de unidades** = todos os segundos cobertos por algum marker em algum coder do escopo (mais precisamente, `[0, max(range.to))`). Segundos não codificados entram no universo com rating `__none__`.
4. **Reduz** o conjunto de códigos de cada marker a 1 código por segundo — pega o primeiro código em ordem alfabética. Estado atual do código (ver "Limitações conhecidas §1").
5. **Aplica** os 5 coeficientes (Cohen κ pareado, Fleiss κ, Krippendorff α nominal, α-binary, cu-α) sobre a matriz segundo × coder × rating resultante.

O motor κ pra temporal **reutiliza exatamente** o mesmo código que opera sobre texto-likes — a unidade `pos` no `KappaInput` é agnóstica (chars em texto, segundos em audio/video). A documentação dos coeficientes em `docs/ICR-LINEAR-METHODOLOGY.md` se aplica integralmente; este doc cobre apenas as decisões específicas de temporal.

> **Multi-código por marker — comportamento alvo documentado em doc separado:** quando um marker temporal carrega múltiplos códigos, o roadmap (refactor C) prevê tratamento como conjunto indivisível com distância Jaccard/MASI. Detalhes, fórmulas e referências bibliográficas em `docs/ICR-SET-VALUED-METHODOLOGY.md`. Estado atual reduz pra primeiro código alfabético — ver "Limitações conhecidas §1".

## Por que esta formulação (e não outras)

A escolha foi entre 3 formulações principais:

**Per-second unit space (escolhida)**
Cada segundo é a unidade analítica. Definir overlap fica trivial — segundo 12 da timeline, ou ambos codificadores marcaram, ou um, ou nenhum. Idêntico em estrutura matemática ao char-level de texto-likes — reaproveita o motor κ sem duplicação de código. Resolução de 1s alinha com a granularidade típica de coding em audio/video (raramente o pesquisador codifica frame-a-frame; a unidade prática de leitura é segundo).

Esta formulação espelha o que ATLAS.ti 25 reporta em seu módulo ICA pra audio/video — receita conhecida em literatura QDA recente.

**Per-marker unit space com matching IoU 1D temporal (rejeitada)**
Análogo ao bbox: cada marker uma unidade, overlap entre 2 markers = IoU = `|A ∩ B| / |A ∪ B|` no eixo temporal. Requer threshold e Hungarian assignment. Vantagem: trata cada segmento codificado como unidade analítica. Desvantagem: nada disso é necessário — timeline é 1D linear, segundo-level já resolve sem precisar pareamento.

**Milissegundo-level units (rejeitada)**
Resolução mais fina, mas amplifica artificialmente o universo (1 minuto = 60.000 unidades em ms vs 60 em segundos) sem ganho metodológico. Coding humano em audio/video tem precisão ~100-500ms na borda; granularidade abaixo disso é ruído.

## Por que segundos e não milissegundos

`MediaMarker` armazena `from` e `to` como números float em segundos (com fração quando o usuário arrasta a borda do bloco no waveform/timeline). A conversão pra unidade discreta exige uma escolha:

- **Segundos** (escolhida): 1 unidade por segundo. Erro de borda ≤ 1s em qualquer direção.
- **Milissegundos**: 1000 unidades por segundo. Erro de borda ≤ 1ms (desprezível) mas universo 1000× maior.

O custo de explosão char-level (ou second-level) em `explodeMarkersToCharLabels` é O(N markers × duração média). Pra um arquivo de 1h com 100 markers, segundo-level dá 360.000 unidades — viável em main thread mas próximo do limite (worker já é usado pra coefs pesados via `kappa.worker.ts`). Milissegundo-level seria 360M unidades — inviável.

Mais importante: coding humano em audio/video raramente tem precisão de borda abaixo de 500ms. O erro metodológico de 1s no boundary é desprezível perto do ruído de interpretação humana. A escolha alinha com ATLAS.ti 25, que opera em 1s pra timeline coding.

## Por que arredondamento conservador (floor/ceil)

Conversão `from_int = ⌊from⌋`, `to_int = ⌈to⌉` cobre **todo segmento parcial**. Marker `from=10.3, to=10.7` (400ms dentro do segundo 10) entra como `[10, 11)` — o segundo 10 inteiro é considerado coded.

Alternativas:

- **Round (nearest):** `from=10.3 → 10`, `to=10.7 → 11`. Coincide com conservador em a maioria dos casos mas pode encurtar bordas (10.3 → 10 = perde 300ms iniciais).
- **Truncate (floor both):** `from=10.3 → 10`, `to=10.7 → 10`. Falha — marker some (vazio).

O arredondamento conservador garante que **nenhum segundo tocado por qualquer fração do marker** seja perdido. Isso infla levemente a sobreposição na borda (favorece concordância pra markers próximos), o que é o viés certo na maioria dos casos: se A marca `[10.3, 15.7)` e B marca `[10.6, 15.4)`, ambos cobrem essencialmente "os segundos 10 a 15" — penalizar essa concordância por 300ms de diferença seria sobrecorrer.

Em coding com precisão sub-second crítica (ex: análise de turnos de fala em conversation analysis), considerar reportar α-binary separadamente — boundary disagreement em escala menor que 1s vira invisível neste motor.

## Por que `__none__` no universo

Idêntico a texto-likes (ver `ICR-LINEAR-METHODOLOGY.md`). Segundos não codificados entram no universo com rating `__none__`, reflectindo "ninguém marcou aqui". Necessário pra Pe não colapsar — chance agreement precisa contar silêncio mútuo.

**Caveat específico de temporal (ver "Limitações conhecidas §2"):** `totalUnits` por source é `max(range.to)` entre markers do escopo, não a duração real do arquivo. Áudio de 1h com markers só nos primeiros 10min reportará universo de 10min (~600 unidades), não 3600.

## Por que análise pair-wise + multi-coder

Idêntico a texto-likes. Cohen κ é pareado por construção (C(N, 2) entradas em matriz triangular pra N>2). Fleiss κ, Krippendorff α, α-binary e cu-α aceitam N codificadores nativamente — produzem número único. Ambos caminhos disponíveis no toolbar.

## Fórmulas e algoritmos

### Pipeline marker → input

```
Entrada: MediaMarker M = { markerType ∈ {audio, video}, fileId, from, to, codes, codedBy }
Saída: CodedMarker = { coderId, range = TextRange, codeIds }

1. range = TextRange(
     fileId  = M.fileId,
     locator = M.markerType,        // 'audio' ou 'video'
     from    = ⌊M.from⌋,            // floor
     to      = ⌈M.to⌉,              // ceil
   )

2. codeIds = M.codes.map(c → c.codeId)
3. coderId = M.codedBy
```

`totalUnits` por source = `max(range.to)` entre todos markers do escopo no mesmo `(fileId, locator)`. **Não** é a duração real do arquivo (limitação §2).

### Universo de unidades e explosão second-level

```
Pra cada CodedMarker m:
    Pra pos ∈ [m.range.from, m.range.to):     // pos em segundos inteiros
        key = (m.range.fileId, m.range.locator, pos)
        charMap[key][m.coderId].add(m.codeIds[0])   // primeiro alfabético

Universo de units = todos pos ∈ [0, source.totalUnits)  pra source ∈ sources
```

A função `iterateAllUnitKeys` em `kappaInput.ts` itera `pos = 0` até `totalUnits - 1` por source — sem distinguir chars de segundos. O motor é agnóstico à unidade.

### Coeficientes

Cohen κ, Fleiss κ, Krippendorff α nominal, α-binary e cu-α aplicam **as mesmas fórmulas** documentadas em `ICR-LINEAR-METHODOLOGY.md §Fórmulas e algoritmos`. A única diferença é que `unit` significa "1 segundo" em vez de "1 char". As edge cases (input vazio → 1; Pe == 1 → 1) também são idênticas.

### Frases prontas pra seção de métodos

> "Inter-coder reliability foi calculada second-level sobre a timeline dos arquivos de áudio/vídeo cobertos pela análise. Bounds de markers foram arredondados conservadoramente (floor no início, ceil no fim) para inteiros em segundos. Segundos não codificados entraram no universo de unidades com rating `__none__`. Foram reportados Cohen κ pareado para cada par de codificadores, Fleiss κ multi-codificador, Krippendorff α nominal, α-binary (detecção de boundary temporal) e cu-α (concordância de código restrita aos segundos compartilhados)."
>
> "A escolha de resolução temporal (1 segundo) alinha com a prática estabelecida no módulo ICA do ATLAS.ti 25 para coding em mídia temporal, e reflete a granularidade típica de precisão em coding humano."

## Limitações conhecidas

1. **Set-valued ainda não implementado em temporal.** Mesma situação dos texto-likes: motor reduz `codeIds` a 1 código por segundo via `pickFirstCode`. Markers com múltiplos códigos `{cor, raiva}` perdem a discordância sobre o segundo código. Refactor C cravado em `docs/ICR-SET-VALUED-METHODOLOGY.md` cobre o caminho mas código pendente.

2. **`totalUnits` é `max(range.to)`, não duração do arquivo.** Pra audio/video, `totalUnits` reflete o segundo mais alto tocado por algum marker do escopo. Em arquivos longos com coding concentrado em uma janela inicial, o universo é truncado — Po fica artificialmente alto (todos os "segundos do silêncio mútuo" depois da janela não entram). **Em prática, isso favorece concordância em corpora com coding esparso.** Reporte sempre o `totalUnits` efetivo (visível no relatório) junto com o κ; em paper, mencione "second-level universe truncated to max boundary among markers in scope".

3. **Resolução temporal de 1s.** Sub-second disagreement é invisível pra este motor. Análises que exigem precisão sub-second (ex: turn-taking em conversation analysis, micro-expressões em vídeo etnográfico) devem considerar exportar markers e calcular κ externamente em resolução custom, ou aguardar implementação de modo configurável.

4. **`fileId` + `locator` como escopo.** Audio e video do mesmo arquivo (raro, mas possível em mídia mista) ficam em locators separados — markers de audio nunca comparam com markers de video. Isso é por design — `markerType` distingue domínio analítico.

5. **Aggregate cross-engine ponderado por marker count.** Quando o escopo combina audio + video + outras engines (texto-likes ou bbox), o aggregate κ é média ponderada por número de markers. "1 marker audio de 30s" tem peso igual a "1 marker bbox" — incomparáveis. O `aggregateWarnings` do reporter avisa quando engines com unidades incomparáveis entram juntas (`'seconds' vs 'chars' vs 'categorical' vs 'spatial-bbox'`). Reporte sempre **κ por engine separadamente** em paper.

## Trabalho futuro

- **Set-valued via Jaccard/MASI** (refactor C cravado): mesmo trabalho compartilhado com texto-likes, conforme `ICR-SET-VALUED-METHODOLOGY.md`.
- **Duração real do source como `totalUnits`:** consultar metadata de duração do arquivo (audio: tag MP3/WAV; video: container metadata) e usar como `totalUnits` em vez de `max(range.to)`. Corrige inflação de Po em corpora com coding esparso.
- **Resolução temporal configurável (s/100ms/ms):** modo opt-in pra análises sub-second. Trade-off de custo computacional registrado — universo cresce linearmente com resolução; precisa worker dedicado pra >1h de mídia em resolução fina.
- **Frame-level mode pra video:** unidade = frame em vez de segundo, parametrizado por fps. Útil pra análise comportamental fina (etologia, micro-análise).

---

## Referências

- Cohen, J. (1960). *A coefficient of agreement for nominal scales.* Educational and Psychological Measurement, 20(1), 37-46.
- Fleiss, J. L. (1971). *Measuring nominal scale agreement among many raters.* Psychological Bulletin, 76(5), 378-382.
- Krippendorff, K. (2018). *Content Analysis: An Introduction to Its Methodology* (4th ed.). Sage. (α nominal, α-binary, cu-α — extensão pra qualquer unit space discreto)
- ATLAS.ti GmbH (2025). *Inter-Coder Agreement (ICA) module documentation.* (second-level timeline coding pra audio/video)

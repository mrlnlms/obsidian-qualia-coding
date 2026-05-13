# ICR pra coding categórico (CSV cod row) — methodology

> **Audiência:** pesquisador escrevendo seção de métodos em paper, ou avaliando se o plugin é defendable pra publicação.
>
> **Status:** stable, refletindo implementação Slice 1 + spec cross-coder (`categoricalKappaInput.ts` + `coefficients/{cohen,fleiss,krippendorffAlpha}KappaCategorical.ts`).
>
> **Spec autoritativo:** `docs/superpowers/specs/2026-05-12-csv-row-marker-cross-coder-design.md`
>
> **Companion docs:** `docs/ICR-MULTIMODAL-METHODOLOGY.md` (framework cross-modalidade — agregação, LLM como faceta, camadas 1/2/3), `docs/ICR-METHODOLOGY.md` (bbox 2D), `docs/ICR-SET-VALUED-METHODOLOGY.md` (multi-código por região), `docs/ICR-LINEAR-METHODOLOGY.md` (markdown/PDF/CSV segment), `docs/ICR-TEMPORAL-METHODOLOGY.md` (audio/video).

---

Este documento descreve o algoritmo de Inter-Coder Reliability (ICR) implementado no plugin Qualia Coding pra coding **categórico** — a engine `csvRow`, onde a unidade de análise é a célula `(fileId, sourceRowId, column)` de uma planilha. Cada codificador atribui um conjunto de códigos à célula como um todo (sem seleção de trecho de texto dentro dela). Esse é o paradigma classificatório do questionário pós-codificado: linha = caso, coluna = pergunta, código = categoria de resposta.

A modalidade categórica é **estruturalmente diferente** das outras engines: não tem geometria de overlap, não tem boundaries, não tem char-level explosion. Cada célula é uma identidade pré-definida; o motor κ opera direto sobre decisões unit-level, sem necessidade de pareamento ou char universe.

## Como funciona, em uma página

Quando você roda Compare Coders sobre RowMarkers (CSV cod row) de N codificadores, o plugin executa:

1. **Coleta** todas as células `(fileId, sourceRowId, column)` codificadas por pelo menos um codificador no escopo. Cada célula vira uma **unit**.
2. **Mapeia** unit → coder → set de codeIds. Coders que não marcaram uma unit ficam ausentes do map (rating implícito `__none__`).
3. **Reduz** o set de codeIds de cada (unit, coder) a 1 código — primeiro em ordem alfabética (estado atual do código, ver "Limitações conhecidas §1").
4. **Aplica** Cohen κ pareado, Fleiss κ e Krippendorff α nominal sobre a matriz unit × coder × rating resultante. α-binary e cu-α não são aplicáveis (não há boundary disagreement) e retornam 1 (vacuous) preservando shape do report.

A intuição: cada célula é uma decisão classificatória. Concordância é "os codificadores deram a mesma categoria a esta célula?". Não há boundary disagreement porque os bounds da unidade (fileId + row + column) são pré-definidos pelo source CSV, não decididos pelo codificador.

> **Multi-código por célula — comportamento alvo documentado em doc separado:** quando uma célula recebe múltiplos códigos de um mesmo codificador (`{satisfeito, ambivalente}`), o roadmap (refactor C) prevê tratamento como conjunto indivisível com distância Jaccard/MASI. Detalhes, fórmulas e referências bibliográficas em `docs/ICR-SET-VALUED-METHODOLOGY.md`. Estado atual reduz pra primeiro código alfabético — ver "Limitações conhecidas §1".

## Por que esta formulação (e não outras)

A escolha foi entre 2 formulações principais:

**Unit-level decisions (escolhida)**
Cada célula `(fileId, sourceRowId, column)` é uma unit indivisível. Coders dão decisões por unit; o motor κ opera sobre a matriz unit × coder × rating direto. Isso é o caminho canônico da literatura de κ — Cohen (1960) e Fleiss (1971) foram formulados exatamente assim, sobre N raters classificando M items em K categorias. Não há nada adicional a inventar — é o "vanilla κ" da literatura.

Esta é a formulação que NVivo, ATLAS.ti, MAXQDA e Dedoose usam pra "code as variable" / "case-level coding" — receita amplamente publicada.

**Reaproveitar char-level pipeline (rejeitada)**
Forçar `csvRow` no mesmo pipeline que CSV segment (explodir cada célula pra char universe). Tecnicamente possível — `extractCsvSegmentRange` poderia tratar a célula inteira como `[0, cellLength)` e cair no caminho linear. Falha em dois pontos:

1. **Universo errado.** O universo natural pra categórico é o conjunto de células codificadas, não a soma de chars das células. Char-level inflaria artificialmente a concordância (chars `__none__` dentro de células brancas dominariam).
2. **Limitação semântica.** Coding categórico **não tem boundaries** — não faz sentido perguntar "concordamos onde começa o coding?". A célula é a unidade; só há "concordamos no quê?".

A separação em `categoricalKappaInput.ts` + coeficientes próprios (`cohenKappaCategorical.ts`, `fleissKappaCategorical.ts`, `krippendorffAlphaCategoricalNominal.ts`) reflete essa diferença estrutural.

## Por que unit-level e não char-level

Coding categórico é **decisão classificatória por unidade pré-definida**, não marcação de trecho. A célula CSV `(row 5, column "satisfaction")` existe no source independente de qualquer codificador — ela é a unidade analítica do desenho de pesquisa. Pedir "qual o boundary?" não faz sentido; pedir "qual a categoria?" é a única pergunta legítima.

Char-level (texto-likes) ou second-level (temporal) faz sentido onde **o boundary é parte da decisão analítica**. Em CSV row, o boundary é dado pelo source. Forçar char-level seria misturar duas semânticas de coding e reportar um número difícil de interpretar.

## Por que coders ausentes viram `__none__`

Pesquisa categórica realista tem **missing data** — codificador A revisa todas as 100 linhas; codificador B revisa só 60. A literatura κ (Krippendorff α em particular) lida com missing data tratando ausência como uma categoria adicional ou excluindo a unit do cohort.

O plugin adota a primeira convenção (`__none__` como categoria) por consistência cross-engine — texto-likes e temporal também tratam ausência como `__none__`. Vantagem: número único e simples de interpretar. Caveat: codificadores que **decidiram não codificar** uma célula (interpretação válida: "essa célula não tem código aplicável") são indistinguíveis de codificadores que **não chegaram a revisar** a célula (missing data verdadeiro).

Pra desenhos onde essa distinção importa, considerar filtrar o escopo previamente (ex: codificar todos pelo menos uma vez antes de rodar ICR) ou exportar tabular e aplicar α com tratamento de missing apropriado externamente.

## Por que análise pair-wise + multi-coder

Idêntico às outras modalidades. Cohen κ é pareado por construção (C(N, 2) entradas em matriz triangular pra N>2). Fleiss κ e Krippendorff α aceitam N codificadores nativamente — produzem número único. Ambos caminhos disponíveis no toolbar.

Pra categórico, Fleiss κ é particularmente apropriado — ele foi originalmente formulado pra esse caso (N raters, M items, K categorias nominais). É o coeficiente "default" pra coding categórico em literatura clássica.

## Fórmulas e algoritmos

### Pipeline marker → input

```
Entrada: RowMarker M = { fileId, sourceRowId, column, codes, codedBy }
Saída: CategoricalUnit = { fileId, sourceRowId, column, codeIds, coderId }

1. unit.fileId       = M.fileId
2. unit.sourceRowId  = M.sourceRowId
3. unit.column       = M.column
4. unit.codeIds      = M.codes.map(c → c.codeId)
5. unit.coderId      = M.codedBy ?? 'human:default'

Stable unit key = `${fileId}|row:${sourceRowId}|col:${column}`
```

Diferente das outras engines, o input não tem `sources` com `totalUnits` — universo é implícito (todas células onde algum coder marcou).

### Cohen κ categórico pareado

```
Pra cada par (coderA, coderB):
    Pra cada unit u (célula única no escopo):
        ratingA(u) = primeiro código alfabético de A em u, ou '__none__' se A ausente
        ratingB(u) = idem pra B

    matrix[rA, rB] = contagem
    Po = Σ_{r}  matrix[r, r] / total
    Pe = Σ_{r}  p_A(r) × p_B(r)        // marginais
    κ  = (Po − Pe) / (1 − Pe)
```

Total = número de unidades distintas no escopo. Edge cases idênticos ao Cohen κ texto-likes (input vazio → 1; Pe == 1 → 1).

### Fleiss κ categórico

```
M = |unidades distintas|, N = |coders|

Pra cada unit u, n_ij(u) = quantos coders deram rating j em u (incluindo '__none__')
Pa = (1/M) × Σ_u  [ Σ_j n_ij(u) × (n_ij(u) − 1) ] / [ N × (N−1) ]
Pe = Σ_j p_j²,  onde p_j = (1/(M·N)) × Σ_u  n_ij(u)
κ  = (Pa − Pe) / (1 − Pe)
```

Fórmula clássica de Fleiss (1971), aplicada direto sobre unit-level decisions. Sem char explosion.

### Krippendorff α categórico nominal

```
Coincidence matrix sobre unit-level ratings:
    pra cada unit u com n ratings:
        catCounts[j] = quantos coders deram rating j em u
        c_ij += (n1 × n2) / (n − 1)   se i ≠ j
        c_ii += (n1 × (n1 − 1)) / (n − 1)

Do = Σ_{i≠j} c_ij
n_c = Σ_j c_cj
n   = Σ_c n_c
De  = Σ_{i≠j} (n_i × n_j) / (n − 1)
α   = 1 − Do / De
```

Fórmula idêntica ao α nominal de texto-likes (ver `ICR-LINEAR-METHODOLOGY.md §Krippendorff α nominal`) — a única diferença é o universo (unit-level, não char-level).

### α-binary e cu-α: não-aplicáveis

α-binary e cu-α dependem de **boundary disagreement** ou **partial overlap** — conceitos inexistentes em categórico (unidades pré-definidas pelo source). O reporter retorna `1` (vacuous) pra esses dois coeficientes em escopo categórico, preservando o shape do `CoefficientReport`. Em paper, **omita-os** ou explicite que são vacuous (1 por convenção).

### Frases prontas pra seção de métodos

> "Inter-coder reliability foi calculada unit-level sobre as células `(arquivo, linha, coluna)` codificadas por pelo menos um codificador no escopo da análise. Codificadores ausentes em uma célula foram tratados como categoria `__none__` (Krippendorff, 2018). Foram reportados Cohen κ pareado para cada par de codificadores, Fleiss κ multi-codificador (Fleiss, 1971) e Krippendorff α nominal. α-binary e cu-α não se aplicam ao caso categórico (sem disagreement de boundary) e foram omitidos."
>
> "O motor não aplicou char-level explosion na engine categórica: a célula CSV é a unidade analítica indivisível por construção do desenho de pesquisa."

## Limitações conhecidas

1. **Set-valued ainda não implementado em categórico.** Quando uma célula recebe múltiplos códigos de um mesmo codificador (`{satisfeito, ambivalente}`), motor reduz a 1 código via `pickFirstCode` (primeiro em ordem alfabética). Discordância sobre o segundo código fica silenciada. Refactor C (`docs/ICR-SET-VALUED-METHODOLOGY.md` + spec `2026-05-12-icr-set-valued-labels-design.md`) cobre o caminho pra `cohenKappaCategorical`, `fleissKappaCategorical`, `krippendorffAlphaCategoricalNominal` mas código pendente.

2. **`__none__` ambíguo entre "decidi não codificar" e "não revisei".** Codificadores ausentes em uma célula são tratados como categoria `__none__`, idêntico à interpretação "decidiu que nenhum código se aplica". Sem campo explícito de "reviewed but uncoded", o motor não distingue os dois casos. Em corpora onde essa distinção importa (ex: revisão parcial deliberada), reporte explicitamente a fração de células com coverage cross-coder no método.

3. **Universo implícito = células onde algum coder marcou.** Células do CSV não codificadas por ninguém **não entram** no universo. Isso é por design — categórico não tem "ausência mútua" análoga ao silêncio mútuo de texto-likes. Caveat: se o desenho exige que todos os codificadores revisem todas as linhas, e parte delas ficou completamente uncoded, o universo será menor que o esperado. Pre-filter por coverage antes de reportar.

4. **α-binary e cu-α retornam 1 vacuous.** O `CoefficientReport` preserva shape, então o relatório mostra `α-binary = 1.000` e `cu-α = 1.000` pra categórico — número sem significado metodológico. **Não reportar esses dois em paper sobre categórico.** O reporter sinaliza isso internamente; UI de Compare Coders mostra grayed.

5. **`sourceRowId` é identidade estável, não conteúdo.** Markers em rows que foram deletadas+recriadas (ou que tiveram conteúdo alterado pós-coding) mantêm sourceRowId — pode haver descolamento entre rating e conteúdo. Esse é um problema de provenance, ortogonal ao κ; consultar `sourceHashAtCoding` pra auditar.

6. **Aggregate cross-engine ponderado por marker count.** Quando o escopo combina csvRow + outras engines, o aggregate κ é média ponderada por número de markers. "1 row marker" tem peso igual a "1 marker de char-range" — incomparáveis. O `aggregateWarnings` avisa quando engines com unidades incomparáveis entram juntas (`'categorical' vs 'chars' vs 'seconds' vs 'spatial-bbox'`). Reporte sempre **κ por engine separadamente** em paper.

## Trabalho futuro

- **Set-valued via Jaccard/MASI** (refactor C cravado): mesmo trabalho compartilhado com outras modalidades, conforme `ICR-SET-VALUED-METHODOLOGY.md`. Importante em categórico porque coding "multi-categoria por célula" é caso frequente (ex: codificação de respostas abertas onde uma resposta pode tocar várias categorias).
- **Distinção `__none__` vs `reviewed_uncoded`:** campo explícito no RowMarker pra "revisei e decidi não codificar". Resolve ambiguidade do §2. Exige UX no codingview pra registrar revisão sem coding.
- **Universo opcional = todas as células do source.** Hoje universo é implícito (só células marcadas). Modo opt-in que considere todas as células do CSV (mesmo não marcadas) — útil pra reportar coverage real e ter Pe consistente em cohorts heterogêneos.

---

## Referências

- Cohen, J. (1960). *A coefficient of agreement for nominal scales.* Educational and Psychological Measurement, 20(1), 37-46.
- Fleiss, J. L. (1971). *Measuring nominal scale agreement among many raters.* Psychological Bulletin, 76(5), 378-382. (formulação original pra N raters categórico)
- Krippendorff, K. (2018). *Content Analysis: An Introduction to Its Methodology* (4th ed.). Sage. (α nominal, tratamento de missing data)
- Lumivero (2025). *NVivo Coding Comparison Query documentation.* (case-level coding agreement)
- ATLAS.ti GmbH (2025). *Inter-Coder Agreement (ICA) module documentation.*

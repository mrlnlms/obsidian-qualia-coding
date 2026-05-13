# ICR pra coding linear (texto) — methodology

> **Audiência:** pesquisador escrevendo seção de métodos em paper, ou avaliando se o plugin é defendable pra publicação.
>
> **Status:** stable, refletindo implementação Slice 1/Fase 1 (`reporter.ts` + `coefficients/*` + `textRange.ts`).
>
> **Spec autoritativo:** `docs/superpowers/specs/2026-05-09-icr-compare-coders-design.md` (Fase 1 — texto-likes)
>
> **Companion docs:** `docs/ICR-METHODOLOGY.md` (bbox 2D), `docs/ICR-SET-VALUED-METHODOLOGY.md` (multi-código por região), `docs/ICR-TEMPORAL-METHODOLOGY.md` (audio/video), `docs/ICR-CATEGORICAL-METHODOLOGY.md` (CSV cod row).

---

Este documento descreve o algoritmo de Inter-Coder Reliability (ICR) implementado no plugin Qualia Coding pras três engines lineares de texto: **markdown** (notas .md do vault), **PDF text** (texto extraído via pdfjs), e **CSV segment** (trechos selecionados dentro de uma célula). As três compartilham a mesma estrutura matemática — coding é um intervalo `[from, to)` de caracteres dentro de um source com um locator estável — e portanto o motor κ as trata uniformemente.

## Como funciona, em uma página

Quando você roda Compare Coders sobre markers lineares de N codificadores, o plugin executa:

1. **Normaliza** cada marker pra um `TextRange = (fileId, locator, from, to)`. O `locator` distingue o escopo dentro do arquivo — vazio em markdown, `page:N` em PDF, `row:R|col:C` em CSV segment. Markers em locators diferentes nunca comparam (são unidades disjuntas).
2. **Explode** cada marker pra um conjunto de chars individuais. Pra `from=10, to=15`, gera 5 unidades — os chars 10, 11, 12, 13 e 14. Cada char vira a **unidade analítica** do κ.
3. **Universo de unidades** = todos os chars de todos os sources cobertos no escopo. Chars não codificados por ninguém entram no universo com rating `__none__` (ausência codificada).
4. **Reduz** o conjunto de códigos de cada marker a 1 código por char — pega o **primeiro código em ordem alfabética**. Isso é o estado atual do código (ver "Limitações conhecidas §1").
5. **Aplica** os 5 coeficientes (Cohen κ pareado, Fleiss κ, Krippendorff α nominal, α-binary, cu-α) sobre a matriz char × coder × rating resultante.

A intuição: cada char no source é um voto. Concordância é "os codificadores deram o mesmo voto neste char?". Discordância pode ser **boundary** (um marcou, outro não) ou **code** (ambos marcaram, com códigos diferentes).

> **Multi-código por marker — comportamento alvo documentado em doc separado:** quando um marker carrega múltiplos códigos, o roadmap (refactor C) prevê tratamento como conjunto indivisível com distância Jaccard/MASI. Detalhes, fórmulas e referências bibliográficas em `docs/ICR-SET-VALUED-METHODOLOGY.md`. Estado atual do código (Slice 1) reduz pra primeiro código alfabético — ver "Limitações conhecidas §1".

## Por que esta formulação (e não outras)

A escolha foi entre 3 formulações principais:

**Per-char unit space (escolhida)**
Cada char é a unidade analítica. Definir overlap fica trivial — char 12 ou os dois codificadores tocaram, ou um, ou nenhum. Cohen κ, Fleiss κ, α e variantes operam sobre o universo de chars sem precisar resolver "qual marker corresponde a qual marker". A redução pra char-level torna o problema matematicamente idêntico ao κ clássico sobre N raters em N units, que é o caminho amplamente publicado.

Esta formulação espelha o que NVivo chama de "character-level agreement" no Coding Comparison Query — receita canônica em QDA pra texto.

**Per-marker unit space com matching IoU 1D (rejeitada)**
Análogo ao bbox: cada marker seria uma unidade, e o overlap entre 2 markers seria IoU = `|A ∩ B| / |A ∪ B|` no eixo de chars. Requer threshold e Hungarian assignment. Vantagem: trata cada quotation como unidade analítica (mais próximo de como o pesquisador pensa). Desvantagem: nada disso é necessário — texto é 1D linear, char-level já resolve sem precisar pareamento.

**Token/word-level units (rejeitada)**
Tokenização explícita (palavras ou tokens NLP) como unidade. Faz sentido em corpora linguísticos, mas exige scheme de tokenização que vira parâmetro adicional. Char-level é language-agnostic e idêntico cross-engine (markdown/PDF/CSV).

## Por que char-level e não word-level

Char é a granularidade mais fina disponível sem ambiguidade — o offset `from` em todas as engines é em chars, não em words. Word-level exigiria definir uma função de tokenização que mudaria por idioma, alfabeto e domínio. Char-level produz números idênticos pra mesmo coding regardless de idioma, e o erro de granularidade (1 char a mais ou a menos no boundary) é desprezível perto do ruído metodológico de coding humano.

NVivo Coding Comparison Query opera char-level por padrão; este plugin segue a mesma convenção pra defendabilidade direta.

## Por que `__none__` no universo

Coding raro deixa boundary disagreement invisível se você só contar chars que algum codificador tocou. Exemplo: A marca chars 10-100 com `cor`, B marca chars 50-60 com `cor`. Se só contarmos os chars que algum dos dois tocou (universo = chars 10-100), Po fica baixo mas Pe também — α/κ produzem números aparentemente "decentes" pra um coding que claramente diverge.

Incluir todos os chars do source (mesmo os não codificados por ninguém, com rating `__none__`) é a receita standard de Krippendorff α e ATLAS.ti — `__none__` é uma categoria como qualquer outra do ponto de vista do coeficiente. Pe sobe, Po sobe, κ reflete corretamente que "a maior parte do texto teve concordância (silêncio mútuo)". Em corpora QDA isso é o realismo.

## Por que α-binary e cu-α separados

α-binary e cu-α são duas decomposições complementares do disagreement, herdadas do pattern ATLAS.ti ICA:

- **α-binary** colapsa todos códigos pra `__present__`. Mede só **boundary detection** — "concordamos que tem coding aqui?", ignorando qual código foi aplicado.
- **cu-α** filtra o universo pros chars onde **todos** os codificadores marcaram alguma coisa. Mede só **code agreement** — "dado que ambos identificaram esta região, concordamos no código?".

Juntos isolam a fonte de discordância. Em paper, reportar os dois separados permite ao leitor diagnosticar: "α-binary alto mas cu-α baixo" = "vocês concordam onde codificar mas não no quê"; "α-binary baixo cu-α alto" = "quando reconhecem a região, concordam — mas nem sempre reconhecem".

## Por que análise pair-wise + multi-coder

Cohen κ é pareado por definição (2 codificadores) — pra N>2, o plugin reporta uma **matriz triangular** com C(N, 2) entradas (todos pares possíveis), análogo ao bbox (ver `ICR-METHODOLOGY.md`).

Fleiss κ, Krippendorff α, α-binary e cu-α aceitam N codificadores nativamente — produzem um número único pra todo o cohort. Ambos caminhos estão expostos no toolbar.

**Por que oferecer ambos:** literatura QDA tradicional (NVivo, ATLAS.ti) reporta Cohen κ pareado matriz pra N coders; literatura content analysis (Krippendorff) reporta α multi-rater como número único. Plugin entrega os dois pra acomodar ambas tradições de reporting.

## Fórmulas e algoritmos

### Pipeline marker → input

```
Entrada: marker M com { fileId, codes, range, codedBy }
Saída: CodedMarker = { coderId, range = TextRange, codeIds }

1. Extrai TextRange via adapter por engine:
     - Markdown:   TextRange = (M.fileId, '', lineCh→absChar(M.range.from), lineCh→absChar(M.range.to))
     - PDF text:   TextRange = (M.fileId, `page:${M.page}`, M.beginIndex, M.endIndex)
     - CSV segment: TextRange = (M.fileId, `row:${M.sourceRowId}|col:${M.column}`, M.from, M.to)

2. codeIds = M.codes.map(c → c.codeId)
3. coderId = M.codedBy
```

Markdown precisa de `sourceText` pra converter `(line, ch)` em char absoluto via somatório de offsets de linha. PDF e CSV já trabalham em char offsets diretos.

### Char explosion (unit space)

```
Pra cada CodedMarker m:
    Pra pos ∈ [m.range.from, m.range.to):
        key = (m.range.fileId, m.range.locator, pos)
        charMap[key][m.coderId].add(m.codeIds[0])   // primeiro alfabético

Universo de units = ∪ source.totalUnits  pra source ∈ sources
    onde totalUnits = max(chars do source) — markdown lê arquivo;
                                              PDF/CSV: max(range.to) entre markers do scope
```

### Cohen κ pareado

```
Pra cada par (coderA, coderB):
    Po = (1/N) × Σ_units  𝟙[ratingA(unit) == ratingB(unit)]
    Pe = Σ_categoria  p_A(cat) × p_B(cat)
    κ  = (Po − Pe) / (1 − Pe)
```

Onde N = |universo de units| (chars cobertos por sources, incluindo `__none__`).

Edge cases tratados: input vazio → 1; Pe == 1 → 1 (κ indefinido por convenção).

### Fleiss κ (N raters)

```
M = |universo de units|, N = |coders|

Pra cada unit u, n_ij(u) = quantos coders deram rating j em u
Pa = (1/M) × Σ_u  [ Σ_j n_ij(u) × (n_ij(u) − 1) ] / [ N × (N−1) ]
Pe = Σ_j p_j²,  onde p_j = (1/(M·N)) × Σ_u  n_ij(u)
κ  = (Pa − Pe) / (1 − Pe)
```

### Krippendorff α nominal

```
Coincidence matrix:
    pra cada unit u com n ratings:
        catCounts[j] = quantos coders deram rating j em u
        c_ij += (n1 × n2) / (n − 1)   se i ≠ j
        c_ii += (n1 × (n1 − 1)) / (n − 1)

Do = Σ_{i≠j} c_ij    (observed disagreement)
n_c = Σ_j c_cj       (marginais por categoria)
n   = Σ_c n_c
De  = Σ_{i≠j} (n_i × n_j) / (n − 1)
α   = 1 − Do / De
```

Edge cases: De == 0 → 1 se Do == 0, senão 0 (concordância perfeita ou todos discordam).

### α-binary

Reduz `codeIds` de cada marker a `['__present__']`, depois aplica Krippendorff α nominal. Universo passa a ser binário `{__present__, __none__}`. Mede boundary detection.

### cu-α (continuous unitization α)

```
1. Filtra char universe pros chars onde TODOS coders ∈ scope marcaram (algum código)
2. Reconstrói sources truncados (totalUnits = max shared pos + 1 por source)
3. Aplica Krippendorff α nominal sobre o subset

Sem chars compartilhados → 1 (vacuous).
```

Reusa αNominal sobre o subset — não é fórmula separada, é α com universo restringido.

### Frases prontas pra seção de métodos

> "Inter-coder reliability foi calculada char-level sobre o conjunto completo de caracteres dos sources cobertos pela análise, incluindo chars não codificados (rating `__none__`). Foram reportados Cohen κ pareado para cada par de codificadores, Fleiss κ multi-codificador, Krippendorff α nominal, α-binary (boundary detection) e cu-α (code agreement restrito ao escopo compartilhado)."
>
> "Para PDF text, char offsets foram extraídos via pdfjs. Para CSV segment, char offsets são locais à célula `(row, column)`. Cada combinação `(fileId, locator)` constitui um escopo independente de comparação — markers em escopos diferentes não foram comparados."

## Limitações conhecidas

1. **Set-valued ainda não implementado em texto-likes.** O motor reduz `codeIds` a 1 código por char via `pickFirstCode` (primeiro em ordem alfabética). Quando um marker carrega múltiplos códigos `{cor, raiva}`, só `cor` entra no κ — a discordância sobre o segundo código é silenciada. O refactor C (`docs/ICR-SET-VALUED-METHODOLOGY.md` + spec `2026-05-12-icr-set-valued-labels-design.md`) foi cravado pra estender as três funções (`cohenKappa`, `fleissKappa`, `krippendorffAlphaNominal`) com distância paramétrica Jaccard/MASI, mas o código ainda usa pickFirstCode. Pesquisador que cita κ em paper com corpus multi-código atual deve **explicitar** que reportou single-label majority-alphabetic ou aguardar refactor C.

2. **Markdown precisa source text disponível.** `extractMarkdownRange` converte `(line, ch)` em char absoluto via leitura do arquivo. Se o arquivo está inacessível (deletado, renomeado, vault offline), markers desse fileId são pulados silenciosamente. O relatório não distingue "0 markers nesse arquivo" de "arquivo ilegível".

3. **`totalUnits` em PDF/CSV é max(range.to), não tamanho real do source.** Pra PDF text, `totalUnits` reflete o maior `endIndex` entre markers do escopo — não o tamanho total do texto extraído da página. Markers cobrindo só o início da página subestimam o universo. Em prática, isso infla Po (mais chars `__none__` compartilhados que o real). Markdown usa o tamanho real do arquivo via `vault.cachedRead`.

4. **CSV segment: locator = `row:R|col:C`.** Markers no mesmo conteúdo de célula mas em rows distintas (CSV com células duplicadas) nunca comparam. Isso é por design — `sourceRowId` é a identidade estável, não o conteúdo.

5. **Aggregate cross-engine ponderado por marker count.** Quando o escopo combina markdown + PDF + CSV segment, o aggregate κ é média ponderada pelo número de markers de cada engine. Como "1 marker markdown" e "1 marker PDF" cobrem quantidades diferentes de chars, o peso ideal não é claro. O `aggregateWarnings` do reporter avisa quando engines com unidades incomparáveis entram juntas. Reporte sempre **κ por engine separadamente** em paper.

## Trabalho futuro

- **Set-valued via Jaccard/MASI** (refactor C cravado): estender Cohen/Fleiss/α com δ paramétrica, conforme `ICR-SET-VALUED-METHODOLOGY.md`. Hoje só está documentado; código pendente.
- **Source-text-aware total units pra PDF/CSV:** ler o conteúdo real do source (página PDF extraída, célula CSV) e usar como `totalUnits` em vez de `max(range.to)`. Corrige inflação de Po em escopos parcialmente codificados.
- **Word/token-level mode como opcional:** alguns paradigmas (análise de conteúdo, análise temática) reportam agreement word-level. Adicionar como modo selecionável (default segue char-level).

---

## Referências

- Cohen, J. (1960). *A coefficient of agreement for nominal scales.* Educational and Psychological Measurement, 20(1), 37-46.
- Fleiss, J. L. (1971). *Measuring nominal scale agreement among many raters.* Psychological Bulletin, 76(5), 378-382.
- Krippendorff, K. (2018). *Content Analysis: An Introduction to Its Methodology* (4th ed.). Sage. (α nominal, α-binary, cu-α)
- Lumivero (2025). *NVivo Coding Comparison Query documentation.* (char-level agreement em texto)
- ATLAS.ti GmbH (2025). *Inter-Coder Agreement (ICA) module documentation.* (α-binary + cu-α decomposition pattern)

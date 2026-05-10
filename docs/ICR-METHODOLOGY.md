# ICR pra coding espacial 2D — methodology

> **Audiência:** pesquisador escrevendo seção de métodos em paper, ou avaliando se o plugin é defendable pra publicação.
>
> **Status:** stable, refletindo implementação Slice 6 (2026-05-09).
>
> **Spec autoritativo:** `obsidian-qualia-coding/plugin-docs/superpowers/specs/2026-05-09-icr-bbox-adapter-design.md`

---

Este documento descreve o algoritmo de Inter-Coder Reliability (ICR) implementado no plugin Qualia Coding pra markers espaciais 2D — regiões em PDFs (PDF shape) e imagens (Image). Pra coding linear (markdown/PDF text/CSV cell) e temporal (audio/video) e categórico (CSV cod row), os métodos e rationales são distintos e cobertos em outros documentos.

## Como funciona, em uma página

Quando você roda Compare Coders sobre PDF shape ou Image markers de 2 codificadores, o plugin executa:

1. **Agrupa** as regiões de cada codificador por escopo (cada página de PDF é um escopo separado; cada imagem é seu próprio escopo).
2. **Compara espacialmente** todas as regiões do codificador A com todas as regiões do codificador B usando **Intersection over Union (IoU)** — uma métrica padrão em visão computacional que mede o quanto duas regiões se sobrepõem.
3. **Empareia** as regiões usando o algoritmo Hungarian (atribuição ótima): cada região do A é pareada no máximo com 1 região do B, maximizando a soma total de IoU. Pares com IoU abaixo de um threshold (default 0.5) são desfeitos — interpretados como "esses codificadores não concordaram que esta região estava lá".
4. **Calcula κ de Cohen** sobre a estrutura resultante: pra cada par de regiões emparelhadas, mede se os codificadores aplicaram os mesmos códigos; pra regiões "sobrando" (que só um codificador marcou), conta como discordância total.

O output é um valor de κ que combina **concordância espacial** (concordamos que esta região existe?) e **concordância de código** (concordamos sobre o que esta região representa?).

> **Limitação importante a saber antes de citar resultados em paper:** quando uma região carrega múltiplos códigos (ex: A marca uma região com `{cor, raiva}`, B marca a mesma região com `{cor, frustração}`), o motor κ atual **reduz cada região ao primeiro código em ordem alfabética**. Nesse exemplo, ambos viram `cor` na comparação → κ trata como concordância total, mesmo discordando em `raiva` vs `frustração`. Esta limitação é herdada do motor κ existente (afeta também todas as outras engines do plugin), não é específica do bbox adapter. Está documentada no Appendix A do spec design e é trabalho conhecido pra um refactor futuro do motor (suporte a set-valued labels via distância de Jaccard ou similar). Quem cite κ deste plugin em paper deve mencionar essa propriedade explicitamente, ou restringir o coding a 1 código por região onde isso for crítico.

## Por que esta formulação (e não outras)

A escolha foi entre 3 formulações principais:

**Bbox-as-unit binário com matching IoU + κ pareado (escolhida)**
Cada região é uma unidade indivisível de análise. O matching espacial (Hungarian + threshold IoU) encapsula o problema 2D numa única etapa; a etapa de κ é então o κ pareado clássico que o NVivo Coding Comparison já usa pra texto e regiões. Essa separação é importante: a parte 2D fica auto-contida e defendável (alinhada com COCO/computer vision); a parte κ usa fórmula clássica sem necessidade de derivações novas. *Caveat herdada do motor κ atual:* multi-código por região é reduzido a first-code alfabético — ver "Limitações conhecidas" abaixo.

**cu-α de Krippendorff com IoU como peso contínuo (rejeitada neste slice — ver "Trabalho futuro")**
Não exigiria threshold; o IoU contínuo entraria diretamente como métrica de distância. Mais "honesto" matematicamente, mas exigiria derivação formal de chance agreement pra geometria 2D — não há precedent QDA. Linha de pesquisa publicável, registrada como trabalho futuro.

**Per-código matching primeiro, κ binário por código (rejeitada)**
Cada código seria tratado como universo independente. Falha em representar regiões que carregam múltiplos códigos juntos — uma característica fundamental do plugin (cada região porta um conjunto de códigos como unidade analítica indivisível).

## Por que IoU como métrica de overlap

IoU (Intersection over Union) é a métrica padrão de sobreposição em visão computacional, usada por ferramentas como o COCO benchmark. Ela mede:

```
IoU(A, B) = área(A ∩ B) / área(A ∪ B)
```

- Vale 1 quando A e B são idênticas.
- Vale 0 quando A e B são disjuntas.
- Vale 0.5 quando metade da união é interseção (regra prática: "regiões sobrepostas em mais ou menos metade").

IoU é simétrica, normalizada por tamanho (regiões grandes não dominam regiões pequenas), e tem interpretação intuitiva. Não há precedent direto no QDA pra regiões 2D, mas IoU é o padrão na literatura adjacente (computer vision, object detection) — escolhê-la mantém a metodologia defendável.

## Por que Hungarian assignment

Quando 2 codificadores marcam regiões na mesma página, é comum aparecerem casos como:
- Codificador A marca 1 região grande; codificador B marca 2 regiões pequenas dentro dela.
- Codificador A marca 3 regiões; codificador B só marca 2.
- Ambos marcam 4 regiões cada, mas com padrões de sobreposição cruzada.

O algoritmo Hungarian (também chamado Munkres) resolve o "problema de atribuição": dada uma matriz de IoUs entre todas as regiões de A e B, encontra o emparelhamento 1:1 que maximiza a soma total de IoU. Regiões sobrando ficam não-pareadas.

Algoritmos mais simples (como "greedy descendente") quase sempre dão o mesmo resultado, mas falham em casos ambíguos onde várias regiões competem pelo mesmo emparelhamento. Hungarian é o padrão em visão computacional pra esse problema.

## Por que rasterização uniforme em grid 200×200

Calcular IoU pra retângulos é trivial; pra elipses e polígonos exige geometria computacional não-trivial (interseção de polígonos, integração de elipses). Em vez de manter 5 caminhos de código diferentes, o plugin usa uma única receita:

1. Cada região (rect, ellipse, polygon, freeform) é "pintada" num grid 200×200 normalizado pelas coordenadas [0,1] da página.
2. IoU é calculada contando células comuns entre os dois grids.

Esta abordagem:
- Trata todas as formas uniformemente (sem descontinuidade entre tipos).
- Tem erro de borda inferior a 0.5% por dimensão (irrelevante perto do ruído metodológico do próprio coding humano).
- Tem custo computacional baixo e previsível (~0.05ms por par).

Em casos onde regiões muito pequenas (área < 0.01% da página) podem produzir IoU instável, o plugin automaticamente aumenta a resolução pra grid 400×400.

## Por que θ=0.5 como default e quando mudar

O threshold IoU controla quando 2 regiões são consideradas "a mesma região". Default 0.5 vem do COCO benchmark — convenção estabelecida em computer vision e amplamente defendida em literatura.

**Mudar pra θ=0.7 quando:** seu coding exige precisão espacial alta. Exemplos: marcação de citações exatas em manuscritos digitalizados; identificação de elementos visuais específicos (rosto de pessoa, gráfico em página de relatório). Regiões "quase iguais" não devem contar como concordância.

**Mudar pra θ=0.3 quando:** seu coding é tópico-aproximado. Exemplos: marcação de "região de interesse" em diagrama; identificação de "área de tensão" em fotografia social. Regiões parcialmente sobrepostas em torno do mesmo elemento devem contar como concordância.

**Por que configurável e não fixo:** pesquisa qualitativa é heterogênea — um threshold único não serve a todos os domínios. Deixar 0.5 como default mantém a defendabilidade COCO; permitir customização atende a heterogeneidade real.

**O threshold escolhido é sempre estampado no relatório de output**, garantindo reprodutibilidade. Em paper, cite: "ICR computed with IoU threshold θ=X (default 0.5)".

## Por que análise pair-wise pra bbox

O algoritmo Hungarian opera em 2 codificadores por vez. Quando você seleciona N codificadores na análise, o plugin executa Hungarian C(N, 2) vezes — todos os pares possíveis — e reporta uma **matriz triangular** com C(N, 2) entradas (renderizada como N×N simétrica, diagonal=1) mais a média e range dos valores fora da diagonal.

Isso é a convenção QDA estabelecida: NVivo Coding Comparison Query reporta multi-codificador exatamente assim. ATLAS.ti 25 ICA também opera primariamente pair-wise.

**Limitação:** não existe um número único "Fleiss κ multi-codificador" pra bbox neste estado do plugin. Reportar o multi-codificador via matriz pair-wise é o padrão aceito em literatura QDA — cite a média + range em métodos.

**Por que não suportamos multi-codificador "puro"?** Generalizar Hungarian pra N>2 codificadores exigiria clustering iterativo de regiões (cada cluster representando "regiões que múltiplos codificadores marcaram aproximadamente no mesmo lugar"), o que requer trabalho de pesquisa metodológica ortogonal. Está registrado como trabalho futuro.

## Como o output é estruturado

O relatório de κ pra bbox sempre inclui:
- Valor(es) de κ (escalar pra 2 codificadores; matriz pra N>2).
- Threshold IoU usado.
- Resolução do grid (200 ou 400 quando adaptive ativou).
- Número de regiões totais por codificador.
- Número de regiões emparelhadas vs não-emparelhadas.
- Por código aplicado: agreement parcial.

## Limitações conhecidas

1. **Multi-código reduzido a first-code alfabético** (limitação herdada do motor κ existente — afeta TODAS as engines do plugin, não só bbox). Quando uma região tem `codes: [a, b]`, a comparação κ usa apenas o código alfabeticamente primeiro. Mencione explicitamente em métodos se citar κ deste plugin, ou restrinja coding a 1 código por região no estudo.

2. **Receita nova sem corpus de validação cross-vault.** O algoritmo bbox-as-unit + Hungarian + κ pareado não tem precedent direto na literatura QDA. Está alinhado com práticas de visão computacional (IoU, Hungarian) e com práticas QDA pra texto (Cohen κ), mas a combinação específica é nova. Estudos devem citar este documento e documentar os parâmetros.

3. **Bounds não-retangulares aproximados em raster.** Elipses e polígonos têm erro de borda <0.5% por dimensão em grid 200×200 (e <0.25% em 400×400). Em estudos com regiões muito pequenas, considere se esse erro é tolerável. Regiões com aspecto muito fino (ex: rect com largura <0.5% da página) podem ter IoU instável mesmo com adaptive resolution; o relatório lista um warning.

4. **Single-page scope.** A análise não combina concordância em 2 páginas diferentes da mesma análise. Cada página é avaliada independentemente; uma região em página 3 nunca pareará com uma região em página 5.

5. **Multi-codificador via matriz pair-wise.** Não há "Fleiss κ multi-codificador" pra bbox. Reporte média + range da matriz pair-wise.

## Trabalho futuro

- **Set-valued labels no motor κ:** suporte propriamente a multi-código via distância de Jaccard (ou similar) entre code-sets, eliminando a redução first-code. Refactor do motor κ — afeta todas as engines do plugin.
- **cu-α com IoU contínuo:** eliminaria o threshold; respeitaria continuidade da sobreposição. Linha de pesquisa publicável; exige derivação formal de chance agreement 2D.
- **Multi-codificador via clustering N-way:** alternativa à matriz pair-wise; daria um número único pra N>2 codificadores. Exige design de algoritmo de clustering bbox.
- **Sub-cell precisão analítica:** pra estudos com regiões sub-pixel, fórmulas analíticas exatas substituiriam raster.

Cada uma destas linhas está registrada no Appendix A do spec doc original (developer audit) com condições de retomada.

---

## Referências

- Cohen, J. (1960). *A coefficient of agreement for nominal scales.* Educational and Psychological Measurement, 20(1), 37-46.
- Krippendorff, K. (2018). *Content Analysis: An Introduction to Its Methodology* (4th ed.). Sage. (cu-α, α-binary)
- Lin, T. Y., et al. (2014). *Microsoft COCO: Common objects in context.* European Conference on Computer Vision. (IoU, mAP)
- Munkres, J. (1957). *Algorithms for the assignment and transportation problems.* Journal of the Society for Industrial and Applied Mathematics, 5(1), 32-38. (Hungarian)
- Williamson, F., et al. (2025). *In Tandem With AI.* (ICR + AI workflow em ATLAS.ti)
- Lumivero (2025). *NVivo Coding Comparison Query documentation.*
- ATLAS.ti GmbH (2025). *Inter-Coder Agreement (ICA) module documentation.*

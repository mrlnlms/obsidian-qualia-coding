# ICR pra multi-código por marker — methodology

> **Audiência:** pesquisador escrevendo seção de métodos em paper, ou avaliando se o plugin é defendable pra publicação.
>
> **Status:** spec'd e plano de implementação aprovado em 2026-05-12. **Código ainda não implementa este comportamento** — motor κ atual reduz multi-código a first-code alfabético em 7 sites. Este doc descreve o **destino** (refactor C em curso). Quando implementação fechar, status muda pra "stable".
>
> **Spec autoritativo:** `docs/superpowers/specs/2026-05-12-icr-set-valued-labels-design.md`
>
> **Plan de implementação:** `docs/superpowers/plans/2026-05-12-icr-set-valued-labels.md`
>
> **Companion docs:**
> - `docs/ICR-MULTIMODAL-METHODOLOGY.md` — framework cross-modalidade (Camada 1/2/3, agregação, LLM como faceta)
> - `docs/ICR-METHODOLOGY.md` — ICR pra coding espacial 2D (bbox)
> - `docs/ICR-LINEAR-METHODOLOGY.md` — texto (markdown + PDF text + CSV segment)
> - `docs/ICR-TEMPORAL-METHODOLOGY.md` — áudio + vídeo
> - `docs/ICR-CATEGORICAL-METHODOLOGY.md` — CSV row

---

Este documento descreve como o motor de Inter-Coder Reliability (ICR) do plugin Qualia Coding trata markers que carregam **múltiplos códigos simultaneamente**. Aplica-se a todas as engines (markdown, PDF, CSV, audio, video, image) sempre que um codificador atribui 2 ou mais códigos à mesma região.

## O problema, em um exemplo

Imagine que a Carla codifica um trecho de entrevista com os códigos `{cor, raiva}` (a fala expressa **e** uma cor metafórica **e** raiva). A Joana, lendo o mesmo trecho, codifica com `{cor, frustração}` (a cor está lá, mas Joana lê o sentimento como frustração, não raiva).

Antes do refactor C, o motor κ do plugin **reduzia cada conjunto ao primeiro código em ordem alfabética**. No exemplo, `cor` aparece nos dois conjuntos e é o primeiro alfabeticamente nos dois — então o motor "achava" que Carla e Joana concordaram totalmente. A discordância sobre `raiva` vs `frustração` desaparecia silenciosamente.

Isso era matematicamente errado pra a semântica que o plugin entrega: cada região carrega um **conjunto de códigos como unidade analítica indivisível**, não um código solitário. O refactor C corrige isso.

## Como funciona, em uma página

Quando você roda Compare Coders com Krippendorff α (ou cu-α) num escopo que tem markers multi-código, o plugin agora:

1. **Mantém os conjuntos íntegros** — `{cor, raiva}` permanece como conjunto, não vira só `cor`.
2. **Calcula a distância entre conjuntos** usando uma das duas fórmulas (Jaccard ou MASI — você escolhe via toggle no toolbar do Compare Coders).
3. **Integra essa distância nos cálculos clássicos de α** (D_o observado e D_e esperado) — sem mudar a estrutura matemática do α; apenas trocando a função de distância que ele usa internamente.
4. **Reporta um κ que reflete agreement parcial** quando os conjuntos compartilham códigos mas não são idênticos.

Pra Cohen κ, o caminho é diferente (caminho A — binary-per-label macro-average): pra cada código no universo, monta uma matriz 2×2 de presença/ausência e calcula Cohen κ binário; o κ final é a média desses κ por código. Esse é o mesmo padrão que o NVivo Coding Comparison Query usa há anos.

Pra Fleiss κ, quando o escopo tem markers multi-código, o motor delega automaticamente pra Krippendorff α com a distância ativa — porque Fleiss κ é matematicamente um caso particular de α com N codificadores, e os dois números coincidem nesse caso.

Pra α-binary, nada muda — α-binary já trata cada região como "tem código aplicado / não tem" (binário), ignorando a identidade do código. Set-valued não afeta.

## As duas distâncias entre conjuntos

### Jaccard distance (default)

```
d_Jaccard(A, B) = 1 − |A ∩ B| / |A ∪ B|
```

- 0 quando os conjuntos são idênticos.
- 1 quando os conjuntos são completamente disjuntos.
- Valor parcial proporcional à interseção.

Casos numéricos:

| Conjuntos | d_Jaccard |
|---|---|
| `{a, b}` vs `{a, b}` (idênticos) | 0 |
| `{a, b}` vs `{a, b, c}` (um codificador foi mais granular) | 0.333 |
| `{a, b}` vs `{a, c}` (compartilham `a`, divergem no resto) | 0.667 |
| `{a, b}` vs `{c, d}` (nenhum código em comum) | 1 |

Jaccard é amplamente usada em machine learning, information retrieval, e estatística aplicada. É a métrica de "similaridade de conjuntos" mais ubíqua na literatura adjacente. Defendável em qualquer paper.

### MASI distance (opt-in)

MASI (Measuring Agreement on Set-valued Items) foi proposta por **Rebecca Passonneau (2006)** no contexto de anotação linguística semântica. Adiciona um **fator de monotonicidade** que diferencia tipos de discordância parcial:

```
d_MASI(A, B) = 1 − (|A ∩ B| / |A ∪ B|) × M

M = 1     se A == B
M = 2/3   se A ⊂ B ou B ⊂ A   (um conjunto é subconjunto estrito do outro)
M = 1/3   se A ∩ B ≠ ∅ mas nenhum é subconjunto do outro   (overlap lateral)
M = 0     se A ∩ B = ∅
```

Casos numéricos comparados:

| Conjuntos | d_Jaccard | d_MASI |
|---|---|---|
| `{a, b}` vs `{a, b}` | 0 | 0 |
| `{a, b}` vs `{a, b, c}` (subset) | 0.333 | **0.555** |
| `{a, b}` vs `{a, c}` (overlap lateral) | 0.667 | **0.889** |
| `{a, b}` vs `{c, d}` (disjoint) | 1 | 1 |

Lendo a tabela: MASI **premia mais** quando um codificador foi simplesmente "mais granular" que o outro (subset relation — a divergência é refinamento, não conflito); e **penaliza mais** quando os codificadores divergem lateralmente (overlap parcial sem hierarquia — discordância de interpretação real). MASI captura uma intuição semântica que Jaccard achata.

MASI é padrão de fato em anotação semântica e pragmática (linguística computacional). Em QDA tradicional, é menos conhecida, mas defendável quando citada com referência à paper original.

## Fórmulas e algoritmos dos coeficientes

Esta seção lista as fórmulas exatas que o motor κ aplica em cada coeficiente quando o escopo tem markers multi-código. Cite estas fórmulas em seção de métodos quando publicar resultados.

### Krippendorff α com distância paramétrica

α é a generalização limpa pra set-valued — paramétrica em distance function δ desde Krippendorff (2018, cap. 11). Fórmula:

```
α = 1 − D_o / D_e
```

Onde:

```
D_o = (1 / n_pares_observados) × Σ_unit  Σ_{(i,j)} δ(set_coder_i, set_coder_j)
```

(soma sobre todos pares (i,j) de codificadores na mesma unit, sobre todas as units, dividido pelo número total de pares)

```
D_e = (1 / N²_total) × Σ_{(A,B) ∈ pares_observados}  freq(A) × freq(B) × δ(A, B)
```

(distribuição empírica de sets observados — não enumeração de todos sets possíveis, evita explosão de Pe; receita standard de Krippendorff 2018)

A função δ é uma das três: `δ_nominal`, `δ_jaccard`, ou `δ_MASI` (definidas na seção anterior). O plugin usa `δ_jaccard` por default; usuário troca pra `δ_MASI` via toggle no toolbar.

**Equivalência com Cohen κ pareado weighted:** quando há exatamente 2 codificadores e os sets têm tamanho 1, α com δ_nominal ≡ Cohen κ clássico. Quando há 2 codificadores e sets multi-label, α com δ_jaccard ≡ Cohen κ pareado weighted com peso = Jaccard similarity (caminho C da literatura — ver Appendix A.2 do spec). Por isso o plugin **não oferece "Cohen κ pareado weighted" como rótulo separado** — usaria a mesma fórmula com nome confuso.

### Cohen κ multi-label (caminho A — binary-per-label macro-average)

Quando você seleciona Cohen κ num escopo multi-label, o motor aplica caminho A. Algoritmo:

```
Entrada: N regiões, 2 codificadores (A e B), cada um com set de códigos por região
Saída: κ_macro (número único) + κ por código (decomposição auditável)

1. Coleta universo_de_codigos = união de todos os codes vistos em A e B
2. Pra cada code c ∈ universo_de_codigos:
     a. Constrói matriz 2×2 de contagem:
        ┌───────────────────────────┬───────────────────────────┐
        │ B aplicou c               │ B não aplicou c           │
   ┌────┼───────────────────────────┼───────────────────────────┤
   │ A  │ n_11(c)                   │ n_10(c)                   │
   │ apl│                           │                           │
   ├────┼───────────────────────────┼───────────────────────────┤
   │ A  │ n_01(c)                   │ n_00(c)                   │
   │ não│                           │                           │
   └────┴───────────────────────────┴───────────────────────────┘

     b. Calcula Cohen κ binário sobre essa matriz:
        P_o(c) = (n_11 + n_00) / N
        P_e(c) = [(n_11 + n_10) × (n_11 + n_01) + (n_01 + n_00) × (n_10 + n_00)] / N²
        κ(c)   = (P_o(c) − P_e(c)) / (1 − P_e(c))

3. κ_macro = média aritmética de κ(c) sobre todos códigos do universo
4. Retorna { value: κ_macro, perCode: { c1: κ(c1), c2: κ(c2), ... } }
```

**Propriedade importante:** caminho A trata cada código como universo independente. Não usa distância entre conjuntos — por isso o toggle Jaccard/MASI fica cinza desabilitado quando você seleciona Cohen κ. Vantagem: paridade direta com NVivo Coding Comparison Query. Caveat: perde noção holística do conjunto (relação entre códigos que coexistem na mesma região).

**Reporting em paper:** "Cohen κ multi-label foi calculado via macro-average sobre Cohen κ binário (presença/ausência) por código (cf. NVivo Coding Comparison Query)."

### Fleiss κ multi-label (fallback automático)

Quando o escopo tem sets multi-label, Fleiss κ delega automaticamente pra Krippendorff α com a distância ativa. Razão matemática:

```
Fleiss κ (clássico, single-label, N codificadores) ≡ Krippendorff α nominal com N codificadores
```

Em sets single-label, os dois números coincidem. Em sets multi-label, "estender Fleiss κ" significa escolher como interpretar o set — e essa escolha vira δ_jaccard ou δ_MASI, ou seja, α com δ paramétrica. Manter "Fleiss κ multi-label" como rótulo separado pra mesmo cálculo confunde o pesquisador.

**Tooltip do plugin** quando você seleciona Fleiss num escopo multi-label: "Fleiss κ ≡ Krippendorff α nominal pra single-label. Em sets multi-label, motor usa α com δ ativa." Toggle Jaccard/MASI fica **ativo** (você controla a δ).

**Reporting em paper:** "Concordância multi-codificador em escopo multi-label foi calculada via Krippendorff α com distância Jaccard/MASI; o toolbar de Fleiss κ delega pra essa fórmula porque Fleiss é caso particular de α (Krippendorff, 2018, p. 277)."

### cu-α (continuous unitization α)

Reusa Krippendorff α dentro do escopo de boundaries compartilhadas. Mesma fórmula de α, mesma δ paramétrica — operada sobre os char-ranges/segments cobertos por algum coder.

### α-binary

Inalterado pelo refactor C. Cada região colapsa pra `__present__` (algum código aplicado) ou `__none__` (sem código). Não usa identidade dos códigos, então sets multi-label se tornam single-label binário automaticamente. Toggle Jaccard/MASI fica cinza desabilitado.

---

## Quando usar Jaccard, quando usar MASI

Recomendação direta:

- **Jaccard (default)** — use sempre que não tiver razão específica pro contrário. É ubíqua, defendável em qualquer paper, e qualquer revisor entende.
- **MASI** — use quando seu codebook tem **relações hierárquicas explícitas** entre códigos (códigos genéricos contidos em códigos específicos) e você quer que agreement parcial reflita "codificador mais granular ≠ codificador divergente". Caso típico: análise temática com categorias e subcategorias na mesma região.

Em paper, cite a distância usada explicitamente. Ex:

> "Inter-coder reliability foi calculada via Krippendorff α com distância Jaccard entre conjuntos de códigos por região (Krippendorff, 2018, cap. 11)."
>
> ou
>
> "...com distância MASI (Passonneau, 2006) entre conjuntos, capturando a monotonicidade entre subconjuntos hierárquicos do codebook."

## O que muda no número κ quando seu corpus tem multi-código

Antes do refactor C, casos como `{cor, raiva}` vs `{cor, frustração}` contavam como **agreement total** (motor reduzia ambos a `cor`). κ inflado em proporção à frequência de discordância multi-código.

Após o refactor C, esses casos contam como **agreement parcial**, com valor dependente da distância escolhida:

- Em corpus **predominantemente single-label** (cada região com 1 código): Jaccard, MASI e nominal produzem o **mesmo número**. Sem mudança visível.
- Em corpus com **alguma fração multi-código** (digamos 10-30%): κ pode cair entre alguns décimos. Diferença entre Jaccard e MASI é pequena mas mensurável.
- Em corpus com **alta densidade multi-código** (>50%): κ pode cair substancialmente. Diferença Jaccard vs MASI fica mais visível.

O plugin mostra um **badge** acima da matriz do Compare Coders indicando quantos markers no escopo são multi-código e em que porcentagem, pra você calibrar atenção.

## Limitações conhecidas

### Cohen κ multi-label = paridade NVivo

Quando você seleciona Cohen κ no toolbar com escopo multi-código, o motor usa **caminho A** (binary-per-label macro-average). Isso é o mesmo padrão do NVivo Coding Comparison Query. Vantagem: paridade com a expectativa do pesquisador QDA que vem de NVivo. **Caveat:** caminho A perde a noção holística do conjunto — trata cada código como universo independente, perdendo a relação entre códigos que compartilham regiões.

Se você quer manter a noção holística do conjunto, use **Krippendorff α com Jaccard ou MASI** em vez de Cohen κ. α é a generalização matemática limpa pra set-valued.

O chip toggle Jaccard/MASI fica **cinza desabilitado** quando você seleciona Cohen κ — porque caminho A não usa distância entre conjuntos.

### Fleiss κ aposenta em escopos multi-label

Quando você seleciona Fleiss κ num escopo que tem markers multi-código, o motor **automaticamente usa Krippendorff α** com a distância ativa. Isso é matemático: Fleiss κ é um caso particular de α com N codificadores; em sets multi-label, manter dois nomes pra mesmo cálculo confunde. O tooltip do chip explica.

Em escopos single-label puros, Fleiss κ continua calculando como sempre.

### Aggregate cross-engine ainda em aberto

Quando você roda Compare Coders sobre múltiplas engines (ex: markdown + PDF + audio juntos), o motor produz um κ agregado ponderado por número de markers de cada engine. Como "1 marker markdown" e "1 marker bbox" representam quantidades de trabalho analítico diferentes, o número agregado tem viés. Esse é um problema separado (item B4 no roadmap do plugin), não resolvido neste refactor.

Recomendação prática: ao reportar κ em paper sobre análise multi-modal, **reporte κ por engine separadamente** (o plugin mostra isso por padrão na matriz Mode A) em vez de citar só o agregado.

## Referências bibliográficas

- **Krippendorff, K.** (2018). *Content Analysis: An Introduction to Its Methodology* (4ª ed.). Sage. Capítulo 11 cobre extensão de α via distance function customizada — base teórica pra Jaccard/MASI dentro de α.
- **Passonneau, R.** (2006). Measuring Agreement on Set-valued Items (MASI) for Semantic and Pragmatic Annotation. In *Proceedings of LREC*. ACL Anthology [L06-1392](https://aclanthology.org/L06-1392/). Paper original que define MASI.
- **Rosenberg, A., & Binkowski, E.** (2004). Augmenting the kappa statistic to determine interannotator reliability for multiply labeled data points. In *Proceedings of NAACL/HLT*. Referência metodológica adicional pra Cohen κ multi-label (caminho B, considerado e rejeitado em favor do caminho A — ver spec).
- **NLTK** — `nltk.metrics.masi_distance` e `jaccard_distance` em `nltk/metrics/distance.py`. **Aviso:** a implementação MASI do NLTK [diverge da paper de Passonneau](https://github.com/nltk/nltk/issues/294) (issue aberto desde 2012). Este plugin implementa a fórmula direta da paper.

## Decisão única que ainda fica com você

A escolha entre Jaccard e MASI fica salva por SavedComparison (toolbar do Compare Coders). Você decide ao criar/editar a comparação; a escolha viaja com o doc. Pra papers diferentes com escopos diferentes do mesmo corpus, pode salvar comparações separadas com distâncias diferentes — o plugin acomoda.

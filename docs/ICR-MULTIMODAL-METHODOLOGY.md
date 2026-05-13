# ICR Multimodal — framework de reliability cross-modalidade

> **Audiência:** pesquisador escrevendo seção de métodos em paper que use o plugin pra análise multimodal (texto + PDF + imagem + audio/vídeo + tabular). Também relevante pra quem usa o plugin com coding humano + LLM-assistido.
>
> **Status (2026-05-13):**
> - **Camada 1 (per-modality enforcement)** — em implementação (sessão B4)
> - **Camada 2 (Bayesian annotation model com LLM como faceta)** — planejada; entra junto com a primeira implementação de LLM coding
> - **Camada 3 (G-theory multivariate / MFRM)** — research-grade opcional, sem timeline cravada
>
> **Spec autoritativo da virada conceitual:** `obsidian-qualia-coding/Research/ICR Multimodal - Unidades Heterogeneas.md` (pesquisa 2026-05-13)
>
> **Companion docs (methodology por modalidade):**
> - `docs/ICR-LINEAR-METHODOLOGY.md` — texto (markdown + PDF text + CSV segment)
> - `docs/ICR-METHODOLOGY.md` — bbox 2D (PDF shape + imagem)
> - `docs/ICR-TEMPORAL-METHODOLOGY.md` — audio + vídeo
> - `docs/ICR-CATEGORICAL-METHODOLOGY.md` — CSV row
> - `docs/ICR-SET-VALUED-METHODOLOGY.md` — multi-código por marker (transversal)

---

## O problema, em uma frase

Em análise multimodal, "1 marker" significa quantidade de trabalho analítico **semanticamente diferente** em cada modalidade — 1 char-range de texto ≠ 1 bbox em PDF ≠ 1 intervalo em segundos no áudio ≠ 1 linha de CSV. Calcular um único κ pooled agregando esses markers por contagem trata-os como trocas comensuráveis, o que **não é defensável** na literatura de reliability.

## Por que o plugin não vende um número único cross-modalidade

Quando você roda Compare Coders sobre escopo que mistura modalidades, o plugin **não oferece um κ pooled como métrica primária**. Razão fundamentada em literatura:

- κ e α de Krippendorff são definidos sobre uma **única variável homogênea** com sua própria função distância δ. Dois α com δ diferentes **não estão na mesma escala** — média aritmética entre eles não tem interpretação interpretável (Krippendorff, 2018; Hayes & Krippendorff, 2007).
- Stratified κ (Barlow, 1996; Vanbelle, 2019) só admite ponderação quando estratos compartilham o mesmo esquema categorial — **não** é o caso entre char-range, bbox, intervalo temporal e linha tabular.
- Artstein & Poesio (2008) e Mathet et al. (2015) demonstram que diferentes tipos de unidade de análise (UoA) exigem coeficientes diferentes. **Pool entre eles não é definido** na literatura.
- Convergência empírica em corpora multimodais consolidados (AMI Meeting Corpus, MUMIN, NEUROGES, ELAN) é reportar reliability **separadamente por camada/tier/dimensão**, não como número único pooled.

Posição defensável em paper: *"A operação de agregar κ por contagem de markers através de modalidades carece de fundamento em Krippendorff (2018), Artstein & Poesio (2008) e Mathet et al. (2015), pois cada UoA exige sua própria função distância e seu próprio coeficiente."* A operação é **unsupported**, não **refutada** — o ônus de defesa cai em quem agrega.

## O que o plugin reporta hoje (Camada 1)

Quando o escopo do Compare Coders contém duas ou mais modalidades, a apresentação primária é uma **tabela κ/α por modalidade**:

```
┌──────────────┬─────────┬──────────┬─────────┬───────────┬─────────┐
│ Modalidade   │ Cohen κ │ Fleiss κ │ α       │ α-binary  │ cu-α    │
├──────────────┼─────────┼──────────┼─────────┼───────────┼─────────┤
│ texto (md)   │  0.71   │   0.69   │  0.72   │   0.78    │  0.74   │
│ bbox (PDF)   │  0.55   │   0.58   │  0.61   │   0.67    │   —     │
│ áudio        │  0.83   │   0.81   │  0.85   │   0.88    │  0.82   │
└──────────────┴─────────┴──────────┴─────────┴───────────┴─────────┘
```

Cada modalidade tem seu coeficiente com a δ apropriada:
- **Texto** (char-range): δ nominal sobre chars, ou δ Jaccard/MASI quando há multi-código por marker (ver `ICR-SET-VALUED-METHODOLOGY.md`)
- **Bbox 2D**: matching IoU + Hungarian (ver `ICR-METHODOLOGY.md`)
- **Audio/Vídeo**: δ temporal por segundo (ver `ICR-TEMPORAL-METHODOLOGY.md`)
- **CSV row**: δ nominal categórica (ver `ICR-CATEGORICAL-METHODOLOGY.md`)

Quando o plugin oferece um valor agregado, ele aparece **marcado como descritivo, não inferencial**, com tooltip apontando pra este documento. Pesquisador que cita um número agregado em paper sem esse caveat está usando o plugin contra a recomendação da literatura.

## Como reportar em paper (Camada 1)

Convenção sustentável por evidência convergente (Krippendorff 2018; Hayes & Krippendorff 2007; Artstein & Poesio 2008; Hallgren 2012; O'Connor & Joffe 2020):

1. **Reportar reliability separadamente por modalidade**, identificando para cada uma:
   - Coeficiente usado (Cohen κ, Krippendorff α, etc.) + justificativa da δ
   - N de unidades analisadas, N de codificadores
   - % do corpus duplo-codificado
   - Intervalo de confiança bootstrap quando aplicável
   - Quando relevante, desagregação por código dentro da modalidade

2. **Se síntese cross-modalidade for analiticamente necessária**, sustentar com modelo de variância (Camada 2 ou 3 — ver abaixo). Não com média ponderada por contagem de markers.

3. **Nunca reportar a média ponderada por N como métrica primária.** Se reportar, marcar como descritivo com referência explícita à incomensurabilidade de δ entre modalidades.

Frase pronta pra seção de métodos:

> "Inter-coder reliability foi calculada separadamente por modalidade, usando Krippendorff α com função distância apropriada a cada unidade de análise (nominal para texto e categórico tabular; α com δ Jaccard/MASI para regiões multi-código; matching IoU + Hungarian para bbox 2D; α temporal para áudio/vídeo). Não foi calculado um valor agregado cross-modalidade, alinhado com a recomendação de Krippendorff (2018), Artstein & Poesio (2008) e Mathet et al. (2015) e a prática estabelecida em corpora multimodais (AMI Meeting Corpus; MUMIN; NEUROGES)."

## Caminho futuro — Camada 2 e Camada 3 do framework

Quando você precisa de **diagnóstico sobre as fontes de unreliability** (e não só de um valor de agreement), o plugin oferece — em camadas futuras — caminhos defensáveis em literatura:

### Camada 2 — Bayesian annotation model com modalidade e tipo de coder como facetas

Para corpora que envolvem **humano + N LLMs codificando o mesmo material**, o plugin vai implementar a tradição de annotator quality modeling de NLP/speech (Dawid & Skene, 1979; Whitehill et al., 2009; Hovy et al., 2013 — MACE; Sheng et al., 2008; Snow et al., 2008; Passonneau & Carpenter, 2014; Paun et al., 2018). Modelo estima simultaneamente:

- **Competência por coder** (humano ou LLM), por modalidade — separa coder severo de coder errático de coder em modo "spam"/hallucination
- **Dificuldade por item** — quais segmentos confundem múltiplos coders
- **Label latente** — estimativa probabilística da "verdade" sob heterogeneidade de coders

Esse modelo:
1. **Não exige homogeneidade** de coders ou de modalidades
2. **Identifica LLM em modo hallucination** via fit statistics (analogia direta com "spammer detection" de MACE)
3. **Substitui** a noção de "média entre coders" por estimativa Bayesiana com posterior
4. **Trata humano e LLM no mesmo framework matemático** — sem precisar tratar AI como categoria epistemológica separada

**Decisão de produto cravada (2026-05-13):** LLM coding não entra no plugin sem Camada 2. LLM como coder sem fundamento Bayesiano vira "auto-code button" sem rigor — exatamente o uso comoditizado que outras ferramentas oferecem. Com Camada 2, o plugin se posiciona como **bench de avaliação rigorosa de LLM em QDA multimodal** — categoria que não existe no mercado.

### Camada 3 — G-theory multivariate ou Many-Facet Rasch Measurement

Para corpora grandes o suficiente (rule of thumb: ≥ 2 codificadores × ≥ 2 modalidades × ≥ 30 itens por célula), o plugin pode oferecer decomposição completa de variância em facetas (Brennan, 2001 cap. 9; Shavelson & Webb, 1991; Vispoel et al., 2018 para versão Bayesiana). Desenho `pessoa × rater × modalidade × tipo de coder`:

```
σ²(X) = σ²_p + σ²_r + σ²_m + σ²_c + σ²_{rm} + σ²_{rc} + σ²_{mc} + σ²_{rmc} + σ²_e
```

Cada componente responde uma pergunta específica que κ pooled não responde:

| Componente | Pergunta |
|---|---|
| σ²_p | Quanto da variação é sinal real (coding correto)? |
| σ²_r | Quanto vem da identidade do codificador? |
| σ²_m | Quanto vem da modalidade (bbox é mais difícil que texto)? |
| σ²_c | Quanto vem do tipo de coder (humanos vs LLMs)? |
| σ²_{rm} | Algum codificador é especialmente bom/ruim numa modalidade? |
| σ²_{mc} | LLMs são piores em bbox que humanos? |

Many-Facet Rasch (Linacre, 1989; Eckes, 2015) oferece alternativa em escala logit com fit statistics infit/outfit MSQ.

Camada 3 é research-grade, opt-in, e tem custo alto de adoção (software especializado: GENOVA, mGENOVA, lme4 para G-theory; FACETS para MFRM). Plugin vai expor uma interface, não exigir do usuário.

## Por que isso importa para uso com LLM

A virada conceitual de 2026-05-13 reconhece que **heterogeneidade de modalidade e heterogeneidade de coder são o mesmo problema estrutural** — ambos são facetas em um desenho de medida. Tratá-los separadamente força o plugin a inventar duas soluções ad hoc; tratá-los como instâncias do mesmo problema permite uma resposta unificada.

Concretamente:

- Quando o plugin oferece LLM coding (futuro), o LLM será modelado como **um coder no framework**, não como "feature de AI"
- Compare Coders entre humano e LLMs vai operar com a mesma matemática usada pra comparar dois humanos
- Comparação humano vs LLM-A vs LLM-B vai mostrar **decomposição de variância**, não só um κ par-a-par
- Trocar o prompt do LLM = mudar a faceta `c` no modelo, com decomposição mostrando quanto a concordância melhorou — plugin vira **bench de prompt engineering** com fundamento metodológico

## Origem disciplinar dos métodos

A tradição QDA stricto sensu (Strauss & Corbin, Charmaz, Saldaña) é historicamente cética de reliability quanti — debate é sobre trustworthiness, member checking, qualitative validity. Reliability multimodal é tema importado de **outras tradições adjacentes**:

| Tradição | Contribuição |
|---|---|
| Educational measurement / Psychometrics | G-theory (Brennan, Shavelson, Webb); MFRM (Linacre, Eckes) |
| Communication / Content Analysis | Krippendorff α e variantes (anos 70+); Hayes |
| Computational Linguistics / NLP | γ de Mathet et al. (2015); Artstein & Poesio (2008); annotator quality models |
| Speech / HCI / Multimodal Corpora | AMI Meeting Corpus (Carletta); MUMIN (Allwood); NEUROGES; ELAN |
| Clinical observation | ICC multi-way (Shrout & Fleiss); Hallgren |
| Qualitative methods | O'Connor & Joffe (2020) — único par com link direto a QDA |

**Posição defensável em paper:** o plugin opera num cruzamento de tradições. Não é "QDA tool com extensão multimodal" — é **híbrido de NLP/speech multimodal annotation + epistemologia QDA** (memo, relations, magnitudes, audit trail interpretativo, open coding). Defesa metodológica em paper vem das tradições importadas, não da tradição QDA estrita.

## Limitações conhecidas e trabalho em andamento

1. **Não existe template "oficial" cross-modalidade.** Não há equivalente do CONSORT/STROBE para reliability multimodal. Documentos de corpora multimodais (AMI, MUMIN, NEUROGES) funcionam como precedente, não como standard.

2. **Coeficiente unificado verdadeiramente multimodal não existe.** γ de Mathet et al. (2015) avançou pra continua categorizados (texto/audio segmentado) mas não cobre bbox 2D + char-range + intervalo temporal + linha tabular simultaneamente. Trabalho em medical image segmentation (STAPLE) explora IoU + κ híbridos mas é intra-modalidade. O plugin opera em território de pesquisa ativa.

3. **Bayesian hierarchical models para IRR multilevel** (Tran, Demirhan & Dolgun, 2021; Vispoel et al., 2018) sugerem caminho promissor pra Camada 3 mas sem consenso ainda em QDA aplicada.

## Referências bibliográficas

### Frame teórico central
- **Krippendorff, K.** (2018). *Content Analysis: An Introduction to Its Methodology* (4th ed.). Sage.
- **Hayes, A. F., & Krippendorff, K.** (2007). Answering the call for a standard reliability measure for coding data. *Communication Methods and Measures*, 1(1), 77–89.
- **Artstein, R., & Poesio, M.** (2008). Inter-coder agreement for computational linguistics. *Computational Linguistics*, 34(4), 555–596.
- **Mathet, Y., Widlöcher, A., & Métivier, J.-P.** (2015). The unified and holistic method gamma (γ) for inter-annotator agreement measure and alignment. *Computational Linguistics*, 41(3), 437–479.
- **Krippendorff, K., Mathet, Y., Bouvry, S., & Widlöcher, A.** (2016). On the reliability of unitizing textual continua: Further developments. *Quality & Quantity*, 50(6), 2347–2364.

### Generalizability Theory (Camada 3)
- **Brennan, R. L.** (2001). *Generalizability theory*. Springer.
- **Shavelson, R. J., & Webb, N. M.** (1991). *Generalizability theory: A primer*. Sage.
- **Vispoel, W. P., Morris, C. A., & Kilinc, M.** (2018). A Bayesian approach to estimating variance components within a multivariate generalizability theory framework. *Behavior Research Methods*.

### Many-Facet Rasch Measurement (Camada 3)
- **Linacre, J. M.** (1989). *Many-facet Rasch measurement*. MESA Press.
- **Eckes, T.** (2015). *Introduction to Many-Facet Rasch Measurement* (2nd ed.). Peter Lang.

### Annotator quality / crowdsourcing (Camada 2)
- **Dawid, A. P., & Skene, A. M.** (1979). Maximum likelihood estimation of observer error-rates using the EM algorithm. *Applied Statistics*, 28(1), 20–28.
- **Whitehill, J., Wu, T., Bergsma, J., Movellan, J. R., & Ruvolo, P. L.** (2009). Whose vote should count more: Optimal integration of labels from labelers of unknown expertise. *NeurIPS*.
- **Hovy, D., Berg-Kirkpatrick, T., Vaswani, A., & Hovy, E.** (2013). Learning whom to trust with MACE. *NAACL*.
- **Paun, S., Carpenter, B., Chamberlain, J., Hovy, D., Kruschwitz, U., & Poesio, M.** (2018). Comparing Bayesian models of annotation. *Transactions of the ACL*, 6, 571–585.
- **Passonneau, R. J., & Carpenter, B.** (2014). The benefits of a model of annotation. *Transactions of the ACL*, 2, 311–326.

### Corpora multimodais (precedente prático)
- **Carletta, J., Ashby, S., Bourban, S., et al.** (2006). The AMI meeting corpus. *LNCS* 3869, 28–39.
- **Allwood, J., Cerrato, L., Jokinen, K., Navarretta, C., & Paggio, P.** (2007). The MUMIN coding scheme. *Language Resources and Evaluation*, 41(3), 273–287.
- **Brugman, H., & Russel, A.** (2004). Annotating multi-media/multi-modal resources with ELAN. *LREC 2004*.

### Qualitative IRR
- **O'Connor, C., & Joffe, H.** (2020). Intercoder reliability in qualitative research: Debates and practical guidelines. *International Journal of Qualitative Methods*, 19.
- **Hallgren, K. A.** (2012). Computing inter-rater reliability for observational data. *Tutorials in Quantitative Methods for Psychology*, 8(1), 23–34.

### LLM como coder
- **Gilardi, F., Alizadeh, M., & Kubli, M.** (2023). ChatGPT outperforms crowd workers for text-annotation tasks. *PNAS*, 120(30).

---

## Pra quem programa o plugin

A discussão técnica de implementação (refactor C set-valued labels, B4 Camada 1 enforcement, planejamento Camada 2) vive em:
- `docs/superpowers/specs/2026-05-12-icr-set-valued-labels-design.md` — refactor C arquivado em workspace externo após release 0.5.0
- `docs/ROADMAP.md` §"Framework Unificado ICR + LLM" — sequência de camadas no roadmap
- `docs/BACKLOG.md` §"ICR — Compare Coders polish" — escopo de B4 Camada 1
- `obsidian-qualia-coding/Research/ICR Multimodal - Unidades Heterogeneas.md` — pesquisa original que cravou a virada conceitual

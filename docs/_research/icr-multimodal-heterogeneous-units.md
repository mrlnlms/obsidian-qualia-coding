# Confiabilidade inter-codificador em QDA multimodal com unidades heterogêneas

## Enquadramento

Em análise qualitativa multimodal, a "unidade de análise" varia ontologicamente: char-range (texto), bbox 2D (imagem/PDF), intervalo temporal (A/V), linha (tabular). Calcular Cohen's κ ou Krippendorff's α agregando essas unidades por simples contagem trata-as como trocas comensuráveis, o que (a) viola a premissa de homogeneidade na construção de α (Krippendorff, 2018; Hayes & Krippendorff, 2007) e (b) inflaciona o peso de modalidades com unidades baratas/numerosas. As três tradições abaixo oferecem alternativas defensáveis.

---

## Campo 1 — Generalizability Theory (G-theory)

**Referências centrais**
- Brennan, R. L. (2001). *Generalizability theory*. Springer. https://link.springer.com/book/10.1007/978-1-4757-3456-0
- Shavelson, R. J., & Webb, N. M. (1991). *Generalizability theory: A primer*. Sage.
- Webb, N. M., Shavelson, R. J., & Haertel, E. H. (2007). Reliability coefficients and generalizability theory. *Handbook of Statistics*, 26, 81–124.
- Lakes, K. D., & Hoyt, W. T. (2009). Applications of generalizability theory to clinical child and adolescent psychology research. *Journal of Clinical Child & Adolescent Psychology*. https://pmc.ncbi.nlm.nih.gov/articles/PMC3650138/
- Vispoel, W. P., Morris, C. A., & Kilinc, M. (2018). A Bayesian approach to estimating variance components within a multivariate generalizability theory framework. *Behavior Research Methods*. https://link.springer.com/article/10.3758/s13428-017-0986-3

**O método.** G-theory substitui a noção monolítica de "erro" por decomposição ANOVA-style do score observado em **componentes de variância** atribuíveis a facetas distintas. Num desenho cruzado pessoa × rater × tarefa (p × r × t):

$$\sigma^2(X_{prt}) = \sigma^2_p + \sigma^2_r + \sigma^2_t + \sigma^2_{pr} + \sigma^2_{pt} + \sigma^2_{rt} + \sigma^2_{prt,e}$$

O **G-study** estima componentes; o **D-study** os combina em coeficientes G (relativo) ou Φ (absoluto). Para reliability inter-codificador:

$$G = \frac{\sigma^2_p}{\sigma^2_p + \sigma^2_{\text{erro relativo}}}$$

**Aplicação ao problema multimodal.** Modalidade entra como **faceta m** num desenho p × r × m. Os componentes σ²_m e σ²_{rm} respondem diretamente "quanto da variância se deve à modalidade e à sua interação com codificadores?", em vez de absorvê-la num κ pooled. **Multivariate G-theory** (Brennan, 2001, cap. 9) é o caminho formalmente correto quando se quer reportar fidedignidade conjunta sem colapsar unidades incompatíveis — cada modalidade tem sua estrutura de componentes e as covariâncias entre modalidades são modeladas.

A vantagem sobre κ pooled: G-theory **revela** quanto da desconcordância é atribuível à heterogeneidade entre modalidades em vez de escondê-la na média.

---

## Campo 2 — Many-Facet Rasch Measurement (MFRM)

**Referências centrais**
- Linacre, J. M. (1989). *Many-facet Rasch measurement*. MESA Press. https://www.rasch.org/facet.htm
- Eckes, T. (2015). *Introduction to Many-Facet Rasch Measurement* (2nd ed.). Peter Lang. https://www.peterlang.com/document/1045610
- Sudweeks, R. R., Reeve, S., & Bradshaw, W. S. (2004). A comparison of generalizability theory and many-facet Rasch measurement in an analysis of college sophomore writing. *Assessing Writing*, 9(3), 239–261. https://www.sciencedirect.com/science/article/abs/pii/S1075293504000364
- Wolfe, E. W., & McVay, A. (2012). Application of latent trait models to identifying substantively interesting raters. *Educational Measurement: Issues and Practice*, 31(3), 31–37.

**O método.** Para uma resposta x_{nijk} (pessoa n, item i, juiz j, categoria k):

$$\log\!\left(\frac{P_{nijk}}{P_{nij(k-1)}}\right) = \beta_n - \delta_i - \alpha_j - \tau_k$$

onde β_n = proficiência, δ_i = dificuldade, α_j = severidade do juiz, τ_k = passo de categoria. Facetas novas (e.g., modalidade m com leniência μ_m) entram aditivamente. **Todas as estimativas em logits — comparáveis entre facetas heterogêneas.**

**Aplicação ao problema multimodal.** Tratar **modalidade como faceta** com μ_m separa três efeitos confundidos no κ pooled: (a) severidade do codificador, (b) dificuldade do item, (c) leniência da modalidade. Output: medidas fair-corrected em escala única, com erros-padrão. Fit statistics (infit/outfit MSQ) sinalizam juízes/modalidades erráticos — diagnóstico que κ não fornece.

Eckes (2015, cap. 4–6) trata o caso de raters julgando objetos heterogêneos com escala comum. Sudweeks et al. (2004) mostram complementaridade com G-theory: MFRM produz **medidas fair-corrected por examinando**; G-theory produz **inferências sobre o desenho de medida**.

---

## Campo 3 — Literatura de anotação multimodal

**Referências centrais**
- Krippendorff, K. (2018). *Content analysis: An introduction to its methodology* (4th ed.). Sage.
- Hayes, A. F., & Krippendorff, K. (2007). Answering the call for a standard reliability measure for coding data. *Communication Methods and Measures*, 1(1), 77–89. https://doi.org/10.1080/19312450709336664
- Artstein, R., & Poesio, M. (2008). Inter-coder agreement for computational linguistics. *Computational Linguistics*, 34(4), 555–596. https://doi.org/10.1162/coli.07-034-R2
- Mathet, Y., Widlöcher, A., & Métivier, J.-P. (2015). The unified and holistic method gamma (γ) for inter-annotator agreement measure and alignment. *Computational Linguistics*, 41(3), 437–479. https://aclanthology.org/J15-3003/
- Krippendorff, K., Mathet, Y., Bouvry, S., & Widlöcher, A. (2016). On the reliability of unitizing textual continua: Further developments. *Quality & Quantity*, 50(6), 2347–2364. https://link.springer.com/article/10.1007/s11135-015-0266-1
- Carletta, J., Ashby, S., Bourban, S., et al. (2006). The AMI meeting corpus. *LNCS* 3869, 28–39. https://link.springer.com/chapter/10.1007/11677482_3
- Allwood, J., Cerrato, L., Jokinen, K., Navarretta, C., & Paggio, P. (2007). The MUMIN coding scheme. *Language Resources and Evaluation*, 41(3), 273–287. https://link.springer.com/article/10.1007/s10579-007-9061-5
- Brugman, H., & Russel, A. (2004). Annotating multi-media/multi-modal resources with ELAN. *LREC 2004*.
- O'Connor, C., & Joffe, H. (2020). Intercoder reliability in qualitative research: Debates and practical guidelines. *International Journal of Qualitative Methods*, 19. https://doi.org/10.1177/1609406919899220
- Hallgren, K. A. (2012). Computing inter-rater reliability for observational data. *Tutorials in Quantitative Methods for Psychology*, 8(1), 23–34. https://pmc.ncbi.nlm.nih.gov/articles/PMC3402032/

**O que sustentam.**

1. **Reporting per-variable, não pooled.** Krippendorff (2018) e Hayes & Krippendorff (2007) tratam α como coeficiente de **uma variável** com sua própria função distância δ. Dois α com δ diferentes **não estão na mesma escala** e não admitem média aritmética interpretável.

2. **Tarefas heterogêneas exigem coeficientes específicos.** Artstein & Poesio (2008) demonstram que tarefas além de categorização disjunta requerem α com δ apropriada. Mathet et al. (2015) propõem γ porque unitizing+categorização não se reduzem a um único κ. Krippendorff et al. (2016) formalizam u_α para continua. **A literatura central já trata cada tipo de unidade com seu próprio coeficiente.**

3. **Prática em corpora multimodais.** AMI Meeting Corpus (Carletta et al., 2006; https://groups.inf.ed.ac.uk/ami/corpus/annotation.shtml) reporta reliability **por esquema separadamente**. ELAN calcula agreement **por pares de tiers**, não cross-tier. MUMIN (Allwood et al., 2007) reporta por dimensão do esquema separadamente. NEUROGES-ELAN reporta κ por categoria gestual separada. **Convergência empírica em reportar por camada/tier/dimensão** — não há template canônico publicado.

4. **Literatura qualitativa reforça per-variable.** O'Connor & Joffe (2020) e Hallgren (2012) recomendam IRR por código/variável, com ICs, examinando padrões de disagreement por categoria. Nenhum endossa pooled cross-task κ.

---

## Síntese — Q1, Q5, Q9

### Q1 — A literatura sustenta a crítica?

**Sim, com consenso técnico, ainda que raramente formulado nesses termos exatos.** Não há paper que diga literalmente "agregar κ por contagem de unidades através de modalidades é inválido" — a crítica está implícita na construção:

1. κ e α são definidos sobre **uma variável homogênea**. δ é específico do tipo de medida; α com δ diferentes não compartilha unidade.
2. Stratified κ (Barlow, 1996; Vanbelle, 2019) só admite ponderação quando estratos compartilham o mesmo esquema categorial — **não** é o caso entre char-range, bbox, intervalo e linha tabular.
3. Artstein & Poesio (2008) e Mathet et al. (2015) reconhecem que diferentes UoAs exigem coeficientes diferentes. **Pool entre eles não é definido.**

Posição defensável: *"A operação carece de fundamento em Krippendorff (2018), Artstein & Poesio (2008) e Mathet et al. (2015), pois cada UoA exige sua própria função distância e seu próprio coeficiente."* É **unsupported**, não **refutado**.

### Q5 — Tratamento defensável?

Em ordem de força metodológica:

1. **Reportar separadamente por modalidade (mínimo defensável).** Cada modalidade com seu κ/α e δ apropriado (nominal para texto/CSV categórico; γ ou u_α para char-range com unitizing; IoU-based para bbox; α-temporal para A/V). É o que AMI, MUMIN e prática ELAN sustentam.

2. **G-theory multivariate (Brennan, 2001, cap. 9).** Modalidade como faceta, decomposição de variância em σ²_p, σ²_r, σ²_m, σ²_{rm}, σ²_{pm}. Reporta G global + decomposição. Responde "quanto da unreliability é atribuível à modalidade?".

3. **MFRM com modalidade como faceta (Linacre, 1989; Eckes, 2015).** Estima leniência μ_m em logits, corrige severidade do rater por modalidade, produz medidas fair-corrected comparáveis.

4. **Modelos Bayesianos hierárquicos (Vispoel et al., 2018; Tran, Demirhan & Dolgun, 2021, arXiv 2407.12700).** Generalizam G-theory para distribuições não-gaussianas e estruturas multinível.

**Ponderação por "tempo de codificação" ou "complexidade da unidade"** não tem proposta publicada cross-modality — a literatura responde a essa intuição via componentes de variância da G-theory, não via ponderação manual.

### Q9 — Como reportar em paper?

Convenção sustentável por evidência convergente:

1. **Reportar reliability separadamente por modalidade**, identificando: coeficiente usado + justificativa de δ; N de unidades, N de codificadores, % de corpus duplo-codificado; IC bootstrap (Hayes & Krippendorff, 2007); quando relevante, por código dentro da modalidade (Hallgren, 2012).

2. **Se síntese cross-modalidade for analiticamente necessária**, sustentar com (a) G-study multivariate reportando componentes de variância + G/Φ globais, ou (b) MFRM com modalidade como faceta. Ambos substituem κ-pooled-ponderado-por-contagem.

3. **Nunca reportar a média ponderada por N como métrica primária.** Se reportada por compatibilidade descritiva, marcar como **descritivo, não inferencial**, com referência explícita à incomensurabilidade de δ entre modalidades.

Não há template "oficial" — sem equivalente do CONSORT/STROBE para reliability multimodal. Documentos de corpora multimodais (AMI, MUMIN, NEUROGES) funcionam como precedente.

### Onde a literatura está em movimento

- **Coeficiente unificado multimodal.** γ (Mathet et al., 2015) avançou mas é restrito a continua categorizados. Não há análogo consolidado para bbox 2D + char-range + intervalo temporal + linha tabular simultaneamente. Trabalho em medical image segmentation (STAPLE) propõe IoU+κ híbridos, ainda intra-modalidade.
- **Bayesian hierarchical models para IRR multilevel.** Tran et al. (2021) sugerem caminho promissor — sem consenso ainda em QDA aplicada.

---

## Análise

**1. O κ pooled é unsupported, não refutado — o ônus muda.** Não há paper dizendo "agregar κ cross-modality por contagem é errado". Há ausência: os coeficientes não foram construídos pra isso. Implicação prática: quem agrega hoje pode argumentar "ninguém disse que não pode", mas em paper o **ônus da defesa cai em quem agrega**. A referência ortogonal (per-variable α de Krippendorff, γ de Mathet et al.) está cravada em peer review. Sem proposta publicada de "weighted cross-modality κ", a média ponderada por N de markers fica defendível só como **descritiva**, nunca como inferencial.

**2. Existe um gap real na literatura — não estamos perdendo um framework conhecido.** γ é o mais próximo de unificado, mas restrito a continua categorizados (texto/áudio segmentado). Ninguém publicou algo que cubra bbox 2D + char-range + intervalo temporal + linha tabular simultaneamente. STAPLE (medical image) flerta com IoU+κ híbridos mas é intra-modalidade. Ferramenta de QDA multimodal está construindo num território onde a literatura simplesmente não foi — é fronteira, não ignorância.

**3. As três saídas têm força e custo muito diferentes.**

| Caminho | Força metodológica | Custo de adoção |
|---|---|---|
| Reportar per-modality | Mínimo defensável | Zero (AMI, MUMIN, ELAN fazem assim) |
| G-theory multivariate | Alto — decompõe variância por faceta | Software (GENOVA/mGENOVA/lme4), curva ANOVA-style |
| MFRM com modalidade como faceta | Alto — corrige leniência em logits | Software (FACETS), curva Rasch |

A diferença não é só rigor — é **o que cada um responde**. κ pooled não responde "quanto da unreliability vem da modalidade?". G-theory responde diretamente. MFRM responde "qual rater é severo em qual modalidade?". São perguntas que ferramenta de QDA atual nem formula.

**4. Posição que sustenta paper.** Reportar per-modality é o piso e precisa estar sempre presente. G-theory entra como camada opcional de análise diagnóstica quando há corpus grande o suficiente pra estimar σ²_m com confiança (rule of thumb: ≥ 2 codificadores × ≥ 2 modalidades × ≥ 30 itens por célula). MFRM entra quando o foco é avaliar codificadores comparativamente, não o coding em si.

**5. Implicação pra fluxo prático.** Codificadores reais não vão aprender G-theory ou MFRM. Per-modality é o que tem chance de adoção. Se uma ferramenta quer expor "reliability geral" do projeto, a única opção honesta é **tabela de κ separados** (com IC bootstrap por linha) — não um número escalar único.

---

## Origens disciplinares dos métodos

A literatura de reliability quanti veio quase toda de tradições **adjacentes** a QDA, importadas pra dentro:

| Autor / método | Área de origem | O que tentavam medir originalmente |
|---|---|---|
| Cohen (κ, 1960) | Psicologia / Psychometrics | Concordância em diagnóstico psiquiátrico nominal |
| Krippendorff (α, anos 70+) | Communication / Content Analysis (Annenberg, UPenn) | Codificação de mídia/propaganda |
| Hayes | Communication Science / quanti methodology | Empirical communication |
| Brennan, Shavelson & Webb (G-theory) | Educational Measurement (ACT/SAT) | Reliability de testes padronizados |
| Linacre, Eckes (MFRM) | Language Testing / Educational Measurement | Multiple raters corrigindo essays (TOEFL, IELTS) |
| Mathet, Widlöcher, Métivier (γ) | NLP / Computational Linguistics (Caen, FR) | Corpus annotation pra NLP |
| Artstein & Poesio | Computational Linguistics (Trento) | Anáfora, dialogue annotation |
| Carletta (AMI Corpus) | Speech / HCI (Edinburgh) | Anotação de reuniões multi-party pra speech tech |
| Allwood (MUMIN) | Linguística multimodal (Gothenburg) | Gesture/feedback annotation em conversa face-a-face |
| Hallgren | Clinical psychology / addiction research | Observational data em pesquisa clínica |
| O'Connor & Joffe | Psychology / qualitative methods | Único par com link direto a QDA stricto sensu |

**Cinco troncos disciplinares:**

1. **Educational measurement / psychometrics** — G-theory, MFRM. Pensam em testes, provas, exames. Reliability = quanto da variação no score é "verdadeira".
2. **Content analysis em communication** — Krippendorff, Hayes. Codificação de mídia. Annenberg é a ponte canônica pra QDA quanti.
3. **NLP / Computational Linguistics** — Mathet, Artstein, Poesio. Annotation = ground truth pra modelos.
4. **Speech / HCI / multimodal corpora** — Carletta, Allwood. Anotação multimodal é o objeto.
5. **Clinical observation** — Hallgren. Médico vs médico vendo o mesmo paciente.

**Por que QDA estrito não produziu essas métricas.** A tradição QDA pós-positivista (Strauss & Corbin, Charmaz, Saldaña) tipicamente é cética de κ — o debate é sobre trustworthiness, member checking, qualitative validity, não reliability quanti. Krippendorff é a ponte mais explícita (content analysis ⊂ communication aborda objetos QDA-like), mas ele veio de mass communication, não de grounded theory.

**Consequências:**

- A literatura QDA não aborda "agregar cross-modality" porque o default histórico de QDA é **só texto**. Multimodal não era a questão.
- Reliability multimodal é tema de NLP/speech porque pra eles **o corpus multimodal é o produto** — sem reliability, o dataset não vale ML.
- Ferramentas de QDA multimodal (NVivo, ATLAS.ti, Dedoose, MAXQDA) historicamente têm reliability fraca ou inexistente em modalidades não-textuais. Não porque seja difícil, mas porque a literatura QDA não cobrava.

**Posição honesta pra paper de QDA multimodal:** você está num cruzamento. As métricas vêm de fora. Escolhe de qual tradição importar e **cita a tradição**, não o uso QDA. Krippendorff (2018) é importação de content analysis. Brennan (2001) é importação de educational measurement. Mathet et al. (2015) é importação de CL. Paper honesto combina tradições explicitamente.

---

## Multimodalidade em NLP/speech vs QDA

### Por que multimodalidade é tema central de NLP/speech

1. **O objeto de estudo é intrinsecamente multimodal.** Diálogo humano não é texto — é fala + gesto + gaze + expressão facial + postura + prosódia simultaneamente. Quem estuda interação (conversation analysis quanti, dialogue systems, HCI, embodied communication) é forçado a anotar tudo. AMI, MUMIN, HCRC Map Task nascem disso.
2. **ML moderna precisa de pares cross-modal pra treinar.** ASR precisa de (áudio, transcrição) alinhados. Lip reading precisa (vídeo, áudio, texto). Visual grounding precisa (imagem, expressão referencial). Foundation models (CLIP, GPT-4V, Gemini) são treinados em bilhões de pares (imagem, legenda), (áudio, transcrição). Anotação multimodal é gargalo da indústria de IA.
3. **Annotation tools nasceram multimodal por design.** ELAN, ANVIL, Praat — pensadas desde o início pra tiers paralelos (texto + áudio + vídeo). Infraestrutura técnica madura desde ~2000.

### Sobreposição estrutural com QDA multimodal

| Eixo | NLP/Speech annotation | QDA multimodal |
|---|---|---|
| Modalidades | Texto, áudio, vídeo, imagem | Texto, áudio, vídeo, imagem, PDF, tabular |
| Estrutura do marker | (segmento, label) | (segmento, codeId, memo, magnitude, relations) |
| Unidade em texto | Char-range, token-range, span | Char-range |
| Unidade em áudio/vídeo | Intervalo temporal | Intervalo temporal |
| Unidade em imagem | Bbox 2D, polygon, mask | Bbox 2D |
| Matching cross-coder | Hungarian + IoU/overlap threshold | Hungarian + IoU/overlap threshold |
| Reliability per-modality | Padrão (AMI/MUMIN/ELAN) | Caminho recomendado neste documento |
| Schema | Fechado (categorias pré-definidas) | Aberto + emergente (codebook evolui) |
| Coders típicos | 2-N, frequentemente crowdsourced (MTurk, Prolific) | 2-3, expertise alta |
| Finalidade | Ground truth pra treinar/avaliar modelo | Interpretação, geração de teoria |
| Incentivo a reliability rigorosa | Altíssimo (modelo ruim ↔ dinheiro) | Tradicionalmente baixo (prova social) |
| Memo / reflexão analítica | Inexistente | Central |

### Onde diverge

1. **Open vs fechado.** NLP/speech trabalha com schema fechado decidido antes da anotação. QDA faz open coding — categorias emergem. Reliability em open coding é mais difícil porque o próprio espaço de categorias se move durante a anotação. Krippendorff & Hayes (2007) enfatizam "coding instructions" estabilizadas antes de calcular α exatamente por isso.
2. **Anotação como meio vs como fim.** NLP/speech anota pra **alimentar modelo**. A anotação é descartável (vira pesos). QDA codifica pra **gerar interpretação**. A codificação é o produto. Memo não existe em NLP/speech — não tem onde guardar reflexão interpretativa porque o modelo só consome labels.
3. **Escala e atenção por unidade.** NLP/speech escala (10k+ anotadores via MTurk, 5-10s por unidade, low-context). QDA é íntimo (2-3 codificadores, minutos por unidade, deep context). γ de Mathet et al. assume velocidade alta e segmentação ruidosa entre anotadores — útil em NLP. Em QDA com 2 codificadores experientes, segmentação é mais consistente e a parte dura é o **label**, não a fronteira.

### Consequência prática

Estrutura de dados idêntica em quase tudo. É possível **importar livremente** técnicas de anotação multimodal de NLP/speech:

- Hungarian + IoU pra bbox matching
- α-temporal (Krippendorff continuum) ou γ pra intervalos áudio/vídeo
- u_α (Krippendorff et al., 2016) pra char-range com unitizing
- AMI/MUMIN como precedente de "reportar separado por tier/dimensão"

O que **não importa cleanly** é a filosofia: memo, relations entre códigos, magnitudes, hierarquia, audit trail interpretativo são QDA-específicos. NLP/speech não tem nada disso.

QDA multimodal stricto sensu é híbrido: **estrutura de dados de NLP/speech multimodal annotation + epistemologia de QDA**. Não há produto pronto no mercado nessa intersecção. NVivo/ATLAS.ti têm epistemologia mas estrutura técnica fraca (matching, IoU, temporal IAA mal implementados). ELAN/ANVIL têm estrutura técnica madura mas zero epistemologia QDA. O espaço entre eles é onde QDA multimodal opera.

---

## Cenários híbridos humano-LLM como crowdsourcing assimétrico

Quando o desenho envolve **1 humano + N LLMs** (ou 2 humanos + 2 LLMs, etc.), o cenário deixa de ser ICR clássico (2-3 humanos experts densos) e estruturalmente vira **crowdsourcing assimétrico**: 1 high-quality slow + N moderate-quality fast. Esse setup tem 15+ anos de literatura em NLP/speech que a tradição QDA não importou.

### Paralelo estrutural

| Cenário | Anotador típico | Volume por unidade | Contexto disponível |
|---|---|---|---|
| ICR clássico QDA | 2-3 humanos experts | Lento, profundo | Documento inteiro, history, conhece corpus |
| Crowdsourcing NLP (MTurk era) | N workers heterogêneos | Rápido, raso | Snippet, instruções breves |
| 1 humano + N LLMs (QDA multimodal moderno) | 1 expert + N moderate-quality fast workers | Misto | Humano: profundo. LLM: prompt + memo, controlado |

### Literatura central de annotator quality / crowdsourcing

Modelos que assumem qualidade variável por anotador e estimam "verdade latente" + competência simultaneamente:

- Dawid, A. P., & Skene, A. M. (1979). Maximum likelihood estimation of observer error-rates using the EM algorithm. *Applied Statistics*, 28(1), 20–28. https://doi.org/10.2307/2346806 — modelo seminal. EM iterativo: alterna entre estimar true label e estimar matriz de confusão por anotador.
- Whitehill, J., Wu, T., Bergsma, J., Movellan, J. R., & Ruvolo, P. L. (2009). Whose vote should count more: Optimal integration of labels from labelers of unknown expertise. *NeurIPS*. GLAD model — anotador tem expertise α, item tem difficulty β, label probability é função das duas.
- Hovy, D., Berg-Kirkpatrick, T., Vaswani, A., & Hovy, E. (2013). Learning whom to trust with MACE. *NAACL*. https://aclanthology.org/N13-1132/ — Multi-Annotator Competence Estimation. Bayesiano. Identifica spammers.
- Sheng, V. S., Provost, F., & Ipeirotis, P. G. (2008). Get another label? Improving data quality and data mining using multiple, noisy labelers. *KDD*. https://doi.org/10.1145/1401890.1401965 — quando vale adicionar mais um anotador.
- Snow, R., O'Connor, B., Jurafsky, D., & Ng, A. Y. (2008). Cheap and fast — but is it good? Evaluating non-expert annotations for natural language tasks. *EMNLP*. https://aclanthology.org/D08-1027/ — 4 não-experts MTurk igualam 1 expert em vários tasks.
- Passonneau, R. J., & Carpenter, B. (2014). The benefits of a model of annotation. *Transactions of the ACL*, 2, 311–326. https://doi.org/10.1162/tacl_a_00185 — mesmo com agreement alto, majority vote é inferior a modelos probabilísticos.
- Paun, S., Carpenter, B., Chamberlain, J., Hovy, D., Kruschwitz, U., & Poesio, M. (2018). Comparing Bayesian models of annotation. *Transactions of the ACL*, 6, 571–585. https://doi.org/10.1162/tacl_a_00040 — survey comparando Dawid-Skene, MACE, multinomial, hierarchical. Leitura de entrada no campo.
- Felt, P., Ringger, E., & Seppi, K. (2016). Semantic annotation aggregation with conditional crowdsourcing models and word embeddings. *COLING*. https://aclanthology.org/C16-1218/ — crowdsourcing + multi-task simultaneamente.

### LLM como crowd worker (literatura recente)

- Gilardi, F., Alizadeh, M., & Kubli, M. (2023). ChatGPT outperforms crowd workers for text-annotation tasks. *Proceedings of the National Academy of Sciences*, 120(30). https://doi.org/10.1073/pnas.2305016120 — ChatGPT vs MTurk em annotation tasks; ChatGPT bate em vários.
- Wang, J., Liang, Y., Meng, F., Sun, Z., Shi, H., Li, Z., Xu, J., Qu, J., & Zhou, J. (2023). Is ChatGPT a good NLG evaluator? A preliminary study. *EMNLP NewSum Workshop*. https://aclanthology.org/2023.newsum-1.1/ — LLMs como "annotators" com concordância humana.

### Conexão estrutural

O cenário 1H + N LLMs no design de QDA multimodal moderno é o **mesmo problema** que NLP/speech resolveu via Dawid-Skene, MACE, e variantes. Aplicação direta:

1. **Dawid-Skene aplicável a 1H + N LLMs.** Estima qualidade de cada coder + label latente. Não precisa de κ. Cada par recebe matriz de confusão. O "espelho do prompt" (κ humano-LLM mede fidelidade de tradução, não agreement) é corolário emergente — Dawid-Skene mediria correlação entre humano e LLMs como propriedade do modelo, não como problema separado.
2. **MACE pra identificar LLM "spammer"** — LLM respondendo sem informação real (alucinando, ou cheap pattern matching). Modelo Bayesiano dá probabilidade explícita de "anotador está em modo spam". Detector de hallucination complementar ao verbatim verification.
3. **Sheng/Ipeirotis "Get Another Label?"** responde diretamente uma pergunta de produto: vale rodar 3 LLMs ou 5? Existe cálculo de marginal return.
4. **Calibração via gold-standard tasks** — pré-codificar manualmente 5-10 segments e usar como sanity check do LLM antes de aplicar batch. Pattern Amazon MTurk de 2008 aplicável direto a LLM.

### Frame unificado

Vários componentes propostos na literatura recente de multi-LLM são re-derivações dessa tradição clássica reframed:

- **Self-consistency Monte Carlo** = "multiple noisy labelers" aplicado a runs do mesmo LLM.
- **Confidence-diversity dual signal** (arxiv 2508.02029) = annotator competence reframed — "confiança × concordância" é literalmente o eixo Whitehill/Dawid-Skene.
- **Memo-as-prompt** = pattern NLP de "annotator pre-training / calibration": training data antes do anotador começar. Aplicado a LLM, o memo é o pre-training.

Tratar essas peças como conjunto independente perde a unidade conceitual: **isto é annotator quality modeling**, e a tradição NLP/speech tem o canivete suíço maduro.

---

## Unificação: heterogeneidade de modalidade e heterogeneidade de coder são o mesmo problema

As duas perguntas que aparentavam ser separadas — agregar κ/α cross-modality vs tratar 1H + N LLMs — são **o mesmo problema estrutural**: heterogeneidade em facetas do desenho de medida.

| Pergunta | Faceta heterogênea | Solução clássica |
|---|---|---|
| Como agregar κ/α cross-modality? | Modalidade (texto, bbox, áudio, tabular) | G-theory faceta m; MFRM faceta μ_m |
| Como tratar 1H + N LLMs? | Tipo de coder (humano, LLM-A, LLM-B, LLM-C) | Dawid-Skene; MACE; G-theory faceta c |

Em ambos, κ pooled colapsa a heterogeneidade num escalar e perde a informação que era o ponto. A literatura que cobre os dois converge na **mesma família matemática**: G-theory multivariate, MFRM com múltiplas facetas, Bayesian hierarchical annotation models. Não é coincidência — é que o problema matemático é o mesmo.

### G-theory cobrindo ambos

Desenho p × r × m × c (pessoa codificada × rater × modalidade × tipo de coder):

$$\sigma^2(X) = \sigma^2_p + \sigma^2_r + \sigma^2_m + \sigma^2_c + \sigma^2_{rm} + \sigma^2_{rc} + \sigma^2_{mc} + \sigma^2_{rmc} + \sigma^2_e$$

Cada componente responde uma pergunta distinta:

| Componente | Pergunta que responde |
|---|---|
| σ²_p | Quanto da variação é "verdade" (sinal real de coding correto)? |
| σ²_r | Quanto vem da identidade do rater (severidade individual)? |
| σ²_m | Quanto vem da modalidade (bbox é mais difícil que texto)? |
| σ²_c | Quanto vem do tipo de coder (humanos são mais consistentes que LLMs)? |
| σ²_{rm} | Algum rater é especialmente bom/ruim numa modalidade? |
| σ²_{rc} | Esse LLM específico é especialmente errático? |
| σ²_{mc} | LLMs são piores em bbox que humanos? (interação tipo × modalidade) |
| σ²_{rmc} | Resíduo: idiossincrasia rater-modalidade-tipo |

κ pooled jamais responde nenhuma dessas perguntas.

### MFRM cobrindo ambos

$$\log\!\left(\frac{P_{ijkmc,x}}{P_{ijkmc,x-1}}\right) = \beta_n - \delta_i - \alpha_j - \mu_m - \nu_c - \tau_k$$

Mais facetas adicionadas aditivamente, tudo em logits. Cada coder recebe sua leniência α_j corrigida pela modalidade μ_m e pelo tipo ν_c. Output: "este LLM é severo em texto e leniente em bbox, comparado a humanos". Diagnóstico operacional, não só métrica.

### Bayesian hierarchical annotation models

A convergência entre as duas tradições (G-theory de educational measurement; annotator quality models de NLP) acontece em modelos Bayesianos hierárquicos com múltiplas facetas:

- Vispoel, W. P., Morris, C. A., & Kilinc, M. (2018). A Bayesian approach to estimating variance components within a multivariate generalizability theory framework. *Behavior Research Methods*. https://link.springer.com/article/10.3758/s13428-017-0986-3 — Bayesian G-theory explícito.
- Paun et al. (2018), citado acima, cobre o lado annotation models.

A literatura ainda **não publicou** um modelo canônico que combine **multimodal annotation + annotator quality + multi-task** simultaneamente. Esse é território de pesquisa ativo (2023+).

### Generalidade — degrada elegantemente

O framework cobre todos os casos via colapso de facetas vazias:

| Cenário | Facetas ativas | Modelo equivalente |
|---|---|---|
| 2 humanos, 1 modalidade | r (com 2 níveis) | Cohen κ (caso de borda) |
| 3+ humanos, 1 modalidade | r | Fleiss κ / Krippendorff α |
| 2 humanos, N modalidades | r, m, rm | G-theory p × r × m |
| 1H + N LLMs, 1 modalidade | r, c, rc | Dawid-Skene / MACE |
| 1H + N LLMs, N modalidades | r, m, c, rm, rc, mc, rmc | G-theory multivariate / Bayesian hierarchical |
| N LLMs runs Monte Carlo, 1 modalidade | r (runs como raters), c=LLM fixo | Self-consistency Monte Carlo |

Cada cenário é caso especial do modelo geral. **Complexidade aparece só se a heterogeneidade existir no dado** — o desenho não precisa "decidir" antecipadamente qual cenário é.

---

## Cubo 3D — cenário × modalidade × indicador

A matriz original (cenário × indicador) é 2D. Cruzando com modalidade, vira cubo 3D — cada interseção (cenário, modalidade) recebe um indicador apropriado:

```
                           Modalidade
                  texto   bbox     temporal   tabular
Cenário
──────────
H × H              κ      κ_IoU    α_T        κ
H × LLM            κ*     κ_IoU*   α_T*       κ*
LLM × LLM mesmo    cos    IoU+cos  α_T+cos    cos
LLM × LLM runs     SC     SC       SC         SC
1H + N LLMs        BHM    BHM      BHM        BHM
```

Onde:
- κ = Cohen / Fleiss / Krippendorff conforme N
- κ* = "validação de prompt engineering" (espelho do prompt) — mesmo cálculo, framing diferente
- α_T = α temporal de Krippendorff
- κ_IoU = κ com matching por IoU
- cos = cosine similarity sobre embeddings
- SC = self-consistency Monte Carlo
- BHM = Bayesian hierarchical model (Dawid-Skene / MACE / Paun et al. com modalidade como faceta)

O cubo tem 3 dimensões porque tem 3 fontes de heterogeneidade: **par de coders** + **modalidade** + **indicador apropriado pra essa interseção**.

---

## Caminho operacional defensável

Em ordem de força + custo, cobrindo ambos cenários simultaneamente:

**1. Piso (sempre presente).** Reportar per-modality + per-pair-type separadamente. Tabela com linha por (modalidade × pair). Sem agregação cross-modality. Sem κ pooled. Cobre o argumento de Krippendorff (2018), Artstein & Poesio (2008), Mathet et al. (2015): cada par tem sua função distância apropriada.

**2. Camada média.** Bayesian annotation model (Dawid-Skene / MACE / variantes) rodado **per-modality**, depois meta-análise across modalities reportando consistência. Cobre crowdsourcing assimétrico sem assumir comensurabilidade de modalidades. Aplica Paun et al. (2018) por dimensão.

**3. Camada alta (research-grade).** G-theory multivariate ou MFRM com facetas (rater, modalidade, tipo de coder). Decomposição completa de variância. Responde "de onde vem a unreliability?" — diagnóstico, não só métrica. Vispoel et al. (2018) como referência bayesiana; Brennan (2001) cap. 9 como referência frequentista.

---

## Posição final cruzando os dois eixos

QDA multimodal com cenários híbridos humano-LLM é genuinamente território de pesquisa, não território de produto consolidado. **Nenhuma das três tradições isoladas** (G-theory de educational measurement, annotator quality models de NLP, Krippendorff/Mathet de content analysis e CL) cobre os três eixos simultaneamente: **modalidade heterogênea + tipo de coder heterogêneo + open coding**. Cada uma cobre um par.

O caminho honesto pra paper:
1. Importar Paun et al. (2018) e Vispoel et al. (2018) explicitamente — esses dois são as pontes mais avançadas.
2. Reportar per-modality como piso não-negociável.
3. Apresentar modelo hierárquico (G-theory ou Bayesian annotation) com facetas (rater, modalidade, tipo de coder) como camada de análise.
4. Tratar o trabalho como **combinação original de tradições adjacentes**, não como aplicação de framework consolidado.

A literatura central de QDA estrito (Strauss, Charmaz, Saldaña) não cobre nada disso e historicamente foi cética de reliability quanti. A defesa metodológica precisa vir das três tradições importadas, não da tradição QDA — o que reforça o ponto sobre origens disciplinares: QDA multimodal moderno opera num cruzamento, não numa tradição.

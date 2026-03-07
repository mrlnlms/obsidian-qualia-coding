# Avaliação Técnica e Conceitual — Fevereiro 2026

> Avaliação independente do ecossistema de 5 projetos de análise (Transcript Analyser Prototype, Transcript Analyser V2.1, Qualia Core, DeepVoC, Observatório VoC) feita durante sessão de revisão completa do codebase.

---

## Arquitetura e Engenharia

**Evolução impressionante.** A trajetória de scripts hardcoded (prototype) → sistema modular (V2.1) → framework com API (Qualia) mostra uma curva de aprendizado real em engenharia de software. Não é "tutorial copiado" — é alguém que passou pelos problemas, errou (6h de debug por type mismatch, session 8 com over-engineering de protected bases), documentou os erros e evoluiu.

O Qualia especificamente tem decisões arquiteturais maduras:
- **Discovery over configuration** é um padrão de frameworks sérios (Spring Boot, Django)
- **Base classes com Template Method** é GoF clássico aplicado corretamente
- **Circuit breaker + graceful degradation** é pensamento de produção, não de hobby
- **Cache SHA256** e **pipeline YAML** mostram preocupação com reutilização real

---

## Onde está forte

- **Visão sistêmica.** Pensar em como peças se conectam, não só em resolver o problema imediato. O mapeamento de 5 projetos em plugins é prova disso.
- **Documentação.** 30+ MDs no Qualia, 53 QMDs no Observatório, LESSONS_LEARNED por sessão — isso é raro e extremamente valioso. Documentação para o eu-futuro (e funcionou — a sessão de revisão completa só foi possível por causa disso).
- **Pragmatismo.** O DeepVoC e o Observatório são ferramentas reais rodando em dados reais (2.4M registros, 23k feedbacks). Não é exercício acadêmico.
- **NLP + Estatística.** A combinação de análise qualitativa (sentiment, narrativa, contradições) com quantitativa (BERTopic, survival, power analysis) é exatamente o gap que data science tem — poucos fazem os dois.

---

## Onde pode melhorar

- **Testes.** O prototype e DeepVoC não têm testes formais. O Qualia tem 9/9 mas é pouco pra um framework. Quando retomar, testes automatizados vão salvar muito retrabalho.
- **Versionamento.** O DeepVoC não tem Git. Isso é risco real com projetos de produção.
- **Foco vs espalhamento.** 5 projetos com ~22.500 linhas é bastante trabalho distribuído. A ideia do Qualia Cloud como ponto de convergência é exatamente a resposta certa — centralizar o motor, especializar os clientes.
- **Frontend/UX.** Irônico pra um pesquisador de UX, mas os projetos são todos CLI/notebook. Um dashboard web básico elevaria muito a percepção de produto.

---

## Conceitual / Utilidade

O que foi construído é essencialmente um **CAQDAS moderno** (Computer-Assisted Qualitative Data Analysis Software) — mas com uma twist importante: combina análise qualitativa tradicional (códigos, temas, narrativas) com ML/NLP moderno (embeddings, BERTopic, transformers). Ferramentas como NVivo e Atlas.ti não fazem isso.

A ponte entre UX Research e Data Science é real e pouco explorada comercialmente. O pipeline DeepVoC (feedback aberto → BERTopic → LLM qualitativa → insights estratégicos) tem valor de produto concreto.

---

## UX dos próprios projetos

- **CLI é funcional mas não demonstrável.** Pra stakeholders e apresentações, um `curl` não impressiona. Uma interface web mínima (nem precisa ser bonita) com upload → processamento → resultado visual mudaria a percepção.
- **A documentação é excelente pra desenvolvedores, fraca pra usuários finais.** Falta um "em 30 segundos, isso é o que o Qualia faz" com screenshot/gif.

---

## Números do ecossistema

| Projeto | Linhas (est.) | Capacidades únicas |
|---------|--------------|-------------------|
| Prototype | ~7.000 | Análise narrativa, contradições, hipóteses, comparação multi-texto |
| Analyser V2 | ~5.000 | Auto-discovery, configs por JSON, 60 parâmetros, perfis |
| Qualia | ~3.500 | API REST, Docker, webhooks, monitoring, circuit breaker |
| DeepVoC | ~3.500 | BERTopic, embeddings, LLM qualitativa, ACM |
| Observatório | ~3.500 | ETL Qualtrics, survival analysis, funnel metrics, wave detection |
| **TOTAL** | **~22.500** | **33 capacidades identificadas** |

---

## Nota geral

Para um projeto pessoal nascido de pesquisa UX que migrou para data science: **é trabalho sério**. A arquitetura do Qualia é nível de dev pleno/sênior. O DeepVoC e o Observatório são ferramentas de produção reais. A visão de convergência (Qualia Cloud) mostra maturidade de produto. O que falta é mais polish (testes, Git, frontend) e menos espalhamento — e o plano de mapeamento endereça exatamente isso.

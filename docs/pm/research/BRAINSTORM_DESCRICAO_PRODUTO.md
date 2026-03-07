# Brainstorm: Como descrever o Qualia para pesquisadores

> Fevereiro/2026 — Notas de brainstorm sobre posicionamento, descrição e comunicação do Qualia como produto para pesquisadores.

---

## O problema

Pesquisadores (UX, qualitativos, data science) vivem num ciclo:

1. Recebem dados textuais (transcrições, feedbacks, conversas, respostas abertas)
2. Precisam transformar em insights
3. Escrevem scripts soltos, usam ferramentas que não conversam entre si
4. No projeto seguinte, reinventam tudo do zero
5. Ferramentas existentes (NVivo, Atlas.ti) são manuais, caras, e não fazem ML

## O que o Qualia resolve

O motor analítico que fica por trás dos seus projetos. Plugins prontos que você compõe como blocos. Funciona com qualquer texto.

---

## Candidatos de tagline

**Funcional:**
> "Plugue seus dados textuais, combine análises, obtenha insights — sem reinventar o motor a cada projeto."

**Provocativa:**
> "Pare de reescrever scripts de análise. O Qualia já tem."

**Acadêmica:**
> "Framework aberto de análise qualitativa computacional com plugins reutilizáveis e API REST."

**Curta:**
> "Análise qualitativa como serviço. Plugins que combinam."

---

## Framings possíveis

### 1. "O motor invisível"
Qualia é uma plataforma que roda por trás dos seus projetos. Você alimenta com dados, escolhe os plugins (sentimento, tópicos, redes conceituais, clustering...), e recebe resultados via API. Funciona com transcrições de entrevista, feedbacks de pesquisa, conversas de WhatsApp, respostas abertas — qualquer texto.

**Pra quem:** pesquisadores técnicos que já programam.

### 2. "LEGO analítico"
Monte sua pipeline combinando blocos: filtro de qualidade → embeddings → clustering → sentimento → visualização. Cada bloco é um plugin independente. Adicione novos sem tocar nos existentes.

**Pra quem:** data scientists que querem composabilidade.

### 3. "O anti-NVivo"
Ferramentas como NVivo e Atlas.ti são manuais e caras. Qualia automatiza o que pode ser automatizado (topic modeling, sentimento, padrões linguísticos) e libera o pesquisador para o que só humano faz: interpretar.

**Pra quem:** pesquisadores qualitativos frustrados com ferramentas tradicionais.

### 4. "De scripts soltos a plataforma"
Você já tem scripts de análise espalhados por projetos? Qualia transforma isso em plugins reutilizáveis com API, cache, e documentação automática. Escreva uma vez, use em todos os projetos.

**Pra quem:** quem já tem código e quer organizar.

---

## Os pipelines como showcases

Cada projeto existente é um exemplo de uso real do Qualia:

| Pipeline | Showcase | Demonstra | Dados |
|----------|----------|-----------|-------|
| **Transcript Analyser** | Análise de entrevistas qualitativas | Plugins de texto: sentiment, contradições, narrativa, linguística | Transcrições de entrevistas |
| **DeepVoC** | Feedbacks de pesquisa NPS (23k textos) | Plugins ML: BERTopic, embeddings, LLM qualitativa | Respostas abertas de pesquisa |
| **Observatório VoC** | Diagnóstico de programas de pesquisa | Plugins estatísticos: survival, power, funnel, NPS | Dados de distribuição + respostas |
| **WhatsApp Analytics** | Análise de conversas pessoais (92k msgs) | Plugins conversacionais: parser, features, transcrição | Exports de WhatsApp |

Cada um é um "como analisar X usando Qualia" — com dados reais, pipeline configurável, resultados reproduzíveis.

---

## Estrutura de comunicação para README/landing

### Em 10 segundos (hero)
> **Qualia** — plataforma de análise qualitativa com plugins combináveis. Transforme textos em insights via API.

### Em 30 segundos (sub-hero)
> Qualia é um framework Python que transforma análise qualitativa em plugins reutilizáveis. Sentimento, topic modeling, redes conceituais, clustering, métricas de pesquisa — tudo disponível via API REST. Monte sua pipeline combinando blocos, sem reescrever código.

### Em 2 minutos (detalhes)

**O que faz:**
- 30+ plugins de análise (texto, estatística, ML, visualização)
- API REST automática — qualquer plugin vira endpoint instantaneamente
- Pipelines combináveis via YAML
- Cache inteligente — roda uma vez, reutiliza sempre
- Background tasks para operações pesadas (embeddings, clustering)

**Pra quem:**
- Pesquisadores UX que analisam transcrições de entrevistas
- Data scientists que trabalham com feedbacks e respostas abertas
- Times de VoC que precisam processar milhares de respostas
- Qualquer pessoa que transforma texto em insights

**Exemplos reais:**
- Analisou 23.000 feedbacks de pesquisa NPS com BERTopic + LLM (DeepVoC)
- Diagnosticou programas de pesquisa com 2.4M registros (Observatório VoC)
- Analisou 92.000 mensagens de WhatsApp com sentiment BERT (WhatsApp Analytics)
- Processou transcrições de entrevistas com análise narrativa completa (Transcript Analyser)

---

## O diferencial real

O que torna o Qualia único não é nenhum plugin individual — é a **combinação**:

1. **Qualitativo + Quantitativo** — sentimento E topic modeling E estatística E sobrevivência. Poucos fazem os dois mundos.
2. **Plugin-based** — diferente de notebooks soltos, cada capacidade é reutilizável e combinável.
3. **API-first** — não é uma ferramenta desktop. É um serviço que qualquer aplicação consome.
4. **Testado em produção** — os 7 projetos mostram que funciona em dados reais, de 132 a 2.4M registros.
5. **Feito por pesquisador** — não é framework genérico de ML. É feito por quem analisa dados qualitativos e sabe onde dói.

---

## Público-alvo (priorizado)

1. **Pesquisadores UX/Qualitativos** que programam um pouco — querem automatizar sem virar dev
2. **Data Scientists em times de CX/VoC** — precisam de pipeline reproduzível para feedbacks
3. **Acadêmicos** — querem CAQDAS moderno, aberto, com ML
4. **Desenvolvedores** que criam ferramentas de análise — querem um engine pronto

---

## Próximos passos de comunicação

- [ ] Screenshot/GIF de "dados entram → insights saem" (o que falta pra UX do produto)
- [ ] Landing page mínima (pode ser o próprio README do repo)
- [ ] 4 tutoriais "showcase" (um por pipeline)
- [ ] Diagrama visual da arquitetura (versão bonita do ASCII art)
- [ ] Vídeo curto (~2min) demonstrando um pipeline completo

# Entrevista P05 — Juliana, 38 anos
**Data:** 2026-02-22 | **Duração:** 40min | **Local:** Remoto (Zoom)

## Contexto
Juliana é pesquisadora em uma consultoria de inovação social. Trabalha com avaliação de impacto de programas sociais. Usa Dedoose e Excel extensivamente.

---

## Bloco 1: Contexto de trabalho

**P: Que tipo de pesquisa você faz?**

Avaliação de impacto. Governos e ONGs contratam a consultoria para avaliar se um programa social está funcionando. Por exemplo, agora estou avaliando um programa de capacitação profissional para jovens em situação de vulnerabilidade.

O trabalho é sempre mixed methods. A parte quantitativa vem dos indicadores do programa — taxa de empregabilidade, renda média, evasão. A parte qualitativa vem das entrevistas com beneficiários, gestores e educadores. O relatório final precisa integrar as duas perspectivas.

**P: Quais tipos de dados você coleta?**

De tudo. Transcrições de entrevistas individuais e grupos focais. Respostas abertas de questionários — geralmente em CSV exportado do Google Forms ou Qualtrics. PDFs de documentos oficiais do programa — editais, relatórios de gestão, atas de reunião. Fotos de campo quando faço visitas. Às vezes áudio de reuniões que não deu tempo de transcrever.

O volume é grande. Num projeto típico tenho 30-40 entrevistas, 500+ respostas de survey, 20-30 documentos PDF, e umas 50 fotos. Tudo isso precisa ser codificado sistematicamente.

## Bloco 2: Workflow atual

**P: Como é seu processo de análise?**

Começo pela framework analysis. Diferente da grounded theory onde os códigos emergem dos dados, eu já tenho um framework teórico — geralmente baseado na teoria de mudança do programa. Então meus códigos iniciais são dedutivos: "acesso ao programa", "qualidade da capacitação", "inserção no mercado", "fatores facilitadores", "barreiras".

Depois adiciono códigos indutivos conforme analiso — coisas que não estavam no framework mas emergem. "Rede de apoio familiar", "estigma social", "motivação intrínseca". No final tenho uns 40-60 códigos organizados em 5-6 categorias temáticas.

A parte mais trabalhosa é o cruzamento com variáveis demográficas. Preciso responder: "jovens do sexo feminino reportam mais barreiras que jovens do sexo masculino?". Isso requer que cada entrevista tenha metadados — gênero, idade, região, tempo no programa. E que eu possa filtrar os códigos por essas variáveis.

**P: Que ferramentas você usa?**

Dedoose para codificação qualitativa. É web, então posso acessar de qualquer lugar, e suporta equipe — trabalho com 2 assistentes de pesquisa que codificam junto.

Excel para os dados quantitativos e para os cruzamentos. Exporto as frequências do Dedoose, importo no Excel, e faço os gráficos lá.

PowerPoint para os relatórios — colo quotes, gráficos, e narrativa. É manual e demorado.

**P: O que funciona e o que não funciona?**

O Dedoose funciona razoavelmente para codificação de texto. Mas tem problemas sérios. Primeiro: já perdeu dados meus. Duas vezes. Uma vez foi um bug no sync que deletou 3 dias de trabalho. Na segunda o servidor ficou fora por 12 horas durante uma deadline de entrega.

Segundo: o suporte a PDF é péssimo. Basicamente uma visualização embutida onde você destaca texto. Não dá para codificar regiões de imagem dentro do PDF, ou tabelas.

Terceiro: a análise estatística é limitada. Tem frequência e co-ocorrência, mas não tem qui-quadrado, não tem análise de correspondência. Para qualquer coisa além do básico, preciso exportar.

## Bloco 3: Necessidades e desejos

**P: O que procura numa ferramenta ideal?**

Confiabilidade acima de tudo. Depois do trauma com o Dedoose, preciso de dados locais. Não confio mais em cloud para dados de pesquisa. Se o arquivo está no meu computador e eu faço backup, o risco é meu e eu controlo.

Segundo: case variables. É absolutamente essencial para avaliação de impacto. Cada participante tem 10-15 variáveis demográficas e programáticas. Cruzar essas variáveis com os códigos qualitativos é o core do meu trabalho.

Terceiro: relatórios automáticos. Gasto 2-3 dias montando relatório no PowerPoint. Se a ferramenta gerasse pelo menos as tabelas de frequência, os quotes por código, e os gráficos de co-ocorrência automaticamente, economizaria uma semana por projeto.

**P: E interoperabilidade?**

Crítica. Meus clientes às vezes pedem o projeto codificado para auditoria. Se não consigo exportar em formato padrão — REFI-QDA ou no mínimo CSV estruturado — fico refém da ferramenta.

Também preciso importar dados do Qualtrics. São exports em CSV gigantes — às vezes 2 milhões de linhas quando é pesquisa de larga escala. A ferramenta precisa aguentar isso sem travar.

---

## Notas do pesquisador
- Perfil profissional (consultoria), não acadêmico — pragmatismo + volume
- Trauma com perda de dados no Dedoose → local-first é requisito hard
- Case variables são core do workflow, não nice-to-have
- Volume de dados significativo (30-40 entrevistas + 500+ survey + PDFs)
- Export Qualtrics 2M linhas → performance de Parquet é relevante
- Framework analysis (dedutivo + indutivo) vs grounded theory
- Equipe pequena (2 assistentes) → colaboração básica necessária
- Relatórios automáticos como diferencial de produtividade

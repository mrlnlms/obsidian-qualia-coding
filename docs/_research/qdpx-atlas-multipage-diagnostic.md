# Diagnóstico preservado — marcadores PDF multipágina do QDPX/Atlas

> Estado da investigação em 2026-09-01, na branch
> `fix/qdpx-atlas-page-anchoring`. Este documento registra evidências e decisões
> já consolidadas. Ele não é ainda a especificação da solução.

## Por que este documento existe

A leitura desta frente depende da comparação entre o conteúdo exportado pelo
Atlas, os registros importados pelo plugin, o texto linear exposto pelo PDF.js e
uma inspeção visual/manual no Obsidian. Como essa leitura é difícil de reconstruir
apenas pelo código, este arquivo é a memória durável do diagnóstico.

Material primário da inspeção manual no vault:

- `_MULTIPAGE reference.md`, lido integralmente, inclusive a seção final de
  insights do usuário;
- onze capturas de tela referenciadas nesse documento;
- doze marcações manuais ainda presentes no plugin com o código `marlonnn`
  (code id `mtipc4bf1xlbsd6d759`).

`data.json` é uma fonte auxiliar e descartável para inspecionar o estado atual,
não a memória canônica desta investigação: o usuário costuma apagá-lo durante os
testes.

## Estado funcional anterior a esta frente

O trabalho já corrigiu o desalinhamento geral da importação Atlas/QDPX:

- os 203 marcadores importados caem na página visual esperada após a conversão da
  numeração QDPX para a numeração do viewer;
- os 191 marcadores que não são fragmentos multipágina foram resolvidos;
- 182 tiveram correspondência textual exata;
- 9 apresentaram apenas diferenças mínimas de glifos, com cobertura entre 98,9%
  e 100%;
- restaram 12 fragmentos pertencentes a 6 seleções multipágina implícitas;
- 7 desses 12 fragmentos ainda estavam pendentes no último retrato medido.

Checkpoints relevantes:

- `0c9f4f3` — conversão de páginas QDPX para numeração do viewer;
- `65b06e5` — captura de text items para diagnosticar divergências;
- `1e82321` — resolução de âncoras importadas a partir de text items;
- `6a50a29` — preservação da página declarada pelo QDPX;
- `882cbbf` — cobertura automatizada da ancoragem Atlas.

Nesse ponto, a suíte completa tinha 258 arquivos, 3.637 testes aprovados e build
aprovado. A frente multipágina deve ser tratada de forma isolada, preservando o
comportamento já estabilizado.

## O que a inspeção manual provou

### 1. O plugin já consegue capturar uma seleção que cruza páginas

Isso não é uma possibilidade teórica. A seleção manual multipágina funciona em
vários dos mesmos trechos problemáticos da importação.

Hoje, porém, a captura transforma uma seleção contínua em um resultado por
página:

- primeiro resultado: do início selecionado até o fim textual da primeira
  página;
- resultados intermediários: o conteúdo linear integral de cada página;
- último resultado: do início textual da última página até o fim selecionado.

Em seguida, cada resultado vira um `PdfMarker` persistente independente. Portanto,
o sistema atual sabe produzir e renderizar os segmentos, mas ainda não representa
a intenção do usuário como um único marcador lógico multipágina.

### 2. Os doze marcadores `marlonnn` reproduzem exatamente os seis casos

A inspeção encontrou 215 marcadores PDF no estado local: os 203 importados mais os
12 marcadores manuais. Isso confirma que as marcações manuais não substituíram nem
apagaram os registros importados; elas apenas podem cobri-los visualmente por
estarem no mesmo trecho.

Os pares manuais são:

| Caso | Páginas do viewer | Leitura principal |
|---|---:|---|
| D1 — trecho 1 | 6–7 | O par manual cobre a continuação; a diferença textual para o Atlas é mínima. |
| D1 — trecho 2 | 8–9 | O par manual cobre a continuação; correspondência praticamente integral. |
| D2 | 8–9 | A continuação inclui naturalmente cabeçalhos e uma tabela no fluxo linear do PDF. |
| D5 | 2–3 | O fim manual ficou mais curto por imprecisão do gesto de seleção. Não é defeito do browser nem evidência de truncamento do plugin. |
| D8 — trecho 1 | 5–6 | Correspondência integral entre a seleção manual concatenada e o conteúdo esperado. |
| D8 — trecho 2 | 6–7 | Correspondência integral entre a seleção manual concatenada e o conteúdo esperado. |

Comparações textuais já observadas:

- D1, primeiro par: similaridade aproximada de 99,89%; o manual começou um
  caractere depois e o Atlas continha um `M` residual no final;
- D1, segundo par: similaridade aproximada de 99,97%;
- os dois pares D8: correspondência integral;
- D5: a divergência decorre da seleção manual não preciosista, conforme esclarecido
  pelo usuário;
- D2: confirma que a ordem linear “suja” faz parte do conteúdo que as ferramentas
  de origem e o PDF expõem.

### 3. Cabeçalhos, rodapés e tabelas não são uma frente deste projeto

A captura multipágina inclui o que estiver no fluxo linear do PDF entre o início e
o fim da seleção. Isso pode conter cabeçalhos, rodapés, legendas e tabelas.

Decisão explícita: não será criada aqui uma camada semântica para tentar remover
esses elementos. O Atlas não realiza esse saneamento de forma confiável, e não é
responsabilidade do plugin inventá-lo. O conteúdo deve preservar a ordem linear
nativa fornecida pelo PDF.js/Atlas.

### 4. A incompletude visual dos fragmentos importados tem uma causa concreta

O resolver legado limita a chave de ancoragem a 160 caracteres por meio de
`MAX_ANCHOR_KEY_LENGTH` em `src/pdf/resolvePendingIndices.ts`.

Os fragmentos identificados por `importedQdpxMultipageFragment` são deliberadamente
excluídos dos resolvers novos baseados em text items e contexto. Por isso eles
caem no caminho legado, que frequentemente encontra o começo correto, mas encerra
o destaque depois de aproximadamente 160 caracteres canônicos.

Essa combinação explica os destaques importados parciais observados em D1, D2 e
D8. Ela também explica por que aumentar a quantidade de tentativa e erro no
resolver geral não seria uma estratégia confiável: os casos multipágina estão em
um caminho especial e precisam de tratamento explícito.

Exemplos visuais importantes:

- em D8, a primeira página de “People downstream” já estava completa; era o
  segmento da página seguinte que permanecia pendente;
- em D5, o marcador importado permanecia sem âncora resolvida;
- em outros casos, a faixa começava corretamente mas parava cedo, compatível com
  a chave limitada.

## Leitura conceitual consolidada

Uma seleção multipágina possui duas naturezas simultâneas:

1. para localizar e desenhar no PDF, ela precisa de segmentos locais por página;
2. para o usuário e para o modelo de codificação, ela é uma única unidade lógica.

Os segmentos por página são, portanto, uma necessidade geométrica interna — não
devem obrigar a interface nem a persistência conceitual a apresentar dois ou mais
marcadores independentes.

O comportamento final desejado é:

- um único marcador lógico multipágina;
- destaques desenhados nos segmentos correspondentes de cada página;
- uma “zebra” contínua no margin panel, atravessando visualmente a quebra entre as
  páginas;
- apenas uma apresentação lógica do marcador/rótulo, não um rótulo duplicado por
  página;
- todo o restante do margin panel permanece como está hoje;
- comportamento de múltiplos códigos também permanece como está, restrito apenas
  à adaptação necessária para um marcador multipágina.

Agrupar visualmente marcadores independentes pode servir como etapa de migração,
mas não deve ser confundido com o modelo final: o usuário não criou duas
codificações, criou uma codificação que atravessa uma quebra de página.

## Hipótese incremental a avaliar — ainda não é decisão

Há uma etapa intermediária potencialmente valiosa: usar a evidência dos vínculos
QDPX para preencher e renderizar todos os segmentos multipágina importados mesmo
que, temporariamente, eles continuem persistidos como marcadores por página e
apareçam com códigos/rótulos duplicados.

Essa etapa faria sentido apenas se:

- ficar isolada dos 191 marcadores normais já estabilizados;
- preservar no dado a identidade do grupo multipágina, evitando uma nova migração
  cega depois;
- não consolidar a duplicação visual como contrato definitivo;
- reduzir risco e produzir valor verificável antes da mudança estrutural do
  margin panel.

A viabilidade e o custo dessa sequência só devem ser decididos depois de mapear a
arquitetura atual do margin panel, especialmente alocação de colunas, posição dos
rótulos, hover/clique e o overlay que atravessa a rolagem do PDF.

## Decisões que não devem ser reabertas sem nova evidência

- Não alterar o funcionamento geral do margin panel.
- Isolar o tratamento multipágina.
- Não interpretar as diferenças de D5 como erro de browser/plugin; foram
  imprecisões da marcação manual.
- Não tentar excluir cabeçalhos, rodapés, tabelas ou legendas.
- Não tratar os `data.json` apagáveis como única memória da investigação.
- Não voltar a tentativa e erro no resolver geral antes de desenhar explicitamente
  a semântica multipágina.
- Manter segmentos locais por página como detalhe geométrico, mas perseguir uma
  única unidade lógica e uma única apresentação no produto.

## Etapa de arquitetura concluída depois deste diagnóstico

O mapeamento do margin panel solicitado neste ponto já foi concluído e está
registrado em `pdf-margin-panel-multipage-architecture.md`. A investigação de
autoria que surgiu em seguida está em
`qdpx-atlas-coder-roundtrip-margin-panel.md`.

Esses documentos posteriores estabeleceram que preservar autoria multicoder na
importação precede a implementação multipágina. Portanto, a lista abaixo é
histórica e não deve ser interpretada como a próxima tasklist ativa:

- como ele representa barras, colunas, rótulos e eventos hoje;
- o tamanho real da mudança para uma zebra multipágina contínua;
- alternativas incrementais;
- riscos e recomendação de sequência.

A sequência ativa está em
`../superpowers/specs/2026-09-01-qdpx-multicoder-import-design.md`.

## Validação manual do Marco 3 — 2026-09-02

Foi executada uma importação limpa do corpus real em modo somente leitura, sem
usar `data.json` ou seu backup como memória canônica. O artefato regenerado pelo
importador ficou em
`imports/UnifiedDevOps Selective Coding ITE5 ICA/qdpx-import-audit.md`.

O primeiro passe revelou um deslocamento sistemático dos offsets Atlas: o começo
perdia alguns caracteres e o fim avançava a mesma distância para o próximo
trecho. Por exemplo, `Figure 2` chegava como `e 2` e incluía parte de `MEMO`,
enquanto `People downstream` chegava como `e downstream` e incluía `3. A`. O
resolver foi corrigido para reancorar dinamicamente pelo nome exportado, sem
hardcode de documento, página ou frase. Apenas um token final cortado pelo drift
é removido; o fluxo linear intermediário permanece integral.

Depois da correção e de nova importação, os seis casos foram aceitos visualmente:

| Caso | Páginas | Resultado |
| --- | --- | --- |
| D1 — Figure 2 | 6–7 | passou; cobertura completa |
| D1 — Autonomy | 8–9 | passou; cobertura completa |
| D2 — infra background | 8–9 | passou; cobertura completa |
| D5 — Which approach | 2–3 | passou; cobertura completa |
| D8 — operational responsibilities | 5–6 | passou; cobertura completa |
| D8 — People downstream | 6–7 | passou; cobertura completa |

Também foram confirmados manualmente:

- modo somente leitura bloqueia mutações;
- com Jessica ativa, apenas markers de Jessica podem ser alterados;
- seleção manual cross-page cria uma única unidade lógica;
- exclusão lógica remove os destaques das duas páginas;
- sidebar apresenta uma unidade, não uma entrada por segmento;
- marker multipágina não oferece handles;
- marker simples preserva os dois handles.

O audit registrou 615 markers PDF, 633 segmentos e 1.189 aplicações no corpus
completo. Dentro disso, os seis grupos deste diagnóstico correspondem a 18
markers lógicos, 36 segmentos e 35 aplicações semânticas.

Cabeçalhos, rodapés, tabelas e demais elementos que o próprio fluxo linear do
Atlas/PDF inclui entre os endpoints continuam presentes por decisão explícita.
Isso pode produzir uma faixa do margin panel cobrindo quase toda a página. A
duplicação de rótulo/projeção no margin panel também permanece neste marco; sua
consolidação visual pertence ao Marco 4.

# Brief de pesquisa profunda: import QDPX Atlas.ti para highlights textuais em PDFs

Este documento foi preparado para consultar outras IAs sobre um problema de matching textual e geometrico em PDFs. A analise deve considerar o sistema completo, nao apenas um caso de um PDF.

## Pedido para a IA

Investigue como projetar um resolvedor robusto para importar selecoes textuais do Atlas.ti/QDPX como highlights textuais em PDFs renderizados pelo PDF.js/Obsidian.

O sistema precisa funcionar com diversos PDFs academicos, sem regras especificas por documento, sem transformar selecoes textuais em shapes e sem sacrificar os markers que ja sao resolvidos corretamente.

Quero uma analise profunda de:

- matching entre o texto do Atlas.ti e a text layer do PDF.js;
- separacao entre localizar a ancora inicial e determinar a extensao final;
- candidatos encontrados por texto exato, texto normalizado, bbox, contexto e janelas internas;
- uso seguro de geometria, linhas, blocos e colunas;
- ranking de candidatos e medicao de confianca;
- comportamento conservador quando o PDF nao oferece evidencia suficiente;
- estrategias de teste/diagnostico que nao dependam de e2e automatizado no Obsidian.

Nao proponha regras para nomes de PDFs, editoras, frases especificas ou boilerplate especifico. Se sugerir uma heuristica, explique por que ela generaliza para PDFs diferentes e qual regressao pode causar.

## Contexto do sistema

Repositorio:

`/Users/mosx/Desktop/obsidian-plugins-workbench/.obsidian/plugins/obsidian-qualia-coding`

Projeto: plugin Obsidian Qualia Coding.

Fixture principal:

`../../../QUALIA-QDPX/QDPX Tests/UnifiedDevOps Selective Coding ITE5 ICA.qdpx`

O QDPX contem selecoes PDF textuais de dez artigos. O importer cria `PdfMarker` com texto, pagina e indices DOM. Quando importa antes de a text layer existir, os indices ficam `0,0,0,0`; depois o `PdfPageObserver` tenta resolver os indices no PDF.js.

Arquivos centrais:

- `src/import/qdpxImporter.ts`: parse QDPX, preserva texto, bbox, contexto PlainText e relacoes `continued by`;
- `src/pdf/resolvePendingIndices.ts`: matching e resolucao de indices DOM;
- `src/pdf/pageObserver.ts`: lifecycle das paginas, re-anchor, pagina vizinha, render e coverage audit;
- `src/pdf/index.ts`: registro dos observers e persistencia dos snapshots JSON;
- `src/pdf/pdfCodingTypes.ts`: tipos `PdfMarker`, bbox e contexto importado;
- `scripts/audit_qdpx_pdf_import.py`: cruza QDPX, `data.json` e coverage runtime;
- `QDPX-ATLAS-FINAL-AUDIT-FULL.md`: tabela completa dos markers e trechos cobertos;
- `QDPX-ATLAS-IMPORT-NOTES.md`: historico consolidado e guardrails.

## Contrato que nao pode quebrar

Em smoke completo, preservar:

- `203/203` `PdfMarker` textuais resolvidos;
- `0` markers pendentes;
- `0` `PdfShapeMarker` para selecoes que eram textuais;
- `23/23` markers com `continued by` resolvidos;
- sem alterar a semantica de pagina vizinha:
  - `resolveOnNeighborPage()` testa `[pageNumber - 1, pageNumber + 1]`;
  - `importedPdfTextContext` pode ultrapassar o gate de `strongEnough`;
  - `resolveAdjacentPendingMarkersOnPage()` tambem avalia as duas paginas vizinhas;
- bbox do Atlas.ti e hint/restricao diagnostica, nao deve virar shape;
- selecao textual nunca deve ser convertida para retangulo ou shape como fallback.

O resultado deve distinguir resolucao estrutural de qualidade visual. Um marker resolvido nao significa necessariamente que o range cobre todo o texto esperado.

## Baseline visual confirmado

Depois de corrigir o auditor para acumular rows entre viewers e fazer flush ao fechar cada PDF, um smoke completo produziu:

- `203/203` markers auditados;
- `182/203` matches exatos;
- `21/203` mismatches;
- `0` `unauditedMarkers`;
- classes:
  - `16` `covered-prefix`;
  - `5` `covered-inside-expected`;
  - `0` `wrong-range-or-page` pela classificacao automatica.

O D1, que antes desaparecia do audit por ser o primeiro PDF aberto, passou a ser auditado: `29/31` matches e `2` mismatches. D11 e D12 ficaram `100%` matches.

Os `21` mismatches nao sao todos iguais:

1. Dois casos graves no D1: o texto esperado comeca em um trecho do artigo, mas o range cobriu boilerplate de licenca/rodape. Apesar de a classe automatica ser `covered-inside-expected`, semanticamente sao falsos positivos de localizacao.
2. Dezesseis casos `covered-prefix`: o inicio do highlight bate, mas o range termina cedo. Alguns sao truncamentos claros; outros podem envolver divergencia de text layer, hifenizacao, ligaturas ou ordem textual.
3. Tres casos `covered-inside-expected` fora do D1: o range inicia no meio do trecho esperado.

Os dois artefatos principais do smoke completo sao:

- `../../../imports/_qualia-pdf-marker-coverage-audit.json`;
- `../../../imports/_qualia-pdf-marker-current-status.json`.

O audit full e:

`QDPX-ATLAS-FINAL-AUDIT-FULL.md`

## Como o matching funciona hoje

`resolvePendingIndices.ts` trabalha aproximadamente nesta ordem:

1. coleta os `.textLayerNode` externos e monta o texto da pagina;
2. tenta texto literal e texto com whitespace normalizado;
3. tenta chave alfanumerica normalizada, ignorando pontuacao, espacos, soft hyphen e replacement char;
4. tenta prefixo unico, limitado por comprimento de ancora;
5. em alguns caminhos tenta bbox-text;
6. tenta `plainTextContext` importado do QDPX;
7. quando permitido, tenta uma janela interna unica do texto;
8. converte offsets do texto de pagina para `beginIndex/endIndex` e offsets DOM.

A normalizacao de ligaturas Atlas atualmente tem aliases explicitos `fff -> ffi` e `ff -> fi` em pontos especificos. Ela nao deve ser generalizada sem medir regressao, porque uma normalizacao global afetou o fallback de janela/pagina vizinha.

## Tentativas que falharam

### Expansao textual ampla

Uma tentativa expandia o range depois da ancora enquanto a chave normalizada continuasse batendo.

Resultado: highlights vazaram para tabelas, rodapes e areas vizinhas. A mudanca foi revertida.

Aprendizado: continuidade textual sem limite geometrico ou sem evidencia de bloco nao e suficiente em PDFs academicos.

### Validacao binaria do inicio

Foi testada uma regra que rejeitava qualquer candidato cujo texto coberto nao comecasse pelos primeiros 32 caracteres de `marker.text`.

Resultado do smoke: `165/203` resolvidos, `38` pendentes, `174/203` auditados e `29` `unaudited`.

A regra eliminou falsos positivos, mas tambem rejeitou anchors internas necessarias em PDFs com ligaturas, hifenizacao, ordem de text layer diferente ou divergencia entre o contexto Atlas e o texto PDF.js.

Aprendizado: nao transformar uma validacao de plausibilidade em filtro obrigatorio que devolve marker para pendente. O sistema precisa comparar candidatos e preservar a resolucao estrutural.

## Hipotese tecnica principal

O problema nao e um unico algoritmo de busca. Existem dois subproblemas:

### 1. Localizar a ancora

Encontrar onde a selecao comeca no PDF.js, mesmo quando a representacao Atlas e diferente.

Evidencias possiveis:

- texto literal/normalizado;
- prefixo unico;
- janela interna;
- contexto antes/depois;
- bbox Atlas;
- pagina original e paginas vizinhas.

### 2. Determinar a extensao

Depois de localizar a ancora, decidir ate onde o highlight deve ir.

O sistema atual resolve bem a ancora em muitos casos, mas frequentemente salva o fim da ancora/prefixo em vez do fim da selecao completa.

Esses problemas nao devem ser confundidos. Uma ancora interna pode ser a melhor evidencia de localizacao, mas nao prova que a janela encontrada seja a selecao inteira.

## Direcao de arquitetura sugerida

Investigar um pipeline de candidatos, sem regra por PDF:

1. Cada estrategia gera um candidato com:
   - pagina;
   - inicio e fim;
   - origem da estrategia;
   - tamanho da chave encontrada;
   - offset da janela dentro do texto esperado;
   - contexto antes/depois que bateu;
   - proximidade e intersecao com bbox;
   - nos/linhas/bloco visual envolvidos.
2. Um scorer combina essas evidencias em vez de aplicar uma condicao binaria.
3. A melhor alternativa precisa ter margem sobre a segunda melhor para ser considerada alta confianca.
4. A extensao final so deve crescer quando a continuacao mantiver evidencia textual e geometrica suficiente.
5. Expansao entre linhas/colunas/paginas deve ser possivel quando o layout indicar continuidade, mas nunca apenas porque a string continua parecendo semelhante.
6. Quando houver baixa confianca, manter o melhor range estrutural e registrar o nivel de confianca/evidencias no diagnostico. Nao criar pending automaticamente.

Sinais geometricos genericos que valem investigar:

- bounding boxes dos `textLayerNode`;
- continuidade de linhas por proximidade vertical;
- coluna/bloco por agrupamento de x e y;
- saltos grandes para outra regiao da pagina;
- coerencia com bbox Atlas como soft constraint;
- continuidade entre paginas quando a selecao realmente atravessa pagina.

O scorer deve evitar tanto falso positivo em boilerplate quanto rejeicao excessiva de anchors internas necessarias.

## Perguntas para pesquisa

1. Como outros sistemas fazem alignment entre texto de OCR/PDF e texto de uma fonte externa quando hifenizacao, ligaturas e ordem de leitura divergem?
2. E melhor usar alinhamento local tipo Smith-Waterman/sequence alignment, fuzzy matching ou candidatos por n-gramas?
3. Como detectar blocos e colunas de forma robusta a partir das coordenadas dos text nodes?
4. Como representar uma selecao textual que foi localizada, mas cuja extensao tem baixa confianca, sem perder o marker?
5. Quais metricas separam melhor ancora correta, range truncado, inicio interno e pagina errada?
6. Como calibrar um scorer com apenas 203 exemplos reais e smoke manual?
7. Como evitar que uma heuristica melhore `covered-prefix` e simultaneamente aumente pendencias ou falsos positivos?

## Validacao recomendada

Nao usar testes unitarios como criterio principal nesta fase exploratoria. O teste principal e smoke manual no Obsidian:

1. import limpo;
2. abrir/percorrer todos os PDFs;
3. confirmar `data.json` com `203` markers, `0` pendentes e `0` shapes;
4. confirmar coverage audit com `203/203` rows;
5. gerar:

```bash
python3 scripts/audit_qdpx_pdf_import.py
python3 scripts/audit_qdpx_pdf_import.py --full-text --output QDPX-ATLAS-FINAL-AUDIT-FULL.md
```

Uma proposta so deve ser aceita se mantiver o contrato estrutural e reduzir erros visuais sem gerar falsos positivos em areas vizinhas.

## Resposta que eu gostaria de receber

Entregue:

- diagnostico da causa provavel, separando ancora e extensao;
- desenho de algoritmo generalizavel;
- sinais e pesos sugeridos para candidatos;
- como usar geometria sem transformar selecao em shape;
- estrategia de baixa confianca que preserve markers;
- plano incremental de implementacao;
- riscos e casos em que o sistema deve admitir que nao sabe;
- exemplos de metricas para comparar uma mudanca com o baseline.

Nao recomende regras especificas para D1, IEEE, D2, D4 ou qualquer documento individual.

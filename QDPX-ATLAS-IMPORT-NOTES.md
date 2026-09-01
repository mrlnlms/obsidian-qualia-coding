# Atlas.ti QDPX PDF Import Notes

Contexto consolidado em 2026-08-06 para retomar o trabalho sem refazer o levantamento.

## Resumo executivo - ler primeiro

Estado mais recente validado em smoke real no Obsidian:

- fixture: `QUALIA-QDPX/QDPX Tests/UnifiedDevOps Selective Coding ITE5 ICA.qdpx`;
- import final: `203` `PdfMarker` textuais, `0` `PdfShapeMarker`;
- apos `plain-text-context`: `203/203` resolvidos, `0/203` pendentes;
- todos os `23` markers com `continued by` foram resolvidos;
- auditoria estrutural final apos o ultimo ciclo: `203/203` resolvidos, `0` pendentes e `0` shapes;
- cobertura visual final apos corrigir o acumulo do auditor: `203/203` markers auditados, `182` matches e `21` mismatches;
- `0` markers ficaram `unaudited` no snapshot final;
- entre todos os markers, os mismatches sao `16` `covered-prefix` e `5` `covered-inside-expected`;
- snapshot runtime fica em `imports/_qualia-pdf-marker-current-status.json`.
- coverage runtime fica em `imports/_qualia-pdf-marker-coverage-audit.json`.

## Ultima avaliacao - 2026-08-06

O ciclo manual de reimport e abertura dos PDFs confirmou o contrato estrutural do import: `203/203` `PdfMarker` textuais resolvidos, `0` pendentes, `0` `PdfShapeMarker` e `23/23` markers com `continued by` resolvidos. Isso indica que a reancoragem e a preservacao dos markers continuam funcionando.

O snapshot de cobertura final foi gerado em `2026-08-07T00:05:20.981Z`. Ele observou `203/203` markers: `182` matches e `21` mismatches. Os mismatches sao `16` `covered-prefix`, isto e, a ancora inicial bate mas o range termina cedo, e `5` `covered-inside-expected`. Nao apareceu `wrong-range-or-page` neste snapshot.

Conclusao operacional: o diagnostico agora esta fechado para os `203` markers. O import estrutural esta correto; os `21` casos restantes devem ser tratados como truncamentos ou divergencias da text layer, nao como falha estrutural de import. Nao fazer expansao textual ampla: a tentativa anterior mostrou risco de vazamento para tabelas e rodapes.

## Tentativa rejeitada - validacao de inicio interno em 2026-08-07

Foi testada uma validacao generica que rejeitava qualquer candidato cujo texto coberto nao comecasse pelos primeiros caracteres de `marker.text`. A intencao era eliminar os `2` falsos positivos graves do D1 sem regras especificas por PDF.

Resultado do smoke: regressao estrutural para `165/203` resolvidos, `38` pendentes e `29` markers sem cobertura auditada. A abordagem foi retirada; nao usar esse criterio como filtro obrigatorio. O problema e que varios caminhos de janela/contexto sao necessarios para manter `203/203`, mesmo quando o range inicial nao pode ser validado dessa forma.

Estado para a proxima sessao: o codigo esta de volta ao comportamento estavel anterior ao commit experimental `8ef2f2c`; o snapshot atual do workspace veio da tentativa rejeitada e nao deve ser usado como baseline. E necessario um novo smoke apos o rollback para regenerar `203/203` resolvidos e `203/203` auditados.

## Direcao tecnica registrada para a proxima tentativa

A validacao binaria de inicio (`coveredKey` precisa comecar com os primeiros 32 caracteres de `marker.text`) falhou porque confundiu dois cenarios diferentes:

- candidato realmente errado, como os falsos positivos do D1 em boilerplate de licenca;
- ancora interna necessaria para PDFs em que ligaturas, hifenizacao, ordem da text layer ou contexto Atlas/PDF.js impedem localizar o inicio literal.

Rejeitar o segundo caso quebrou os caminhos `window`/`plain-text-context` responsaveis por manter `203/203` resolvidos. Nao repetir esse filtro como regra obrigatoria.

Direcao recomendada:

1. manter o baseline estavel antes de qualquer nova heuristica;
2. fazer cada estrategia produzir um candidato com evidencias (`page-text`, `bbox-text`, `plain-text-context`, `window-text`, prefixo encontrado, offset da janela, contexto e geometria);
3. pontuar e comparar candidatos, em vez de aceitar/rejeitar por uma condicao unica;
4. usar proximidade ao bbox, contexto antes/depois, comprimento da correspondencia e continuidade visual como sinais combinados;
5. quando a confianca for baixa, manter o marker resolvido e registrar `low-confidence`, sem devolve-lo para pendente;
6. tratar os dois casos graves do D1 com contexto/geometria genericos, nunca por regra de documento ou texto especifico.

Regra central:

- NUNCA converter `PDFSelection` textual do Atlas.ti em `PdfShapeMarker`;
- bbox/coordenadas do Atlas.ti sao apenas hint/restricao diagnostica;
- output correto continua sendo `PdfMarker` textual com indices reais.

Codigo relevante ja alterado:

- `src/import/qdpxImporter.ts`: preserva bbox e metadados `continued by` em markers textuais;
- `src/pdf/resolvePendingIndices.ts`: normalizacao textual, bbox hint, `plain-text-context`, fallback por prefixo/janela e diagnosticos;
- `src/pdf/pageObserver.ts`: re-anchor runtime, retry de text layer, pagina vizinha, snapshot JSON, coverage audit e diagnosticos;
- `src/pdf/index.ts`: grava `imports/_qualia-pdf-marker-current-status.json` e `imports/_qualia-pdf-marker-coverage-audit.json`;
- testes focados em `tests/pdf/resolvePendingIndices.test.ts` e testes de import QDPX.

Ultimas melhorias validadas:

- `plain-text-context` resolveu os `12` pendentes finais sem baixar limiar global para texto curto;
- coverage audit confirmou que o problema remanescente e de extensao visual do range, nao de import estrutural;
- prefixo/janela continuam sendo caminhos de resolucao necessarios para preservar o patamar `203/203`;
- qualquer melhoria de cobertura deve preservar esses caminhos e atuar como expansao/ajuste do range, nao como endurecimento que devolve markers para pendente;
- rollback verificado no JSONL da sessao `rollout-2026-08-06T16-11-12-019fd87c-99e1-7213-88fa-dd7cc28245ea.jsonl`: o estado funcional `203/203` usava `resolveOnNeighborPage()` testando `[pageNumber - 1, pageNumber + 1]`, permitia `importedPdfTextContext` furar o gate de `strongEnough`, e `resolveAdjacentPendingMarkersOnPage()` avaliava `[pageNumber - 1, pageNumber + 1]`;
- nao mudar essa ordem/semantica de pagina vizinha por inferencia visual isolada; qualquer ajuste futuro precisa preservar `203/203` resolvidos em smoke real antes de atacar coverage;
- `npm test -- tests/pdf/resolvePendingIndices.test.ts tests/import/qdpxImporter.test.ts` passou;
- `npm run build` passou.

Erros observados no snapshot final:

- `2` falsos positivos graves no D1: o texto esperado comeca em `Figure 2...`/`3.2.5 Autonomy...`, mas o range cobriu texto de licenca IEEE;
- `16` `covered-prefix`: a ancora inicial esta correta, mas o highlight termina antes do fim esperado;
- `3` `covered-inside-expected` fora do D1: o range comeca no meio do trecho esperado;
- `D11` e `D12` ficaram sem mismatches;
- nao apareceu `wrong-range-or-page` pela classificacao automatica, embora os `2` casos de licenca do D1 sejam semanticamente ranges errados.

Proximo passo recomendado:

1. Nao refazer o import: o diagnostico agora cobre `203/203` markers.
2. Corrigir primeiro os `2` falsos positivos do D1, adicionando uma restricao que rejeite ancoras em boilerplate de licenca/rodape.
3. Depois analisar `5-10` dos `16` `covered-prefix` e separar truncamento real de divergencia da text layer.
4. Implementar apenas expansao seletiva apos ancora, limitada por bloco/linha/coluna visual; nunca expansao textual solta.
5. Preservar em cada smoke `203/203` resolvidos, `0` pendentes e `0` shapes.

Observacao do smoke limpo:

- `data.json` confirmou `203` markers, `0` pendentes, `0` shapes;
- `_qualia-pdf-marker-coverage-audit.json` confirmou `203` markers auditados;
- `_qualia-pdf-marker-current-status.json` ficou intermediario/stale com D12 pendente, gerado antes do coverage posterior; nao usar sozinho para negar o baseline final.

## Tentativa revertida 2026-08-06 - expansao conservadora de range apos ancora

Contexto:

- smoke manual pos-reimport confirmou o baseline estrutural: `203/203` resolvidos, `0` pendentes, `0` shapes;
- coverage runtime desse smoke ficou em `113/203` matches e `90/203` mismatches;
- `84/90` mismatches eram `covered-prefix`, confirmando range visual truncado no comeco correto.

Mudanca tentada:

- `findUniqueSearchKeyRange()` e `findUniqueWindowSearchKeyRange()` preservavam tambem o offset da ancora na chave normalizada da pagina;
- depois de encontrar uma ancora unica, `expandSearchKeyRange()` tentava expandir para tras/frente enquanto `pageKey` e `textKey` continuassem iguais;
- se a expansao acrescentasse menos de `16` caracteres normalizados, ela era descartada para evitar falsos ganhos por coincidencias curtas;
- o fallback antigo permanecia como default quando a continuacao divergia.

Resultado:

- smoke visual mostrou falso positivo grave: alguns highlights vazaram para regioes/tabelas fora do trecho esperado;
- a mudanca foi revertida no codigo;
- manter o aprendizado: expansao por continuidade de chave textual, sozinha, nao e restricao suficiente em PDFs academicos com colunas/tabelas/ordem textual divergente.

Guardrail preservado:

- nenhuma conversao para `PdfShapeMarker`;
- nenhuma alteracao na semantica de pagina vizinha;
- nenhuma remocao/reordenacao de fallback por prefixo/janela/contexto.

Validacao local antes da reversao:

- `npm test -- tests/pdf/resolvePendingIndices.test.ts tests/import/qdpxImporter.test.ts` passou (`52` testes);
- `npm run build` passou;
- `python3 -m py_compile scripts/audit_qdpx_pdf_import.py` passou.

Reversao:

- codigo voltou a bater com `dd4dd9d` nos arquivos criticos (`src/pdf/resolvePendingIndices.ts`, `src/pdf/pageObserver.ts`, importer e testes focados);
- validacao apos reversao voltou ao baseline de `50` testes focados;
- `npm run qdpx:reset` removeu `imports/` e deixou o proximo smoke como reimport limpo.

## Historico - estado de 2026-08-04 antes dos fallbacks finais

Esta secao e historica. O estado atual consolidado esta no resumo executivo acima e no smoke de 2026-08-06: `203/203` resolvidos, `0` pendentes, `0` shapes.

O objetivo naquele momento nao era alterar o algoritmo de matching. O trabalho era ganhar visibilidade final pos-smoke para entender os pendentes restantes antes de qualquer nova heuristica.

Estado observado naquele smoke:

- `203` `PdfMarker` textuais importados;
- `0` `PdfShapeMarker`;
- `168/203` markers textuais resolvidos;
- `35/203` markers textuais pendentes.

Pendentes por PDF:

- D1: `5`;
- D2: `2`;
- D4: `4`;
- D5: `10`;
- D6: `3`;
- D7: `1`;
- D8: `5`;
- D9: `4`;
- D11: `0`;
- D12: `1`.

Leitura dos pendentes naquele momento:

- `continued by` explica parte, mas nao tudo;
- dos `35` pendentes, `12` estao ligados a `continued by`;
- os outros `23` pendentes nao sao explicados por `continued by`;
- todos os PDFs com markers ainda tem pelo menos algum pendente, exceto D11.

Regra central preservada:

- `PDFSelection` textual do Atlas.ti nao deve ser convertido em `PdfShapeMarker`;
- bbox/coordenadas do Atlas.ti sao somente hint/restricao de busca textual;
- o resultado correto continua sendo `PdfMarker` textual com indices reais;
- shape fallback so vale para selecoes realmente sem texto/nome textual.

## Historico - trabalho em andamento de diagnostico consolidado

Proximo chunk acordado naquele momento:

1. Implementar/ajustar um relatorio runtime unico pos-smoke por PDF, calculado a partir do estado atual final dos markers no model.
2. O relatorio deve incluir, por PDF:
   - total de markers textuais;
   - resolvidos;
   - pendentes;
   - pendentes com `continued by`;
   - pendentes curtos;
   - paginas dos pendentes;
   - amostras limitadas dos pendentes.
3. Garantir que o `console.table` desse status final apareca fora de grupos colapsados.
4. Nao alterar heuristica de import/re-anchor ate esse relatorio separar melhor os `35` pendentes.

Implementado nesta retomada:

- `src/pdf/pageObserver.ts` expandiu `[qualia-coding] PDF marker current status`;
- o status final agora sai com `console.log` + `console.table` fora de grupo colapsado;
- o status final agora e calculado para todos os PDFs presentes no model, nao apenas para o PDF/pagina que acabou de renderizar;
- colunas adicionadas:
  - `pendingPages`;
  - `pendingShortTextLt64`;
  - contagens de bbox/continued-by ja existentes preservadas;
- nova tabela `[qualia-coding] PDF marker current pending samples`, com ate 5 pendentes por PDF:
  - arquivo;
  - pagina;
  - marker id;
  - tamanho do texto;
  - flag de texto curto;
  - bbox;
  - `continued by`;
  - preview textual.
- `src/pdf/index.ts` grava o mesmo snapshot em `imports/_qualia-pdf-marker-current-status.json` dentro do vault;
- o snapshot JSON contem `generatedAt`, `totals`, `rows` e `samples`;
- `npm run build` passou apos a implementacao.
- apos o primeiro smoke com JSON, `src/pdf/pageObserver.ts` foi ajustado para:
  - incluir todos os pendentes em `samples`, sem limitar a 5 por PDF;
  - carregar no sample final os detalhes de falha de re-anchor por marker quando disponiveis (`reason`, bbox preview, melhores scores da pagina e paginas vizinhas);
  - manter limite de `50` apenas para a tabela de console do diagnostico de tentativa, nao para o snapshot final.

Naquele ponto, ainda faltava validar por smoke manual no Obsidian.

## Smoke manual 2026-08-04 - snapshot JSON

Fluxo executado pelo user:

- deletou estado anterior;
- reimportou o QDPX;
- abriu todos os PDFs;
- rolou ate o fim para carregar/renderizar paginas.

Snapshot lido em `imports/_qualia-pdf-marker-current-status.json`, gerado em `2026-08-04T21:47:47.539Z`:

- PDFs: `10`;
- `203` `PdfMarker` textuais;
- `168` resolvidos;
- `35` pendentes;
- `14` pendentes curtos `<64`;
- `12` pendentes com `continued by`;
- `0` `PdfShapeMarker`.

Pendentes por PDF no snapshot:

- D1: `5`, pagina `5`, todos com `continued by`, `3` curtos;
- D2: `2`, pagina `5`, nenhum `continued by`;
- D4: `4`, paginas `4, 6`, `2` com `continued by`;
- D5: `10`, paginas `1, 2, 4`, `2` com `continued by`, `4` curtos;
- D6: `3`, pagina `6`, todos com `continued by`, todos curtos;
- D7: `1`, pagina `4`, sem `continued by`;
- D8: `5`, paginas `5, 6`, sem `continued by`, `3` curtos;
- D9: `4`, paginas `3, 4, 6`, sem `continued by`;
- D11: `0`;
- D12: `1`, pagina `5`, curto, sem `continued by`.

Leitura apos esse smoke:

- o novo snapshot confirma o patamar anterior (`168/203`, `35` pendentes, `0` shapes);
- `continued by` explica exatamente `12/35`;
- `23/35` pendentes nao sao `continued by`;
- todos os pendentes tem bbox preservada;
- o primeiro snapshot limitava samples a 5 por PDF, entao D5 veio truncado; isso ja foi corrigido para o proximo smoke.

## Smoke manual 2026-08-04 - snapshot JSON completo

Fluxo executado pelo user:

- recarregou o plugin apos a melhoria do snapshot;
- abriu/rolou os PDFs novamente;
- gerou novo `imports/_qualia-pdf-marker-current-status.json`.

Snapshot gerado em `2026-08-04T21:57:04.369Z`:

- `203` `PdfMarker` textuais;
- `168` resolvidos;
- `35` pendentes;
- `14` pendentes curtos `<64`;
- `12` pendentes com `continued by`;
- `0` `PdfShapeMarker`;
- `samples`: `35`, agora completo.

Classificacao diagnostica dos `35` pendentes:

- `12/35` sao `continued by`;
- `7/35` sao curtos sem `continued by`;
- `34/35` tentaram bbox, mas a bbox nao teve match textual util (`bboxBestPrefixKeyLength = 0` e `bboxBestWindowKeyLength = 0`);
- `20/35` nao tiveram sinal textual util nem na pagina atual nem em pagina vizinha carregada;
- `7/35` tiveram sinal relevante em pagina vizinha (`>=48` chars de melhor janela/prefixo), mas nao resolveram pelo algoritmo atual.

Markers com sinal relevante em pagina vizinha:

- D4 p4: `these activities are solely the responsibility of the DevOps teams.` (`nextPageBestWindowKeyLength = 57`);
- D4 p4: `Scripts are created for conffguration management...` (`nextPageBestWindowKeyLength = 49`);
- D4 p6: quotation longa `our ffndings show DevOps... platform builders` (`nextPageBestWindowKeyLength = 160`);
- D4 p6: `All deployments in the study... automated pipelines.` (`nextPageBestWindowKeyLength = 79`);
- D8 p5: quotation longa sobre approvals/change advisory board (`nextPageBestWindowKeyLength = 72`);
- D8 p6: `measurement of process, value, cost, and technical metrics;` (`nextPageBestWindowKeyLength = 48`);
- D8 p6: `regular retrospectives as an input...` (`nextPageBestWindowKeyLength = 63`).

Leitura tecnica:

- bbox nao esta ausente; ela esta preservada em todos os pendentes;
- para quase todos os pendentes, a bbox aponta para texto claramente diferente do texto da quotation;
- aumentar tolerancia da bbox nao deve resolver; tende a ampliar regioes erradas;
- `continued by` explica D1/D6 e parte de D4/D5, mas nao D2/D7/D8/D9/D12;
- o proximo ganho provavel nao e "usar bbox como shape"; e sim:
  - tratar fragmentos `continued by` como cadeia textual quando isso ajudar a achar a ancora;
  - adicionar um fallback textual controlado por melhor janela/prefixo em pagina vizinha;
  - registrar classificacao automatica de pendentes no snapshot para nao reclassificar manualmente.

## Implementacao 2026-08-04 - fallback por janela em pagina vizinha

Mudanca aplicada apos o snapshot completo:

- `resolvePendingIndicesWithDiagnostics()` ganhou opcao explicita `allowWindowFallback`;
- por padrao o fallback por janela continua desligado;
- quando habilitado, o resolver pode ancorar uma janela textual unica dentro da pagina, mesmo quando o prefixo da quotation nao aparece;
- a janela precisa ser unica na pagina e respeitar `minWindowKeyLength`;
- `resolvedBy` pode vir como `window-text`;
- `PdfPageObserver` habilita esse fallback somente no re-anchor por pagina vizinha;
- limiar de pagina vizinha foi ajustado para `48`, porque o snapshot real mostrou 7 candidatos fortes entre `48` e `160`;
- bbox continua sendo apenas hint e nao vira shape.

Escopo esperado da melhoria:

- atacar principalmente os 7 pendentes com sinal forte em pagina vizinha:
  - D4 p4/p6;
  - D8 p5/p6;
- nao deve resolver a maioria dos casos sem sinal textual (`20/35`);
- nao deve resolver automaticamente os fragments `continued by` curtos quando nao ha janela unica suficiente.

Validacao local:

- `npm test -- tests/pdf/resolvePendingIndices.test.ts` passou (`19` testes);
- `npm run build` passou.

Proximo smoke manual:

- recarregar o plugin no Obsidian;
- abrir/rolar D1-D12 novamente;
- ler `imports/_qualia-pdf-marker-current-status.json`;
- expectativa: `pendingTextMarkers` deve cair se os candidatos D4/D8 forem adotados por `window-text`.

## Smoke manual 2026-08-04 - apos window fallback

Fluxo executado pelo user:

- refez todo processo de importacao;
- abriu todos os PDFs;
- rolou ate carregar/renderizar tudo.

Snapshot gerado em `2026-08-04T22:07:30.962Z`:

- `203` `PdfMarker` textuais;
- `191` resolvidos;
- `12` pendentes;
- `12` pendentes curtos `<64`;
- `7` pendentes com `continued by`;
- `0` `PdfShapeMarker`.

Ganho observado:

- resolvidos subiram de `168/203` para `191/203`;
- pendentes cairam de `35` para `12`;
- ganho liquido: `+23` markers resolvidos;
- D2, D4, D7, D9 e D12 ficaram com `0` pendentes;
- D8 caiu de `5` para `2`;
- D5 caiu de `10` para `4`;
- D1 caiu de `5` para `3`;
- D6 ficou em `3`.

Pendentes restantes:

- D1 p5, `continued by`, curtos:
  - `and lack of collaboration`;
  - `and/or mentoring among others, as a service`;
  - `showing some cultural barriers.`
- D5 p1/p2:
  - `collaboration between Dev and Ops`;
  - `but keep existing roles differentiated,`;
  - `Mix personnel: increase communication`;
  - `and collaboration is promoted.` (`continued by`)
- D6 p6, `continued by`, curtos:
  - `communications`;
  - `Collaboration`;
  - `y increase by establishing cross-functional teams`
- D8 p6:
  - `sharing of knowledge and tools;`;
  - `a culture of collaboration between all team members`.

Leitura tecnica apos o ganho:

- window fallback em pagina vizinha resolveu mais que os 7 candidatos inicialmente destacados, sem criar shapes;
- os `12` restantes sao todos curtos;
- `7/12` restantes sao `continued by`;
- a proxima etapa nao deve baixar limiar global indiscriminadamente;
- o proximo alvo deve ser especifico para fragmentos curtos:
  - usar cadeia `continued by` quando houver;
  - usar matching curto somente com contexto local forte/adjacencia a fragmento ja resolvido;
  - manter diagnostico para evitar falso positivo em termos comuns como `Collaboration`.

## Historico - validacao manual no Atlas.ti dos pendentes

Objetivo:

- abrir o projeto no Atlas.ti e validar como essas quotations foram preenchidas;
- comparar o texto/fragmento exportado no QDPX com o highlight visual real no Atlas;
- decidir se cada caso deve ser:
  - fragmento curto que completa uma quotation maior;
  - quotation independente curta;
  - `continued by` com ordem/page-shift estranha;
  - erro/limite da exportacao do Atlas;
  - caso que nao vale tentar resolver automaticamente.

Estado base para validacao:

- ultimo smoke apos window fallback: `191/203` resolvidos, `12/203` pendentes, `0` shapes;
- todos os `12` pendentes sao curtos;
- `7/12` tem metadado `continued by`.

### D1 2021 UPM Paper.pdf - pagina 5

Pendentes `continued by`:

1. `and lack of collaboration`
   - relacionado resolvido: `Some participating organizations highlighted that product teams have external dependencies with other teams... These dependencies usually generate organizational barriers due to poor communication`
   - hipotese visual: fragmento final de frase, formando `poor communication and lack of collaboration`.
   - validar no Atlas: confirmar se o highlight realmente inclui a continuacao no fim da frase ou se e uma quotation separada.

2. `and/or mentoring among others, as a service`
   - relacionado resolvido: `While using these codes, we also realized that there were different kinds of horizontal teams such as DevOps Center of Excellence (DevOps CoE), DevOps chapter and Platform team.`
   - hipotese: fragmento curto ligado por `continued by`, mas o contexto textual exportado nao deixa claro se completa imediatamente a mesma quotation.
   - validar no Atlas: verificar onde esse fragmento aparece visualmente e qual quotation maior o Atlas mostra.

3. `showing some cultural barriers.`
   - relacionado resolvido: `Stable product teams resulting from the creation of teams in which developers and operators daily collaborate, but there exist still a transfer of work between them`
   - hipotese visual: fragmento final de frase/trecho seguinte, possivelmente completando `...still show cultural barriers`.
   - validar no Atlas: confirmar se o fragmento pertence ao trecho `Some other organizations... still show cultural barriers` ou a outra quotation.

### D5 2016 Nybon Paper.pdf - paginas 1-2

Pendentes sem `continued by`:

1. `collaboration between Dev and Ops`
   - pagina importada: `1`;
   - hipotese: fragmento curto/titulo/subtrecho; pode estar repetido ou em regiao diferente da bbox.
   - validar no Atlas: confirmar se e quotation independente ou parte de um trecho maior.

2. `but keep existing roles differentiated,`
   - pagina importada: `1`;
   - hipotese: fragmento final/intermediario curto, dificil de ancorar isoladamente.
   - validar no Atlas: identificar texto anterior/posterior no highlight.

3. `Mix personnel: increase communication`
   - pagina importada: `1`;
   - hipotese: item/lista/titulo curto; pode precisar de contexto de linha.
   - validar no Atlas: confirmar se o Atlas destacou so esse item ou tambem descricao adjacente.

Pendente `continued by`:

4. `and collaboration is promoted.`
   - pagina importada: `2`;
   - relacionado resolvido: `In this way, the Dev and Ops responsibilities are maintained, but communication`
   - hipotese: fragmento final de frase, formando `...communication and collaboration is promoted.`
   - validar no Atlas: confirmar continuidade e se a quotation cruza pagina/coluna.

### D6 2017 Shahin Paper.pdf - pagina 6

Todos pendentes e ligados por `continued by`:

1. `communications`
2. `Collaboration`
3. `y increase by establishing cross-functional teams`

Relação observada:

- `y increase by establishing cross-functional teams` e origin;
- `Collaboration` e `communications` aparecem como targets relacionados;
- todos continuam com indices `0,0,0,0`.

Hipotese:

- cadeia curta/multifragmentada, talvez extraida de tabela/lista;
- `y increase...` parece comecar no meio de uma palavra/frase, possivelmente `may increase by...`;
- termos como `Collaboration` e `communications` sao curtos/comuns demais para resolver por busca global sem risco.

Validar no Atlas:

- localizar a quotation original na pagina 6;
- verificar se esses tres fragments sao uma unica quotation visual, partes de uma tabela, ou quotations separadas conectadas por `continued by`;
- anotar texto anterior/posterior de `y increase...`.

### D8 2011 Humble.pdf - pagina 6

Pendentes sem `continued by`:

1. `sharing of knowledge and tools;`
   - hipotese: item curto em lista.
   - validar no Atlas: confirmar se e item isolado ou parte de uma lista maior destacada.

2. `a culture of collaboration between all team members`
   - hipotese: fragmento curto dentro de lista/frase maior.
   - validar no Atlas: confirmar contexto anterior/posterior e se o Atlas destacou somente esse fragmento.

Resultado esperado da validacao:

- para cada item, registrar:
  - texto visivel no Atlas;
  - se e highlight unico ou continuacao;
  - pagina real visual;
  - se o trecho antes/depois deve entrar como contexto;
  - se parece seguro automatizar ou se deve ficar como limite conhecido.

Categorias que o relatorio deve ajudar a separar:

- fragment curto;
- `continued by`;
- provavel page-shift ainda nao adotado;
- bbox aponta para regiao errada;

## Implementacao 2026-08-06 - contexto PlainTextSelection para pendentes curtos

Decisao:

- nao depender do Atlas.ti como pre-requisito para resolver os `12` pendentes;
- usar o proprio QDPX/QDE como fonte de contexto textual auditavel;
- manter cada `PDFSelection` textual como `PdfMarker` textual separado;
- nao fazer merge automatico de highlights.

Mudanca aplicada:

- `PdfMarker` ganhou `importedPdfTextContext`;
- o import grava contexto vindo do `PlainTextSelection` pareado:
  - `before`;
  - `exact`;
  - `after`;
  - `startPosition`;
  - `endPosition`;
  - `resolutionStrategy`;
- o resolver PDF ganhou `resolvedBy: plain-text-context`;
- esse caminho so roda depois de `page-text` e `bbox-text` falharem;
- o fragmento curto nao e buscado sozinho: o resolver busca uma janela maior do contexto exportado e so resolve se essa janela for unica na pagina;
- o snapshot/diagnostico passa a carregar sinais de tentativa por contexto quando o marker continuar pendente.

Motivacao:

- `<64` nao e heuristica semantica; e apenas sinal de baixo poder de ancoragem;
- os `12` pendentes existem mesmo no QDE como pares `PDFSelection` + `PlainTextSelection`;
- muitos pendentes sao subtrechos dentro de frase/lista maior:
  - D5: `Mix personnel: increase communication and collaboration between Dev and Ops, but keep existing roles differentiated`;
  - D6: `Collaboration and communications among team members can considerably increase by establishing cross-functional teams`;
  - D8: `a culture of collaboration between all team members; ... sharing of knowledge and tools;`;
- usar contexto do `PlainTextSelection` e mais seguro que baixar limiar global para texto curto.

Validacao local:

- `npm test -- tests/pdf/resolvePendingIndices.test.ts tests/import/qdpxImporter.test.ts` passou (`50` testes);
- `npm run build` passou.

Proximo smoke manual:

- reimportar o QDPX para gerar markers com `importedPdfTextContext`;
- abrir/rolar D1-D12 no Obsidian;
- ler `imports/_qualia-pdf-marker-current-status.json`;
- checar se aparecem resolucoes por `plain-text-context`;
- expectativa: reduzir os `12` pendentes sem criar `PdfShapeMarker`.

## Smoke manual 2026-08-06 - primeiro contexto PlainTextSelection

Fluxo executado pelo user:

- Obsidian fechado;
- deletou `data.json`;
- deletou projeto importado;
- abriu Obsidian;
- importou QDPX;
- abriu todos os PDFs.

Snapshot gerado em `2026-08-06T19:41:41.996Z`:

- `203` `PdfMarker` textuais;
- `191` resolvidos;
- `12` pendentes;
- `12/12` pendentes curtos `<64`;
- `7/12` pendentes com `continued by`;
- `0` shapes;
- `197/203` markers com `importedPdfTextContext`;
- `12/12` pendentes com `importedPdfTextContext`.

Resultado:

- a persistencia do contexto funcionou;
- a contagem ainda nao caiu;
- `plainTextContextAttempted: true` apareceu nos `12`, mas `plainTextContextBestWindowKeyLength = 0`.

Diagnostico:

- o contexto foi tentado na pagina atual do marker;
- para D1/D6, o proprio snapshot ainda mostrava sinal na pagina vizinha;
- o gate de pagina vizinha ainda dependia do texto curto isolado antes de testar contexto;
- isso impedia o novo resolver de tentar uma janela contextual maior na pagina vizinha.

Ajuste aplicado depois do smoke:

- `resolveOnNeighborPage()` e `resolveAdjacentPendingMarkersOnPage()` agora testam pagina vizinha quando o marker tem `importedPdfTextContext`, mesmo que o texto curto isolado nao atinja `NEIGHBOR_PAGE_REANCHOR_MIN_KEY_LENGTH`;
- a seguranca continua dentro do resolver: `plain-text-context` so resolve com janela contextual unica;
- `npm test -- tests/pdf/resolvePendingIndices.test.ts tests/import/qdpxImporter.test.ts` passou (`50` testes);
- `npm run build` passou.

## Smoke manual 2026-08-06 - contexto em pagina vizinha

Fluxo executado pelo user:

- refez todo o processo de importacao;
- abriu todos os PDFs no Obsidian.

Snapshot gerado em `2026-08-06T19:51:50.405Z`:

- `203` `PdfMarker` textuais;
- `203` resolvidos;
- `0` pendentes;
- `0` pendentes com `continued by`;
- `0` `PdfShapeMarker`;
- `samples: []`.

Resultado:

- os `12` pendentes restantes foram resolvidos;
- a regra central foi preservada: nenhum `PDFSelection` textual virou shape;
- `23` markers com `continued by` no total, todos resolvidos;
- `197/203` markers com `importedPdfTextContext`;
- `0/203` pendentes com contexto.

Os `12` previamente pendentes foram ancorados assim:

- D1:
  - `and lack of collaboration` -> pagina `6`, `50:26-51:16`;
  - `and/or mentoring among others, as a service` -> pagina `6`, `189:40-190:26`;
  - `showing some cultural barriers.` -> pagina `6`, `98:51-99:23`;
- D5:
  - `collaboration between Dev and Ops` -> pagina `2`, `64:45-65:3`;
  - `but keep existing roles differentiated,` -> pagina `2`, `65:5-65:42`;
  - `Mix personnel: increase communication` -> pagina `2`, `64:3-64:40`;
  - `and collaboration is promoted.` -> pagina `3`, `17:39-17:69`;
- D6:
  - `communications` -> pagina `7`, `103:18-103:32`;
  - `Collaboration` -> pagina `7`, `2:0-2:13`;
  - `y increase by establishing cross-functional teams` -> pagina `7`, `103:67-103:117`;
- D8:
  - `sharing of knowledge and tools;` -> pagina `7`, `58:74-58:105`;
  - `a culture of collaboration between all team members` -> pagina `7`, `55:79-58:12`.

Leitura tecnica:

- o gargalo final era page-shift + texto curto;
- o contexto `PlainTextSelection` resolveu sem baixar limiar global para fragmentos curtos;
- o proximo passo recomendado e inspecao visual amostral no Obsidian dos 12 ranges acima, nao nova heuristica.

## Auditoria de cobertura visual - 2026-08-06

Apos validacao visual, foi identificado um novo problema:

- `203/203` markers estao resolvidos estruturalmente;
- porem alguns highlights visuais cobrem apenas parte do `marker.text`;
- exemplo D1: o trecho esperado segue ate `self-organization and autonomy`, mas o highlight/text layer coberto parava em `cross-functionality (sometimes us`.

Nova auditoria runtime criada:

- `imports/_qualia-pdf-marker-coverage-audit.json`;
- compara `marker.text` com texto realmente coberto pelos indices `begin/end` na text layer do PDF.js;
- `scripts/audit_qdpx_pdf_import.py` cruza QDPX + `data.json` + coverage audit;
- relatorios:
  - `QDPX-ATLAS-FINAL-AUDIT.md`;
  - `QDPX-ATLAS-FINAL-AUDIT-FULL.md`;
  - `QDPX-ATLAS-COVERAGE-AUDIT-FINDINGS.md`.

Primeiro resultado:

- `112/203` coverage matches;
- `91/203` coverage mismatches;
- `0` mismatches curtos `<64`;
- mismatches concentrados em trechos medios/longos, especialmente `256+` chars.

Leitura atual:

- a camada de import esta preservada;
- o problema restante e extensao/cobertura do range visual;
- hipotese dominante: caminhos de ancoragem por prefixo/janela salvam um range parcial para textos longos;
- proxima etapa: classificar os `91` mismatches e corrigir expansao do range apos encontrar a ancora inicial.
- divergencia textual/OCR/PDF.js.

Modo de trabalho nesta investigacao:

- nao automatizar Obsidian/e2e para o smoke real;
- o plugin deve emitir diagnosticos agregados automaticamente;
- o user faz reload/import/abre/rola PDFs no Obsidian e cola os logs;
- para reduzir copia de console, apos o smoke o user pode passar o conteudo de `imports/_qualia-pdf-marker-current-status.json`;
- antes de novo import manual, limpar `data.json` com `npm run qdpx:reset`, somente apos confirmacao explicita do user;
- resets de import continuam dependendo do momento do smoke manual.

## Fixture principal

- Vault real: `/Users/mosx/Desktop/obsidian-plugins-workbench/`
- Plugin repo: `/Users/mosx/Desktop/obsidian-plugins-workbench/.obsidian/plugins/obsidian-qualia-coding/`
- QDPX de teste: `/Users/mosx/Desktop/obsidian-plugins-workbench/QUALIA-QDPX/QDPX Tests/UnifiedDevOps Selective Coding ITE5 ICA.qdpx`
- Materiais de investigacao movidos para: `/Users/mosx/Desktop/obsidian-plugins-workbench/QUALIA-QDPX/investigacao-import-atlas-qdpx/`

## Resultado do import observado

Preview do modal:

- Origin: `ATLAS.ti 26.0.1 33971 , macOS Version 26.5 (Build 25F71)`
- Found: `25 codes, 408 segments, 10 sources, 6 memos, 20 relations`

Auditoria do `data.json` apos import:

- `203` `PdfMarker` textuais
- `0` `PdfShapeMarker`
- A maioria dos markers fica pendente com `beginIndex/beginOffset/endIndex/endOffset = 0`

Os `408 segments` do preview nao significam necessariamente 408 markers finais. O QDE do Atlas.ti traz pares `PDFSelection` + `PlainTextSelection` para muitas quotations; o importer atual pareia/deduplica esses GUIDs e cria marker textual unico.

## Entendimento atual

O problema atual nao e mais "o importer cria shapes em vez de texto". O codigo atual ja prefere `PdfMarker` textual quando ha `PDFSelection.name` ou offsets textuais, e so usa shape fallback para selecoes sem `name`.

O problema que resta e re-anchoring textual:

1. O QDPX do Atlas.ti informa PDF, pagina e texto aproximado/truncado da selection.
2. O Qualia precisa converter isso em indices exatos da text layer do PDF.js no Obsidian.
3. `resolvePendingIndices()` tenta buscar o texto do marker na pagina renderizada.
4. Para muitos markers, a busca falha e o marker continua pendente, entao nenhum highlight aparece.

## Por que a busca falha

O texto exportado pelo Atlas.ti e o texto renderizado pelo PDF.js podem divergir:

- whitespace e quebras diferentes;
- selecoes truncadas com reticencias;
- caracteres invalidos como `�`;
- ligaduras/glyphs extraidos de forma diferente em PDFs academicos;
- ordem textual diferente em PDFs de duas colunas.

`normalize('NFKC')` ou busca literal nao bastam quando a corrupcao ja virou ASCII aparentemente valido, como sequencias estranhas de `f`.

## Nao solucao

Converter quotations textuais em retangulos/shapes nao e a solucao correta.

Isso ate poderia desenhar uma regiao visual aproximada, mas muda a semantica do dado: a marcacao deixa de ser uma ancora textual e vira uma forma grafica. Para coding de PDF academico, o comportamento esperado e preservar highlights textuais.

## Historico - proximo passo tecnico recomendado em 2026-08-04

Esta secao e historica e foi superada pelos fallbacks posteriores (`bbox-text`, `window fallback`, `plain-text-context` e pagina vizinha), que chegaram ao baseline validado de `203/203` resolvidos, `0` pendentes e `0` shapes.

Status apos checkpoint de 2026-08-04:

- Diagnostico agregado foi adicionado no runtime real do PDF viewer.
- Smoke no Obsidian confirmou corrida de text layer (`no-text-layer-nodes`) e depois falhas reais de `not-found`.
- Fallbacks textuais implementados:
  - busca literal;
  - busca com whitespace normalizado;
  - chave textual limpa (`NFKC`, alfanumerica, sem `�`/soft hyphen/pontuacao);
  - prefixo limpo unico;
  - re-anchor em pagina vizinha quando a pagina anterior/proxima carregada apresenta match textual forte.
- Resultado observado no fixture principal apos rolar os PDFs no Obsidian: `167/203` `PdfMarker` textuais resolvidos, `36` pendentes, `0` `PdfShapeMarker`.
- O maior ganho veio de page-shift local confirmado por texto: muitos markers de D1/D2/D4-D9 ancoravam corretamente em `page + 1`, mas nao e seguro aplicar `+1` global no import porque o QDE mostra padroes variados por documento. A solucao atual move para pagina vizinha somente quando ha match textual forte.

Antes de alterar mais o algoritmo, manter/usar diagnostico:

- quando `resolvePendingIndices()` falhar, registrar arquivo, pagina, marker id, tamanho do texto procurado, inicio do texto procurado e tamanho do texto da pagina;
- expor contagem de markers resolvidos vs pendentes por arquivo;
- evitar spam no console com logs agregados por pagina/arquivo.
- registrar `bestPrefixKeyLength`, `bestWindowKeyLength` e scores em paginas vizinhas para separar page-shift de divergencia textual real.

Proxima tentativa recomendada para os `36` pendentes restantes:

Usar as coordenadas do `PDFSelection` apenas como restricao de busca textual page-aware, nao como marker shape. A ideia e buscar/ordenar os `.textLayerNode` dentro ou proximos da regiao visual do Atlas.ti e entao gerar indices reais de `PdfMarker` textual. Isso preserva semantica textual e evita transformar quotations em retangulos.

Pipeline atual/futuro:

1. Buscar direto.
2. Buscar com whitespace normalizado.
3. Buscar por prefixo limpo quando o Atlas truncou com reticencias.
4. Buscar em pagina vizinha se houver match textual forte.
5. Usar bbox do `PDFSelection` como filtro de candidatos textuais, nao como shape.
6. Buscar fuzzy com tolerancia controlada.
7. Gravar indices reais somente quando houver match suficientemente confiavel.

O smoke real precisa abrir PDFs importados no Obsidian, nao apenas rodar Vitest.

## Historico - handoff de 2026-08-04

Checkpoint base: commit `d4520da` (`fix: reancorar PdfMarkers QDPX por texto`).

Estado funcional validado em smoke real no Obsidian:

- fixture: `QUALIA-QDPX/QDPX Tests/UnifiedDevOps Selective Coding ITE5 ICA.qdpx`;
- modal import observado: 25 codes, 408 segments, 10 sources, 6 memos, 20 relations;
- `data.json` apos rolar D1-D12 no viewer: `203` `PdfMarker` textuais, `0` `PdfShapeMarker`;
- resolvidos: `167/203`;
- pendentes: `36/203`;
- melhoria visual confirmada no Obsidian.

Regra de produto/arquitetura:

- nao converter quotations textuais importadas do Atlas.ti em shapes/retangulos;
- bbox/coordenadas do QDE podem ser usadas somente como restricao ou pista para encontrar texto na text layer;
- o resultado salvo deve continuar sendo `PdfMarker` textual com indices reais.

Hipotese seguinte:

Os `36` pendentes restantes parecem falhar menos por page-shift simples e mais por divergencia entre o texto exportado pelo Atlas.ti e a text layer do PDF.js. O proximo passo e carregar os dados de `PDFSelection` do QDE/QDPX, preservar as coordenadas no marker pendente ou em metadado auxiliar, e usar essa bbox para limitar/ranquear os nos da `.textLayer` candidatos antes de aplicar matching textual.

Plano tecnico recomendado:

1. Reabrir `CLAUDE.md` e este arquivo antes de editar.
2. Localizar no importer onde `PDFSelection` e convertido em `PdfMarker`.
3. Verificar quais atributos de coordenada/page existem no QDE para `PDFSelection`.
4. Persistir esses dados como diagnostico/metadado de pending marker, sem criar `PdfShapeMarker`.
5. No resolver do PDF viewer, quando a busca textual falhar, selecionar text layer nodes dentro/proximos da bbox e tentar resolver indices por trecho local.
6. Manter logs agregados e evitar spam no console.
7. Rodar `npm run build`.
8. Rodar smoke real no Obsidian com o fixture, abrindo/rolando D1-D12.
9. Auditar `data.json` e confirmar que `PdfShapeMarker` continua `0`.

## Execucao 2026-08-04 - bbox Atlas no runtime real

Modo de trabalho validado com o user:

- nao automatizar smoke real com WDIO/e2e neste fluxo;
- o plugin deve imprimir diagnosticos agregados automaticamente;
- o user faz apenas reload/import/abrir/rolar PDFs no Obsidian e cola os logs;
- nao pedir snippets de console para auditoria manual;
- antes de reimportar o fixture, limpar `data.json` com `npm run qdpx:reset`, porque o fluxo atual de import conflita quando os codigos ja existem.

Implementacao e validacao local nesta rodada:

- `PdfMarker` textual passou a preservar `importedPdfSelectionBBox` vindo de `PDFSelection`;
- a bbox e usada apenas como pista local no resolver, nunca como `PdfShapeMarker`;
- o resolver so aplica bbox quando `bboxHint.page` corresponde a pagina renderizada, evitando uso cego em fallback/adocao de pagina vizinha;
- a conversao de bbox do Atlas para coordenadas normalizadas foi ajustada para origem top-left no caso de text selection;
- o resolver bbox continua retornando indices globais reais baseados em `data-idx` da text layer, com offsets dentro do `textContent`;
- os testes focados de importer/conversor/resolver passaram;
- `npm run build` passou;
- nenhum commit, tag, push ou release foi feito.

Diagnosticos adicionados/observados:

- import: `[qualia-coding] QDPX PDF import bbox diagnostics`;
- runtime: `[qualia-coding] PDF pending marker re-anchor diagnostics`;
- o import diagnostic confirmou que as 10 fontes PDF importadas trazem bbox para todos os markers textuais importados;
- em todos os sources observados, `textMarkersWithBBox == textMarkers` e `pendingTextMarkersWithBBox == pendingTextMarkers`;
- os logs runtime confirmam `withBBox` e `bboxAttempted`, entao o problema atual nao e falta de bbox no marker.

Resultados relevantes do smoke manual:

- D2 melhorou apos a correcao da origem da bbox: pagina 5 chegou a resolver `6/8`, ficando `2` pendentes;
- D2 paginas 7/8 tinham muitos pendentes antes, mas depois de reload/reimport alguns logs deixaram de aparecer, sugerindo resolucao ou ausencia de tentativa pendente naquela passagem;
- D6 pagina 6 continua com `3` pendentes;
- D8 parecia visualmente correto para o user, apesar de logs residuais de pendentes; esses pendentes podem ser highlights nao visiveis no trecho observado ou fragments secundarios que nao prejudicam a leitura visual imediata.

Falhas residuais exemplares:

- D2 p5 pendentes:
  - `collaboration among teams (#I30) or spread awareness about automated tests (#I5, #I15).`;
  - `Limited DevOps initiatives, centered on adopting tools, do not improve communication`.
- D6 p6 pendentes:
  - `communications`;
  - `Collaboration`;
  - `y increase by establishing cross-functional teams`.

Leitura dos logs:

- nos pendentes de D2 p5, `bboxTextPreview` aponta para regioes como `conceptual framework` e `diagram representing it`, ou seja, a bbox local esta consistente tecnicamente mas nao contem o texto esperado;
- nos pendentes de D6 p6, `bboxTextPreview` aponta para `field to describe their team structures...`, tambem sem conter o texto esperado;
- portanto, aumentar tolerancia da bbox ou transformar em shape nao resolve a causa; isso so esconderia uma ancora textual ruim.

Inspecao local do QDE para D6 p6:

- `B209B888-AA3C-40D1-9A40-1C049A59405B`: texto `communications`, page 6, coords `123,120 -> 182,126`;
- `AC9F7E48-66CE-4793-ADF5-0F7D11A04087`: texto `Collaboration`, page 6, coords `54,120 -> 103,126`;
- `2DF7EB8D-52A3-42A3-9921-87E61A8D5295`: texto `y increase by establishing cross-functional teams`, page 6, coords `328,118 -> 511,129`;
- o QDE tem links `continued by` conectando esses GUIDs.

Hipotese atual:

O caminho bbox esta parcialmente correto e ja ajuda quando a bbox cai sobre texto compativel. O principal resto agora parece misturar tres casos:

1. bbox do Atlas aponta para uma regiao visual que nao contem a quotation textual exportada;
2. fragments muito curtos ou quebrados por `continued by`;
3. quotations longas/multifragmentadas em PDFs academicos, onde a ordem textual do PDF.js diverge do texto exportado pelo Atlas.

Proximo avanco recomendado:

1. Primeiro medir, nao corrigir no escuro.
2. Diagnostico agregado de links `continued by` foi adicionado ao import em `[qualia-coding] QDPX PDF continued-by diagnostics`.
3. O log compara QDE e markers por source: `PDFSelection`, `PlainTextSelection`, pareamentos, links `continued by`, endpoints mapeados, pendentes, textos curtos `<64`, bbox e endpoints nao mapeados.
4. Os markers PDF importados em links `continued by` recebem metadado diagnostico `importedQdpxContinuedBy`, sem alterar a ancora textual e sem criar shape.
5. O runtime log de re-anchor mostra tentativas por pagina (`attempted/resolved/pending`) e agora tambem `withContinuedBy`, `continuedByPending` e `continuedByShortTextPendingLt64`; esse log e diagnostico de tentativa e pode ficar obsoleto se a pagina resolver depois por retry/neighbor/adoption.
6. Para responder "quantos highlights ainda faltam", o runtime tambem emite `[qualia-coding] PDF marker current status`, calculado do estado atual do model por arquivo: `textMarkers`, `resolvedTextMarkers`, `pendingTextMarkers`, bbox, continued-by e shapes.
7. Para amostras de import, o log limita a poucos links pendentes com `markerId`, source/target da cadeia, status de pending, tamanho/preview do texto e bbox.
8. Se a maioria residual estiver em `continued by`, decidir entre:
   - preservar fragments separados e usar contexto da cadeia para re-anchor textual;
   - criar um anchor textual composto pela cadeia e depois manter markers textuais separados com indices reais;
   - marcar fragments secundarios como diagnostico/baixa prioridade se o highlight visual principal ja aparece.
9. So depois dessa medicao mexer no algoritmo de resolucao.

## Comandos uteis

Limpar estado antes de novo import:

```bash
npm run qdpx:reset:dry-run
npm run qdpx:reset
```

Auditar markers PDF apos import:

```bash
node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync('data.json','utf8')); const pdf=d.pdf||{}; const markers=pdf.markers||[]; const shapes=pdf.shapes||[]; const by={}; for(const m of markers){(by[m.fileId]??={markers:0,shapes:0,pages:new Set(),pending:0,withText:0}).markers++; by[m.fileId].pages.add(m.page); if(m.beginIndex===0&&m.beginOffset===0&&m.endIndex===0&&m.endOffset===0) by[m.fileId].pending++; if(m.text) by[m.fileId].withText++;} for(const s of shapes){(by[s.fileId]??={markers:0,shapes:0,pages:new Set(),pending:0,withText:0}).shapes++; by[s.fileId].pages.add(s.page);} console.log('total text markers',markers.length); console.log('total shapes',shapes.length); for(const [file,v] of Object.entries(by).sort()){console.log(JSON.stringify({file,markers:v.markers,shapes:v.shapes,pending:v.pending,withText:v.withText,pages:[...v.pages].sort((a,b)=>a-b)}));}"
```

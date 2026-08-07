Estamos no repo:
  `/Users/mosx/Desktop/obsidian-plugins-workbench/.obsidian/plugins/obsidian-qualia-coding`

## Estado final validado em 2026-08-07

O ultimo smoke manual percorreu todos os PDFs e o auditor foi corrigido para acumular rows entre viewers e fazer flush ao fechar cada PDF.

- `203/203` `PdfMarker` textuais importados e resolvidos;
- `0` pendentes;
- `0` `PdfShapeMarker`;
- `23/23` markers com `continued by` resolvidos;
- `203/203` markers auditados visualmente;
- `182/203` matches exatos;
- `21/203` mismatches: `16` `covered-prefix` e `5` `covered-inside-expected`;
- `0` `unauditedMarkers`;
- nenhum `wrong-range-or-page` pela classificacao automatica;
- D1 agora foi auditado: `29/31` matches e `2` casos graves de range em texto de licenca IEEE;
- D11 e D12 ficaram `100%` matches.

Leitura tecnica dos erros:

- os `2` casos do D1 nao sao simples truncamentos: a selecao esperada comeca em texto do artigo, mas o range caiu em boilerplate de licenca/rodape;
- os outros `3` `covered-inside-expected` indicam inicio no meio do trecho esperado;
- os `16` `covered-prefix` indicam, em geral, ancora inicial correta e fim curto;
- diferencas de ligatura, hifenizacao, espacos e caracteres `�` podem ser apenas divergencia da text layer, mas nao explicam os ranges claramente incompletos;
- a tentativa anterior de expansao textual ampla vazou para tabelas/rodapes e foi revertida.

Objetivo da proxima sessao:

1. Nao refazer o import inteiro: o auditor agora esta completo.
2. Corrigir primeiro os `2` falsos positivos do D1 com uma restricao contra boilerplate de licenca/rodape.
3. Analisar `5-10` casos `covered-prefix` no audit full e verificar se o fim correto esta no mesmo bloco/coluna/fluxo.
4. Implementar uma expansao minima e seletiva, somente com evidencia geometrica/textual forte.
5. Preservar sempre `203/203` resolvidos, `0` pendentes e `0` shapes.

Arquivos/artefatos finais:

- `QDPX-ATLAS-FINAL-AUDIT-FULL.md`;
- `QDPX-ATLAS-FINAL-AUDIT.md`;
- `QDPX-ATLAS-IMPORT-NOTES.md`;
- `../../../imports/_qualia-pdf-marker-coverage-audit.json`;
- `../../../imports/_qualia-pdf-marker-current-status.json`.

Checkpoint commits:

- `90d3244 wip: audit Atlas PDF coverage`;
- `2c5ca4c wip: aggregate coverage audit across PDFs`.

Nao adicionar nem rodar testes nesta fase exploratoria, salvo pedido explicito. `npm run build` passou apos a correcao do auditor.

  Tema: import QDPX do Atlas.ti para PDFs academicos no Qualia Coding.

  Objetivo agora:
  Resolver o problema de coverage visual incompleto em `PdfMarker` textual importado de QDPX Atlas.ti.

  Estado bom a preservar:
  - `203/203` `PdfMarker` textuais importados e resolvidos.
  - `0` pendentes.
  - `0` `PdfShapeMarker`.
  - `23` markers com `continued by`, todos resolvidos.
  - Nunca converter `PDFSelection` textual em `PdfShapeMarker`.
  - Bbox do Atlas.ti e apenas hint/restricao diagnostica.

  Estado atual do problema:
  - Smoke limpo mais recente: `112/203` coverage matches, `91/203` mismatches.
  - Classes: `covered-prefix=86`, `covered-inside-expected=3`, `covered-includes-expected-start=2`.
  - O problema dominante e `covered-prefix`: o highlight comeca certo, mas termina cedo demais.
  - A ancora esta boa; o range final esta curto.
  - O problema NAO e "PDF com duas colunas" em geral: o algoritmo ja resolve varios highlights que atravessam colunas/paginas quando a ancora textual e suficiente.
  - O foco deve ser bem mais simples: dado um inicio correto, continuar o range no texto esperado, especialmente em casos de mesmo paragrafo/mesma coluna, sem vazar para tabela/rodape.

  Arquivos a ler primeiro:
  1. `QDPX-next_session-prompt.md`
  2. `QDPX-ATLAS-IMPORT-NOTES.md`
     - Ler resumo executivo.
     - Procurar "Tentativa revertida 2026-08-06".
  3. `QDPX-ATLAS-COVERAGE-AUDIT-FINDINGS.md`
  4. `QDPX-ATLAS-FINAL-AUDIT-FULL.md`
     - Nao ler inteiro.
     - Abrir exemplos `Coverage = NO`, principalmente `covered-prefix`.

  JSONL guardrail:
  `/Users/mosx/.codex/sessions/2026/08/06/rollout-2026-08-06T16-11-12-019fd87c-99e1-7213-88fa-dd7cc28245ea.jsonl`

  O JSONL confirma:
  - `203/203` veio de `plain-text-context` + pagina vizinha.
  - `resolveOnNeighborPage()` testava `[pageNumber - 1, pageNumber + 1]`.
  - `importedPdfTextContext` pode furar o gate de `strongEnough`.
  - `resolveAdjacentPendingMarkersOnPage()` avaliava `[pageNumber - 1, pageNumber + 1]`.
  - Nao alterar essa semantica.

  Cuidado importante:
  Uma tentativa de expansao textual automatica ja foi feita e revertida.
  Ela expandia apos uma ancora unica enquanto a chave normalizada continuasse batendo.
  Isso piorou visualmente: highlights vazaram para tabelas/rodape/areas erradas.
  Nao repetir expansao textual solta.

  Enquadramento correto:
  - Temos o texto esperado completo em `marker.text`.
  - Temos indices iniciais bons em muitos `covered-prefix`.
  - O que falta e completar `endIndex/endOffset` para cobrir mais do mesmo texto esperado.
  - Nao transformar isso em um problema geral de layout multi-coluna antes de provar que o caso exige isso.
  - Comecar pelos casos mais triviais: `covered-prefix` em que `Texto coberto pela text layer` e prefixo claro de `Trecho esperado no Qualia`, aparentemente no mesmo paragrafo/coluna.
  - Se esses casos simples nao puderem ser expandidos com seguranca, documentar exatamente qual divergencia da text layer impede.

  Como trabalhar:
  1. Nao mexer no algoritmo de cara.
  2. Primeiro analisar 5-10 casos reais `covered-prefix` em `QDPX-ATLAS-FINAL-AUDIT-FULL.md`.
  3. Para cada caso, comparar:
     - `Range`
     - `Trecho esperado no Qualia`
     - `Texto coberto pela text layer`
     - PDF/documento/pagina
     - se o fim correto esta na mesma coluna/linha/bloco ou cruza tabela/rodape/coluna.
  4. Formular uma regra de expansao minima para os casos simples primeiro.
     - A expansao deve preservar a ancora atual.
     - Primeiro tentar completar dentro do mesmo fluxo textual/paragrafo aparente.
     - Se nao tiver confianca, manter range antigo.
     - Nunca devolver marker para pendente.
  5. So depois implementar uma pequena mudanca.

  Possiveis direcoes:
  - tentar expansao incremental de `endIndex/endOffset` a partir do fim atual e medir se o texto coberto continua prefixo do texto esperado;
  - parar no primeiro ponto em que o texto coberto deixa de ser prefixo normalizado plausivel;
  - usar geometria/linhas da text layer apenas como guardrail contra vazamento para tabela/rodape, nao como ponto de partida desnecessariamente complexo;
  - expandir primeiro dentro do mesmo bloco/coluna visual quando o exemplo for claramente simples;
  - usar bbox do Atlas.ti como limite diagnostico/visual, nao como shape;
  - adicionar diagnostico antes da heuristica se faltarem dados.

  Validacao:
  - Rodar:
    `npm test -- tests/pdf/resolvePendingIndices.test.ts tests/import/qdpxImporter.test.ts`
    `npm run build`
    `python3 -m py_compile scripts/audit_qdpx_pdf_import.py`
  - O smoke real continua manual no Obsidian.
  - Depois do smoke, rodar:
    `python3 scripts/audit_qdpx_pdf_import.py`
    `python3 scripts/audit_qdpx_pdf_import.py --full-text --output QDPX-ATLAS-FINAL-AUDIT-FULL.md`

  Meta:
  Reduzir `covered-prefix` sem perder:
  - `203/203` resolvidos;
  - `0` pendentes;
  - `0` shapes.

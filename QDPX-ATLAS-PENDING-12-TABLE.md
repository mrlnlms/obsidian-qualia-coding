# QDPX Atlas.ti - 12 PDF markers pendentes

Base: `imports/_qualia-pdf-marker-current-status.json`, gerado em `2026-08-05T01:43:49.885Z`.

Resumo do smoke:

- `203` `PdfMarker` textuais;
- `191` resolvidos;
- `12` pendentes;
- `12/12` curtos `<64`;
- `7/12` com `continued by`;
- `0` `PdfShapeMarker`.

## Leitura sobre `continued by`

Documentacao encontrada:

- REFI-QDA trata `Selection` como o equivalente de `Quotation` no Atlas.ti, e `Link` como `link / relation`.
- ATLAS.ti documenta hyperlinks como links nomeados entre duas quotations, com relacoes escolhidas/criadas pelo usuario.
- ATLAS.ti documenta PDFs textuais como quotations de texto, distintas de quotations graficas.

Inferencia para o importer:

- `continued by` deve ser tratado como relacao semantica entre quotations/selection fragments, nao como prova automatica de que duas linhas do QDPX precisam virar um unico marker.
- Quando os fragments compartilham codigo e estao visualmente adjacentes, pode ser correto materializar como um highlight continuo ou como uma cadeia navegavel.
- Sem validacao visual no Atlas.ti, fundir automaticamente e arriscado, porque `continued by` e exportado como `Link`, nao como uma selecao unica.

Regra operacional recomendada:

- manter cada `PDFSelection` textual como `PdfMarker` textual;
- usar `continued by` como contexto forte para re-ancorar fragmentos curtos;
- so fundir ranges se o Atlas.ti mostrar claramente um highlight unico/frase unica quebrada pelo export;
- nunca usar `continued by` sozinho para criar match global de texto curto.

## Tabela de validacao

| # | PDF | Pag. | Texto pendente | Len | continued by | Papel | Sinal diagnostico | Hipotese atual | Validar no Atlas.ti |
|---:|---|---:|---|---:|---|---|---|---|---|
| 1 | D1 2021 UPM Paper | 5 | `and lack of collaboration` | 26 | sim | target | pagina atual `0`; proxima pagina prefixo `22` | Provavel final de frase ligada a quotation maior: `poor communication and lack of collaboration`. | Confirmar se o highlight visual inclui a continuacao no fim da frase ou se e quotation separada. |
| 2 | D1 2021 UPM Paper | 5 | `and/or mentoring among others, as a service` | 44 | sim | target | pagina atual `0`; proxima pagina prefixo/janela `35` | Fragmento curto ligado por `continued by`; contexto textual nao prova adjacencia local. | Ver qual quotation maior o Atlas mostra e se ha texto anterior/posterior selecionado. |
| 3 | D1 2021 UPM Paper | 5 | `showing some cultural barriers.` | 33 | sim | target | pagina atual `0`; proxima pagina prefixo/janela `27` | Provavel final de trecho sobre barreiras culturais. | Confirmar se pertence ao trecho `still show cultural barriers` ou a outra quotation. |
| 4 | D5 2016 Nybon Paper | 1 | `collaboration between Dev and Ops` | 34 | nao | - | sem diagnostico de falha no snapshot atual | Fragmento curto/titulo/subtrecho; pode estar repetido ou fora da bbox util. | Confirmar se e quotation independente ou parte de trecho maior. |
| 5 | D5 2016 Nybon Paper | 1 | `but keep existing roles differentiated,` | 39 | nao | - | sem diagnostico de falha no snapshot atual | Fragmento intermediario/final curto, dificil de ancorar isolado. | Anotar texto imediatamente anterior e posterior no highlight. |
| 6 | D5 2016 Nybon Paper | 1 | `Mix personnel: increase communication` | 37 | nao | - | sem diagnostico de falha no snapshot atual | Item/lista/titulo curto; talvez precise de contexto de linha. | Confirmar se o Atlas destacou so esse item ou tambem descricao adjacente. |
| 7 | D5 2016 Nybon Paper | 2 | `and collaboration is promoted.` | 30 | sim | target | sem diagnostico de falha no snapshot atual | Provavel final de frase ligada a marker resolvido: `...communication and collaboration is promoted.` | Confirmar continuidade e se cruza coluna/pagina. |
| 8 | D6 2017 Shahin Paper | 6 | `communications` | 14 | sim | target | sem diagnostico de falha no snapshot atual | Termo curto comum dentro de cadeia/lista; alto risco de falso positivo. | Ver se e item separado, celula/tabela, ou parte de fragmento maior. |
| 9 | D6 2017 Shahin Paper | 6 | `Collaboration` | 13 | sim | target | sem diagnostico de falha no snapshot atual | Termo curto comum; nao deve ter busca global automatica. | Ver se e item separado, celula/tabela, ou parte de fragmento maior. |
| 10 | D6 2017 Shahin Paper | 6 | `y increase by establishing cross-functional teams` | 50 | sim | origin | sem diagnostico de falha no snapshot atual | Parece comeco truncado no meio da palavra/frase, talvez `may increase...`; origin com 2 links. | Anotar texto anterior/posterior e targets relacionados. |
| 11 | D8 2011 Humble | 6 | `sharing of knowledge and tools;` | 31 | nao | - | pagina atual `0`; pagina anterior `0`; bbox aponta para texto de compliance/controls | Item curto em lista ou trecho fora da bbox util. | Confirmar se e item isolado ou parte de lista maior destacada. |
| 12 | D8 2011 Humble | 6 | `a culture of collaboration between all team members` | 52 | nao | - | pagina atual `0`; pagina anterior `0`; bbox aponta para texto de compliance/controls | Fragmento curto dentro de lista/frase maior; sem sinal textual local no PDF.js. | Confirmar contexto anterior/postior e se o Atlas destacou somente esse fragmento. |

## Decisao esperada apos validacao

Para cada linha, marcar uma categoria:

- `merge-candidate`: Atlas mostra um highlight unico/frase unica quebrada pelo export.
- `chain-anchor-candidate`: manter marker separado, mas usar `continued by` + vizinho resolvido para ancorar.
- `local-context-candidate`: sem `continued by`, mas Atlas mostra contexto local forte que pode ser usado.
- `known-limit`: texto curto/comum, bbox ruim, ou selecao sem contexto suficiente para automatizar com seguranca.

## Proxima heuristica provavel

Se a validacao confirmar as hipoteses:

1. Para `continued by`, procurar marker relacionado ja resolvido.
2. Testar adjacencia textual local antes/depois do range resolvido, na mesma pagina ou pagina vizinha.
3. Resolver fragmento curto somente quando o texto adjacente bater com a cadeia esperada e houver uma unica posicao local.
4. Registrar no snapshot `resolvedBy: continued-by-adjacent` para auditar.


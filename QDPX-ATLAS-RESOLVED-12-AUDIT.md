# QDPX Atlas.ti - auditoria dos 12 markers recuperados

Base:

- Snapshot: `imports/_qualia-pdf-marker-current-status.json`
- Gerado em: `2026-08-06T19:51:50.405Z`
- Resultado: `203/203` `PdfMarker` resolvidos, `0` pendentes, `0` `PdfShapeMarker`

Objetivo deste arquivo:

- comparar os 12 markers que estavam pendentes com o que veio do QDPX/QDE;
- reduzir dependencia de validacao visual no Atlas.ti;
- separar texto declarado pelo Atlas, contexto textual exportado e range final no PDF.js/Obsidian.

## Leitura geral

Os 12 casos existem de fato no QDPX/QDE como selections do Atlas.ti. A evidencia vem de duas camadas:

- `PDFSelection.name`: texto/quotation declarado pelo Atlas.ti;
- `PlainTextSelection`: offsets e contexto textual da representacao `.txt` exportada.

Observacao importante:

- em varios casos, o slice exato por offset comeca no meio de palavra (`ack`, `r mentoring`, `ications`, etc.);
- isso indica drift/fragmentacao entre `PDFSelection.name` e `PlainTextSelection`;
- por isso a validacao correta nao e comparar apenas `exact`, mas sim confirmar que o texto declarado pelo Atlas aparece dentro do contexto exportado.

## Tabela

| # | PDF | Range final no Obsidian | Texto do marker / Atlas | Contexto QDE confirma? | Contexto relevante |
|---:|---|---|---|---|---|
| 1 | D1 | p6 `50:26-51:16` | `and lack of collaboration` | sim | `poor communication and lack of collaboration. Some other organizations...` |
| 2 | D1 | p6 `189:40-190:26` | `and/or mentoring among others, as a service` | sim | `platform, infrastructure, IT operation, and/or mentoring among others, as a service. This gives autonomy...` |
| 3 | D1 | p6 `98:51-99:23` | `showing some cultural barriers.` | sim | `transfer of work between them, showing some cultural barriers. ID14...` |
| 4 | D5 | p2 `64:45-65:3` | `collaboration between Dev and Ops` | sim | `Mix personnel: increase communication and collaboration between Dev and Ops, but keep existing roles differentiated...` |
| 5 | D5 | p2 `65:5-65:42` | `but keep existing roles differentiated,` | sim | `collaboration between Dev and Ops, but keep existing roles differentiated, or 3. Bridge team...` |
| 6 | D5 | p2 `64:3-64:40` | `Mix personnel: increase communication` | sim | `or 2. Mix personnel: increase communication and collaboration between Dev and Ops...` |
| 7 | D5 | p3 `17:39-17:69` | `and collaboration is promoted.` | sim | `responsibilities are maintained, but communication and collaboration is promoted. It is also mentioned...` |
| 8 | D6 | p7 `103:18-103:32` | `communications` | sim | `Collaboration and communications among team members can considerably increase...` |
| 9 | D6 | p7 `2:0-2:13` | `Collaboration` | sim | `...give the signoff”. Collaboration and communications among team members...` |
| 10 | D6 | p7 `103:67-103:117` | `y increase by establishing cross-functional teams` | sim | `team members can considerably increase by establishing cross-functional teams as explained by R85...` |
| 11 | D8 | p7 `58:74-58:105` | `sharing of knowledge and tools;` | sim | `technical metrics; sharing of knowledge and tools; and regular retrospectives...` |
| 12 | D8 | p7 `55:79-58:12` | `a culture of collaboration between all team members` | sim | `the discipline of devops: a culture of collaboration between all team members; measurement...` |

## O que isso valida

- Os 12 trechos vieram do Atlas.ti/QDPX, nao foram inferidos pelo Qualia.
- O contexto exportado pelo QDE aponta para frases/listas coerentes.
- O re-anchor final moveu varios markers para a pagina onde o texto existe no PDF.js.
- A estrategia `plain-text-context` resolveu os casos sem transformar texto em shape.

## O que ainda depende de olho humano

- Se o retangulo visual do highlight cobre exatamente os caracteres esperados.
- Se os ranges derivados de fragments com offset truncado deveriam incluir tambem a primeira/letra anterior no caso visual.
- Se fragments ligados por `continued by` devem continuar como highlights separados ou se futuramente merecem uma visualizacao de cadeia.


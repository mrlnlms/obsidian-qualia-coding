# QDPX Atlas.ti - achados da auditoria de cobertura visual

Data: 2026-08-06

## Estado consolidado

O import QDPX do Atlas.ti chegou a um marco importante:

- `203/203` selections PDF codificadas no QDPX foram importadas como `PdfMarker` textual;
- `203/203` markers estao resolvidos com indices `begin/end`;
- `0` markers pendentes;
- `0` `PdfShapeMarker`;
- `23` markers com metadata `continued by`, todos resolvidos;
- `0` selections QDPX sem marker Qualia.

Isso valida a camada estrutural:

- o QDPX/QDE e a fonte primaria;
- o `data.json` confirma que cada selection virou marker;
- nenhum texto foi degradado para shape;
- coders/codigos do processo de ICR foram preservados na auditoria cruzada.

Relatorio principal:

- `QDPX-ATLAS-FINAL-AUDIT.md`
- `QDPX-ATLAS-FINAL-AUDIT-FULL.md`

Script gerador:

- `scripts/audit_qdpx_pdf_import.py`

## Novo problema descoberto

A validacao visual mostrou que `resolved` nao significa necessariamente `highlight visual completo`.

Exemplo observado no D1:

- `Trecho esperado no Qualia`:
  - `Product team category emerges ... poly-skilled teams), self-organization and autonomy`
- `Texto coberto pela text layer`:
  - `Product team category emerges ... cross-functionality (sometimes us`

Ou seja:

- o marker existe;
- os coders e codigos estao corretos;
- a pagina/range existem;
- mas o range salvo cobre apenas o comeco do trecho esperado.

## Auditoria runtime adicionada

Foi criada uma auditoria runtime no Obsidian/PDF.js:

- arquivo gerado: `imports/_qualia-pdf-marker-coverage-audit.json`;
- compara `marker.text` contra o texto efetivamente coberto por `beginIndex/beginOffset/endIndex/endOffset` na text layer renderizada;
- o script `scripts/audit_qdpx_pdf_import.py` cruza esse JSON com QDPX e `data.json`;
- o Markdown agora mostra:
  - `Coverage`;
  - `Trecho esperado no Qualia`;
  - `Texto coberto pela text layer`.

Resultado do primeiro coverage audit:

- `203/203` markers auditados;
- `112/203` `Coverage = yes`;
- `91/203` `Coverage = NO`;
- `0` nao auditados.

## Distribuicao dos mismatches

Por PDF:

| PDF | Total | Coverage yes | Coverage NO |
|---|---:|---:|---:|
| D1 2021 UPM Paper | 31 | 16 | 15 |
| D2 2021 USP Paper | 43 | 15 | 28 |
| D4 2020 Macarthy Paper | 20 | 10 | 10 |
| D5 2016 Nybon Paper | 19 | 10 | 9 |
| D6 2017 Shahin Paper | 20 | 13 | 7 |
| D7 2019 Luz | 21 | 9 | 12 |
| D8 2011 Humble | 22 | 19 | 3 |
| D9 2022 How SRE Relates to DevOps | 20 | 13 | 7 |
| D11 2020 State of DevOps Report | 3 | 3 | 0 |
| D12 2022 Cross-Company Ethnographic Study | 4 | 4 | 0 |

Por tamanho do texto esperado entre os `91` mismatches:

| Tamanho | Mismatches |
|---|---:|
| `<64` | 0 |
| `64-127` | 4 |
| `128-255` | 9 |
| `256-511` | 47 |
| `>=512` | 31 |

Leitura:

- os mismatches nao sao os fragmentos curtos que motivaram `plain-text-context`;
- todos os mismatches sao trechos medios/longos;
- isso aponta para truncamento de range em casos longos, nao para erro nos 12 fragments curtos.

Classificacao objetiva dos `91` mismatches do primeiro audit:

| Classe | Mismatches | Leitura |
|---|---:|---|
| `covered-prefix` | 85 | O texto coberto e o comeco correto do trecho esperado, mas termina cedo demais. |
| `covered-inside-expected` | 2 | O range cai dentro do trecho esperado, mas nao inclui o inicio completo. |
| `covered-includes-expected-start` | 2 | O range inclui o inicio esperado, mas provavelmente diverge por hifenizacao/quebra de linha ou termina cedo. |
| `wrong-range-or-page` | 2 | O texto coberto nao parece pertencer ao trecho esperado; pode ser pagina/range errado. |

Essa classificacao confirma que o problema dominante e truncamento de range, nao perda de codificacao.

## Hipotese tecnica principal

O resolver atual tem caminhos que ancoram por prefixo/janela textual quando o texto completo nao bate literalmente na text layer do PDF.js.

Isso foi util para sair de `168/203` para `191/203` e depois `203/203`, mas tem um efeito colateral:

- ele pode salvar o range correspondente ao prefixo/janela encontrada;
- para trechos longos, isso pode ser apenas o inicio do `marker.text`;
- o marker fica `resolved`, mas visualmente cobre menos texto que deveria.

Em outras palavras:

- `resolvedBy: page-text/window-text/plain-text-context` resolveu a posicao;
- mas nem sempre resolveu a extensao completa da selection.

## Outras hipoteses plausiveis

1. Divergencia de texto Atlas vs PDF.js:
   - hifenizacao;
   - ligaduras;
   - colunas;
   - quebras de linha;
   - caracteres `�`;
   - pontuacao/espacamento.

2. `PDFSelection.name` truncado no QDPX:
   - alguns `name` do Atlas terminam com reticencias;
   - nesses casos o importer usa offsets/representacao para reconstruir texto maior;
   - se o texto reconstruido for maior que a janela ancorada, o range fica curto.

3. Ordem de leitura multi-coluna:
   - a representation `.txt` do Atlas pode ordenar o texto diferente do PDF.js;
   - o inicio do trecho pode bater, mas a continuacao esperada pode estar em outra sequencia de text nodes.

4. Limite do proprio highlight visual:
   - a geometria e calculada por `begin/end`;
   - se `begin/end` param antes, o visual tambem para antes;
   - portanto o problema provavelmente esta no range salvo, nao no CSS.

## O que nao parece ser

- Nao parece erro de import estrutural: `203/203` selections chegaram.
- Nao parece perda de coders/codigos: a auditoria mostra coders e codes por selection.
- Nao parece problema dos 12 fragments finais: nenhum mismatch tem `<64`.
- Nao parece conversao indevida para shape: `0` shapes.

## Proximo passo recomendado

Decisao tecnica apos a classificacao:

1. Nao remover nem endurecer o fallback por prefixo/janela: ele e necessario para manter o patamar `203/203` resolvidos.
2. O problema dominante e extensao visual do range apos a ancora, nao ausencia de ancora.
3. Os limites antes "magicos" (`160`, `48`, etc.) devem ser tratados como limites de ancora/diagnostico, nao como tamanho semantico da selection.
4. O estado funcional foi reconfirmado no JSONL da sessao: manter a logica de pagina vizinha que testava `[pageNumber - 1, pageNumber + 1]` e a adocao adjacente bilateral; mudar isso causou falso positivo visual e deve ser evitado sem novo smoke completo.
5. O coverage audit passou a registrar:
   - `expectedKeyLength`;
   - `coveredKeyLength`;
   - `coverageRatio`;
   - `coverageClass`.

Validacao esperada apos reload completo:

- manter `203/203` markers resolvidos como baseline;
- usar `coverageClass` para separar truncamento (`covered-prefix`) de range/pagina realmente errado;
- corrigir `covered-prefix` por expansao/ajuste do range, preservando a ancora que ja funciona.

Hipotese de correcao mais provavel:

- quando a busca encontra prefixo/janela de um texto longo, usar essa posicao como ancora inicial;
- depois tentar expandir o range para cobrir o restante de `marker.text` por matching sequencial/fuzzy na text layer da mesma pagina;
- se a expansao nao for confiavel, manter o range antigo e deixar o coverage audit apontar o mismatch, em vez de devolver o marker para pendente.

## Validacao manual sugerida agora

Usar `QDPX-ATLAS-FINAL-AUDIT.md`:

- filtrar mentalmente linhas `Coverage = NO`;
- conferir alguns exemplos de cada PDF;
- comparar:
  - `Trecho esperado no Qualia`;
  - `Texto coberto pela text layer`;
  - highlight visual.

Se o `Texto coberto pela text layer` ja termina onde o highlight visual termina, entao a auditoria esta medindo corretamente o bug.

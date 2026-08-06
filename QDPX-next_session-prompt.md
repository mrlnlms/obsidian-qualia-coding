Estamos no repo:
`/Users/mosx/Desktop/obsidian-plugins-workbench/.obsidian/plugins/obsidian-qualia-coding`

Tema: import QDPX do Atlas.ti para PDFs academicos no Qualia Coding.

## Ordem de leitura com economia de token

1. `QDPX-ATLAS-IMPORT-NOTES.md`
   - Ler primeiro o "Resumo executivo - ler primeiro".
   - Depois procurar por:
     - "Smoke manual 2026-08-06 - contexto em pagina vizinha";
     - "guardrail" ou "JSONL";
     - "Implementacao 2026-08-06 - contexto PlainTextSelection".
   - Nao ler o arquivo inteiro de inicio, porque ele contem historico longo.

2. `QDPX-ATLAS-COVERAGE-AUDIT-FINDINGS.md`
   - Ler inteiro se a tarefa for sobre coverage visual/range incompleto.
   - Este e o documento principal para entender `Coverage = NO`, `covered-prefix`, `coverageRatio` etc.

3. `QDPX-ATLAS-FINAL-AUDIT.md`
   - Usar como tabela pratica apos cada smoke/reload.
   - Nao ler tudo por padrao; abrir cabecalho e PDF/linhas especificas que o usuario citar.

4. `QDPX-ATLAS-RESOLVED-12-AUDIT.md`
   - Ler apenas se a tarefa envolver os 12 pendentes historicos resolvidos por `plain-text-context`.

5. `QDPX-ATLAS-FINAL-AUDIT-FULL.md`
   - Abrir somente quando precisar do texto completo sem truncamento.
   - Evitar carregar por padrao.

Arquivos auxiliares:

- `QDPX-ATLAS-PENDING-12-TABLE.md`: historico dos 12 pendentes antes do `plain-text-context`.
- `scripts/audit_qdpx_pdf_import.py`: script que cruza QDPX + `data.json` + coverage runtime e gera a tabela Markdown.

## Estado funcional que deve ser preservado

- Fixture: `QUALIA-QDPX/QDPX Tests/UnifiedDevOps Selective Coding ITE5 ICA.qdpx`.
- Baseline funcional: `203/203` `PdfMarker` textuais resolvidos, `0` pendentes, `0` `PdfShapeMarker`.
- `23` markers com `continued by`, todos resolvidos.
- `197/203` markers com `importedPdfTextContext`.
- Os 12 pendentes historicos foram resolvidos por `plain-text-context` + pagina vizinha.

Regra absoluta:

- Nunca converter `PDFSelection` textual do Atlas.ti em `PdfShapeMarker`.
- Bbox do Atlas.ti e apenas hint/restricao diagnostica.
- O output correto continua sendo `PdfMarker` textual com indices reais.

## Guardrail importante

O estado funcional foi reconfirmado no JSONL:
`/Users/mosx/.codex/sessions/2026/08/06/rollout-2026-08-06T16-11-12-019fd87c-99e1-7213-88fa-dd7cc28245ea.jsonl`

Linhas relevantes do racional: `0..780`, especialmente o trecho que levou ao smoke `203/203`.

Nao alterar por inferencia a semantica de pagina vizinha:

- `resolveOnNeighborPage()` testava `[pageNumber - 1, pageNumber + 1]`;
- `importedPdfTextContext` pode furar o gate de `strongEnough`;
- `resolveAdjacentPendingMarkersOnPage()` avaliava `[pageNumber - 1, pageNumber + 1]`.

Mudar isso quebrou anchors e gerou falso positivo visual. Se precisar alterar, primeiro justificar com dados e validar smoke real preservando `203/203`.

## Proximo passo tecnico

1. Apos o usuario fazer reload/import/abrir PDFs no Obsidian, rodar:

```bash
python3 scripts/audit_qdpx_pdf_import.py
python3 scripts/audit_qdpx_pdf_import.py --full-text --output QDPX-ATLAS-FINAL-AUDIT-FULL.md
```

2. Confirmar baseline:
   - `203/203` resolvidos;
   - `0` pendentes;
   - `0` shapes.

3. So depois analisar `Coverage = NO`, principalmente `covered-prefix`.

4. Qualquer melhoria futura deve atuar como expansao/ajuste de range apos a ancora, preservando a ancora que ja funciona. Nao remover, endurecer ou reordenar fallback por prefixo/janela/pagina vizinha.

## Validacao local minima antes de pedir smoke

```bash
npm test -- tests/pdf/resolvePendingIndices.test.ts tests/import/qdpxImporter.test.ts
npm run build
python3 -m py_compile scripts/audit_qdpx_pdf_import.py
```

O smoke real e manual no Obsidian; nao automatizar e2e.

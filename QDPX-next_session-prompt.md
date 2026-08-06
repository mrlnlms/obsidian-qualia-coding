Estamos no repo:
/Users/mosx/Desktop/obsidian-plugins-workbench/.obsidian/plugins/obsidian-qualia-coding

Antes de fazer qualquer alteração, leia:
1. CLAUDE.md
2. QDPX-ATLAS-IMPORT-NOTES.md

Contexto: estamos investigando import QDPX do Atlas.ti com PDFs acadêmicos. A regra absoluta é NÃO converter
PDFSelection textual em PdfShapeMarker. Bbox do Atlas é apenas hint/restrição diagnóstica; o output correto
continua sendo PdfMarker textual com índices reais.

Estado mais recente validado em smoke real no Obsidian:
- fixture: QUALIA-QDPX/QDPX Tests/UnifiedDevOps Selective Coding ITE5 ICA.qdpx
- import: 203 PdfMarker textuais
- shapes: 0 PdfShapeMarker
- após window fallback em página vizinha: 191/203 resolvidos, 12/203 pendentes
- todos os 12 pendentes são trechos curtos <64
- 7/12 pendentes têm metadata continued by
- snapshot runtime: imports/_qualia-pdf-marker-current-status.json

Já foi implementado:
- preservação de importedPdfSelectionBBox
- metadata importedQdpxContinuedBy
- logs/snapshot runtime por PDF
- fallback opcional allowWindowFallback em página vizinha
- snapshot JSON com totals/rows/samples
- build e testes focados passaram

Não automatize Obsidian/e2e. O smoke real é manual: eu recarrego o plugin, importo o QDPX, abro/rolo D1-D12 e
você lê o JSON gerado.

Próximo passo: estamos validando manualmente no Atlas.ti os 12 pendentes atuais antes de criar nova
heurística. Não mexa no algoritmo ainda sem classificar esses casos.

Pendentes atuais para validação:
- D1 p5: “and lack of collaboration”; “and/or mentoring among others, as a service”; “showing some cultural
barriers.”
- D5 p1/p2: “collaboration between Dev and Ops”; “but keep existing roles differentiated,”; “Mix personnel:
increase communication”; “and collaboration is promoted.”
- D6 p6: “communications”; “Collaboration”; “y increase by establishing cross-functional teams”
- D8 p6: “sharing of knowledge and tools;”; “a culture of collaboration between all team members”

Depois que eu trouxer observações do Atlas.ti, ajude a decidir se a próxima heurística deve usar:
- cadeia continued by;
- adjacência a marker já resolvido;
- contexto local forte;
- ou marcar algum caso como limite conhecido.
## Diagnóstico: por que os 21 mismatches acontecem

O padrão dos números é revelador. A validação binária de prefixo (rejeitar candidato que não comece com os 32 primeiros caracteres) fez o sistema cair de 203→165 resolvidos. Isso prova que parte dos highlights corretos *não* começam com correspondência literal nos primeiros caracteres — geralmente por causa de ligaturas, hifenização quebrada na text layer, ou pequenas divergências de normalização entre o texto exportado pelo Atlas.ti e o texto que o PDF.js expõe. Ou seja: o localizador de âncora *precisa* de tolerância, e essa tolerância é legítima, não um bug.

Mas os 16 casos `covered-prefix` mostram o problema oposto: o sistema acerta o início e "desiste cedo" na extensão. Isso é consistente com uma arquitetura em que a mesma estratégia que localiza a âncora também decide onde parar — normalmente porque a extensão é derivada do comprimento da chave que gerou o match (prefixo, janela interna, chave normalizada), e não de uma extensão calculada independentemente. Quando a chave de match é curta (ex.: prefixo de 32 caracteres, ou uma janela interna pequena), o range herda esse comprimento curto por default, mesmo que o texto correto continue por mais 200 caracteres na mesma linha/bloco.

Os 2 casos graves do D1 (range cai em boilerplate de licença/rodapé) são um terceiro modo de falha, distinto dos outros dois: aqui a âncora foi localizada no lugar errado — provavelmente porque o rodapé de licença contém uma substring que colide com o começo do texto esperado (é comum PDFs acadêmicos repetirem cabeçalhos/licenças em cada página, e cabeçalhos são texto curto e genérico, logo propensos a match espúrio quando o critério de aceitação é fraco).

Então, três causas-raiz distintas, não uma:
1. **Colisão de âncora** — texto curto/genérico casa em local errado (D1).
2. **Truncamento de extensão** — âncora certa, mas o range herda o tamanho da evidência de match em vez de continuar até o fim real da seleção.
3. **Âncora interna correta rejeitada ou não priorizada** — quando o início Atlas não bate literalmente com o início PDF.js (ligatura/hifenização/ordem), mas uma âncora no meio do trecho é a evidência mais forte disponível.

Isso confirma a separação que o brief já sugere: **localizar âncora** e **determinar extensão** devem ser subsistemas diferentes, com evidências e critérios de parada diferentes, mesmo compartilhando o mesmo pipeline de candidatos.

## Desenho de algoritmo generalizável

### Fase 1 — Geração de candidatos de âncora

Cada estratégia continua gerando candidatos (não vira filtro binário), mas cada candidato carrega metadados ricos em vez de só um booleano de aceitação:

```
Candidate {
  page: number
  startOffset, endOffset: number        // no texto de página concatenado
  strategy: 'literal' | 'normalized' | 'prefix' | 'innerWindow' | 'bboxText' | 'plainTextContext'
  matchedKeyLength: number              // quantos chars da evidência bateram
  offsetWithinExpected: number          // onde essa janela cai dentro do marker.text esperado (0 = início)
  contextBeforeMatched: boolean
  contextAfterMatched: boolean
  bboxOverlapRatio: number | null       // interseção candidato vs bbox Atlas
  domNodesInvolved: Node[]
  lineSpan: {startLine, endLine}
  columnId: string | null
}
```

O ponto central: **nenhuma estratégia decide sozinha** que um candidato é válido. Todas rodam, todas produzem candidatos (mesmo os fracos), e o scorer compara.

### Fase 2 — Scoring com margem

```
score(candidate) =
    w1 * matchQuality(candidate)          // literal > normalizado > prefixo > janela interna
  + w2 * contextAgreement(candidate)      // contexto antes/depois bateram?
  + w3 * bboxSoftConstraint(candidate)    // proximidade geométrica do bbox Atlas, nunca hard-reject
  + w4 * uniquenessOnPage(candidate)      // penaliza candidatos que colidem com múltiplos locais na página
  + w5 * offsetPenalty(candidate)         // penaliza levemente âncoras que caem muito longe do início esperado (mitiga D1)
```

`uniquenessOnPage` é provavelmente o fator que resolveria diretamente os casos do D1: texto de rodापé/licença tende a ser curto e a se repetir; se a mesma chave casar em múltiplos lugares da página (ou em várias páginas), isso é evidência forte contra aquele candidato específico, sem precisar de nenhuma regra sobre "boilerplate" — é uma propriedade estrutural (repetição), não léxica.

**Regra de decisão**: aceitar o candidato de maior score só se `score(top) - score(second) > margin`. Se a margem não for atingida, ainda usar o melhor candidato estruturalmente (não criar pending), mas marcar confiança baixa no diagnóstico — exatamente como o brief já antecipa.

### Fase 3 — Extensão, como problema separado

Uma vez a âncora aceita (offset inicial fixado), a extensão é resolvida por um processo próprio que **não herda o tamanho da chave que localizou a âncora**:

1. Comece do fim da âncora localizada.
2. Tente estender comparando o texto restante esperado (`marker.text` além do que já foi coberto pela âncora) contra o texto de página que segue, usando **alinhamento local tolerante a edição** (ver seção de pesquisa abaixo) — não crescimento "enquanto a string parecer igual" (isso foi tentado e vazou para tabelas/rodapés).
3. A cada passo de extensão, exigir:
   - continuidade geométrica (próxima linha está na mesma coluna/bloco, ou é uma continuação de página aceita pelas regras existentes de página vizinha);
   - a taxa de edição/diferença acumulada não pode degradar abaixo de um limiar (evita "seguir" para texto não relacionado só porque algumas palavras comuns aparecem);
   - parar assim que o texto esperado (`marker.text`) se esgotar, ou assim que a evidência textual/geométrica cair abaixo do limiar — o que vier primeiro.
4. Se a extensão parar antes de cobrir 100% do texto esperado, isso **não é uma falha silenciosa**: registrar `extentCoverageRatio` no diagnóstico (ex.: 0.4 = cobriu 40% do texto esperado). É exatamente a métrica que faltava para diferenciar "resolvido estruturalmente" de "visualmente completo", que o próprio brief pede.

Isso separa fisicamente as duas decisões no código: uma função resolve `anchorStart`, outra função resolve `extentEnd` a partir do `anchorStart` já fixado. Truncamento de extensão vira um bug rastreável (baixo `extentCoverageRatio`) em vez de um efeito colateral escondido dentro da lógica de match.

## Geometria como soft constraint, nunca como shape

Regra operacional: geometria só participa como **termo de score** ou como **critério de parada da extensão**, nunca como fonte da própria seleção. Concretamente:

- Bbox do Atlas.ti entra no `bboxSoftConstraint` do scorer — um candidato com melhor sobreposição de bbox ganha pontos, mas um candidato sem nenhuma sobreposição de bbox ainda pode vencer se a evidência textual for muito mais forte (o brief já registra isso: `importedPdfTextContext pode ultrapassar o gate de strongEnough`, e esse princípio deve se manter).
- Linhas/colunas entram como **restrição de continuidade** durante a extensão: um salto de coordenadas x muito grande entre uma linha e a próxima (indicando pulo de coluna sem uma transição de coluna esperada, ou pulo para outra região da página) interrompe a extensão, independentemente de a string ainda "parecer" igual.
- Em nenhum momento o output final é um retângulo derivado apenas de bbox. O output é sempre um par de offsets (`beginIndex/endIndex`) no texto DOM, exatamente como hoje — geometria só influencia *qual* par de offsets é escolhido e *até onde* a extensão avança.

### Detecção de blocos/colunas sem regra por documento

Abordagem puramente estrutural, baseada nas coordenadas dos `textLayerNode`, sem qualquer conhecimento do documento:

1. Colete `(x_left, x_right, y_top, y_bottom)` de todos os nós de texto da página.
2. Agrupe em linhas: nós cujo `y_top`/`y_bottom` se sobrepõem significativamente (dentro de uma fração da altura de linha típica da página, calculada localmente, não fixa) pertencem à mesma linha.
3. Agrupe linhas em colunas/blocos via análise de gaps horizontais: ordene os `x_left` de início de linha e procure lacunas (gaps) recorrentes maiores que um múltiplo da largura média de caractere da página — isso separa colunas sem presumir número fixo de colunas.
4. Um "bloco" é uma sequência de linhas na mesma coluna com espaçamento vertical consistente; uma quebra grande de espaçamento vertical (maior que N vezes o espaçamento típico) sinaliza fim de bloco (ex.: transição para rodapé, nota de rapé, tabela).

Isso generaliza porque todas as métricas (altura de linha, largura de caractere, espaçamento típico) são calculadas *por página*, nunca hardcoded — cada PDF acadêmico tem sua própria métrica de linha, e isso é derivado dos próprios dados geométricos daquela página.

## Estratégia de baixa confiança que preserva markers

Adicionar ao `PdfMarker` (ou a uma estrutura de diagnóstico paralela) campos não-destrutivos:

```
resolutionMeta: {
  anchorConfidence: 'high' | 'medium' | 'low'
  anchorMarginScore: number
  extentCoverageRatio: number      // 0..1, quanto do texto esperado foi coberto
  extentStoppedReason: 'textExhausted' | 'geometryBreak' | 'evidenceDecay'
  candidatesConsidered: number
}
```

Regra: **nunca** rebaixar um marker para pending só por baixa confiança de extensão — isso foi exatamente o erro da validação binária que causou a regressão de 203→165. Pending deveria ser reservado para o caso em que **nenhum** candidato de âncora minimamente plausível existe (ex.: nem texto normalizado, nem prefixo, nem janela interna, nem contexto batem em nenhuma página candidata). Baixa confiança de extensão é um problema de qualidade visual, reportável no audit, não um problema de resolução estrutural.

Isso também responde diretamente a uma das perguntas de pesquisa do brief ("como representar uma seleção localizada mas com extensão de baixa confiança sem perder o marker") — a resposta é: metadados de confiança ao lado do range, não um estado binário resolvido/pendente.

## Pesquisa: alinhamento de texto OCR/PDF vs. fonte externa

- **Alinhamento local tolerante a edição** (tipo Smith-Waterman, ou mais simples, um alinhamento local com custo de edição por caractere/token) é a ferramenta certa especificamente para a fase de **extensão**, porque você já tem uma âncora fixada e só precisa decidir "até onde essa correspondência continua sendo boa" — é exatamente o problema para o qual esse tipo de alinhamento foi desenhado (encontrar o melhor subsegmento local entre duas sequências, tolerando pequenas divergências).
- Para a fase de **localização de âncora**, alinhamento local completo em toda a página é caro e desnecessário; prefixos/n-gramas/chaves normalizadas (o que já existe) são mais baratos e adequados para gerar candidatos — o alinhamento entra depois, só para refinar/validar/estender um candidato já localizado.
- Fuzzy matching (ex.: distância de edição normalizada) é útil como **termo de score**, não como filtro binário — reforça o princípio geral do brief.
- Ligaturas e hifenização devem ser tratadas na camada de **normalização de comparação**, não na string armazenada: mantenha o texto original intacto para os offsets finais, mas compare usando uma projeção normalizada (fold de ligaturas conhecidas, remoção de hífen de quebra de linha) só para fins de matching, com um mapa de volta para os offsets originais. Isso evita o problema relatado de que normalização global de ligaturas afetou o fallback de janela/página vizinha — porque a normalização passa a ser local ao comparador, não uma transformação permanente do texto.

## Calibração do scorer com poucos exemplos (203)

Com essa quantidade de exemplos reais, ajuste fino de pesos via otimização numérica (regressão, ML) tende a overfitar. Recomendação:

1. Comece com pesos definidos manualmente por raciocínio de engenharia (literal > normalizado > prefixo > janela interna; contexto bilateral > unilateral; unicidade na página tem peso alto porque colisão é o principal risco observado no D1).
2. Trate o problema como **ranking ordinal**, não regressão de score absoluto: a pergunta que importa é "o candidato correto ficou em 1º lugar com margem?", não o valor exato do score. Isso é mais robusto com poucos dados.
3. Use os 203 markers como conjunto de **regressão obrigatória**, não de treino: qualquer mudança de peso roda contra todos os 203 e você compara a distribuição de classes (exact match, covered-prefix, covered-inside-expected, wrong-range-or-page) antes/depois.
4. Para não overfitar nos 10 PDFs específicos, resista à tentação de adicionar pesos que só melhoram um documento — se um ajuste de peso melhora D1 mas piora D4, isso é sinal de que o peso está capturando uma particularidade do documento, não um princípio geral.

## Métricas para comparar mudança vs. baseline

Baseline atual documentado: 203/203 resolvidos estruturalmente, 182/203 exact match, 21/203 mismatch (16 covered-prefix, 5 covered-inside-expected, 0 wrong-range-or-page pela classificação automática, mas 2 falsos positivos semânticos no D1).

Métricas a rastrear a cada mudança:
- **Taxa de resolução estrutural** (deve permanecer 203/203, 0 pending) — não-negociável.
- **Taxa de exact match** — meta: subir de 182/203.
- **Distribuição de classes de mismatch** — `covered-prefix` deve cair sem que `wrong-range-or-page` suba (esse é exatamente o trade-off que o brief pede para evitar).
- **`extentCoverageRatio` médio** nos casos não-exatos — nova métrica contínua que substitui o julgamento binário "resolvido ou não" por "quanto foi coberto".
- **Taxa de colisão/unicidade** — quantos candidatos de âncora tinham múltiplos matches concorrentes na mesma página, como proxy para risco de falso positivo tipo D1.
- **markers com `continued by`** — os 23/23 devem continuar 100%, monitorado separadamente porque é um contrato explícito.

## Plano incremental de implementação

1. **Instrumentação primeiro, sem mudar comportamento**: adicionar os campos de `resolutionMeta` e `extentCoverageRatio` ao pipeline atual, calculando-os a partir do resultado já existente, só para ter uma baseline quantitativa nova (hoje vocês só têm exact/mismatch binário do auditor externo).
2. **Separar fisicamente âncora e extensão no código**, mesmo mantendo a lógica de extensão atual por enquanto — isso já deve zerar regressões porque nada muda de comportamento, só de estrutura.
3. **Introduzir o candidato com metadados ricos** (ainda sem scorer novo) — todas as estratégias continuam rodando como hoje, mas agora produzem os metadados necessários para o scorer.
4. **Implementar unicidade-na-página como termo de penalização** isoladamente e rodar o smoke completo — hipótese é que isso ataca diretamente os 2 falsos positivos do D1 sem tocar nos outros 19 mismatches. Validar essa hipótese isoladamente antes de empilhar mais mudanças.
5. **Implementar extensão via alinhamento local**, isolada da mudança de âncora, e rodar smoke — hipótese é que isso ataca os 16 `covered-prefix`.
6. Só depois disso, se necessário, ajustar pesos do scorer de âncora para os 3 casos `covered-inside-expected` restantes fora do D1.

Cada passo roda o smoke completo (`audit_qdpx_pdf_import.py` + full-text) e compara contra o baseline documentado antes de avançar para o próximo passo — isso evita exatamente o problema relatado de uma heurística melhorar uma classe e piorar outra sem ninguém perceber.

## Riscos e casos em que o sistema deve admitir que não sabe

- **Texto genérico repetido na página** (cabeçalhos, licenças, numeração) continua sendo o maior risco estrutural — nenhuma quantidade de peso no scorer elimina ambiguidade genuína quando o texto realmente aparece idêntico em dois lugares. Nesses casos, o sistema deveria preferir manter confiança baixa e registrar ambos os candidatos no diagnóstico, em vez de forçar uma escolha silenciosa.
- **Extensão que atravessa página**: o brief já delimita bem o contrato (`resolveOnNeighborPage`, vizinhas `[pageNumber-1, pageNumber+1]`) — qualquer extensão automática de página deve respeitar exatamente esse mesmo contrato existente, não inventar uma regra nova de "seguir para qualquer página seguinte".
- **PDFs com text layer corrompida/fora de ordem de leitura** (comum em PDFs acadêmicos com múltiplas colunas mal exportadas) é o caso onde geometria vira essencial e texto puro não basta — mas também é o caso de maior risco de falso positivo geométrico, então a margem de confiança exigida deveria ser mais alta quando o agrupamento de coluna é ambíguo.
- Nenhuma heurística proposta aqui deveria ser aceita sem rodar contra os 10 PDFs completos — como o próprio brief exige, qualquer generalização precisa justificar por que não é uma regra disfarçada para um documento específico, e isso só se verifica empiricamente contra o smoke completo.

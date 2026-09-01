# Diagnóstico principal

O problema descrito é realmente composto por dois problemas diferentes:

1. **Localização da âncora:** descobrir onde a seleção começa na sequência textual do PDF.js.
2. **Determinação da extensão:** decidir até onde o highlight deve avançar.

O baseline sugere que a primeira etapa já funciona razoavelmente bem: 182/203 correspondências exatas e 203/203 markers estruturalmente resolvidos. A maior deficiência está na segunda etapa, especialmente nos 16 casos `covered-prefix`, nos três casos que começam internamente e nos dois falsos positivos semanticamente graves do D1.

A conclusão mais importante é: **uma âncora confiável não implica que o fim encontrado seja confiável**. O resolver deve manter essas duas confianças separadas.

PDF.js expõe texto acompanhado de transformações, largura, altura e posição, mas os itens da text layer não devem ser tratados como caracteres semanticamente perfeitos ou como uma representação universal da ordem de leitura. A própria geometria precisa ser derivada combinando `transform`, viewport e dimensões do item. [github](https://github.com/mozilla/pdf.js/issues/8655)

# Arquitetura recomendada

## 1. Criar uma representação intermediária

Antes de executar qualquer estratégia de matching, construa um índice imutável da página:

```ts
type PdfTextAtom = {
  nodeIndex: number;
  text: string;
  pageOffsetStart: number;
  pageOffsetEnd: number;
  rect: Rect;
  lineId: number;
  blockId: number;
  columnId: number;
  visualOrder: number;
};

type PageTextIndex = {
  rawText: string;
  atoms: PdfTextAtom[];
  lines: PdfLine[];
  blocks: PdfBlock[];
  columns: PdfColumn[];
};
```

O `rawText` deve ser a concatenação usada atualmente pelo resolver. O índice adicional deve permitir mapear qualquer intervalo textual para:

- nós DOM envolvidos;
- linhas;
- blocos;
- colunas;
- bounding box agregada;
- quebras e lacunas entre os elementos.

Esse índice evita que cada estratégia implemente sua própria interpretação da text layer.

## 2. Normalização em camadas

Não use uma normalização global única. Mantenha pelo menos quatro representações:

| Representação | Uso |
|---|---|
| Literal | Seleções que coincidem exatamente com a text layer |
| Whitespace-normalized | Espaços, quebras de linha e separadores |
| Character-normalized | Pontuação, soft hyphen, replacement char e diferenças triviais |
| Token/phonetic-like | Hifenização, ligaturas e pequenas divergências locais |

A normalização mais agressiva deve servir apenas para **gerar ou verificar candidatos**, nunca para substituir diretamente o intervalo final.

Por exemplo, uma equivalência como `fi`/`ﬃ` pode ser útil em uma janela local, mas uma normalização global desse tipo pode fundir regiões que não deveriam ser equivalentes. O comportamento observado no projeto confirma que aliases de ligaturas precisam permanecer localizados e mensurados.

## 3. Geração de candidatos

Cada estratégia deve produzir um candidato independente:

```ts
type MatchCandidate = {
  pageNumber: number;
  start: number;
  end: number;

  strategy:
    | "literal"
    | "whitespace"
    | "normalized"
    | "anchor"
    | "context"
    | "bbox"
    | "window"
    | "neighbor";

  anchorStart: number;
  anchorEnd: number;
  expectedOffset: number;

  matchedAnchorLength: number;
  matchedContextBefore: number;
  matchedContextAfter: number;

  lineCount: number;
  blockCount: number;
  columnCount: number;

  bboxDistance?: number;
  bboxOverlap?: number;

  extensionConfidence: number;
  diagnostics: string[];
};
```

As estratégias devem ser acumulativas, não mutuamente excludentes.

### Candidatos textuais

A ordem prática pode ser:

1. correspondência literal;
2. whitespace-normalized;
3. normalização alfanumérica;
4. busca de n-gramas da seleção;
5. busca de âncoras internas;
6. alinhamento local para confirmar e estender.

A busca por uma âncora interna deve usar fragmentos suficientemente discriminativos. Não é necessário exigir que os primeiros 32 caracteres coincidam. É melhor avaliar:

- comprimento da âncora;
- raridade da âncora na página;
- posição relativa da âncora dentro de `marker.text`;
- coerência do contexto antes e depois;
- qualidade do alinhamento restante.

Smith–Waterman é adequado como verificador de alinhamento local porque procura regiões semelhantes entre duas sequências e penaliza incompatibilidades e lacunas.  Porém, eu não o usaria como busca exaustiva sobre toda a página: seria mais caro, mais difícil de diagnosticar e poderia produzir bons scores em trechos semanticamente errados. [cran.uib](https://cran.uib.no/web/packages/text.alignment/text.alignment.pdf)

A abordagem recomendada é:

```text
gerar posições por n-gramas ou prefixos/sufixos
→ executar alinhamento local apenas em torno dessas posições
→ usar o alinhamento para separar âncora e extensão
```

## 4. Separar âncora e extensão

Para cada candidato, mantenha dois intervalos:

```ts
anchorRange = [anchorStart, anchorEnd]
resolvedRange = [start, end]
```

A âncora responde:

> “Há evidência de que esta é a região correta?”

A extensão responde:

> “Há evidência suficiente de que o marker continua até aqui?”

Esse desenho permite que um candidato tenha:

```text
anchorConfidence: alta
extensionConfidence: baixa
```

sem transformar o marker em `pending`.

### Extensão textual

A extensão deve começar pelo final da âncora e tentar alinhar o restante do texto esperado. Use uma progressão conservadora:

1. consumir caracteres/tokens com correspondência forte;
2. aceitar espaços e quebras de linha equivalentes;
3. aceitar hifenização de fim de linha;
4. aceitar pequenas divergências de ligatura;
5. aceitar gaps somente quando houver continuidade geométrica;
6. parar quando a próxima região violar texto, geometria ou layout.

Não expanda simplesmente enquanto a string normalizada continuar coincidente. Essa estratégia já demonstrou que pode atravessar rodapés, tabelas e boilerplate.

Uma extensão deve receber penalidade quando:

- cruza uma grande lacuna vertical;
- muda de coluna;
- muda de bloco;
- entra em uma região de rodapé ou cabeçalho estruturalmente separada;
- envolve um salto horizontal incompatível;
- passa por uma área sem correspondência textual;
- começa a depender de normalização agressiva.

Uma extensão pode ser aceita quando:

- o alinhamento textual continua;
- as linhas são próximas verticalmente;
- a direção de leitura permanece coerente;
- o bloco e a coluna continuam estáveis;
- o salto de linha é compatível com o layout;
- o contexto posterior também combina.

# Uso da geometria

## Geometria como evidência, não como anotação

O `bbox` do Atlas.ti deve continuar sendo uma restrição suave ou um sinal diagnóstico. Ele não deve gerar `PdfShapeMarker` nem substituir uma seleção textual.

A geometria serve para responder:

- o candidato está aproximadamente na região esperada?
- a extensão atravessa uma linha visualmente plausível?
- houve salto para outra coluna?
- o intervalo entrou em um bloco vizinho?
- dois candidatos textuais iguais podem ser diferenciados espacialmente?

Não use o bounding box como filtro duro, porque escalas, rotação, crop box, viewport e convenções de coordenadas podem divergir entre Atlas.ti e PDF.js.

## Linhas

Agrupe os atoms em linhas usando tolerância relativa à altura da fonte, não um valor fixo de pixels:

```text
mesma linha se:
- sobreposição vertical suficiente; ou
- distância entre centros menor que k × altura mediana;
- e a diferença de escala/rotação for compatível.
```

A ordenação dentro da linha deve considerar a direção dominante. Em PDFs rotacionados ou com escrita não horizontal, o agrupamento precisa usar o eixo principal da transformação, em vez de assumir sempre `x` crescente.

## Blocos e colunas

Use uma análise hierárquica:

1. atoms → linhas;
2. linhas → blocos;
3. blocos → colunas.

Para blocos, considere:

- distância vertical entre linhas;
- alinhamento horizontal;
- indentação;
- tamanho médio de fonte;
- densidade textual;
- continuidade de linha.

Para colunas, procure separações persistentes no eixo horizontal entre linhas adjacentes. Um algoritmo baseado em espaços verticais, agrupamento ou XY-cut é mais generalizável do que regras como “tudo depois de metade da página é outra coluna”. Abordagens de análise de layout costumam detectar gutters, linhas, blocos e colunas a partir da configuração espacial das caixas. [dl.acm](https://dl.acm.org/doi/10.5555/524178.836741)

O resultado não precisa classificar semanticamente “título”, “rodapé” ou “tabela” na primeira versão. Basta produzir penalidades de continuidade:

```text
sameLine      = forte evidência
sameBlock     = evidência positiva
sameColumn    = evidência positiva
columnChange  = penalidade
largeGap      = penalidade
newRegion     = penalidade forte
```

# Scorer e confiança

Recomendo separar o score em três componentes:

```text
totalScore =
  0.45 × textScore
+ 0.25 × anchorScore
+ 0.20 × geometryScore
+ 0.10 × contextScore
- penalties
```

Os pesos não devem ser tratados como definitivos. Eles são um ponto inicial para comparação experimental.

## Evidência textual

Pode incluir:

- similaridade literal;
- similaridade whitespace-normalized;
- similaridade character-normalized;
- cobertura da seleção esperada;
- comprimento da maior sequência alinhada;
- penalidade por gaps;
- penalidade por substituições.

## Evidência da âncora

Pode incluir:

- tamanho absoluto da âncora;
- fração de `marker.text` coberta;
- raridade na página;
- concordância do contexto anterior;
- concordância do contexto posterior;
- posição plausível da âncora dentro da seleção.

Uma âncora interna longa e rara pode superar um prefixo curto, mas não deve ganhar automaticamente a extensão completa.

## Evidência geométrica

Pode incluir:

- distância do centro do candidato ao bbox Atlas normalizado;
- interseção com o bbox;
- número de linhas;
- mudança de bloco;
- mudança de coluna;
- continuidade vertical;
- saltos horizontais;
- área agregada do intervalo.

O score geométrico deve ser normalizado por dimensões da página e tamanho médio dos atoms. Assim, a mesma heurística funciona em PDFs com escalas diferentes.

## Margem entre candidatos

Não classifique apenas pelo melhor score. Compare o melhor candidato com o segundo:

```text
confidence = f(bestScore, secondBestScore, evidenceCompleteness)
```

Uma política inicial poderia ser:

- **alta:** score alto e margem grande;
- **média:** score razoável, mas margem pequena;
- **baixa:** âncora encontrada, extensão incerta ou candidatos conflitantes.

A margem é especialmente importante quando o mesmo trecho aparece em cabeçalho, corpo, rodapé ou referências.

# Política conservadora

O comportamento recomendado é:

| Situação | Ação |
|---|---|
| Âncora e extensão fortes | Salvar o range completo |
| Âncora forte, extensão média | Salvar o melhor range estrutural e marcar diagnóstico |
| Âncora forte, extensão baixa | Preservar o range da âncora, sem expandir agressivamente |
| Vários candidatos próximos | Escolher o melhor se a margem for suficiente; caso contrário, registrar ambiguidade |
| Nenhuma âncora confiável | Respeitar o comportamento atual de pending |
| Seleção textual importada | Nunca converter em shape |

Isso atende ao requisito central: **não sacrificar os markers já resolvidos para corrigir alguns casos de baixa qualidade visual**.

Eu adicionaria ao `PdfMarker`, ou a um snapshot diagnóstico paralelo, campos como:

```ts
resolutionDiagnostics: {
  anchorConfidence: "high" | "medium" | "low";
  extensionConfidence: "high" | "medium" | "low";
  selectedStrategy: string;
  candidateCount: number;
  score: number;
  margin: number;
  matchedExpectedRatio: number;
  geometryEvidence: string[];
  warnings: string[];
}
```

Esses campos não devem alterar a semântica de `pending`. Um marker pode continuar resolvido estruturalmente e ser reportado como visualmente incerto.

# Implementação incremental

## Fase 1: instrumentação sem mudança de comportamento

Antes de alterar o resolver:

- registrar todos os candidatos atuais;
- salvar score textual, estratégia e intervalo;
- registrar início e fim esperados;
- registrar linhas, blocos e colunas;
- registrar o segundo melhor candidato;
- produzir um JSON comparável por execução.

Essa fase permite entender os 203 casos sem introduzir regressões.

## Fase 2: índice geométrico

Adicionar:

- atoms com offsets;
- linhas;
- blocos;
- colunas;
- conversão segura entre offsets e nós DOM.

Manter exatamente a política atual de páginas vizinhas: `[pageNumber - 1, pageNumber + 1]`. A página vizinha deve ser mais uma fonte de candidatos, não uma razão para alterar a semântica existente.

## Fase 3: separar âncora e extensão

Refatorar o resultado interno para carregar:

```text
anchorRange
extensionRange
anchorScore
extensionScore
```

Nesta fase, ainda se pode salvar o intervalo antigo, mas gerar diagnósticos comparando a extensão atual com uma extensão proposta.

## Fase 4: scorer shadow mode

Executar o novo scorer em paralelo, sem alterar a persistência. Comparar:

- candidato escolhido;
- página;
- início;
- fim;
- estratégia;
- confiança;
- classe visual.

Só depois de observar estabilidade o novo scorer deve controlar a escolha.

## Fase 5: ativar apenas a extensão melhorada

Não substituir inicialmente o mecanismo de localização. Preserve as estratégias que já resolvem os 203 markers e use o novo algoritmo apenas para decidir se a extensão deve:

- permanecer como está;
- avançar até uma linha;
- avançar até o fim alinhado;
- parar antes de uma mudança de bloco ou coluna.

## Fase 6: expansão entre linhas e páginas

Só permitir expansão entre páginas quando:

- o contexto ou `continued by` justificar;
- o fim da primeira página e o começo da próxima tiverem alinhamento;
- não houver outro candidato local melhor;
- a lógica atual de páginas vizinhas for preservada.

# Métricas de avaliação

O baseline deve ser mantido como conjunto de comparação, não apenas como uma contagem de markers resolvidos.

## Métricas estruturais

Exigir, como gates:

- 203/203 markers textuais resolvidos;
- 0 pendentes;
- 0 `PdfShapeMarker` para seleções textuais;
- 23/23 `continued by`;
- 203/203 rows no audit;
- sem mudança na semântica de página vizinha.

Qualquer regressão nesses itens deve bloquear a mudança, mesmo que a qualidade visual melhore.

## Métricas de localização

Para cada marker, classifique manualmente ou semiautomaticamente:

- âncora correta;
- página correta;
- início exato;
- início interno;
- início em região errada;
- boilerplate falso positivo;
- candidato ambíguo.

A métrica principal não deve ser apenas “texto esperado aparece dentro do range”, porque isso aceita os falsos positivos do D1. Deve haver uma métrica de **correção do início**, baseada na posição real do início esperado.

## Métricas de extensão

Calcule:

- erro absoluto do início em caracteres;
- erro absoluto do fim;
- cobertura textual esperada;
- precisão do texto coberto;
- excesso de texto fora da seleção;
- razão entre caracteres esperados cobertos e caracteres cobertos;
- número de linhas esperadas contra linhas cobertas;
- mudança de bloco ou coluna indevida.

As classes atuais `covered-prefix` e `covered-inside-expected` devem ser mantidas, mas divididas em:

```text
prefixo correto com truncamento aceitável
prefixo correto com truncamento grave
início interno aceitável por divergência da text layer
início interno incorreto
falso positivo em região vizinha
```

## Métrica composta

Uma métrica útil para comparar versões é:

```text
visualUtility =
  exactRange
+ 0.5 × acceptableBoundaryDeviation
- 2.0 × wrongRegion
- 3.0 × boilerplateFalsePositive
- 5.0 × structuralRegression
```

Os pesos não precisam ser publicados como verdade estatística; servem para impedir que uma versão “melhore” `covered-prefix` criando falsos positivos ou pendências.

# Diagnósticos e testes

O smoke manual no Obsidian deve continuar sendo o teste de aceitação final. Mas o desenvolvimento pode ser acelerado sem depender de E2E automatizado.

Recomendo três ferramentas auxiliares:

1. **Replay determinístico:** alimentar o resolver com snapshots de `textContent`, nós e geometrias reais capturadas do PDF.js.
2. **Overlay visual:** gerar HTML ou SVG com o texto da página, bbox dos atoms, candidato escolhido, âncora, extensão e bbox Atlas.
3. **Tabela de diferenças:** comparar baseline e experimento por marker, mostrando página, início, fim, estratégia, score e classe visual.

Também use testes de mutação sobre os 203 casos:

- remover espaços;
- inserir quebras de linha;
- trocar hifenização;
- substituir ligaturas;
- inverter pequenas regiões;
- duplicar uma frase em outra parte da página;
- deslocar ligeiramente o bbox;
- alterar a ordem de atoms em uma região.

A heurística só deve ser aceita se continuar preservando os markers em que a representação já é boa e se os casos degradados forem identificáveis pelo diagnóstico.

# Onde o sistema deve admitir que não sabe

O resolver não deve tentar “corrigir” todas as divergências. Ele deve admitir incerteza quando:

- duas regiões possuem o mesmo texto;
- a âncora é muito curta;
- o alinhamento exige normalização agressiva;
- a seleção atravessa uma tabela ou coluna;
- a ordem textual do PDF é incompatível com a ordem visual;
- o bbox Atlas está distante ou em escala incompatível;
- o fim da seleção não aparece na text layer;
- o candidato melhor e o segundo melhor têm scores próximos.

Nesses casos, a resposta correta não é criar um shape nem marcar automaticamente como pending. É preservar o marker textual resolvido da forma mais segura, reduzir a extensão ao último trecho comprovado e registrar:

```text
range estruturalmente resolvido;
extensão visual de baixa confiança;
evidências usadas;
motivo da parada.
```

Em resumo, a mudança de maior retorno é **não criar uma busca totalmente nova**, mas transformar o resolver atual em um sistema de candidatos com âncora, extensão, geometria e confiança independentes. Isso deve corrigir os truncamentos sem impor o filtro binário que já produziu 38 pendências e sem repetir a expansão textual ampla que vazou para regiões vizinhas.
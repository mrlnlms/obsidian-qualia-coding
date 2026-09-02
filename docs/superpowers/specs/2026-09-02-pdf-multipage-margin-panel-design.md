# PDF multipágina — margin panel mínima correta

> Data: 2026-09-02
>
> Branch: `feat/qdpx-multicoder-import`
>
> Baseline: `f70585f`
>
> Estado: desenho aprovado; implementação ainda não iniciada.

## Contexto

Os Marcos 1, 2 e 3 preservaram autoria multicoder, fecharam o round-trip isolado
de autoria e introduziram o marker PDF lógico por coder com `segments[]`. O Marco
3 já projeta esse marker em cada página para highlights e para o renderer legado
da margin panel. Como esse renderer decide barras, lanes e rótulos separadamente
em cada página, um marker multipágina ainda aparece como fragmentos visuais
independentes.

O overlay externo do PDF já move os painéis de página para um único sistema
vertical sincronizado com o viewer. Portanto, a margin panel multipágina não
exige alterar o PDF.js nem desenhar sobre as páginas. O trabalho necessário é
elevar a decisão visual de página para documento.

O Markdown oferece um precedente útil: seu layout de lanes e labels já foi
extraído como cálculo puro, separado do CodeMirror e do DOM. PDF e Markdown não
devem compartilhar renderer ou lifecycle, mas devem convergir para primitivas de
layout e semântica visual comuns.

## Objetivo observável

Um marker PDF multipágina deve aparecer na margem como uma rail contínua por
combinação `marker do coder × código`:

- início no topo do primeiro segmento;
- fim na base do último segmento;
- linha contínua atravessando páginas e vãos intermediários;
- ticks somente nas duas extremidades globais;
- um dot e um label no centro vertical da rail completa;
- autoria identificada pelo formato existente `abreviação · código`;
- hover e clique operando sobre o marker lógico inteiro.

Markers PDF de uma página, shapes e a margin panel Markdown devem preservar seu
comportamento observável atual.

## Referência visual aprovada

A referência aprovada é uma única linha vertical contínua no overlay. Ela começa
junto ao primeiro highlight, cruza o espaço restante da primeira página, o vão
entre páginas e a página seguinte, terminando junto ao último highlight. O label
pode ficar no vão: sua posição é o centro da rail completa, não o centro de um
segmento escolhido.

A montagem usada para aprovar essa geometria não define agrupamento de códigos ou
coders. Cada aplicação visual continua obedecendo ao contrato de uma rail por
`marker × código`.

## Escopo incluído

- criar uma representação visual intermediária de rail independente das engines;
- extrair/generalizar o algoritmo puro de lanes já usado pelo Markdown;
- adaptar o Markdown ao contrato compartilhado sem mudança visual deliberada;
- calcular coordenadas verticais PDF no espaço global do documento;
- coordenar layout e renderização PDF no nível do documento, não da página;
- desenhar rails contínuas para markers multipágina;
- manter lanes consistentes por toda a extensão de cada rail;
- renderizar ticks globais, dot e label únicos;
- preservar indicação de autoria, cor e editabilidade existentes;
- propagar hover e clique pelo `markerId` lógico;
- preservar o bloqueio atual de resize multipágina;
- preservar handles e demais interações de markers simples;
- manter renderização lazy e atualização após zoom, resize ou carregamento de
  novas text layers;
- adicionar testes puros de layout, testes DOM do renderer e validação manual no
  vault real.

## Fora do escopo

- redesign geral de lanes ou de colisões;
- compactação visual `×N`;
- compartilhar uma rail entre markers, coders ou códigos diferentes;
- filtros de visibilidade por coder;
- decidir uma nova interação para markers exatamente sobrepostos;
- resize ou handles cross-page;
- customization ou resize manual da margin panel;
- alteração no schema persistido de markers;
- mudança no importer ou na resolução dos segmentos;
- mudança em sidebar, analytics ou ICR;
- exportação QDPX simples ou multipágina;
- abertura, edição, validação ou adaptação no Atlas.

Esses limites mantêm o Marco 5 responsável pelo redesign visual, o Marco 6 pelo
exporter PDF e round-trip Qualia↔Qualia e o Marco 7 pela interoperabilidade Atlas.

## Alternativas consideradas

### Patch stateful somente no PDF

Guardar a lane escolhida por cada página, esconder labels repetidos e inserir
conectores entre painéis existentes produziria rapidamente uma zebra. Porém, a
ordem lazy de carregamento passaria a determinar o layout, a duplicação com
Markdown permaneceria e linhas, conectores e labels continuariam distribuídos
entre vários donos de estado.

Essa alternativa foi rejeitada por criar uma correção visual frágil.

### Core puro compartilhado e coordenador PDF por documento

O layout recebe rails abstratas, sem conhecer `PdfMarker`, `Marker` do Markdown,
CodeMirror ou PDF.js. Markdown fornece um intervalo numa superfície contínua. PDF
fornece intervalos no espaço vertical global do viewer. Um coordenador PDF mantém
a geometria conhecida e produz um snapshot único para o renderer do overlay.

Essa é a alternativa aprovada. Ela resolve o Marco 4 e cria um limite reutilizável
sem tentar uniformizar ciclos de vida incompatíveis.

### Renderer universal Markdown/PDF

Compartilhar DOM, eventos, medição e pushing lateral ampliaria muito o refactor.
CodeMirror e PDF.js têm containers, virtualização e gatilhos de atualização
diferentes. Essa alternativa foi rejeitada para o Marco 4 e não é compromisso do
Marco 5.

## Contrato visual compartilhado

O core trabalha com números em uma coordenada vertical contínua. Ele não acessa
DOM nem importa tipos de uma engine.

```ts
interface MarginRailInput {
  key: string;
  markerId: string;
  codeId: string;
  codeName: string;
  color: string;
  ownerAbbreviation?: string;
  ownerName?: string;
  editable: boolean;
  top: number;
  bottom: number;
}

interface MarginRailLayout extends MarginRailInput {
  lane: number;
  center: number;
}
```

Invariantes:

1. `key` identifica exatamente uma combinação lógica `markerId + codeId`;
2. cada input representa uma rail e um label, sem agregação implícita;
3. `top` e `bottom` já estão na coordenada contínua do consumidor;
4. lane `0` é a mais próxima do conteúdo;
5. rails que se sobrepõem verticalmente não compartilham lane;
6. a ordenação é determinística e preserva a prioridade atual de intervalos mais
   longos nas lanes internas;
7. `center = (top + bottom) / 2` é o ponto canônico do dot e do label;
8. o core calcula layout, mas não mede texto, cria elementos ou reage a eventos.

Para Markdown, as coordenadas continuam sendo pixels relativos ao documento do
editor. Para PDF, elas passam a ser pixels relativos ao viewer completo. O core
não precisa conhecer páginas nem vãos.

## Geometria PDF global

Para cada segmento renderizável, o adaptador PDF calcula:

```text
segmentTop    = pageDiv.offsetTop + localTopPx
segmentBottom = pageDiv.offsetTop + localBottomPx
```

Para um marker simples ou shape:

```text
rail.top    = segmentTop
rail.bottom = segmentBottom
```

Para um marker multipágina:

```text
rail.top    = top do primeiro segmento
rail.bottom = bottom do último segmento
```

Essa representação inclui automaticamente a parte não textual das páginas e os
vãos entre elas. Não são necessários elementos de conector distintos: a rail é
uma única linha DOM no overlay.

Cada código do marker gera sua própria rail com os mesmos endpoints. Markers de
coders distintos também continuam gerando rails distintas, ainda que possuam
geometria e código idênticos. O allocator as distribui em lanes paralelas de
acordo com a regra de colisão vigente. Qualquer compactação pertence ao Marco 5.

## Componentes e responsabilidades

### Core de layout

Responsável por:

- tipos abstratos de rail;
- ordenação determinística;
- alocação de lanes;
- cálculo do centro vertical;
- helpers puros necessários para testar colisão e largura de lanes.

Não interpreta autoria, páginas ou registries e não acessa DOM. Campos de
apresentação já resolvidos pelos adapters são apenas payload opaco para o core.

### Adapter Markdown

Continua responsável por converter ranges do editor em coordenadas visuais,
medir labels, abrir espaço junto ao CodeMirror, virtualizar pelo viewport e
renderizar seus elementos.

Sua mudança no Marco 4 se limita a produzir inputs genéricos e consumir o layout
compartilhado. A posição, largura, CSS, hover, clique e collision avoidance de
labels permanecem observavelmente iguais. Melhorias no algoritmo de labels não
entram como efeito colateral da extração.

### Adapter/coordenador PDF

Mantém um cache efêmero de geometria por página carregada. A cada atualização:

1. recebe as projeções de markers e shapes da página;
2. resolve os bounds locais pelos helpers atuais;
3. converte os bounds para coordenadas globais;
4. atualiza o snapshot de geometria daquela página;
5. reconstrói rails lógicas para o documento;
6. executa o allocator compartilhado;
7. entrega um snapshot completo ao renderer do overlay.

O cache não é persistido e é descartado ao fechar, trocar ou desinstrumentar o
PDF. `PdfPageObserver` continua dono dos eventos do PDF.js, da sincronização de
scroll e da criação/destruição do overlay.

### Renderer PDF do overlay

Recebe layout resolvido e cria:

- uma linha por rail;
- dois ticks por rail;
- um dot no centro;
- um label no centro com autoria e nome do código;
- datasets com `markerId`, `codeId` e informações necessárias à interação.

Ele não consulta markers, não escolhe lanes e não decide qual fragmento é âncora.
Hover e clique continuam delegados no container. A identidade lógica já permite
que o estado de hover alcance highlights em todas as páginas.

## Renderização lazy e atualização incremental

O plugin não deve carregar text layers antecipadamente.

Quando somente parte de um marker multipágina possui geometria conhecida:

- se o primeiro segmento estiver conhecido, a rail parcial vai do início exato
  até a base da última página conhecida;
- se apenas um segmento posterior estiver conhecido, a rail parcial começa no
  topo da primeira página conhecida e termina no endpoint conhecido;
- existe no máximo um label para a rail parcial, centralizado no intervalo
  atualmente conhecido;
- quando os endpoints globais ficam disponíveis, o mesmo `key` atualiza a linha,
  o dot e o label para a geometria definitiva.

O layout pode mudar quando uma página acrescenta informação de colisão. Isso não
é persistência de lane nem erro de identidade: é convergência do snapshot lazy.
Para um mesmo conjunto de geometrias conhecidas, o resultado precisa ser estável.

Zoom, resize do viewer, abertura/fechamento da sidebar de thumbnails e novo evento
`textlayerrendered` invalidam coordenadas em pixels e provocam novo snapshot. O
scroll apenas transforma o scroller do overlay; não recalcula layout nem move o
label dentro da rail.

## Labels e colisões

O Marco 4 preserva a política atual de um label por `marker × código` e de
deslocamento mínimo para evitar colisão. O ponto ideal do label é sempre o centro
global da rail. Se o resolver de colisões deslocá-lo, o dot permanece no centro da
rail e o label conserva a associação visual existente.

Não entram neste marco busca bidirecional, limites de página, empilhamento
sofisticado, agrupamento ou expansão por coder. O fato de o centro ideal cair num
vão entre páginas é comportamento correto e aprovado, não um erro a ser ajustado.

## Autoria, cores e editabilidade

O renderer reutiliza as decisões já implementadas nos Marcos anteriores:

- label `abreviação · código` e tooltip com nome completo;
- cor normal para marker do perfil ativo;
- cor neutra para marker não editável;
- todos os markers visíveis por padrão;
- nenhuma ação visual altera markers irmãos de procedência;
- marker multipágina continua sem handles;
- marker simples mostra handles somente quando o model autoriza.

O Marco 4 não redefine identidade ativa nem propriedade. Apenas preserva essas
informações na nova projeção visual.

## Compatibilidade e não regressão

Markers simples e shapes são tratados como rails de um único intervalo global.
Como intervalos de páginas distintas não se sobrepõem, eles podem reutilizar as
mesmas lanes. Dentro de uma página, a prioridade por span e a definição de overlap
continuam equivalentes às atuais.

Não haverá migração do estado persistido. `segments[]` continua sendo lido pelos
helpers do Marco 3; a margin panel consome a unidade lógica sem adicionar dados ao
marker.

O refactor compartilhado não autoriza mudar a apresentação Markdown. Testes de
paridade devem fixar os resultados atuais para intervalos simples, sobrepostos,
adjacentes e com múltiplos códigos.

## Erros e degradação

- text layer ausente: manter a geometria já conhecida e aguardar o evento normal
  do PDF.js;
- bounds locais inválidos: omitir somente aquela rail/segmento do snapshot e não
  persistir correção improvisada;
- endpoint multipágina parcial: usar a regra de rail parcial, sem inventar bounds
  textuais;
- página removida ou recriada após zoom: invalidar sua geometria anterior;
- marker removido ou código alterado: eliminar a rail pelo `key` no próximo
  snapshot;
- overlay indisponível: preservar highlights e demais operações do marker; a
  margin panel não pode bloquear a leitura do PDF;
- falha numa rail não autoriza alterar resolver, marker ou dados importados.

## Testes automatizados

### Core puro

- intervalos disjuntos reutilizam lane `0`;
- intervalos sobrepostos recebem lanes distintas;
- intervalos adjacentes podem compartilhar lane;
- prioridade por span e desempate são determinísticos;
- duas rails com bounds idênticos continuam independentes;
- cada rail recebe centro igual a `(top + bottom) / 2`;
- input equivalente ao Markdown atual produz as mesmas lanes.

### Adapter/coordenador PDF

- marker simples vira uma rail com bounds locais convertidos para globais;
- shape preserva o mesmo contrato;
- marker multipágina vira uma rail do primeiro topo ao último bottom;
- o intervalo inclui o vão real entre páginas;
- cada código gera rail independente;
- coders coincidentes não são colapsados;
- geometria parcial converge para a definitiva sem duplicar label;
- carregamento de páginas em ordens diferentes converge para o mesmo snapshot;
- zoom invalida e recalcula coordenadas;
- remoção de marker elimina sua rail.

### Renderer e interação

- multipágina cria uma linha, dois ticks, um dot e um label;
- `top`, `height` e centro correspondem ao snapshot;
- label mantém autoria, tooltip, cor e ellipsis atuais;
- hover por `markerId` afeta toda a rail e os highlights projetados;
- clique no label abre o marker lógico uma vez;
- marker multipágina não recebe handles;
- marker simples e shape mantêm DOM e comportamento esperados.

### Regressão Markdown

- lanes atuais permanecem iguais nos fixtures existentes;
- layout com múltiplos códigos preserva uma rail por código;
- hover e clique continuam identificando marker e código;
- pushing de gutter/conteúdo e virtualização do viewport não mudam.

## Validação manual

No vault real:

1. importar novamente o corpus Atlas em somente leitura;
2. percorrer os seis casos multipágina do Marco 3;
3. confirmar rail contínua através do vão, com ticks apenas nas extremidades;
4. confirmar dot e label no centro da rail completa, inclusive quando esse centro
   estiver no vão;
5. confirmar uma rail/label por coder e código, sem colapso implícito;
6. alternar perfil ativo e confirmar cores/editabilidade existentes;
7. testar hover e clique a partir das duas páginas e do label;
8. testar zoom e sidebar de thumbnails;
9. criar e apagar uma seleção manual cross-page;
10. validar markers simples e shapes em páginas densas;
11. abrir Markdown com markers simples, sobrepostos e múltiplos códigos e confirmar
    ausência de mudança visual.

Depois da validação funcional, executar testes focados, suíte completa, build e
`git diff --check` antes de fechar o marco.

## Superfície estimada do refactor

O esforço é médio em código e alto em validação visual:

- um módulo puro compartilhado em `src/core/`;
- um adapter/coordenador de layout em `src/pdf/`;
- divisão do renderer PDF entre extração de geometria e DOM global;
- integração localizada no lifecycle de `PdfPageObserver`;
- adaptação pequena do layout Markdown para consumir o core;
- ajustes de CSS e testes focados.

A expectativa é de aproximadamente seis a nove arquivos de produção/teste e de
quinhentas a novecentas linhas entre implementação e cobertura. Essa estimativa
não inclui redesign, exporter ou integração Atlas.

O risco principal é invalidar corretamente geometria lazy e zoom sem regressão no
viewer. O schema de dados e os demais consumidores analíticos não fazem parte da
superfície do marco.

## Critérios de conclusão

O Marco 4 termina somente quando:

1. cada `marker do coder × código` produz exatamente uma rail e um label;
2. a rail multipágina atravessa páginas e vãos como uma linha contínua;
3. a lane é única e consistente por toda a extensão da rail;
4. ticks, dot e label usam os endpoints e centro globais aprovados;
5. autoria, cor, hover, clique e editabilidade permanecem corretos;
6. o lifecycle lazy converge independentemente da ordem de carregamento;
7. markers simples, shapes e Markdown não sofrem regressão observável;
8. validação manual, testes focados, suíte completa, build e `git diff --check`
   passam;
9. nenhuma mudança de redesign, exporter ou Atlas entra no diff.

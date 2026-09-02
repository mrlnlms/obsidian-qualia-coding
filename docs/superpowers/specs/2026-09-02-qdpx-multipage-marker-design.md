# QDPX multipágina — marker lógico por coder

> Data: 2026-09-02
>
> Branch: `feat/qdpx-multicoder-import`
>
> Baseline: `c1fc744`
>
> Estado: desenho aprovado em conversa; implementação ainda não iniciada.

## Contexto

Os Marcos 1 e 2 preservaram autoria multicoder na importação e no round-trip
isolado Qualia→QDPX→Qualia. O Marco 3 passa a tratar as seis citações Atlas que
atravessam páginas.

O QDPX real representa cada uma com duas `PDFSelection`, uma por página, e uma
`PlainTextSelection` associada ao fragmento âncora. As aplicações de código são
repetidas nas representações necessárias ao formato. O Qualia ainda importa os
fragmentos multipágina pelo caminho legado, sem autoria individual, e a captura
manual cross-page cria um marker persistente por página.

O material visual canônico para os seis casos é `_MULTIPAGE reference.md`, na raiz
do vault de trabalho, incluindo suas onze capturas. Ele confirma os limites
visuais, os cortes de aproximadamente 160 caracteres e a presença de cabeçalhos,
rodapés, tabelas e conteúdo de outras colunas no fluxo textual.

`data.json` e seus backups não são memória canônica desta investigação. O usuário
os remove durante testes. Evidências duráveis pertencem às specs, diagnósticos,
audits de importação e testes do corpus.

## Objetivo observável

Depois de uma importação limpa do QDPX Atlas real:

- cada citação multipágina é uma unidade lógica por coder;
- cada unidade contém segmentos ordenados nas páginas abrangidas;
- os destaques cobrem o conteúdo local completo de cada página, sem o corte
  legado de aproximadamente 160 caracteres;
- código, memo, autoria, timestamps e procedência existem uma vez por marker;
- sidebar, analytics e ICR não contam segmentos como markers independentes;
- o comportamento das seleções PDF simples permanece no baseline estabilizado.

Uma nova seleção manual cross-page também cria um único marker lógico, e não um
marker por página.

## Escopo

### Incluído

- detectar e consolidar os seis grupos multipágina do corpus Atlas;
- resolver a citação no fluxo concatenado das páginas declaradas;
- projetar o intervalo lógico em segmentos locais por página;
- introduzir `segments[]` como geometria autoritativa de marker multipágina;
- criar um marker independente por coder;
- preservar todos os GUIDs de Coding das representações QDPX correlacionadas;
- adaptar model, highlights, popover, sidebar, analytics e ICR à unidade lógica;
- fazer novas seleções manuais cross-page nascerem como uma unidade lógica;
- manter leitura retrocompatível de markers PDF simples;
- atualizar a auditoria de importação para eliminar a categoria temporária
  “sem autoria (legado multipágina)” nos seis grupos resolvidos.

### Fora do escopo

- zebra contínua entre páginas, lane compartilhada ou rótulo único;
- qualquer mudança de layout em `marginPanelRenderer.ts`;
- redesign de colunas, labels, filtros ou compactação `×N`;
- resize ou nova UX de handles para markers multipágina;
- exportação PDF multipágina ou mudança no QDPX exporter;
- validação, edição ou adaptação no Atlas;
- remoção semântica de cabeçalhos, rodapés, tabelas ou legendas;
- agrupamento automático dos doze markers manuais existentes com o código
  `marlonnn`;
- migração heurística de fragments multipágina antigos sem autoria preservada.

## Decisão sobre handles

A manipulação por handles é uma questão de interação separada do modelo e do
importador deste marco. O Marco 3 não tentará resolver drag cross-page.

Comportamento durante o Marco 3:

- markers de uma página preservam o resize atual;
- markers multipágina são selecionáveis e permitem as operações lógicas de código,
  memo e exclusão quando pertencem ao coder ativo;
- resize por handles fica desabilitado para markers multipágina, evitando que um
  segmento local seja alterado como se fosse o marker inteiro.

Direção futura registrada, sem compromisso de implementação neste marco:

- a unidade lógica deve expor apenas dois endpoints manipuláveis: o início do
  primeiro segmento e o fim do último;
- segmentos intermediários não devem possuir handles independentes;
- mover um endpoint deve alterar somente o marker do coder ativo;
- a regra para atravessar, criar ou remover páginas durante o drag exige um desenho
  de interação próprio antes de ser implementada.

## Modelo de dados

### Segmento PDF

```ts
interface PdfMarkerSegment {
  page: number;
  beginIndex: number;
  beginOffset: number;
  endIndex: number;
  endOffset: number;
  text: string;

  importedSelectionGuid?: string;
  importedPdfSelectionBBox?: PdfSelectionBBoxHint;
  resolution?: 'resolved' | 'pending';
}
```

O segmento contém apenas geometria, texto local e hints necessários para sua
resolução. Não contém códigos, memo, magnitude, relações, autoria ou timestamps do
marker.

### Marker lógico

`PdfMarker` continua sendo a unidade de domínio. Para markers multipágina ele ganha
`segments?: PdfMarkerSegment[]` e procedência suficiente para representar o grupo:

```ts
interface QdpxSelectionProvenance {
  source: 'refi-qda-selection';
  selectionGuid: string;       // Selection âncora
  selectionGuids?: string[];   // fragments ordenados
  unattributedOwner?: true;
}
```

Invariantes:

1. quando `segments[]` existe, ele é a geometria autoritativa;
2. segmentos são ordenados por página e nunca representam unidades analíticas;
3. os campos escalares legados de página e intervalo são uma projeção compatível
   do primeiro segmento, não uma segunda fonte editável;
4. um helper canônico lê marker simples como uma lista implícita de um segmento;
5. um marker possui exatamente um proprietário;
6. markers de coders diferentes possuem geometrias independentes, mesmo quando
   vieram da mesma Selection externa;
7. `marker.text` representa o conteúdo lógico completo; `segment.text` representa
   apenas o conteúdo local necessário para resolução e renderização.

Não haverá migração em massa de markers simples. A compatibilidade será oferecida
pela camada de acesso, preservando o estado existente sem reescrevê-lo apenas por
ter sido carregado.

## Detecção dos grupos

Um grupo multipágina importável exige simultaneamente:

- duas ou mais `PDFSelection`;
- páginas únicas, ordenadas e adjacentes;
- mesmo nome normalizado;
- mesmo timestamp da Selection;
- mesma assinatura semântica de Codings, incluindo autor e código;
- exatamente um GUID do grupo pareado com `PlainTextSelection`.

A relação QDPX denominada `continued by` não identifica grupos multipágina de
forma confiável. No corpus real ela também conecta quotations independentes na
mesma página. Ela continua sendo importada como relação, mas não participa da
decisão de agrupamento.

Se a evidência estrutural for ambígua, o importer não agrupa silenciosamente. Ele
preserva as Selections pelo caminho individual por coder e emite warning/audit.

## Resolução do conteúdo e projeção

Para cada grupo reconhecido:

1. recuperar o conteúdo lógico completo pela `PlainTextSelection` âncora;
2. obter o texto PDF.js consolidado e seus offsets por página no carregamento já
   feito durante a importação;
3. restringir a busca ao intervalo formado pelas páginas declaradas pelo grupo;
4. localizar início e fim no fluxo concatenado por normalização tolerante a
   whitespace, soft hyphen, caracteres de substituição e ligaturas já observadas;
5. exigir uma combinação ordenada e não ambígua de início e fim;
6. projetar o intervalo global para segmentos locais:
   - início resolvido até o fim textual da primeira página;
   - página textual inteira para cada página intermediária;
   - começo textual da última página até o fim resolvido;
7. resolver cada texto local contra os text items da própria página e persistir
   índices DOM-aligned.

Uma chave limitada pode ser usada para localizar com segurança um endpoint. Ela
nunca determina o fim artificial do destaque. O limite legado de aproximadamente
160 caracteres deixa de definir o tamanho do segmento.

Se os endpoints não puderem ser resolvidos durante a importação, o grupo e sua
autoria permanecem preservados como marker lógico com segmentos `pending`. Um
resolver dedicado pode completar cada endpoint quando a página correspondente
carregar. Não há fallback para um marker truncado nem retorno ao estado
“multipágina sem autoria”.

O fluxo textual nativo é preservado mesmo quando inclui cabeçalhos, rodapés,
tabelas, legendas ou conteúdo de outra coluna. Geometria visual e texto lógico são
camadas relacionadas, mas o importer não inventa saneamento semântico.

## Normalização por coder

As aplicações presentes no `PDFSelection` âncora, no `PlainTextSelection` e nas
continuações são unidas pela identidade semântica `creatingUser + codeGuid`.

Para cada aplicação lógica:

- todos os GUIDs de Coding de origem são preservados em
  `sourceCodingGuids[]`;
- notas de magnitude e timestamps permanecem associados à aplicação;
- duplicatas entre representações não aumentam a contagem de aplicações;
- aplicações de códigos diferentes do mesmo coder permanecem em `codes[]` no
  mesmo marker.

O importer cria um marker por coder usando identidade local resolvida pelo GUID
externo. Todos recebem a mesma geometria inicial por valor, não por referência
mutável compartilhada. Um coder pode divergir depois sem alterar seus irmãos de
procedência.

Codings sem proprietário resolvível formam uma unidade não atribuída e somente
leitura acompanhada de warning; eles nunca recebem `human:default` por fallback.

## Captura manual multipágina

`captureCrossPageSelection` já produz intervalos locais corretos por página. O
popover deve tratá-los como segmentos de uma única intenção:

- lookup considera arquivo, lista completa de segmentos e coder ativo;
- a primeira aplicação de código cria um único marker;
- código, memo, magnitude, relações e exclusão operam uma vez sobre esse marker;
- reabrir pelo hover resolve o marker lógico pelo ID, sem criar markers auxiliares
  para cada página.

Os doze markers `marlonnn` existentes não serão agrupados automaticamente. Eles
servem como referência visual para comparar os seis pares e confirmar os limites.
Novas seleções manuais, criadas após o Marco 3, já usam o modelo lógico.

## Adaptação dos consumidores

### Renderização por página

O model fornece projeções efêmeras de cada segmento para a página carregada. A
projeção carrega o mesmo `markerId`, códigos, autoria e editabilidade do marker
lógico, mas usa os bounds locais do segmento.

Essas projeções:

- não entram na persistência;
- não aparecem em sidebar, analytics ou transporte ICR como markers separados;
- permitem renderização lazy, completando cada página quando ela carregar;
- propagam hover e clique para a unidade lógica.

O renderer da margin panel permanece inalterado. Durante o Marco 3 ele poderá
mostrar uma entrada por página para a mesma unidade. Rail contínua e rótulo único
pertencem ao Marco 4.

### Operações do model e popover

- código, memo, magnitude, relações e exclusão atuam pelo ID lógico;
- markers multipágina não aceitam `updateMarkerRange` escalar;
- resolução de import atualiza um segmento identificado, não o primeiro intervalo
  encontrado por acaso;
- propriedade e modo somente leitura continuam protegidos na camada de mutação.

### Sidebar, analytics e busca

- `getAllMarkers()` e `getMarkersForFile()` retornam unidades lógicas;
- sidebar mostra um marker e pode rotulá-lo como `Pages 6–7`;
- navegação geral abre o primeiro segmento;
- texto pesquisável usa o conteúdo lógico completo;
- analytics contabiliza o marker e suas aplicações uma vez.

### ICR e Compare Coders

Para cálculo espacial, um marker multipágina é projetado em um range PDF por
segmento/página, todos ligados ao mesmo marker lógico. Isso permite comparar a
geometria nas duas páginas sem duplicar a entidade.

O input de ICR deve carregar uma contagem lógica separada da quantidade de ranges.
Pesos, totais de contribuição e referências de marker usam IDs lógicos únicos.
Regiões contestadas podem continuar sendo apresentadas por página, mas operações
sobre códigos atingem o marker lógico uma única vez.

Resize/reconciliação de bounds multipágina não faz parte deste marco.

## Erros e diagnóstico

- grupo estrutural ambíguo: não agrupar, preservar markers por coder e emitir
  warning;
- owner ausente/desconhecido: preservar unidade não atribuída e não editável;
- boundary ambígua: persistir segmentos pendentes, sem truncar;
- página ou texto PDF indisponível: manter dados de domínio e hints, registrar a
  falha no audit;
- divergência entre memos/timestamps repetidos: aplicar precedência determinística
  da âncora seguida da ordem dos fragments e registrar warning;
- nenhum erro multipágina autoriza alterar o resolver geral dos markers simples.

## Evidência esperada no corpus Atlas

Os seis grupos conhecidos devem produzir:

| Caso | Páginas do viewer | Markers lógicos | Aplicações |
|---|---:|---:|---:|
| D1 — Figure 2 | 6–7 | 4 | 11 |
| D1 — Autonomy | 8–9 | 4 | 8 |
| D2 — infra background | 8–9 | 4 | 6 |
| D5 — Which approach | 2–3 | 2 | 4 |
| D8 — operational responsibilities | 5–6 | 2 | 4 |
| D8 — People downstream | 6–7 | 2 | 2 |
| **Total** |  | **18** | **35** |

Esses 18 markers possuem 36 segmentos. Cada aplicação semântica do corpus contém
três GUIDs-fonte: PDF âncora, PlainText e PDF continuação.

Os 191 casos não multipágina continuam sendo o baseline de ancoragem e não podem
regredir.

## Validação e testes

### Cobertura automatizada

- detecção positiva dos seis padrões e rejeição de falsos grupos;
- prova de que links `continued by` não formam grupos;
- localização global e projeção para dois ou mais segmentos;
- início e fim completos sem corte em 160 caracteres;
- tolerância às diferenças de whitespace, ligaturas e glifos já observadas;
- leitura de marker simples como segmento implícito;
- lookup e criação manual por lista completa de segmentos e coder ativo;
- criação de um único marker manual cross-page;
- código, memo, magnitude, relações e exclusão atômicos;
- bloqueio de resize multipágina, preservando resize simples;
- propriedade independente entre markers irmãos;
- sidebar, analytics, transporte e ICR sem dupla contagem;
- corpus Atlas com 6 grupos, 18 markers, 36 segmentos e 35 aplicações;
- regressão do baseline simples;
- suíte completa, build e `git diff --check`.

### Validação manual

1. fazer importação limpa do QDPX real em modo somente leitura;
2. percorrer os seis casos e confirmar os dois segmentos completos;
3. comparar visualmente cada caso com o par `marlonnn` correspondente;
4. confirmar preservação intencional de cabeçalhos/tabelas no fluxo textual;
5. confirmar um registro por coder em sidebar, analytics e Compare Coders;
6. selecionar um coder e alterar código/memo apenas em seu marker;
7. confirmar que resize multipágina não é oferecido e que resize simples continua
   funcionando;
8. criar uma nova seleção manual cross-page e confirmar um marker com dois
   segmentos;
9. apagar esse marker e confirmar remoção lógica única;
10. registrar contagens e observações em audit/diagnóstico, não em `data.json`.

## Critérios de conclusão

O Marco 3 termina somente quando:

1. os seis casos reais são reconstruídos como unidades lógicas por coder;
2. os 36 segmentos cobrem integralmente seus intervalos locais;
3. nenhuma aplicação dos grupos permanece na categoria legada sem autoria;
4. segmentos não duplicam markers, códigos, memos ou contagens analíticas;
5. captura manual multipágina cria uma unidade lógica;
6. resize multipágina está explicitamente bloqueado, sem regressão no resize
   simples;
7. os 191 casos simples permanecem no baseline;
8. validação manual, testes focados, suíte completa e build passam;
9. margin panel, exporter e interoperabilidade Atlas permanecem fora do diff.

## Arquivos provavelmente envolvidos

- `src/pdf/pdfCodingTypes.ts` — segmento e procedência;
- novo helper de acesso/projeção de segmentos em `src/pdf/`;
- novo resolver puro multipágina em `src/pdf/` ou `src/import/`;
- `src/import/qdpxImporter.ts` — agrupamento, projeção e normalização por coder;
- `src/pdf/pdfCodingModel.ts` — lookup, criação lógica e operações atômicas;
- `src/pdf/selectionCapture.ts` e `src/pdf/pdfCodingMenu.ts` — criação manual única;
- `src/pdf/pageObserver.ts` e adaptação mínima do highlight — projeção por página;
- sidebar, analytics e adapters ICR que hoje leem `page/begin/end` diretamente;
- testes correspondentes de importação, model, render projection, analytics e ICR.

Não fazem parte da lista `src/pdf/marginPanelRenderer.ts`,
`src/export/qdpxExporter.ts` ou qualquer integração Atlas.

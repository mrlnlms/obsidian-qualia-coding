# QDPX Atlas, autoria multicoder e margin panel — levantamento e decisões

> Atualização de sequência em 2026-09-02: autoria Qualia↔Qualia foi concluída no
> Marco 2. O round-trip PDF completo entre vaults Qualia é um contrato autônomo
> do Marco 6; interoperabilidade e edição no Atlas formam o Marco 7 separado.

> Levantamento factual e checkpoint de decisões em 2026-09-01. Este documento
> estende os diagnósticos
> `qdpx-atlas-multipage-diagnostic.md` e
> `pdf-margin-panel-multipage-architecture.md`. As decisões assentadas ao final
> devem sobreviver à troca de sessão; os detalhes ainda abertos não constituem uma
> spec de implementação.

> A auditoria posterior do padrão REFI, do importer já concluído e da projeção de
> saída do Marco 6 está em
> [`qdpx-refi-pdf-export-interoperability.md`](qdpx-refi-pdf-export-interoperability.md).
> As seções abaixo que descrevem autoria como “ignorada” ou multipágina como
> fragmentos independentes registram o diagnóstico histórico anterior aos Marcos
> 1–5; não representam o código atual.

## Perguntas que motivaram o levantamento

1. O QDPX relaciona uma pessoa à marcação/codificação?
2. O Qualia preserva essa relação ao importar do Atlas?
3. O Qualia consegue exportá-la novamente para o Atlas?
4. Se duas pessoas aplicam o mesmo código ao mesmo trecho, o margin panel deve
   exibir duas cópias do código?
5. O algoritmo atual de colunas é a causa principal da saturação espacial?
6. Como autoria multicoder e seleção multipágina devem participar do mesmo
   refactor?

## Fontes

### Artefatos locais

- QDPX Atlas real:
  `QUALIA-QDPX/QDPX Tests/UnifiedDevOps Selective Coding ITE5 ICA.qdpx`;
- XML extraído:
  `QUALIA-QDPX/QDPX Tests/UnifiedDevOps Selective Coding ITE5 ICA/UnifiedDevOps Selective Coding ITE5 ICA.qde`;
- schema REFI-QDA local:
  `qualia-coding-sources-FINAL/2024-07-17-local-workbench-QDA-refs/QDA oensource - XSD file of the REFI-QDA Project.xsd`;
- estado importado atual do plugin: `data.json`;
- importer/exporter e modelos do repositório atual.

### Documentação oficial do Atlas

- [The Margin Area — ATLAS.ti 26](https://manuals.atlasti.com/Win/en/manual/Margin/MarginArea.html);
- [Team Work — ATLAS.ti 26](https://manuals.atlasti.com/Win/en/manual/Team/TeamWork.html);
- [Merging Projects — ATLAS.ti 26](https://manuals.atlasti.com/Win/en/manual/Team/TeamWorkMergingProjects.html);
- [User Accounts — ATLAS.ti 26](https://manuals.atlasti.com/Win/en/manual/Team/TeamUserAccounts.html);
- [Setting Up an ICA Project — ATLAS.ti 26](https://manuals.atlasti.com/Win/en/manual/ICA/ICAProjectSetup.html);
- [Merging Projects for ICA Analysis — ATLAS.ti 26](https://manuals.atlasti.com/Win/en/manual/ICA/ICAMergingProjects.html);
- [Creating and Modifying Text Quotations — ATLAS.ti 26](https://manuals.atlasti.com/Win/en/manual/Quotations/QuotationsTextCreating.html);
- [Team Tools — ATLAS.ti 26](https://manuals.atlasti.com/Mac/en/manual/MainConcepts/MainConceptsTeamTools.html).

O manual do Atlas distingue explicitamente quotation de coding: a quotation é o
trecho; coding é o vínculo entre um código e essa quotation. Em modo de análise
intercoder, aplicações coincidentes permanecem visíveis e o margin area pode
mostrar o usuário responsável.

O fluxo de equipe do Atlas é baseado em um projeto mestre, cópias ou bundles para
os codificadores, merge em um novo mestre e eventual redistribuição. Esse processo
pode acontecer em rodadas. O QDPX final, porém, é um snapshot do projeto: preserva
usuários e aplicações, mas não descreve por si só toda a árvore de cópias, merges,
rodadas e versões que o originou. O merge do Atlas também não funciona como um
sistema de subtração de alterações: algo apagado em uma cópia pode reaparecer se
continuar presente em outra. Essa limitação histórica é contexto sobre o Atlas,
não um comportamento que o Qualia precise reproduzir.

Para ICA, o Atlas admite dois desenhos de trabalho relevantes:

- cada codificador cria suas próprias quotations, permitindo limites diferentes;
- quotations são preparadas previamente e compartilhadas como unidades de análise,
  e cada codificador aplica seus próprios códigos sobre elas.

O segundo desenho explica por que uma mesma Selection do QDPX real contém vários
`Coding creatingUser`. Isso é uma propriedade importante do arquivo de origem, mas
não obriga o Qualia a adotar internamente uma entidade compartilhada editável por
várias pessoas.

## Decisão do Qualia sobre a quotation compartilhada do Atlas

O Qualia **não introduzirá um novo tipo de marker compartilhado entre coders**.
Na importação, uma Selection do Atlas com aplicações de várias pessoas será
normalizada em markers independentes, um por coder.

Esses markers podem guardar um identificador comum de procedência, como
`importedSelectionGuid` ou `sourceSelectionId`. Essa relação significa apenas
“vieram da mesma Selection externa”. Ela não cria sincronização posterior.

Consequências deliberadas:

- cada marker tem um único proprietário em `codedBy`;
- cada marker possui sua própria geometria, códigos, memo e timestamps;
- vários códigos aplicados pelo mesmo coder à Selection permanecem no `codes[]`
  do marker daquele coder;
- aplicações de coders diferentes tornam-se markers diferentes;
- se um coder mover um handle, somente o marker dele muda;
- markers irmãos de origem nunca têm suas geometrias resincronizadas
  automaticamente;
- uma divergência criada depois da importação é informação analítica real, não um
  erro a ser corrigido pelo modelo.

Essa escolha é intencionalmente mais simples que o modelo interno do Atlas e é
compatível com a premissa atual do Qualia e do engine de ICR: autoria pertence ao
marker.

## Resposta curta: o QDPX traz, sim, pessoa → aplicação

O schema REFI-QDA possui:

- `<Users>` com vários `<User guid name>`;
- `creatingUser` em `<Coding>`;
- `creatingUser` também em sources e selections, com outro significado;
- `creatingUserGUID` e `modifyingUserGUID` opcionais no projeto.

O atributo decisivo para a pergunta “quem aplicou este código?” é o
`creatingUser` do `<Coding>`, não o criador da seleção.

No arquivo Atlas inspecionado existem seis usuários declarados:

- ATLAS.ti;
- Isaque Alves;
- Jorge Enrique Pérez Martínez;
- Jessica Diaz;
- carla rocha;
- Marlon Lemes.

Quatro deles possuem aplicações nos PDFSelection analisados. “ATLAS.ti” e
“Marlon Lemes” estão no registry do projeto, mas não aparecem como autores das
aplicações PDF contadas.

Exemplo estrutural real simplificado:

```xml
<PDFSelection guid="..." page="5" name="...">
  <Coding creatingUser="guid-carla"><CodeRef targetGUID="code-x"/></Coding>
  <Coding creatingUser="guid-jessica"><CodeRef targetGUID="code-x"/></Coding>
  <Coding creatingUser="guid-jorge"><CodeRef targetGUID="code-x"/></Coding>
  <Coding creatingUser="guid-isaque"><CodeRef targetGUID="code-x"/></Coding>
</PDFSelection>
```

Não são quatro códigos diferentes nem quatro geometrias necessariamente
diferentes. São quatro eventos de aplicação do mesmo código à mesma seleção.

## Dimensão do fenômeno no arquivo real

### PDFSelection

- 207 seleções PDF;
- 1.224 elementos `<Coding>`;
- 400 pares seleção × código possuem mais de um autor;
- 779 aplicações desapareceriam se cada par seleção × código fosse reduzido a
  apenas uma ocorrência;
- nenhum dos 1.224 Codings está sem `creatingUser`.

Distribuição das aplicações PDF:

| Pessoa | Aplicações |
|---|---:|
| Jessica Diaz | 410 |
| Isaque Alves | 310 |
| Jorge Enrique Pérez Martínez | 291 |
| carla rocha | 213 |

### PlainTextSelection

- 201 seleções textuais;
- 1.189 Codings;
- 388 pares seleção × código multicoder;
- 756 aplicações adicionais além da primeira;
- nenhum Coding sem `creatingUser`.

As 201 PlainTextSelections correspondem aos 201 PDFSelections âncora. As seis
PDFSelections restantes são exatamente as continuações dos seis grupos
multipágina.

## Como o Atlas representa PDF e multipágina

Para as seleções normais e para a âncora multipágina, o export Atlas usa duas
representações correlacionadas pelo GUID:

- `PDFSelection`: página e retângulo visual;
- `PlainTextSelection`: offsets dentro da representação textual do PDF.

Nas seis seleções multipágina há ainda uma `PDFSelection` de continuação na página
seguinte, com GUID próprio. O arquivo também possui relações “continued by”. Os
Codings aparecem nos fragmentos necessários para que a codificação exista em cada
representação, mas conceitualmente continuam ligados à citação atravessando
páginas.

Essa estrutura confirma a intuição do usuário: o Atlas separa a unidade conceitual
da forma como ela precisa ser projetada visualmente sobre o PDF.

## O que o importer do Qualia faz hoje

### Users e autoria são ignorados

`ParsedSelection` guarda apenas `codeGuids: string[]`. Durante `parseSelection`, o
importer lê o `CodeRef`, mas descarta:

- GUID do Coding;
- `creatingUser` do Coding;
- timestamp individual do Coding;
- relação do Coding com o User registry.

O importer não lê `<Users>` nem cria entradas no `CoderRegistry`.

Resultado observado no `data.json`:

- 203 markers PDF importados;
- todos os 203 com `codedBy` ausente;
- nenhuma lista de coders importados persistida.

### A perda é assimétrica

Quando uma `PDFSelection` possui uma `PlainTextSelection` com o mesmo GUID, o
importer combina as duas e aplica `Set` sobre os `codeGuids`. Isso colapsa todas as
aplicações repetidas do mesmo código, mesmo quando pertencem a usuários distintos.

Nas seis continuações multipágina não existe o par textual. Por isso os codeGuids
repetidos sobrevivem, mas sem autoria. O estado atual contém exatamente seis
markers com codeIds duplicados — as seis continuações:

| Continuação | Aplicações armazenadas | Códigos únicos |
|---|---:|---:|
| D1, página 7 | 11 | 3 |
| D1, página 9 | 8 | 2 |
| D2, página 9 | 6 | 2 |
| D5, página 3 | 4 | 2 |
| D8, página 6 | 4 | 2 |
| D8, página 7 | 2 | 1 |

Essas repetições são vestígios da autoria multicoder, não códigos acidentalmente
duplicados pelo Atlas. Contudo, sem `creatingUser`, o Qualia já não sabe qual
repetição pertence a quem.

### Efeito atual no margin panel

O renderer cria uma barra para cada item em `marker.codes`. Portanto:

- nas 201 âncoras pareadas, normalmente aparece apenas um rótulo por código porque
  a autoria foi colapsada;
- nas seis continuações, o mesmo nome pode aparecer várias vezes em colunas
  paralelas porque os codeIds repetidos sobreviveram;
- todas essas barras repetidas carregam o mesmo markerId e codeName, sem capacidade
  de indicar o avaliador.

Assim, a interface atual não possui uma política multicoder coerente. Ela mistura
colapso silencioso com duplicação anônima dependendo da forma do QDPX.

### O problema também existe na criação manual PDF

`PdfCodingModel.findExistingMarker` considera arquivo, página e intervalo, mas não
o coder ativo. Se Marlon e João selecionarem exatamente o mesmo intervalo no mesmo
vault, a segunda operação reutiliza o marker da primeira pessoa. O `codedBy` do
marker original permanece, e os códigos são agregados ao mesmo registro.

Portanto, corrigir apenas o importer não resolve a semântica multicoder do engine
PDF.

### Já existe um precedente útil no próprio Qualia

O desenho histórico de coding em linhas CSV já tratava a mesma unidade da fonte
como markers separados por coder e restringia a edição ao coder ativo fora do modo
de comparação. Essa decisão aparece em
`20260512-csv-row-marker-cross-coder-design.md` e é coerente com o caminho adotado
aqui. O PDF não precisa inventar uma semântica de autoria diferente; precisa
generalizar esse princípio para intervalos, handles e segmentos multipágina.

## O que o exporter do Qualia faz hoje

O exporter atual não produz um round-trip multicoder:

- não emite `<Users>`;
- `buildCodingXml` não recebe `codedBy`;
- `<Coding>` sai sem `creatingUser`;
- a autoria existente nos markers criados localmente é perdida no QDPX;
- markers PDF textuais saem como `PlainTextSelection`; o caminho atual não recria
  o par Atlas `PDFSelection + PlainTextSelection` para texto;
- não há projeção de uma unidade multipágina para fragmentos visuais Atlas com
  identidade/autoria preservadas.

O QDPX antigo `qualia-project.qdpx` confirma esse comportamento: possui Codings
com GUID e timestamp, mas não contém Users nem `creatingUser`.

Logo, “round-trip QDPX” no estado atual cobre vários elementos estruturais do
projeto, mas não é round-trip fiel de autoria multicoder nem da representação
visual de citações PDF do Atlas.

## Impacto quantitativo no painel

O estado importado atual possui 468 barras PDF distribuídas entre as páginas 2–10.
Algumas páginas já são densas:

| Página | Markers | Barras atuais | Pico de colunas simultâneas |
|---:|---:|---:|---:|
| 5 | 33 | 77 | 12 |
| 6 | 47 | 106 | 14 |
| 7 | 46 | 99 | 10 entre os markers resolvidos |
| 8 | 28 | 65 | 7 |
| 9 | 13 | 47 | 7 entre os markers resolvidos |

Essas 468 barras já resultam de forte perda de autoria. O arquivo Atlas contém
1.224 aplicações em PDFSelection. Renderizar ingenuamente uma barra completa por
aplicação aumentaria a carga visual em aproximadamente 2,6 vezes nesse corpus.

## O algoritmo de colunas é culpado?

Parcialmente, mas não da forma mais óbvia.

Na amostra real dos markers já resolvidos, o algoritmo atual consumiu exatamente o
pico mínimo de colunas simultâneas em cada página. Em outras palavras: para esse
corpus, não há colunas horizontais desperdiçadas apenas pela ordem greedy.

Os problemas reais são:

1. **unidade visual:** toda aplicação entra como barra independente;
2. **rótulos:** collision avoidance só empurra para baixo, sem busca bidirecional,
   limite de página ou agrupamento;
3. **escopo local:** cada página calcula lanes independentemente;
4. **multipágina:** não há reserva estável de lane entre páginas;
5. **implementações divergentes:** Markdown possui um layout puro mais rico; PDF
   mantém uma cópia simplificada e própria;
6. **ausência de semântica multicoder:** o layout recebe repetições sem saber se
   representam códigos distintos, pessoas distintas ou fragmentos da mesma
   citação.

“Colunas” ou “tracks” continuam sendo uma primitiva útil para empacotar intervalos
verticais sem colisão. O que precisa mudar é o que merece uma track, como tracks
são mantidas entre páginas e como rótulos são agregados/expandidos.

## O que deveria acontecer com Marlon e João

Caso ambos marquem exatamente o mesmo trecho com o mesmo código, existem duas
verdades:

- visualmente, há um único trecho e um único nome de código;
- analiticamente, há duas aplicações independentes, uma de cada pessoa — e isso é
  evidência de concordância.

Mostrar apenas uma aplicação e apagar a autoria é incorreto. Portanto, a fonte de
verdade será composta por dois markers independentes, ambos visíveis por padrão.
O congestionamento resultante é um problema de design do painel, não uma razão
para colapsar os dados.

O comportamento assentado é:

- todas as marcações permanecem visíveis em projetos importados multicoder;
- somente as marcações do perfil ativo são editáveis;
- sem perfil ativo, o projeto fica em modo somente leitura;
- mudar o tamanho, remover um código ou apagar um marker afeta apenas o registro
  daquele coder;
- Compare Coders/ICR consome esses registros independentes;
- limites idênticos importados contam como concordância de boundaries;
- se um coder altera os limites do seu marker, a divergência passa a aparecer na
  comparação.

Uma apresentação compacta como `×N`, iniciais ou agrupamento visual pode ser
explorada futuramente para reduzir ruído. Se existir, será apenas uma projeção
derivada para layout: nunca a fonte de verdade, nunca o alvo implícito de uma
edição e não uma obrigação da primeira implementação correta.

## Modelo interno mais compatível com o Qualia atual

O ICR do Qualia já pressupõe `codedBy` no marker. Mover autoria para dentro de
`CodeApplication` exigiria alterar helpers e todas as engines, que hoje tratam
codeId como único dentro de um marker.

O caminho mais compatível é:

1. manter uma unidade de coding por coder;
2. registrar nos markers importados um vínculo de procedência comum, sem fazer
   desse vínculo uma entidade compartilhada editável;
3. permitir que cada marker do coder contenha os códigos aplicados por aquela
   pessoa;
4. dar a cada marker PDF do coder uma lista própria de segmentos para multipágina;
5. deixar a camada visual decidir se apresenta markers coincidentes separadamente
   ou por uma agregação estritamente derivada;
6. permitir que o exporter reagrupe markers de mesma procedência somente quando a
   geometria ainda for semanticamente compatível; markers que divergiram precisam
   sair como Selections independentes;
7. fazer o importer dividir os Codings da Selection por usuário, deduplicando por
   GUID de Coding ou por identidade semântica — nunca apenas por codeId.

Isso preserva as suposições do ICR e evita uma refatoração transversal de todas as
engines, mas exige que “mesma geometria” e “mesmo marker” deixem de ser sinônimos.

O vínculo de origem também não prova identidade pessoal. Se o QDPX contém um
usuário chamado “Marlon”, isso não autoriza o plugin a assumir que a pessoa que
está operando o vault é esse usuário. A escolha de autoria precisa ser explícita.

## Identidade ativa na importação e durante o trabalho

Um vault novo continua começando com o perfil local padrão `human:default`,
editável como hoje. Ao selecionar um QDPX multicoder, a tela de importação deve
mostrar os coders encontrados e exigir um contexto de participação por meio da
pergunta “Quem é você neste projeto?”.

As opções conceituais são:

1. **Somente leitura — não interferir no ICR**, pré-selecionada;
2. um dos coders importados;
3. **Perfil padrão deste vault — participar como novo codificador**.

“Somente leitura” não é um coder artificial e não equivale a
`human:default`. Internamente deve ser a ausência de coder ativo, por exemplo
`activeCoderId = null`, para impedir atribuição acidental. A importação pode ser
concluída nesse estado: todas as marcações aparecem, mas handles, remoção de código,
exclusão de marker e demais mutações de autoria ficam desabilitados.

Ao selecionar depois um coder importado, o operador passa a editar somente os
markers daquele perfil. Ao selecionar o perfil padrão do vault, novas marcações
pertencem a esse novo participante e entram normalmente no ICR. A seleção de um
coder importado é um contexto local de autoria, não autenticação nem mecanismo de
segurança.

Coders importados sem aplicações ainda devem poder ser preservados para
round-trip. Em contraste, um `human:default` sem nenhuma contribuição não deve
poluir contagens do ICR ou do Compare Coders.

## Propriedade, popover e codebook

Não será criada uma área no popover para incluir ou excluir pessoas de um marker.
Um marker tem um proprietário. O popover precisa apenas identificar esse
proprietário e operar os códigos do próprio marker quando ele pertence ao perfil
ativo.

Essa regra separa duas operações que não podem ser confundidas:

- remover a aplicação de um código de um marker altera somente o trabalho daquele
  coder;
- renomear ou apagar a definição de um código no codebook continua sendo uma
  operação global do projeto.

Quando markers de pessoas diferentes ocuparem exatamente o mesmo trecho, escolher
qual deles receberá hover, clique ou handles será um problema explícito de
interação e layout. A margin panel pode ajudar mostrando a autoria de cada entrada,
mas não deve resolver a ambiguidade fundindo os markers.

## Separação dos contratos de round-trip

O ciclo interno Qualia → QDPX → Qualia é requisito de colaboração local-first e
não depende do comportamento de uma ferramenta externa. Ele deve atingir
paridade de markers, autoria, códigos, bounds e segmentos no Marco 6 antes de
qualquer pacote ser usado como fixture de aceitação externa.

O ciclo Atlas → Qualia → Atlas continua sendo o alvo de interoperabilidade, mas
passa a ser validado separadamente no Marco 7. Particularidades descobertas no
Atlas podem exigir adaptações do serializer externo sem bloquear o uso do QDPX
entre pessoas que trabalham somente em vaults Obsidian.

## Contrato externo futuro — Atlas → Qualia → Atlas

### Entrada

1. importar `<Users>` para o CoderRegistry com mapeamento GUID externo estável;
2. ler cada Coding como registro próprio;
3. correlacionar PDFSelection e PlainTextSelection pelo GUID sem perder autoria;
4. consolidar fragmentos multipágina por coder;
5. gerar um marker independente por coder, mantendo apenas a procedência externa
   comum;
6. manter códigos, timestamps e GUIDs de aplicação necessários para reexportação.

### Estado interno

- marker por coder: geometria/texto próprios, possivelmente em `segments[]`;
- autoria/códigos: propriedade do marker individual;
- procedência: vínculo opcional com a Selection externa original;
- visualização: entradas individuais por padrão; qualquer agregação é derivada e
  nunca fonte de verdade;
- edição: permitida somente quando `marker.codedBy === activeCoderId`.

### Saída

1. emitir `<Users>` para todos os coders referenciados;
2. emitir `creatingUser` em cada Coding;
3. reagrupar markers de mesma procedência apenas quando seus limites continuarem
   compatíveis; exportar divergências como Selections independentes;
4. emitir PDFSelection + PlainTextSelection compatíveis com o padrão observado no
   Atlas;
5. projetar multipágina em fragmentos e relações “continued by” quando necessário;
6. ao reimportar, reconstruir as mesmas pessoas, aplicações e unidade lógica.

Round-trip não precisa preservar byte a byte a organização do XML original. Precisa
preservar a semântica: quem aplicou qual código, em qual seleção e em quais páginas.

## Consequência para o refactor do margin panel

O margin panel não deve receber `PdfMarker[]` crus e decidir layout diretamente.
Ele precisa de uma etapa intermediária que produza entradas visuais conscientes de
semântica, por exemplo:

```text
VisualCodingEntry
  markerId
  sourceSelectionId?
  codeId
  segments[]
  coderId
  applicationIds[]
  editable
  displayMode
```

Depois disso, o layout trabalha apenas com entradas visuais:

- rails por marker/código, preservando autoria e alvo de edição;
- lanes estáveis em coordenadas de documento, não recalculadas cegamente por
  página;
- projeção de uma rail em vários segmentos e nos vãos entre páginas;
- posicionamento de rótulos separado da alocação das rails;
- indicação de coder e de editabilidade;
- eventual compactação de entradas coincidentes somente como modo visual
  reversível.

Essa separação permite refatorar o posicionamento sem acoplar o algoritmo ao
formato QDPX ou ao schema persistido. Todos os markers continuam visíveis por
padrão. Filtros de visibilidade ou uma apresentação `×N` são melhorias posteriores,
não condições para preservar corretamente os dados.

## Decisões assentadas neste checkpoint

1. Uma Selection multicoder do Atlas vira um marker independente por coder.
2. A relação entre esses markers é procedência, não sincronização.
3. Cada coder pode alterar seus próprios limites sem modificar os demais.
4. Todos os markers permanecem visíveis por padrão.
5. Somente o perfil ativo pode editar seus markers.
6. “Somente leitura — não interferir no ICR” vem pré-selecionado na importação.
7. O perfil padrão do vault pode entrar como um novo codificador.
8. Não haverá gestão de múltiplas pessoas dentro do popover de um marker.
9. Compare Coders/ICR trabalha sobre registros individuais, não sobre uma
   agregação visual.
10. O codebook é global; a aplicação de código é individual.

## Decisões ainda abertas

1. Como indicar o autor de cada entrada sem saturar ainda mais a margin panel?
2. Como selecionar um entre vários markers exatamente sobrepostos no texto?
3. Quais filtros opcionais de visibilidade devem existir depois do comportamento
   fiel básico?
4. Como persistir a escolha de identidade ativa por projeto e entre sessões?
5. Qual é a regra exata de exportação quando markers da mesma procedência
   divergiram parcialmente?
6. Como posicionar o único rótulo de uma rail multipágina quando o centro cai no
   vão entre páginas?
7. Uma compactação `×N` agrega apenas apresentações idênticas ou também oferece
   expansão controlada por coder?

## Conclusão factual

Autoria multicoder não é um caso futuro: ela domina o QDPX real em análise. Na
data original deste levantamento, o Qualia perdia essa informação na importação
e na exportação, e as seis continuações multipágina expunham acidentalmente parte
dessa perda como rótulos duplicados. Os Marcos 1 e 2 corrigiram depois o contrato
de autoria para seleções emitidas: marker por coder na entrada, Users e
`creatingUser` na saída e identidade externa estável. Permanecem pendentes o
marker lógico multipágina e a paridade de cobertura PDF do exporter.

Por isso o refactor do margin panel não deve começar pelo algoritmo geométrico. A
sequência de trabalho recomendada é:

1. tratar a ancoragem simples já estabilizada — 191 de 191 markers não
   multipágina resolvidos — como baseline que não deve regredir;
2. preservar Users, Codings e a escolha de identidade no fluxo QDPX para seleções
   de uma página;
3. validar o round-trip multicoder dessas seleções simples;
4. consolidar multipágina em markers segmentados por coder;
5. entregar o comportamento mínimo correto do painel: todos visíveis, somente o
   perfil ativo editável, autoria identificável e zebra multipágina;
6. somente depois redesenhar em profundidade o layout, os filtros e eventuais
   agregações visuais;
7. fechar o round-trip PDF completo entre dois vaults Qualia, com paridade de
   cobertura e sem descarte silencioso;
8. validar Atlas em uma iteração externa posterior, incluindo edição e retorno;
9. consolidar testes de cada recorte após o comportamento funcionar no vault real,
   conforme a
   estratégia acordada para esta frente.

A tasklist operacional e os critérios do primeiro slice estão em
`../superpowers/specs/2026-09-01-qdpx-multicoder-import-design.md`.

## Marco 1 — validação funcional no vault real (2026-09-01)

O ensaio foi realizado após um import limpo do projeto `UnifiedDevOps Selective
Coding ITE5 ICA`, começando em modo **Somente leitura**.

- Todos os PDFs foram percorridos em somente leitura; highlights e zebras ficaram
  visíveis em cinza, sem permitir edição.
- Ao trocar entre Jessica, Jorge e os demais coders, a leaf aberta atualizou as
  cores imediatamente, sem precisar ser fechada. O perfil ativo recuperou as
  cores normais de seus markers; os demais permaneceram neutros.
- Markers de outros coders abriram apenas a consulta com autoria e códigos, sem
  controles de edição.
- Foi possível editar, mover e remover markers quando o perfil correspondente
  estava ativo.
- No D1, o perfil padrão criou uma contribuição independente no mesmo trecho
  (`Product team category emerges as a resu...`) com o código `Codigo de Marlon - Teste`.
  A contribuição apareceu no Compare Coders e desapareceu ao ser removida.
- O relatório [`qdpx-import-audit.md`](../../imports/UnifiedDevOps%20Selective%20Coding%20ITE5%20ICA/qdpx-import-audit.md)
  confirmou quatro coders com aplicações. ATLAS.ti e Marlon foram declarados no
  QDPX, mas ficaram em `0 / 0`; “sem autoria” permaneceu separado como dado
  ainda não resolvido dos fragments multipágina.

Esta validação fecha o comportamento funcional do Marco 1. Permanecem fora dele
as colisões entre markers exatamente sobrepostos, a investigação de regressões
no renderer PDF, a semântica de “sem autoria” e o tratamento multipágina.

## Checklist de testes automatizados pendentes

Executar depois que a cota permitir, antes de iniciar o round-trip:

- [ ] Parser preserva Users, Codings, GUIDs de autoria e pareamento PDF/texto.
- [ ] Usuários declarados sem aplicações não entram no seletor nem criam perfis
  locais vazios; o audit registra essa ausência.
- [ ] GUID externo resolve o mesmo coder após serialização e reimportação.
- [ ] Modos legado, ativo e somente leitura respeitam propriedade; markers sem
  autoria explícita permanecem não editáveis.
- [ ] Selection com vários coders cria markers independentes, com procedência
  comum e aplicações individuais.
- [ ] Lookup, mover, remover código, remover marker e criação respeitam o coder
  ativo; contribuição `human:default` é independente.
- [ ] Rodar o conjunto focado do plano (Task 8), depois `npm test`, `npm run build`
  e `git diff --check`.

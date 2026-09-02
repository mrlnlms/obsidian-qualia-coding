# QDPX multicoder — desenho aprovado e tasklist de retomada

> Data: 2026-09-01
>
> Branch de partida: `fix/qdpx-atlas-page-anchoring`
>
> Estado: Marcos 1–4 concluídos em 2026-09-02; Marcos 5–7 permanecem abertos.

## Como retomar em outra sessão

1. Confirmar que a branch atual parte de `fix/qdpx-atlas-page-anchoring` ou contém
   seus commits.
2. Ler este documento inteiro.
3. Ler os três diagnósticos canônicos referenciados abaixo.
4. Não usar `data.json` como memória da investigação: o usuário o apaga durante os
   testes.
5. Começar pelo **Marco 3 — conteúdo completo e marker multipágina por coder**.
6. Não iniciar zebra ou redesign geral da margin panel antes de fechar a autoria e
   o marker lógico multipágina; o round-trip PDF Qualia↔Qualia fica para o Marco
   6 e a interoperabilidade Atlas para o Marco 7.

## Documentos canônicos

- [Diagnóstico de ancoragem e multipágina](../../_research/qdpx-atlas-multipage-diagnostic.md)
  — evidência do QDPX real, inspeção manual e os seis casos multipágina;
- [Arquitetura atual da margin panel](../../_research/pdf-margin-panel-multipage-architecture.md)
  — overlay, colunas, rótulos, eventos e tamanho da mudança multipágina;
- [Autoria, round-trip e decisões multicoder](../../_research/qdpx-atlas-coder-roundtrip-margin-panel.md)
  — diagnóstico original da perda de Users/Codings, decisão por marker por coder
  e identidade ativa;
- [Round-trip isolado de autoria](2026-09-02-qdpx-authorship-roundtrip-design.md)
  — contrato Qualia↔Qualia concluído no Marco 2 e fronteira explícita com os
  round-trips PDF interno e Atlas;
- `docs/deep-research-ia-qdpx-atlas/` — pesquisas externas usadas como insumo,
  não como especificação automática do produto;
- `_MULTIPAGE reference.md`, na raiz do vault de trabalho — inspeção visual do
  usuário e capturas do Obsidian.

## Baseline que já funciona

O trabalho anterior corrigiu a ancoragem QDPX/Atlas de uma página:

- 203 markers PDF importados caem nas páginas visuais esperadas;
- os 191 markers que não pertencem aos grupos multipágina foram resolvidos;
- 182 têm correspondência textual exata;
- 9 têm apenas diferenças mínimas de glifo, com cobertura entre 98,9% e 100%;
- os 12 fragmentos restantes pertencem exclusivamente a 6 seleções multipágina;
- a suíte registrada nesse checkpoint tinha 258 arquivos e 3.637 testes aprovados,
  além de build aprovado.

Commits da baseline:

- `0c9f4f3` — converter páginas QDPX para a numeração do viewer;
- `65b06e5` — capturar text items para diagnóstico;
- `1e82321` — resolver âncoras importadas a partir de text items;
- `6a50a29` — preservar a página declarada pelo QDPX;
- `882cbbf` — cobrir a ancoragem Atlas com testes.

Não existe uma nova frente de “terminar os markers simples”. Eles são o baseline
estável. A próxima perda relevante ocorre antes da ancoragem: o importer descarta
autoria.

## Problema que o próximo marco resolve

O QDPX real declara Users e registra `creatingUser` em cada Coding. O importer
atual reduz uma Selection a `codeGuids[]`, elimina a identidade das aplicações e
cria markers sem `codedBy`.

Isso produz três erros conectados:

1. aplicações iguais de coders diferentes são colapsadas;
2. o ICR deixa de receber a realidade do projeto Atlas;
3. uma futura entidade multipágina seria construída sobre dados de autoria já
   destruídos.

Por isso o próximo trabalho não começa pelo painel nem por `segments[]`. Começa
pela preservação de Users, Codings e propriedade dos markers.

## Decisões aprovadas

1. Uma Selection Atlas com vários coders vira um marker independente por coder.
2. Cada marker possui sua própria geometria, códigos, memo e timestamps.
3. Markers oriundos da mesma Selection guardam procedência comum, não estado
   compartilhado.
4. Mover handles de um marker nunca altera markers de outros coders.
5. Vários códigos do mesmo coder continuam no `codes[]` do marker daquele coder.
6. Todos os markers ficam visíveis por padrão.
7. Apenas markers do perfil ativo são editáveis.
8. A importação começa em **Somente leitura — não interferir no ICR**.
9. Somente leitura é ausência de coder ativo, não um coder artificial e não
   `human:default`.
10. O perfil padrão do vault pode participar como um novo codificador.
11. Escolher um coder importado define contexto de autoria local; não é
    autenticação nem segurança.
12. O popover não ganhará gestão de pessoas. Um marker tem um proprietário.
13. Remover uma aplicação de código é uma operação individual; alterar a definição
    do código no codebook continua sendo global.
14. Uma eventual compactação `×N` será apenas visual e posterior.
15. Compare Coders/ICR sempre consome os markers individuais.

## Alternativas descartadas para o primeiro marco

### Começar pelo multipágina

Foi descartado porque consolidaria `segments[]` depois de a autoria já ter sido
colapsada pelo importer. A migração seguinte teria de desfazer o próprio modelo
recém-criado.

### Começar pela margin panel

Foi descartado porque o painel atual não recebe informação suficiente para saber
se uma repetição representa outro código, outro coder ou outro fragmento. Melhorar
o layout antes de corrigir os dados esconderia a perda sem resolvê-la.

### Criar somente o seletor “Quem é você?”

Foi descartado como etapa isolada porque a interface não teria Users nem Codings
fiéis para operar. O seletor precisa fazer parte de um fluxo vertical que chegue
até markers per-coder e bloqueio de edição.

### Adotar a quotation compartilhada do Atlas

Foi descartado. O Qualia normalizará o dado externo para seu modelo de marker por
coder. A identidade da Selection Atlas será preservada apenas como procedência.

## Sequência global

- [x] Estabilizar ancoragem QDPX de uma página.
- [x] Diagnosticar os seis grupos multipágina no QDPX e no vault real.
- [x] Mapear a arquitetura atual da margin panel.
- [x] Definir a semântica multicoder e a política de identidade ativa.
- [x] **Marco 1:** importar corretamente autoria multicoder em seleções PDF de uma
  página.
- [x] **Marco 2:** garantir round-trip isolado de autoria Qualia↔Qualia, sem
  prometer ainda interoperabilidade PDF com o Atlas.
- [x] **Marco 3:** completar os fragmentos Atlas e criar marker lógico multipágina
  por coder, com `segments[]`.
- [x] **Marco 4:** entregar a margin panel mínima correta para multipágina e
  autoria.
- [ ] **Marco 5:** refatorar layout espacial, filtros e compactações visuais.
- [ ] **Marco 6:** exportar PDF simples e multipágina e validar o round-trip
  completo entre vaults Qualia/Obsidian.
- [ ] **Marco 7:** validar a interoperabilidade Atlas em uma rodada externa
  separada, incluindo edição no Atlas e retorno ao Qualia.

Cada marco deve funcionar manualmente no vault real antes de os testes daquele
recorte serem consolidados. Isso não significa acumular toda a cobertura para o
final do projeto: os testes fecham um marco depois que seu comportamento foi
compreendido e validado.

## Marco 1 — importação multicoder de uma página

### Condição do primeiro ensaio

O usuário validará este marco em um vault isolado, sem códigos, markers ou coders
locais prévios além do `human:default` estrutural. Coexistência com um codebook
local já populado e novas políticas de conflito/merge não fazem parte deste
marco. A identidade externa por GUID continua necessária para autoria,
reimportação e round-trip.

### Objetivo observável

Importar o QDPX Atlas real, visualizar os markers de uma página separados por
coder e não conseguir alterar nenhum deles enquanto o projeto estiver em modo
somente leitura.

Ao selecionar um coder, apenas os markers dele podem ser alterados. Ao selecionar
`human:default`, uma nova aplicação no mesmo intervalo deve criar um marker novo,
sem reutilizar ou modificar o marker importado de outra pessoa.

### Escopo incluído

- Users do QDPX;
- Codings individuais e seu `creatingUser`;
- pareamento `PDFSelection + PlainTextSelection` sem duplicar a mesma aplicação;
- seleções PDF textuais de uma única página;
- criação de um marker por Selection × coder;
- vários códigos do mesmo coder dentro do mesmo marker;
- procedência da Selection e das aplicações para round-trip futuro;
- preview com os coders encontrados;
- escolha de participação na importação;
- modo somente leitura explícito e pré-selecionado;
- edição restrita ao proprietário ativo;
- busca de marker coincidente considerando o coder ativo;
- visibilidade de todos os markers importados no painel atual;
- validação manual no QDPX e no vault reais;
- testes e build depois da validação funcional.

### Fora do escopo

- agrupar os doze fragmentos multipágina;
- introduzir `segments[]`;
- desenhar zebra entre páginas;
- rótulo único multipágina;
- redesenhar colunas, colisões ou labels da margin panel;
- compactação `×N`;
- filtros de visibilidade por coder;
- modificar a interface de Compare Coders;
- reconciliar divergências;
- imitar o versionamento por cópias e merges do Atlas;
- remover cabeçalhos, rodapés ou tabelas do texto PDF;
- expandir a mesma mudança a todas as modalidades no primeiro slice.

## Contratos de dados do Marco 1

### Parsing

O modelo intermediário da importação precisa representar, no mínimo:

- User: GUID externo e nome;
- Coding: GUID, GUID do código, GUID do `creatingUser`, timestamp e referências de
  nota quando existirem;
- Selection: GUID, geometria/âncora, lista de Codings e metadados próprios.

`codeGuids[]` não pode continuar sendo a única representação de uma Selection.
Deduplicação deve reconhecer a identidade da aplicação e o pareamento entre as
representações visual e textual do PDF; nunca pode usar somente `codeId`.

### Identidade de coder

O GUID externo é a identidade autoritativa do User durante a importação. Nome é
apresentação, não chave.

- mesmo GUID externo reimportado deve resolver para o mesmo coder local;
- nomes iguais com GUIDs diferentes não podem ser fundidos silenciosamente;
- coincidência entre o nome do operador e um User importado não seleciona esse
  perfil automaticamente;
- User importado sem aplicações pode ser preservado para round-trip;
- `human:default` sem contribuição não entra em contagens de ICR apenas por existir
  no registry.

O registry precisará persistir uma referência externa estável por coder. O formato
concreto pode ser um campo opcional no Coder ou um mapa de identidades externas,
desde que suporte mais de uma importação sem usar o nome como chave.

### Procedência de marker e aplicação

O marker precisa guardar o GUID da Selection externa que o originou. Cada aplicação
de código precisa preservar metadados suficientes para reemitir o Coding,
especialmente GUID e timestamp quando presentes.

Essa procedência:

- auxilia reimportação e round-trip;
- permite reconhecer markers irmãos de origem;
- não autoriza propagação de handles, códigos, memos ou exclusões entre eles.

### Contexto de edição

O estado precisa distinguir três situações:

- dado legado sem escolha persistida: mantém `human:default` como comportamento
  retrocompatível;
- coder ativo válido: novas marcações pertencem a ele e apenas seus markers são
  editáveis;
- somente leitura explícito: nenhum coder ativo e nenhuma mutação de marker
  permitida.

Hoje `getActiveCoderId()` sempre retorna `human:default` como fallback. O novo
desenho não pode representar somente leitura apenas apagando o valor, pois isso
ativaria o fallback. A implementação deve introduzir um estado explícito e uma API
que permita consultar “há um coder editável?” sem confundir ausência deliberada
com dado legado.

O bloqueio deve existir na camada de mutação, não apenas ocultando botões. A UI
também deve comunicar o estado, mas chamadas indiretas não podem alterar markers
estrangeiros.

## Fluxo de importação aprovado

Depois que o usuário seleciona um QDPX, o preview mostra as informações existentes
e acrescenta “Quem é você neste projeto?”.

Ordem das opções:

1. **Somente leitura — não interferir no ICR**, pré-selecionada;
2. coders importados, identificados pelo nome;
3. **Perfil padrão deste vault — participar como novo codificador**.

A importação pode prosseguir com a primeira opção. Depois da importação, o seletor
de perfil existente deve permitir sair de somente leitura e escolher um coder
importado ou o perfil padrão.

A importação sempre preserva a autoria declarada pelo arquivo. A opção escolhida
define quem operará o projeto depois da importação; ela não reatribui markers
importados.

## Tasklist executável do Marco 1

### A. Parser e preview

- [x] Introduzir tipos intermediários para User e Coding.
- [x] Ler `<Users>` e preservar GUID/nome.
- [x] Ler cada `<Coding>` com GUID, `creatingUser`, timestamp, CodeRef e NoteRefs.
- [x] Correlacionar `PDFSelection` e `PlainTextSelection` sem colapsar coders.
- [x] Expor coders e quantidade de aplicações no `ImportPreview`.
- [x] Emitir warning para Coding com User ausente ou desconhecido, preservando-o
  como não editável e fora do ICR até haver atribuição explícita.

### B. Persistência e normalização

- [x] Adicionar referência externa estável ao CoderRegistry.
- [x] Importar Users antes de criar markers.
- [x] Adicionar procedência QDPX opcional ao marker e à aplicação de código.
- [x] Normalizar cada Selection de uma página em um marker por coder.
- [x] Manter os códigos daquele coder no `codes[]` de seu marker.
- [x] Garantir IDs locais distintos mesmo quando bounds e códigos coincidirem.
- [x] Preservar coders importados sem aplicações.

### C. Participação e somente leitura

- [x] Representar somente leitura sem criar um coder artificial.
- [x] Preservar o fallback `human:default` para vaults legados/não importados.
- [x] Mostrar no preview a escolha “Quem é você neste projeto?”.
- [x] Deixar “Somente leitura — não interferir no ICR” pré-selecionado.
- [x] Persistir a escolha de participação após a importação.
- [x] Permitir troca posterior pelo seletor de perfil.

### D. Propriedade e edição PDF

- [x] Fazer busca de marker em intervalo exato considerar o coder ativo.
- [x] Impedir criação de marker em somente leitura.
- [x] Impedir resize, remoção de aplicação e exclusão de marker estrangeiro.
- [x] Permitir edição normal do marker pertencente ao coder ativo.
- [x] Manter todos os markers visíveis independentemente do perfil ativo.
- [x] Indicar autoria usando a apresentação mínima que a interface atual comportar,
  sem iniciar o redesign da margin panel.
- [x] Confirmar que operações globais do codebook continuam globais e claramente
  distintas de remover uma aplicação individual.

### E. Validação funcional antes dos testes

- [x] Importar o QDPX real com `data.json` limpo.
- [x] Confirmar os Users esperados no preview e no registry.
- [x] Confirmar que somente leitura vem selecionado e bloqueia mutações.
- [x] Inspecionar uma Selection com o mesmo código aplicado por quatro pessoas.
- [x] Confirmar quatro markers/proprietários distintos e uma procedência comum.
- [x] Selecionar um coder importado e alterar somente seu marker.
- [x] Confirmar que os outros três permanecem idênticos.
- [x] Selecionar `human:default` e codificar o mesmo intervalo.
- [x] Confirmar criação de um novo marker, sem reutilizar qualquer importado.
- [x] Trocar novamente para somente leitura e confirmar o bloqueio.
- [x] Conferir que o painel atual mostra todos os registros, mesmo congestionado.
- [x] Registrar contagens e evidências no documento de diagnóstico, não depender de
  `data.json` preservado.

### F. Cobertura depois do funcionamento

- [x] Cobrir parsing de Users e Codings.
- [x] Cobrir pareamento PDFSelection/PlainTextSelection sem dupla contagem.
- [x] Cobrir marker por coder para bounds e código coincidentes.
- [x] Cobrir GUID externo como identidade, inclusive nomes iguais.
- [x] Cobrir somente leitura explícito versus fallback legado.
- [x] Cobrir busca exata de marker por coder.
- [x] Cobrir bloqueios de mutação de marker estrangeiro.
- [x] Rodar a suíte completa.
- [x] Rodar build.

## Critérios de conclusão do Marco 1

O marco só termina quando todas as condições abaixo forem verdadeiras:

1. nenhum Coding de uma Selection simples é perdido por deduplicação baseada apenas
   em código;
2. cada marker importado possui o coder correto ou um estado estrangeiro não
   editável acompanhado de warning;
3. todas as marcações permanecem visíveis;
4. somente leitura realmente impede mutações;
5. escolher um coder habilita apenas os markers dele;
6. `human:default` cria contribuição nova e independente;
7. a ancoragem simples permanece no baseline anterior;
8. o comportamento foi validado no vault real;
9. testes do recorte e suíte completa passam;
10. build passa.

## Arquivos provavelmente envolvidos no Marco 1

Esta lista orienta a retomada; não é autorização para refatorações laterais.

- `src/import/qdpxImporter.ts` — Users, Codings, preview e normalização;
- `src/import/importModal.ts` — escolha de participação;
- `src/core/icr/coderTypes.ts` — referência externa e estado compatível;
- `src/core/icr/coderRegistry.ts` — resolução por identidade externa;
- `src/core/types.ts` — persistência do contexto e procedência compartilhada;
- `src/main.ts` — contrato do perfil ativo / somente leitura;
- `src/pdf/pdfCodingTypes.ts` — procedência da Selection PDF;
- `src/pdf/pdfCodingModel.ts` — criação, lookup e guardas de propriedade;
- `src/pdf/pdfCodingMenu.ts` e surfaces de handles/popover — comunicação e bloqueio
  de edição;
- testes de importação, modelo PDF e migração de dados correspondentes.

Antes de editar, pesquisar todos os consumidores de `getActiveCoderId()`. A
mudança para suportar somente leitura tem alcance transversal; o primeiro slice
deve evitar quebrar a criação normal em Markdown, CSV, imagem, áudio e vídeo.

## Marco 2 — round-trip isolado de autoria

Este marco implementa apenas o contrato Qualia↔Qualia descrito em
`2026-09-02-qdpx-authorship-roundtrip-design.md`:

- [x] exportar Users referenciados;
- [x] emitir `creatingUser` em cada Coding;
- [x] persistir GUID REFI-QDA estável para coders locais participantes;
- [x] preservar a identidade externa dos coders importados;
- [x] reimportar o QDPX gerado e comparar Users, autoria e códigos;
- [x] validar manualmente no Qualia, sem consumir uma janela de acesso ao Atlas;
- [x] não fechar ainda a projeção PDF visual/textual ou multipágina.

Fechado em 2026-09-02. O checkpoint manual exportou uma contribuição local curta
em `Stable product teams`, reimportou-a em modo somente leitura e confirmou o
perfil externo `Default - marlon-teste` no trecho esperado e no Compare Coders.
A validação automatizada terminou com 109 testes focados e 3.660 testes na suíte
completa, além de build e `git diff --check` aprovados.

O ensaio também tornou mensurável uma limitação já pertencente ao round-trip PDF:
o D1 tinha 113 markers no estado de origem, mas apenas 33 PlainTextSelections
foram emitidas. Diferenças de hifenização, ligaturas, espaços ao redor de
pontuação e caracteres de substituição fazem `resolveMarkerOffsets` pular
markers que o importer havia ancorado por contexto. Isso não altera a conclusão
do contrato isolado de autoria para as seleções emitidas, mas impede qualquer
alegação de cobertura PDF completa antes do Marco 6.

## Marco 3 — conteúdo completo e marker multipágina por coder

Desenho detalhado aprovado em
[`2026-09-02-qdpx-multipage-marker-design.md`](2026-09-02-qdpx-multipage-marker-design.md).

Decisão explícita sobre handles: o Marco 3 não implementa resize multipágina.
Markers multipágina permanecem selecionáveis e editáveis em código/memo/exclusão
quando pertencem ao coder ativo, mas seus handles de resize ficam desabilitados.
A direção futura é expor apenas o início do primeiro segmento e o fim do último;
atravessar, criar ou remover páginas durante drag exige um desenho de interação
separado. Markers de uma página preservam o comportamento atual.

- [x] resolver cada citação no fluxo concatenado das páginas do grupo;
- [x] projetar início e fim para todos os fragmentos locais, eliminando o corte
  legado de aproximadamente 160 caracteres;
- [x] definir `segments[]` como geometria do marker lógico PDF;
- [x] migrar cada grupo QDPX por coder, não por Selection compartilhada;
- [x] manter código, memo, autoria e procedência uma única vez por marker do coder;
- [x] adaptar consumidores sem contar segmentos como markers independentes;
- [x] validar os seis casos reais e os doze markers manuais `marlonnn`;
- [x] não remover cabeçalhos, rodapés, tabelas ou legendas do fluxo textual.

Fechado em 2026-09-02: 456 testes focados em 21 arquivos, suíte completa com
3.708 testes em 266 arquivos e build de produção aprovados. O corpus confirmou 6
grupos, 18 markers lógicos, 36 segmentos e 35 aplicações. Resize multipágina
permanece deliberadamente adiado; margin panel é Marco 4, exporter é Marco 6 e
interoperabilidade Atlas é Marco 7.

## Marco 4 — margin panel mínima correta

- [x] desenhar uma rail por marker do coder × código;
- [x] projetar a rail por todos os segmentos do marker;
- [x] reservar lane consistente entre páginas;
- [x] atravessar o vão usando o overlay externo já existente;
- [x] produzir um rótulo por marker do coder × código;
- [x] identificar autoria;
- [x] propagar hover e clique para todos os segmentos;
- [x] preservar handles de markers simples do perfil ativo e manter resize
  multipágina deliberadamente desabilitado;
- [x] preservar integralmente o comportamento de markers de uma página.

Fechado em 2026-09-02. O checkpoint visual no corpus já importado confirmou em
D8 `People downstream`, páginas 6–7, rails independentes para JD e JEPM,
continuidade pelo vão entre páginas e um único dot/label no centro global. O
usuário aceitou esse caso representativo como suficiente para o fechamento; os
outros cinco casos não foram reinspecionados visualmente nesta rodada.

A verificação terminou com 131 testes focados em 13 arquivos, suíte completa com
3.727 testes em 271 arquivos, type-check, build e `git diff --check` aprovados.
Uma revisão independente encontrou e levou à correção da sincronização inicial
de scroll e da invalidação por resize/sidebar; a revisão corretiva não encontrou
novos problemas. Resize/handles multipágina continuam fora do escopo. Nenhuma
mudança de redesign, exporter ou integração Atlas entrou no diff.

## Marco 5 — redesign posterior da margin panel

Somente após fidelidade de dados e multipágina funcional no Qualia:

- [ ] reavaliar o modelo de colunas/tracks;
- [ ] separar posicionamento de rails e labels;
- [ ] tratar saturação vertical e limites da página;
- [ ] avaliar filtros por coder;
- [ ] avaliar compactação visual `×N` e sua expansão;
- [ ] decidir a interação entre markers exatamente sobrepostos;
- [ ] manter qualquer agregação como projeção reversível, nunca fonte de verdade.

## Marco 6 — round-trip PDF completo Qualia↔Qualia

- [ ] tornar a resolução do exporter tolerante à hifenização, ligaturas,
  pontuação espaçada e caracteres de substituição, reutilizando a provenance de
  contexto quando disponível;
- [ ] impedir descarte silencioso e comparar contagem/cobertura entre markers de
  origem e Selections emitidas;
- [ ] reconstruir `PDFSelection + PlainTextSelection` para markers textuais;
- [ ] preservar ou gerar GUIDs de Coding coerentes para as duas representações;
- [ ] projetar `segments[]` em fragmentos PDF por página;
- [ ] emitir relações `continued by` e procedência necessária;
- [ ] reagrupar markers irmãos somente quando a geometria continuar compatível;
- [ ] exportar markers divergentes como Selections independentes;
- [ ] reimportar o pacote e comparar Users, autoria, códigos, bounds e segmentos;
- [ ] validar colaboração entre pessoas usando apenas vaults Obsidian, sem
  depender de software ou conta externa.

O Marco 6 fecha o contrato de produto local-first. Ele só termina quando um
pacote produzido pelo Qualia pode ser importado em outro vault Qualia sem perda
de markers, autoria, códigos ou geometria. Aceitação por ferramentas externas não
é critério de conclusão deste marco.

## Marco 7 — interoperabilidade Atlas

- [ ] abrir no Atlas um pacote que já passou integralmente pelo Marco 6;
- [ ] validar no Atlas seleções PDF simples e multipágina;
- [ ] adaptar particularidades externas de `PDFSelection + PlainTextSelection`,
  GUIDs duplicados e relações `continued by` sem enfraquecer o contrato interno;
- [ ] usar uma única janela de acesso ao Atlas para validar simples e multipágina;
- [ ] editar no Atlas, exportar de volta e confirmar o ciclo no Qualia.

Falhas descobertas aqui são incompatibilidades externas e formam iterações do
Marco 7. Elas não reabrem automaticamente a paridade Qualia↔Qualia já aprovada no
Marco 6, salvo quando revelarem perda real no formato interno compartilhado.

## Pontos que continuam abertos

Estes itens não bloqueiam o Marco 3, exceto se aparecerem diretamente durante sua
implementação:

- forma visual exata do indicador de autoria no painel atual;
- persistência da identidade ativa por projeto versus por vault;
- política completa para Codings sem `creatingUser` fora do corpus Atlas real;
- formato exato da procedência externa no schema persistido;
- regra detalhada de regroup no exporter após divergência parcial de bounds, a
  decidir apenas no Marco 6;
- interação final entre vários markers exatamente sobrepostos;
- posição do rótulo de uma rail multipágina quando o centro cai entre páginas.

Se uma dessas decisões alterar a semântica aprovada, parar e discutir antes de
implementar. Se for apenas escolha interna reversível dentro do Marco 3, registrar
a decisão no commit correspondente.

## Limites de trabalho

- Não reabrir tentativa e erro no resolver geral.
- Não alterar markers simples sem evidência de regressão.
- Não assumir que divergência manual é erro do browser.
- Não implementar saneamento de cabeçalhos, rodapés ou tabelas.
- Não usar o comportamento do Atlas como obrigação quando ele conflitar com o
  modelo individual por coder decidido para o Qualia.
- Não esconder perda de dados com agregação visual.
- Não começar o redesign completo da margin panel dentro dos Marcos 1–4.
- Não declarar interoperabilidade Atlas concluída antes do Marco 7.

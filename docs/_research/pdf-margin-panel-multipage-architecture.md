# Margin panel PDF e marcadores multipágina — arquitetura e opções

> Levantamento de 2026-09-01. Este documento complementa
> `qdpx-atlas-multipage-diagnostic.md`: primeiro registra o painel como ele existe,
> depois avalia formas de incorporar marcadores multipágina. Ainda não é uma spec
> aprovada nem autoriza implementação.

> **Leitura posterior:** o arquivo
> `qdpx-atlas-coder-roundtrip-margin-panel.md` acrescenta a dimensão multicoder e
> corrige uma premissa incompleta deste documento: uma seleção pode conter várias
> aplicações do mesmo código, cada uma criada por uma pessoa diferente. A unidade
> lógica multipágina precisa preservar essa autoria; não basta agrupar geometria.
> A decisão posterior é normalizar uma Selection multicoder importada em um marker
> independente por coder. O vínculo com a Selection original registra procedência,
> mas não sincroniza geometria ou edição entre esses markers.

## Ordem e fontes da investigação

Antes do código, foram consultadas as fontes documentais do repositório e do vault:

- `docs/ARCHITECTURE.md`, especialmente a decisão por barras de margem;
- `docs/TECHNICAL-PATTERNS.md`, seção “Margin Panel Page Push”;
- `ui_survey.md`, seção da instrumentação PDF;
- `demo/2026-02-19_v35.3-pdf-margin-panel-undo-redo/test-note.md`;
- documentação histórica solta em
  `obsidian-qualia-coding/plugin-docs/HISTORY.md`;
- snapshot histórico
  `plugin-docs/archive/legacy-snapshot-2026-03-03/legacy-CLAUDE.md`;
- `plugin-docs/research/CodeMarker Suite — Project Overview.md`;
- timeline histórica que identifica a introdução do painel, do overlay e da
  captura cross-page como passos separados.

O histórico é consistente:

1. o painel PDF nasceu como uma adaptação por página do painel MAXQDA-style;
2. o overlay externo e o “page push” foram introduzidos para evitar clipping dos
   rótulos e sincronizar a margem com a rolagem;
3. a documentação antiga ainda tratava seleção cross-page como limitação;
4. a captura multipágina foi adicionada depois, dividindo a seleção em markers
   independentes, sem redesenhar o modelo ou o painel.

Portanto, a duplicação atual não é um erro isolado de CSS. É a consequência de uma
feature multipágina ter sido apoiada sobre uma arquitetura originalmente local a
cada página.

## Como o margin panel funciona hoje

### Visão geral

Para cada página carregada do PDF, o observer executa este fluxo:

1. busca os markers cujo `fileId` e `page` correspondem à página;
2. resolve, quando necessário, índices pendentes de imports;
3. desenha os highlights no interior da página;
4. calcula os limites verticais de cada marker;
5. cria uma barra para cada combinação marker × código;
6. distribui essas barras em colunas sem sobreposição;
7. cria um rótulo para cada barra;
8. monta um painel com a altura daquela página;
9. move esse painel para um overlay externo sincronizado com a rolagem.

O resultado visual parece um único margin panel, mas internamente ele é uma coleção
de painéis independentes — um por página carregada.

### O overlay “Page Push”

O PDF viewer possui um container de rolagem. O plugin abre espaço à esquerda dele
e insere, fora desse container, um overlay com a área de barras e rótulos. Um
scroller interno recebe a transformação inversa do `scrollTop`, mantendo painel e
páginas alinhados durante a rolagem.

Cada painel de página é reposicionado nesse overlay com:

- topo igual à posição vertical da página dentro do viewer;
- altura igual à altura da página;
- borda direita encostada no PDF.

Essa arquitetura é uma vantagem para o multipágina: todos os painéis já acabam no
mesmo sistema vertical de coordenadas. Logo, é tecnicamente possível desenhar um
conector no vão entre duas páginas sem modificar o PDF.js e sem desenhar por cima
do canvas do PDF.

### Barras e múltiplos códigos

Existe uma barra para cada código aplicado a cada marker. Uma barra contém:

- linha vertical;
- tick superior;
- tick inferior;
- ponto no meio;
- rótulo com o nome do código.

O comportamento de múltiplos códigos já é o contrato do painel e deve permanecer:
códigos diferentes ocupam barras/colunas paralelas. A frente multipágina não deve
alterar esse comportamento para markers normais.

### Colunas

As colunas são calculadas separadamente em cada página. Barras que se sobrepõem
verticalmente não podem ocupar a mesma coluna; as maiores recebem prioridade.

Embora os painéis possam ter larguras diferentes, a conta horizontal os alinha
pela borda junto ao PDF. Assim, “coluna 0” de páginas diferentes coincide
visualmente. O problema é que hoje nada garante que dois segmentos do mesmo grupo
multipágina recebam o mesmo número de coluna: cada página decide isoladamente,
considerando os outros markers presentes nela.

Para uma zebra reta e contínua, o mesmo marker/código precisa reservar uma coluna
compatível em todas as páginas do seu alcance. Este é o principal problema de
layout; desenhar a linha no vão é a parte simples.

### Rótulos

Cada página cria um rótulo por barra e resolve colisões apenas entre os rótulos
daquela página. Por isso dois fragmentos persistidos como markers independentes
produzem dois rótulos.

Uma apresentação multipágina real precisa distinguir:

- os vários segmentos geométricos necessários para desenhar;
- a única combinação lógica marker × código que deve produzir interação e
  apresentação.

A posição exata do rótulo único ainda é uma decisão de UX. Usar o centro matemático
do alcance inteiro pode colocar o rótulo no vão entre páginas. Alternativas mais
robustas são ancorá-lo no primeiro segmento visível ou calcular o centro e
ajustá-lo para o segmento textual mais próximo. Isso deve ser validado visualmente,
sem mudar o comportamento dos markers de uma página.

### Eventos e identidade

Linha, ticks, ponto e rótulo carregam `markerId` e `codeName`. Hover, clique,
abertura do detalhe e exibição dos handles são propagados a partir desse ID.

Se os segmentos multipágina compartilharem uma identidade lógica, o hover pode
acender todos eles naturalmente. Hoje, porém, cada fragmento tem ID próprio; por
isso interação, remoção, memo, magnitude, relations e navegação continuam
separados.

### Renderização lazy

Somente páginas carregadas são renderizadas. Esse comportamento é necessário para
PDFs grandes. Um marker multipágina deve degradar progressivamente:

- desenhar o segmento da página que já está pronta;
- completar a zebra e o outro segmento quando a página adjacente carregar;
- não exigir renderização ansiosa do documento inteiro.

As posições gerais das páginas existem no viewer, mas os limites exatos do texto
dependem do text layer. A continuidade precisa aceitar atualização incremental.

## Por que “resolver os fragmentos agora” não depende do novo margin panel

O importador já identifica os seis grupos Atlas/QDPX e persiste em cada fragmento:

- um `groupId` comum;
- o papel `anchor` ou `continuation`;
- a lista ordenada dos GUIDs relacionados.

Isso é suficiente para um resolver dedicado tratar o texto como uma citação que
atravessa páginas, em vez de procurar a mesma citação longa isoladamente dentro de
cada página.

O princípio correto é:

1. obter, em ordem, o texto linear das páginas do grupo;
2. localizar a citação uma vez no fluxo concatenado;
3. projetar o início e o fim encontrados de volta para cada página;
4. preencher os índices locais dos fragmentos;
5. renderizar cada fragmento pelo caminho de highlight já existente.

Isso preserva cabeçalhos, rodapés e tabelas tal como aparecem no fluxo linear e
elimina a dependência do limite legado de 160 caracteres.

Portanto, completar primeiro a renderização dos imports multipágina, ainda com
dois registros e rótulos temporariamente duplicados, é viável e produz valor real.
O novo margin panel não é pré-requisito para essa etapa.

## Tamanho real da mudança para um marcador lógico

O desenho visual é apenas um consumidor. Hoje `PdfMarker` pressupõe exatamente uma
página e um intervalo. Essa premissa também aparece em:

- criação e busca de markers;
- popover e aplicação/remoção de códigos;
- memo, magnitude e relations;
- drag handles;
- navegação;
- sidebar;
- analytics;
- exportação tabular;
- exportação QDPX;
- infraestrutura de ICR/reconciliação.

Alterar diretamente `PdfMarker` para conter múltiplos segmentos é conceitualmente
limpo, mas tem uma superfície grande. Fazer apenas o painel fingir que dois markers
independentes são um resolveria a duplicação visual, mas deixaria contagens,
edições, memos, exportações e sidebar semanticamente duplicados.

“Um marcador lógico”, neste documento, deve ser lido como **uma unidade por
coder**. Se quatro pessoas aplicaram códigos à mesma Selection Atlas, o Qualia terá
quatro markers lógicos independentes. Cada um pode ter seus próprios `segments[]`.
Eles podem compartilhar um identificador de procedência para round-trip, mas a
edição de handles, códigos ou memo de um nunca altera os outros.

## Abordagens consideradas

### A. Somente unir visualmente os markers existentes

O painel reconheceria `groupId`, esconderia rótulos repetidos e desenharia um
conector entre as páginas.

Vantagens:

- menor mudança imediata;
- demonstra rapidamente a zebra contínua.

Limitações:

- os códigos continuam sendo aplicações duplicadas;
- remover ou editar um fragmento pode divergir do outro;
- sidebar, analytics, memo, magnitude, relations e exports continuam contando
  duas unidades;
- cria uma aparência de unidade sem uma unidade real.

Conclusão: serve no máximo como protótipo visual descartável. Não é recomendada
como arquitetura final.

### B. Manter segmentos internos vinculados por uma identidade lógica

Os dados ainda podem usar registros locais por página, mas eles deixam de ser
markers independentes: passam a pertencer explicitamente a uma unidade lógica com
códigos e metadados comuns. Todos os consumidores enxergam a unidade lógica; o
renderer enxerga os segmentos.

Vantagens:

- preserva a geometria por página;
- exportação QDPX continua capaz de emitir os fragmentos que o formato espera;
- permite migração gradual.

Riscos:

- se códigos, memo e metadados continuarem copiados em cada segmento, a
  sincronização vira uma fonte permanente de divergência;
- exige uma camada de acesso canônica para impedir que consumidores contem os
  segmentos como markers.

Conclusão: viável se “vinculados” significar uma única entidade de domínio com
segmentos subordinados, não apenas markers duplicados que compartilham uma tag.

### C. Um `PdfMarker` lógico com `segments[]`

O marker guarda uma única identidade, códigos e metadados. A geometria passa a ser
uma lista ordenada de segmentos `{ page, beginIndex, beginOffset, endIndex,
endOffset, text }`. Markers atuais de página única são lidos como uma lista de um
segmento.

Vantagens:

- corresponde diretamente à intenção do usuário;
- código, memo, magnitude, relation, hover e clique têm uma única fonte;
- sidebar e analytics contam uma unidade;
- o renderer continua desenhando localmente por página.

Custos:

- requer adaptar os consumidores de `page/begin/end`;
- exportadores precisam projetar a unidade de volta para representações por
  página;
- ICR precisa decidir como representar bounds cross-page;
- drag handles precisam atuar apenas no início do primeiro segmento e no fim do
  último, ou ter uma regra explícita.

Conclusão: é o modelo final mais claro. Deve ser introduzido por helpers e leitura
retrocompatível, não por uma quebra brusca do schema.

## Sequência recomendada

> **Atualização posterior:** a descoberta da perda de autoria no importer adicionou
> uma etapa anterior obrigatória. A sequência ativa completa está em
> `../superpowers/specs/2026-09-01-qdpx-multicoder-import-design.md`.

### Etapa 0 — preservar autoria multicoder nas seleções de uma página

Antes de criar a unidade multipágina, o importer precisa ler Users e Codings,
gerar markers independentes por coder e introduzir o contexto somente leitura /
perfil ativo. Esse recorte usa apenas seleções de uma página e mantém o painel
atual. Ele impede que o novo modelo multipágina seja construído sobre aplicações
de código já colapsadas.

### Etapa 1 — completar o conteúdo Atlas/QDPX multipágina

Escopo estrito:

- somente markers com hint multipágina QDPX;
- resolver o texto no fluxo concatenado das páginas do grupo;
- preencher todos os segmentos locais;
- manter temporariamente os registros e rótulos duplicados;
- validar manualmente os seis pares já conhecidos;
- não tocar no margin panel geral.

Essa etapa responde diretamente à incompletude atual e gera uma base geométrica
confiável para o painel futuro.

### Etapa 2 — introduzir a unidade lógica multipágina

Criar uma representação canônica de marker com segmentos, preferencialmente o
modelo C ou uma implementação do modelo B que seja semanticamente equivalente.

Fazer a migração por uma camada de compatibilidade:

- marker legado = um segmento implícito;
- grupo QDPX existente = uma unidade lógica por coder, com segmentos ordenados;
- nova seleção manual multipágina já nasce como uma unidade;
- códigos e metadados passam a existir uma única vez.

Adaptar primeiro model, popover, sidebar, analytics e export; só depois declarar a
unidade como contrato estável.

### Etapa 3 — zebra contínua e rótulo único

Com a identidade lógica pronta:

- calcular barras por segmento, mas agrupá-las por marker lógico e código;
- reservar a mesma coluna em todas as páginas abrangidas;
- suprimir ticks internos entre páginas;
- desenhar o conector no overlay externo através do vão;
- produzir um único rótulo lógico;
- propagar hover/clique para todos os segmentos;
- manter intacto o layout dos markers de página única e de múltiplos códigos.

O “rótulo único” desta etapa significa um rótulo por combinação marker do coder ×
código, não um colapso definitivo das aplicações de várias pessoas. Todos os
markers permanecem visíveis por padrão e somente os do perfil ativo são editáveis.
Uma eventual apresentação compacta `×N` será uma camada visual posterior.

### Etapa 4 — validação e testes

Conforme a decisão de trabalho desta frente, primeiro validar funcionalmente no
vault real. Depois que o comportamento estiver correto, consolidar testes para:

- projeção texto concatenado → segmentos;
- migração/compatibilidade do modelo;
- operações atômicas de código e memo;
- contagem única em sidebar/analytics;
- exportação QDPX dos segmentos;
- alocação estável de colunas e rótulo único.

## Recomendação final desta análise

Separar “conteúdo completo” de “representação única” é a abordagem com melhor
relação entre risco e progresso.

A Etapa 1 pode e deve ser feita antes da nova interface: ela é isolável, apoiada
pelos seis casos reais e não exige fingir que a arquitetura final já existe. Em
seguida, a unidade lógica deve ser resolvida no modelo antes de maquiar o painel.
Só então a zebra contínua e o rótulo único se tornam uma consequência consistente,
e não uma exceção visual frágil.

O fato de o overlay já ser global reduz bastante o risco da Etapa 3. O maior custo
está na Etapa 2, porque “um marker” precisa significar uma unidade em todos os
lugares, não apenas na margem do PDF. No cenário multicoder, essa unidade continua
sendo individual por coder; procedência compartilhada não transforma vários
markers em uma entidade editável coletiva.

# Qualia Coding — Levantamento Geral de Interfaces (UI)

Este documento apresenta o mapeamento completo e detalhado de todas as interfaces de usuário do plugin **Qualia Coding** (QDA para Obsidian). O objetivo deste levantamento é apoiar o planejamento de refatoração, identificando cada elemento visual, controles e fluxos de interação atuais.

---

## Índice das Vistas
- [[#1. Painéis Laterais & Navegação (ItemViews)]]
- [[#2. Dashboards Analíticos (ItemViews)]]
- [[#3. Ferramentas de Colaboração & ICR (ItemViews)]]
- [[#4. Camadas de Codificação Inline (Mídia / Editores)]]
- [[#5. Modais & Diálogos (Obsidian Modals)]]
- [[#6. Popovers & Menus Flutuantes]]

---

## 1. Painéis Laterais & Navegação (ItemViews)

### A. Unified Code Explorer View
* **Arquivo Base:** `src/core/baseCodeExplorerView.ts` / `src/core/unifiedExplorerView.ts`
* **Função:** Fornecer uma visualização em árvore dos códigos definidos, os arquivos nos quais eles são aplicados e a listagem dos segmentos (markers) codificados. Também inclui a seção de Smart Codes.

#### Elementos e Controles:
1. **Botão "Collapse All" (Ícone `chevrons-down-up` / `chevrons-down-up`):**
   - *Tipo:* Botão de barra de ferramentas (`ExtraButtonComponent`).
   - *Ação:* Alterna entre colapsar ou expandir todos os nós de código e Smart Codes no nível raiz.
2. **Botão "Collapse Files" (Ícone `list-chevrons-down-up` / `list-chevrons-down-up`):**
   - *Tipo:* Botão de barra de ferramentas (`ExtraButtonComponent`).
   - *Ação:* Alterna entre colapsar ou expandir apenas os nós de arquivos que contêm os segmentos.
3. **Filtro de Busca ("Filter codes..."):**
   - *Tipo:* Campo de texto com busca integrada (`SearchComponent`).
   - *Ação:* Filtra os códigos da árvore por substring (com debounce de 150ms), preservando o contexto hierárquico (exibe ancestrais mesmo se não baterem com a busca).
4. **Botão "Refresh" (Ícone `refresh-cw`):**
   - *Tipo:* Botão de barra de ferramentas.
   - *Ação:* Força o re-processamento dos índices e renderização manual da árvore.
5. **Indicador de Hidratação Lazy ("Hydrating previews..."):**
   - *Tipo:* Div de texto dinâmico.
   - *Ação:* Exibe o progresso de leitura em background dos previews de texto de arquivos não carregados localmente (e.g. Parquet/CSV remotos).
6. **Grupo Principal de Códigos (Árvore Hierárquica):**
   - *Nó de Código (Raiz / Nível 1):* Row clicável com chevron de colapso, cor indicadora (*swatch*), nome do código e contador de frequência de uso.
   - *Nó de Arquivo (Nível 2):* Sub-row clicável com nome abreviado do arquivo (`fileId`) e contador de markers naquele arquivo específico.
   - *Lista Virtual de Segmentos (Nível 3):* Lista scrollável de alta performance (virtualizada, altura máxima baseada no viewport) exibindo o texto de preview de cada marker. Clicar no preview navega até a mídia correspondente.
7. **Seção de Smart Codes (⚡ Smart Codes):**
   - *Header da Seção:* Toggle clicável que colapsa/expande todo o grupo de Smart Codes ativos.
   - *Nó de Smart Code:* Row com chip de cor, nome da query dinâmica e número total de correspondências (*matches*).
   - *Sub-nós de Arquivo e Segmento:* Estrutura idêntica à de códigos regulares, renderizada a partir do cache de queries (`SmartCodeCache`).
8. **Rodapé Estatístico:**
   - *Tipo:* Texto estático.
   - *Ação:* Exibe contadores globais consolidando códigos, segmentos e Smart Codes ativos no painel.

---

### B. Unified Code Detail View
* **Arquivo Base:** `src/core/baseCodeDetailView.ts` / `src/core/unifiedDetailView.ts`
* **Função:** Visualização contextual que alterna dinamicamente entre o livro de códigos (**List Mode**), o detalhe de um código selecionado (**Code Detail**), o detalhe de um segmento específico (**Marker Detail**), uma relação (**Relation Detail**) ou uma query inteligente (**Smart Code Detail**).

#### B1. List Mode (Codebook Tree)
* **Função:** Organização profunda do codebook com suporte a pastas, grupos e operações em massa.

##### Elementos e Controles:
1. **Painel de Grupos (Chips de Grupos):**
   - *Tipo:* Barra de chips clicáveis no topo da lista.
   - *Ação:* Permite filtrar toda a árvore por um Code Group categórico (N:N). Inclui botão para criar novo grupo diretamente.
2. **Opções de Ordenação / Modo Drag:**
   - *Tipo:* Controles da árvore.
   - *Ação:* Alternam o comportamento do Drag and Drop entre **Reorganize** (reparentar e reordenar) ou **Merge** (fundir códigos arrastando um sobre o outro).
3. **Árvore do Codebook (FlatTree):**
   - *Nó de Pasta (Virtual Folder):* Ícone de pasta, nome da pasta (virtual, sem relação com pastas de arquivos reais), chevron de colapso e menu de contexto exclusivo.
   - *Nó de Código:* Chevron de colapso (se possuir filhos), cor do código, nome, contador de frequência direta/agregada.
4. **Interações e Seleção Múltipla:**
   - *Seleção:* `Cmd/Ctrl + Click` para selecionar múltiplos códigos de forma descontínua; `Shift + Click` para selecionar intervalos visíveis.
   - *Menu de Contexto de Massa:* Ao clicar com botão direito sobre códigos selecionados, exibe opções para: renomear em bloco, mudar cor em bloco, mover para pasta, associar a grupo ou deletar em massa.
   - *Menu de Contexto Individual:* Permite adicionar código filho, renomear, re-colorir, mover para pasta virtual, fundir (*merge*), deletar ou exportar histórico.

#### B2. Code Detail Mode
* **Função:** Foco analítico em um único código do codebook.

##### Elementos e Controles:
1. **Barra Superior Contextual:**
   - *Botão Voltar (Ícone `arrow-left`):* Retorna ao modo de lista geral.
   - *Badge de Cor:* Swatch editável.
   - *Título:* Exibe o nome do código.
   - *Ação "Open Memo":* Abre editor de notas de reflexão qualitativa.
   - *Ação "Export History":* Cria/abre uma nota markdown com o diário de auditoria do código.
2. **Seção de Relações (Code Relations):**
   - *Tipo:* Lista de chips.
   - *Ação:* Exibe conexões semânticas explícitas com outros códigos (e.g. "causa", "associa-se").
3. **Timeline de Histórico (Auditoria):**
   - *Tipo:* Timeline colapsável.
   - *Ação:* Lista logs históricos (criação, fusão, rebatismo, modificação de descrição) com opção de ocultar registros ou re-exibir.
4. **Lista de Segmentos Associados (Markers):**
   - *Tipo:* Virtual list com scroll.
   - *Ação:* Mostra trechos de texto, tempo de vídeo ou páginas PDF. Passar o mouse destaca o marker na mídia ativa; clicar abre o arquivo e rola até a anotação.

#### B3. Marker Detail Mode
* **Função:** Visualização e edição fina de um segmento de dados selecionado.

##### Elementos e Controles:
1. **Bloco de Preview de Conteúdo:**
   - *Tipo:* Blockquote textual ou prévia visual da região selecionada.
2. **Formulário de Codificação Rápida:**
   - *Tipo:* Input de tags com autocomplete.
   - *Ação:* Adiciona ou remove múltiplos códigos ao segmento.
3. **Controle de Magnitude (Magnitude Picker):**
   - *Tipo:* Dropdown/Controle de valor.
   - *Ação:* Permite atribuir uma intensidade ao código naquele segmento (e.g., Baixa, Média, Alta), se configurado no código.
4. **Editor de Relações de Segmento:**
   - *Tipo:* Grid interativo.
   - *Ação:* Permite ligar o segmento a outros códigos através de arestas direcionadas ou associativas, adicionando memos específicos para a conexão.
5. **Editor de Memos Textuais:**
   - *Tipo:* Área de texto Markdown integrada com salvamento automático.

---

### C. Case Variables View
* **Arquivo Base:** `src/core/caseVariables/caseVariablesView.ts`
* **Função:** Painel lateral que exibe os metadados agregados aplicados aos arquivos da pesquisa qualitativa (Case Variables/Mixed Methods).

#### Elementos e Controles:
1. **Lista de Variáveis Cadastradas:**
   - *Nome da Variável:* Label identificador (ex: `idade`, `gênero`, `grupo_controle`).
   - *Tipo:* Indicador textual do tipo resolvido (`text`, `number`, `checkbox`, `date`, `datetime`).
   - *Frequência:* Quantidade de arquivos que possuem algum valor atribuído para aquela variável específica.

---

## 2. Dashboards Analíticos (ItemViews)

### A. Analytics View (20 Modos)
* **Arquivo Base:** `src/analytics/views/analyticsView.ts`
* **Função:** Interface para análise estatística, visualizações avançadas cruzando códigos, mídias e metadados.

#### Elementos e Controles:
1. **Barra de Ferramentas Superior:**
   - *Refresh (Ícone `refresh-cw`):* Recarrega dados consolidados de todas as fontes.
   - *Export PNG / Export CSV / Export XLSX / Export Markdown:* Exporta a análise ativa no formato selecionado (Markdown para Memos, XLSX para tabelas multi-tab, PNG para gráficos).
   - *Export/Import REFI-QDA:* Abre modais de interoperação padrão.
   - *Add to Board:* Adiciona um snapshot visual ou cartão KPI à mesa de pesquisa (Research Board).
2. **Painel de Configuração Lateral (Config Panel):**
   - *Filtro de Fontes:* Checkboxes para habilitar/desabilitar formatos específicos (Markdown, PDF Text, PDF Shapes, CSV, Imagens, Áudio, Vídeo).
   - *Dropdown de Modo Visual:* Alterna entre 20 visualizações (Dashboard, Frequência, Coocorrência, Word Cloud, Evolução, MDS, Dendrograma, etc.).
   - *Opções Locais do Modo:* Controles reativos que aparecem dinamicamente conforme o modo selecionado (e.g., slider de distância de corte no dendrograma, seleção de código focal em coordenadas polares, sliders de lag sequencial).
   - *Filtro de Códigos:* Lista com barra de pesquisa para marcar/desmarcar códigos individuais ou Smart Codes.
   - *Min Frequency:* Filtro numérico para descartar códigos com baixa amostragem.
   - *Filtro Case Variable:* Dropdowns encadeados para isolar a análise por perfil de caso (ex: `Sexo == Masculino`).
   - *Filtro Group:* Dropdown para restringir a análise aos códigos membros de um Code Group específico.
3. **Área Visual do Gráfico (Chart Area):**
   - *Cluster Filter Banner:* Exibe filtros ativos resultantes de análise de cluster (Q-mode) com botão para limpar filtro de cluster.
   - *Container Principal:* Renderiza o elemento de renderização correspondente (gráfico Chart.js, canvas interativo Fabric.js, ou listas de texto estruturado).

---

### B. Research Board View (Mesa de Pesquisa)
* **Arquivo Base:** `src/analytics/views/boardView.ts`
* **Função:** Tela de canvas infinito interativo (lousa de síntese qualitativa) que permite organizar, relacionar e esquematizar achados de pesquisa.

#### Elementos e Controles:
1. **Barra de Ferramentas de Mesa (Board Toolbar):**
   - *Ferramenta Select (Ponteiro):* Permite mover, escalar e selecionar nós.
   - *Ferramenta Sticky Note (Ícone Nota):* Permite inserir post-its coloridos clicando em espaços vazios.
   - *Ferramenta Arrow Link (Ícone Seta):* Permite criar setas direcionais conectando dois nós (primeiro clique no nó de origem, segundo no nó de destino).
   - *Ferramenta Pen Drawing (Pincel):* Habilita desenho livre com pincel de cor adaptativa (claro/escuro).
   - *Botões de Ação:* Deletar selecionados, Zoom In, Zoom Out, Zoom to Fit (centralizar conteúdo), Auto-Group (agrupa cartões em clusters usando algoritmo de proximidade de coocorrência), Save manual e Export SVG/PNG.
2. **Canvas Infinito (Fabric.js):**
   - *Área de Drop:* Aceita arrastar códigos diretamente do painel lateral (Code Explorer/Frequency) para criar **Code Cards** dinâmicos na tela.
   - *Nós de Nota Autoadesiva (Sticky Notes):* Cartões editáveis com dois cliques, suportando redimensionamento e cor de fundo personalizável.
   - *Nós de Snapshot (Snapshots):* Imagens de gráficos geradas a partir do Analytics View.
   - *Nós de Excertos (Excerpts):* Citações e trechos textuais arrastados do Text Retrieval.
   - *Nós de Código (Code Cards):* Cartões contendo o nome do código, descrição operacional, contador de markers e lista de arquivos de origem.
   - *Nós KPI (KPI Cards):* Cartões estatísticos de destaque (valor em tamanho gigante + label).
   - *Molduras de Cluster (Cluster Frames):* Retângulos de agrupamento lógico com rótulo dinâmico superior que envolvem blocos de cartões.
   - *Setas de Conexão (Arrows):* Linhas direcionadas ligando cartões, com suporte a texto de label centralizado sobre a reta.

---

## 3. Ferramentas de Colaboração & ICR (ItemViews)

### A. Unified Compare Coders View
* **Arquivo Base:** `src/core/icr/ui/unifiedCompareCodersView.ts`
* **Função:** Painel para cálculo de confiabilidade inter-codificadores (ICR) e tomada de decisão sobre divergências qualitativas.

#### Elementos e Controles:
1. **Barra Superior de Comparação:**
   - *Saved Banner:* Exibe o nome do arquivo de comparação salvo ativo, indicador de mudanças não salvas (*dirty dot*), e botões para Salvar Mudanças, Salvar como Nova e Desvincular.
   - *Overview Chips:* Alterna o painel superior entre os modos **Matriz** (coeficientes cruzados por dupla), **Tabela** (coeficientes por código) e **Heatmap** (divergência por arquivo/mídia).
   - *Drill-down Chips:* Alterna o painel inferior de análise fina entre **Spatial** (mapas de colisão visual), **Cards** (comparação textual/atributos) e **Workflow** (lista sistemática de conciliação).
   - *Controles de Métrica (Coefficient Picker):* Dropdowns para escolher o coeficiente principal (Cohen's Kappa, Fleiss' Kappa, Krippendorff's Alpha) e a métrica de distância para codificação multi-código (Jaccard, Masi, Nominal).
   - *Temporal Resolution:* Controle deslizante para ajustar a janela de tolerância de tempo (em segundos) ao comparar markers de áudio/vídeo.
   - *Chips de Filtro:* Filtro para ocultar total concordância, destacar conflitos, excluir consensus e alternar a visibilidade de codificadores individuais no cálculo.
2. **Painel Overview (Top/Left):**
   - *Visualizador Ativo:* Exibe a matriz, tabela ou heatmap. Clicar em células (dupla de codificadores), linhas (código específico) ou arquivos atualiza instantaneamente a seleção do painel de Drilldown abaixo.
3. **Painel Drilldown (Bottom/Right):**
   - *Spatial View:* Renderiza visualizadores de conflito visual para imagens/PDFs ou faixas horizontais de Waveforms (áudio/vídeo).
   - *Cards View:* Mostra cartões lado a lado representando as codificações individuais para o segmento sob análise, histórico de auditoria e botões para escolher o veredito consensual (Manter A, Manter B, Criar Consenso).
   - *Workflow View:* Tabela de controle que exibe a lista completa de conflitos ("Contested Regions"), dividida em abas (Resolvidos, Conflito Aberto, Sem Conflito), com botão de navegação rápida e ação para Exportar Relatório de Reconciliação em markdown.

---

### B. Unified ICR Import View
* **Arquivo Base:** `src/core/icr/contributions/unifiedIcrImportView.ts`
* **Função:** Painel para arrastar, inspecionar e conciliar contribuições de codificação vindas de outros pesquisadores antes de integrá-las definitivamente ao banco de dados do vault local.

#### Elementos e Controles:
1. **Rail Esquerdo (Lista de Contribuições & Drop Zone):**
   - *Drop Zone:* Área sensível a Drag & Drop para soltar arquivos JSON de exportação de contribuição.
   - *Lista:* Lista cartões das contribuições pendentes de importação, mostrando nome do arquivo de origem, codificador associado e status.
2. **Toolbar Principal de Importação:**
   - *Chips de Navegação:* Alternam a tela principal da contribuição ativa entre **Overview**, **Lado a Lado** (Side-by-Side) e **Por Código** (By Code).
3. **Painel de Exibição Ativa (Direita):**
   - *Overview Chip:* Mostra tabela de mapeamento de arquivos (Incoming vs Local) com status de hash (Matched, Missing, Overridden) e botões de remapeamento manual. Possui ações globais de rodapé: **Aplicar Contribuição** (Mescla definitiva no data.json) e **Descartar**.
   - *Side-by-Side Chip:* Visualizador comparativo que lista trecho por trecho. Mostra o segmento recebido e o local correspondente para inspeção manual. Inclui ações de rodapé para "Pular Marcador" e setas de navegação sequencial.
   - *By Code Chip:* Lista resumida de códigos importados com contadores (locais, sobrepostos, novos no codebook). Possui botões de ação rápida por linha de código: "Aceitar todos", "Pular todos" e "Revisar" (filtra o modo Lado a Lado para este código).

---

## 4. Camadas de Codificação Inline (Mídia / Editores)

### A. Markdown Gutter & Overlay (Margin Panel)
* **Arquivo Base:** `src/markdown/cm6/`
* **Função:** Barra lateral integrada ao editor de texto nativo (CodeMirror 6) do Obsidian que renderiza de forma visual as codificações sem modificar a nota.

#### Elementos e Controles:
1. **Margin Bars (Barras Verticais de Código):**
   - *Tipo:* Decorações verticais posicionadas ao lado do texto.
   - *Ação:* Barras coloridas que mostram visualmente a extensão do segmento codificado. Suporta múltiplos códigos no mesmo trecho (colunas paralelas de barras).
2. **Handle Overlay (Glow de Hover):**
   - *Tipo:* Overlay posicionado dinamicamente.
   - *Ação:* Destaca a região de texto ao passar o mouse sobre a barra correspondente no Margin Panel ou na Sidebar.
3. **Menu Tooltip Inline:**
   - *Tipo:* Tooltip CM6 nativo posicionado sobre a seleção de texto.
   - *Ação:* Fornece botões para adicionar códigos, remover ou acessar os metadados do segmento de forma contextual sem perder o foco visual da seleção do texto.

---

### B. PDF Coding View (Instrumentação do PDF Viewer)
* **Arquivo Base:** `src/pdf/`
* **Função:** Injeta decorações e caixas de seleção sobre o visualizador de PDF nativo do Obsidian.

#### Elementos e Controles:
1. **Barra de Desenho do PDF (Draw Toolbar):**
   - *Tipo:* Barra horizontal flutuante injetada no topo do visualizador de PDF.
   - *Ação:* Fornece botões para selecionar ferramentas de desenho (Text Highlight, Rectangle Draw, Ellipse Draw, Polygon Draw, Freehand Pen) e botão de configurações de visibilidade.
2. **Caixas de Destaque Espacial (BBoxes):**
   - *Tipo:* Elementos SVG desenhados sobre as páginas do PDF.
   - *Ação:* Delimitadores coloridos baseados em coordenadas de pontos ou porcentagens. Passar o mouse exibe alças de redimensionamento e o menu de codificação.
3. **Margin Panel Flutuante (PDF):**
   - *Tipo:* Painel lateral acoplado à página.
   - *Ação:* Renderiza colunas verticais correspondentes aos códigos aplicados na página ativa.

---

### C. CSV Coding View (AG Grid)
* **Arquivo Base:** `src/csv/csvCodingView.ts`
* **Função:** Tabela AG Grid de alta performance que substitui a exibição de arquivos CSV/Parquet nativos por uma interface tabular codificável.

#### Elementos e Controles:
1. **Cabeçalhos Injetados (Header Injection):**
   - *Tipo:* Célula de cabeçalho personalizada.
   - *Ação:* Permite filtrar colunas e visualizar metadados estatísticos.
2. **Células de Linha Codificáveis:**
   - *Tipo:* Custom Cell Renderer da AG Grid.
   - *Ação:* Destaca linhas ou células codificadas usando indicadores de cor de fundo e chips flutuantes. Clicar com o botão direito abre o menu de codificação para a célula/linha selecionada.
3. **Indicador de Paginação Lazy:**
   - *Tipo:* Barra de progresso inferior.
   - *Ação:* Mostra o progresso de consultas no DuckDB OPFS para grandes conjuntos de dados.

---

### D. Image Coding View (Fabric.js canvas)
* **Arquivo Base:** `src/image/views/imageView.ts`
* **Função:** Canvas de edição que envolve visualização nativa de imagens no Obsidian.

#### Elementos e Controles:
1. **Image Toolbar:**
   - *Tipo:* Barra de ferramentas flutuante.
   - *Ação:* Controles para alternar entre ferramentas de seleção (Select), retângulo (Rect), elipse (Ellipse), polígono (Polygon) e controles de zoom/pan (Zoom, Reset View).
2. **Regiões de Codificação Ativas:**
   - *Tipo:* Objetos gráficos Fabric.js com alças de transformação.
   - *Ação:* Retângulos, elipses ou contornos de polígonos coloridos desenhados sobre a imagem com legenda flutuante contendo os códigos aplicados. Passar o cursor destaca o contorno; clicar abre o popover de codificação.

---

### E. Audio/Video Coding View (WaveSurfer)
* **Arquivo Base:** `src/audio/audioView.ts` / `src/video/videoView.ts`
* **Função:** Painel contendo player multimídia com timeline de ondas sonoras e segmentação por faixas (lanes).

#### Elementos e Controles:
1. **Reprodutor de Vídeo Integrado (Apenas Vídeo):**
   - *Tipo:* Elemento HTML5 `<video>` no topo da vista com controles de proporção de tela (*fit*).
2. **Timeline de Forma de Onda (WaveSurfer.js):**
   - *Tipo:* Onda de áudio interativa.
   - *Ação:* Exibe faixas de tempo segmentadas. Permite arrastar os cantos dos segmentos para reajustar o tempo inicial/final.
3. **Faixas Verticais (Vertical Lanes):**
   - *Tipo:* Divisão horizontal paralela abaixo da onda.
   - *Ação:* Distribui segmentos com tempos sobrepostos em raias paralelas verticais diferentes para evitar sobreposição visual.
4. **Minimapa Temporal:**
   - *Tipo:* Linha do tempo resumida de rodapé.
   - *Ação:* Exibe marcações coloridas em miniatura de toda a extensão do arquivo de áudio/vídeo.

---

## 5. Modals & Diálogos (Obsidian Modals)

### A. Smart Code Builder Modal
* **Arquivo Base:** `src/core/smartCodes/builderModal.ts`
* **Função:** Diálogo visual para construção passo a passo de árvores sintáticas (AST) de consultas dinâmicas (Smart Codes).

#### Elementos e Controles:
1. **Header do Construtor:**
   - *Nome (Input de texto):* Campo para definir o nome da query.
   - *Cor (Picker HTML):* Seletor de cor para o rótulo do Smart Code.
   - *Memo (Botão):* Abre área de texto para documentação qualitativa da query.
2. **Árvore de Condições (Builder Body):**
   - *Operadores (Dropdown AND/OR/NOT):* Altera a operação lógica do grupo.
   - *Adicionar Condição (Botão `+ Condition`):* Cria uma nova folha de regra (*leaf*) abaixo do grupo atual.
   - *Adicionar Grupo (Botão `+ Group`):* Cria um novo bloco aninhado (AND/OR/NOT) criando regras complexas multinível.
   - *Botões de Remoção (Ícone `x`):* Remove nós ou grupos da query.
3. **Campos Adaptativos por Tipo de Regra (Rule Inputs):**
   - *hasCode:* Botão que abre modal de busca para escolher código regular.
   - *caseVarEquals:* Botão para escolher variável + campo de texto para o valor correspondente.
   - *inFolder:* Botão para escolher pasta virtual.
   - *inGroup:* Botão para escolher Code Group.
   - *engineType:* Dropdown para escolher formato (Markdown, PDF, CSV, etc.).
   - *textContains:* Campo de texto para termo + checkbox de Case Sensitive.
   - *smartCode:* Botão para escolher outra query inteligente existente (nesting).
4. **Footer de Resultados:**
   - *Indicador de Preview:* Exibe em tempo real (com debounce de 300ms) a contagem de markers batidos e em quantos arquivos eles aparecem.
   - *Ações:* Botões "Cancel" e "Save" (desabilitado se houver erros de árvore ou nome vazio).

---

### B. Smart Code Hub / List Modal
* **Arquivo Base:** `src/core/smartCodes/smartCodeListModal.ts`
* **Função:** Gerenciamento geral de todas as queries inteligentes cadastradas.

#### Elementos e Controles:
1. **Lista de Smart Codes (Painel Esquerdo):**
   - *Tipo:* Lista com scroll.
   - *Ação:* Lista todos os Smart Codes com nome, contagem de matches e botões para Editar, Duplicar ou Deletar.
2. **Painel de Detalhes da Query (Painel Direito):**
   - *Tipo:* Vista estruturada.
   - *Ação:* Exibe o predicate em formato de árvore legível, histórico de modificação da query, e lista de segmentos resultantes com navegação.

---

### C. Codebook Merge Modal
* **Arquivo Base:** `src/core/mergeModal.ts`
* **Função:** Painel interativo para configurar as políticas de fusão semântica de múltiplos códigos.

#### Elementos e Controles:
1. **Lista de Códigos de Origem:**
   - *Tipo:* Chips coloridos com contador de markers individuais afetados e botão `x` para desconsiderar código da fusão.
   - *Busca:* Input de texto com lista de autocomplete para encontrar e adicionar mais códigos à origem da mescla.
2. **Políticas de Resolução de Propriedades:**
   - *Name Selection (Radios):* Escolhe se o código consolidado herdará o nome do destino, de um dos códigos de origem, ou um nome customizado.
   - *Color Selection (Radios):* Escolhe herdar a cor do destino ou de uma das origens.
   - *Description / Memos Policy (Radios + Dropdowns):* Define o tratamento para textos: manter destino, concatenar todos os textos, manter apenas o de um código específico ou descartar tudo.
3. **Visualizador de Impacto (Preview):**
   - *Tipo:* Lista textual de avisos.
   - *Ação:* Mostra exatamente quantos markers serão remapeados, quantos códigos filhos serão reparentados e quais pastas virtuais/grupos serão afetados.

---

### D. Export / Import Modals
* **Arquivos Base:** `src/export/exportModal.ts` / `src/import/importModal.ts`
* **Função:** Configuração de entrada e saída de dados.

#### Elementos do Export Modal:
1. **Seletor de Formato (Radios):**
   - *Ação:* Escolhe entre **QDPX** (projeto REFI-QDA completo), **QDC** (apenas codebook XML) ou **Tabular CSV** (relacional para R/Python).
2. **Opções Adicionais:**
   - *Toggles:* Incluir arquivos originais no zip (sources), exportar coordenadas espaciais em JSON, incluir relações.
3. **Seção de Alertas:** Exibe limitações e avisos sobre aproximação de coordenadas em PDFs ou arquivos deletados no vault.

#### Elementos do Import Modal:
1. **Seletor de Arquivos:** Área para arrastar ou navegar até o arquivo XML/ZIP.
2. **Painel de Preview de Importação:** Mostra a contagem de códigos, arquivos e markers detectados no pacote.
3. **Dropdown de Resolução de Conflitos:** Define a ação quando um código já existe localmente (Merge, Sobrescrever ou Ignorar).

---

### E. Outros Modals Auxiliares
* **Materialize Memos Modal (`materializeAllMemosModal.ts`):** Exibe lista de checagem para converter memos internos do banco de dados em notas markdown reais no vault do Obsidian.
* **Column Toggle Modal (`columnToggleModal.ts`):** Checklist de colunas para exibição/ocultação rápida na AG Grid do CSV Coding View.
* **Compare Coder Coefficients Modal (`compareCoderCoefficientsModal.ts`):** Exibe matriz detalhada comparando os scores de Kappa/Alpha par a par com filtros de dispersão e relatórios descritivos.

---

## 6. Popovers & Menus Flutuantes

### A. Case Variables Properties Popover
* **Arquivo Base:** `src/core/caseVariables/propertiesPopover.ts`
* **Função:** Menu flutuante de edição rápida de metadados exibido diretamente no cabeçalho das notas markdown ou visualizadores de mídia.

#### Elementos e Controles:
1. **Lista de Propriedades Ativas:**
   - Renderiza as chaves e valores associados ao arquivo usando a mesma estrutura de inputs tipados do `PropertiesEditor` (toggles, números, calendários de data/hora e inputs de texto).
2. **Ações Rápidas:**
   - *Botão "Add":* Campo rápido para criar uma nova propriedade chave-valor associada ao arquivo.
   - *Botão "×":* Remove a variável da nota (exige clique em popover de confirmação de segurança).

---

### B. Code Visibility Popover
* **Arquivo Base:** `src/core/codeVisibilityPopover.ts`
* **Função:** Permite alterar a visibilidade de renderização de códigos de forma global ou apenas para a nota em edição ativa.

#### Elementos e Controles:
1. **Controles de Visibilidade:**
   - *Checkbox Global (Olho):* Oculta/mostra o código em todo o vault.
   - *Override local (checkbox):* Força a visibilidade daquele código especificamente no arquivo em foco atual, sem alterar a exibição padrão das outras notas.

---

### C. Menus de Contexto & Popovers de Codificação
1. **Unified Coding Popover (`CodingPopoverAdapter`):**
   - *Input com Autocomplete:* Adiciona novos códigos ao segmento em foco.
   - *Magnitude Selector:* Controles deslizantes/picker de intensidade.
   - *Grid de Relações:* Permite criar ou remover arestas semânticas de segmento.
   - *Textarea de Memo:* Espaço para notas de campo imediatas.
2. **Codebook Context Menu:**
   - Exibe opções de exclusão, rebatismo, movimentação estrutural e agrupamento categórico diretamente sobre os nós da árvore na barra lateral.
3. **Research Board Context Menu:**
   - Acionado com botão direito no canvas interativo; exibe opções para deletar elementos, alterar cores de sticky notes, renomear labels de conexões, editar conteúdo de texto ou trazer elementos para frente/trás (*layer ordering*).

# Worklog — CodeMarker v2

Registro de sessoes de trabalho, decisoes tomadas, e estado do desenvolvimento.

---

## Sessao: 2026-02-17 — Code Detail: Navegação Integrada (Fase 2, passo 3)

### O que foi feito

- `CodeDetailView` estendido com 3 modos de navegação no mesmo ItemView:
  - **Modo lista** (`showList()`) — todos os códigos com swatch, descrição e contagem de segmentos
  - **Detalhe code-focused** (`showCodeDetail()`) — todos os markers de um código cross-file
  - **Detalhe marker-focused** (`setContext()`) — comportamento existente, sem mudanças
- Botão "← All Codes" nos dois modos de detalhe → volta pra lista
- `getAllMarkers()` no model — retorna todos os markers de todos os arquivos
- `revealCodeExplorer()` em main.ts — abre CodeDetailView em modo lista
- Estilos CSS para a lista, rows, back button, file reference

### Decisões

1. **Dois modos no mesmo ItemView** — evita duplicação de views e mantém uma única leaf
2. **`getAllMarkers()` no model** — simples, itera o Map interno. Alternativa seria expor iterador
3. **Back button com `setIcon('arrow-left')`** — padrão Obsidian
4. **Command aponta pra `revealCodeExplorer()`** que usa `CODE_DETAIL_VIEW_TYPE` (não o explorer tree)

### Proximo passo

- Search/filter no Code Explorer
- Leaf View com codebook sidebar + text retrieval

---

## Sessao: 2026-02-17 — Code Explorer View (Fase 2, passo 2)

### O que foi feito

- `src/views/codeExplorerView.ts` — ItemView com árvore 3 níveis: Code → File → Segments
- Toolbar com 3 botões: All (expand/collapse codes), Files (expand/collapse files), Refresh
- Navegação: click no segmento → scroll editor até o marker
- Color swatches + contagens (flair) nos nós da árvore
- Footer com total de codes e segments

### Decisões de design: collapse independente por nível

4 métodos puros e simétricos:
- `expandAll()` / `collapseAll()` → só `codeNodes` (nível 1)
- `expandFiles()` / `collapseFiles()` → só `fileNodes` (nível 2)

**Problema UX:** files são filhos dos codes no DOM. Se codes estão fechados, expandir/colapsar files é invisível. Fix: o **handler do click** do botão Files verifica `isAllCollapsed()` e chama `expandAll()` antes, garantindo visibilidade. Os métodos continuam puros.

### Proximo passo

- Navegação integrada no Code Detail View (lista + detalhe)

---

## Sessao: 2026-02-16 — Code Detail Side Panel + Fix Stacked Labels

### O que foi feito

- `src/views/codeDetailView.ts` — ItemView na sidebar direita com detalhes do código + texto do marker
- Labels clicáveis no margin panel → abrem/atualizam sidebar
- Seções: Header (cor + nome), Description, Text Segment (blockquote), Other Codes (chips clicáveis), Other Markers (lista clicável + scroll)
- `revealCodeDetailPanel()` em main.ts — cria leaf ou atualiza existente
- Fix do bug de render loop do MutationObserver em labels empilhados (mesmo marker, múltiplos códigos)

### Bug encontrado e resolvido

Labels do mesmo marker (múltiplos códigos): primeiro click funciona, segundo falha. Causa: `revealLeaf()` rouba foco → CM6 remove `cm-focused` → MutationObserver dispara após suppression expirar → `renderBrackets()` entra em loop (self-trigger via innerHTML) → DOM destruído a cada frame → clicks falham.

Fix em 3 camadas:
1. `renderBrackets()` suprime self-mutations (`suppressMutationUntil = now+50`)
2. Click handler com fallback para hover state quando DOM foi rebuiltado
3. Removido `revealLeaf(existing)` — sidebar atualiza sem roubar foco

### Decisoes

1. **Sem `revealLeaf` no update** — sidebar já está visível, só precisa de `setContext()`
2. **Fallback hover state no click** — padrão defensivo contra DOM rebuilds (mesmo padrão do `applyHoverClasses`)
3. **Self-suppression no renderBrackets** — previne render loop que existia latente desde a implementação original

### Proximo passo

- Code Explorer completo (lista de todos os códigos com contagem + navegação)
- Leaf View com codebook sidebar + text retrieval

---

## Sessao: 2026-02-16 — Margin Panel Hover Bidirecional

### O que foi feito

- Hover bidirecional entre margin panel e editor (via `setHoverEffect` existente)
- Underline nos labels: bar/dot/tick hover → todos os labels; label hover → so aquele
- `detectElementType()` — identifica tipo de elemento na margem
- Fix do bug de race condition: `applyHoverClasses()` no final de `renderBrackets()`
- Mouse out limpa underlines + handles consistentemente

### Decisoes

1. **Reusar `setHoverEffect`** existente ao inves de criar novo efeito — mesmo padrao do `markerViewPlugin`
2. **Sem sticky handles** — mouse sai do elemento, tudo limpa (underline + handles)
3. **`hoveredElementType`** como campo separado para diferenciar comportamento de underline

### Bug encontrado e resolvido

O underline nunca aparecia porque: `applyHoverClasses()` adicionava a classe → `setHoverEffect` dispatch → `markerStateField` rebuild decorations → DOM muda → `MutationObserver` dispara → `renderBrackets()` faz `innerHTML = ''` → classes perdidas. Fix: chamar `applyHoverClasses()` ao final de `renderBrackets()`.

### Proximo passo

- Labels clicaveis — disparar acao ao clicar num label da margem

---

## Sessao: 2026-02-16 — Hover-to-Edit v0

### Contexto da discussao

Partindo da reflexao sobre expansao do plugin para plataforma QDA completa (ver ARCHITECTURE.md Partes 6-9), decidimos comecar pela interacao mais basica: **hover sobre highlights** para ver/editar codigos.

### Decisoes tomadas

1. **Reutilizar o mesmo menu (Approach C)** ao inves de criar tooltip separado — UX consistente, menos codigo
2. **Hover inteligente**: menu fica aberto enquanto mouse esta sobre highlight OU tooltip, com delay de 300ms no close para evitar flickering
3. **400ms delay** para abrir (evitar ativacoes acidentais)
4. **So codigos do marker** no hover (v1) — v0 mostra todos os codigos como o menu normal
5. **Delecao diferida** quando todos os toggles sao desligados (v1) — v0 usa comportamento padrao
6. **Arquivo isolado** (`hoverMenuExtension.ts`) para proteger codigo existente
7. **Git branch** `feat/hover-menu` para trabalhar sem risco

### O que foi implementado (v0)

**Arquivo novo:**
- `src/cm6/hoverMenuExtension.ts` — ViewPlugin com hover timer, close timer, mouse tracking via custom events

**Modificacoes minimas em existentes:**
- `src/menu/menuTypes.ts` — campo `hoverMarkerId?` no `SelectionSnapshot`
- `src/cm6/selectionMenuField.ts` — state type expandido (`TooltipFieldState`), skip auto-close no hover mode, custom events mouseenter/mouseleave no tooltip DOM
- `src/menu/cm6NativeTooltipMenu.ts` — skip auto-focus do input no hover mode
- `src/main.ts` — registrar `createHoverMenuExtension`

### Bugs encontrados durante teste

1. **Handle drag + hover menu**: Ao clicar nas barrinhas de drag-resize enquanto hover menu esta aberto, o menu continua visivel e a selection preview fica no lugar enquanto o handle se move. Solucao: tratar click em handle como mouse-out, fechando o hover menu.

### Proximos passos (v1)

- [ ] Filtrar menu para mostrar so codigos do marker no hover
- [ ] Delecao diferida (`suppressAutoDelete`) quando todos toggles sao desligados
- [ ] Esconder action buttons irrelevantes no hover mode
- [ ] Click no highlight → integracao com sidebar/explorer (futuro)
- [ ] Extrair `getMarkerAtPos` para util compartilhado (duplicado em markerViewPlugin e hoverMenuExtension)

---

## Sessao: 2026-02-16 — CodeDefinition Registry (Fase 1)

### O que foi feito

- `src/models/codeDefinitionRegistry.ts` — registry com identidade por codigo, paleta de 12 cores
- Auto-migracao de dados existentes (cores de markers → registry)
- Integracao com `codeMarkerModel.ts`

### Decisoes

- Paleta de 12 cores com contraste categorico (nao gradiente)
- `consumeNextPaletteColor()` atribui cores sequencialmente
- Registry serializado junto com data.json via `fromJSON()`

---

## Sessao: 2026-02-16 — Margin Panel MAXQDA-style

### O que foi feito

- `src/cm6/marginPanelExtension.ts` (539 LOC) — barras coloridas na margem
- 7 commits de refinamento (prototipo → layout unificado → labels dinamicos → alinhamento → overlap fix)

### Decisoes de layout

1. **Colunas por span:** barras maiores ficam mais a direita (perto do texto)
2. **Labels centrados:** collision avoidance com peso por tamanho da barra
3. **Deteccao RLL:** leitura da margem natural do plugin Readable Line Length
4. **MutationObserver:** detecta toggle de inline title (que nao dispara resize do CM6)

### Commits relacionados

```
29c9b95 Fix panel overlap when RLL is off and add label left margin
f79d808 Align margin panel to content edge with dynamic padding
10e1574 Dynamic label space: measure text width for panel sizing
e942152 MAXQDA-style bars: centered labels, filled dots, compact columns
e0c3648 Refactor margin panel: unified layout with dynamic label positioning
4d58f39 Fix margin panel not updating on inline title toggle
6643a4f Prototype: margin panel with MAXQDA-style colored brackets
```

---

## Sessao: 2026-02-16 — Selection Preview + Menu Simplification

### O que foi feito

- `codeFormModal.ts`: callback `onDismiss` (dispara em save e cancel)
- Selection preview durante modal via `setSelectionPreviewEffect`
- Modal reabre tooltip ao fechar (save ou cancel) — fluxo "parenteses"
- "Remove Code" + "Remove All Codes" unificados em "Remove Codes"

### Commit

```
be9d862 Selection preview during modal + reopen tooltip on close + unify remove buttons
```

---

## Referencia

- Plano detalhado: `.claude/plans/cached-wiggling-island.md`
- Arquitetura geral: `ARCHITECTURE.md`
- Regras de desenvolvimento: `CLAUDE.md`

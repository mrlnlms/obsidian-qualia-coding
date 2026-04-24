# Toggle Visibility por Código — Design

**Data:** 2026-04-24
**Status:** Design aprovado, pronto pra plano de implementação
**ROADMAP:** #1 (frente — solo)

---

## Contexto

Com 20+ códigos aplicados num mesmo doc, o editor vira "color soup" — highlights sobrepostos, cores difíceis de distinguir, dificuldade pra focar num recorte analítico. O per-code blending (2026-03-02, `opacity / N` + `mix-blend-mode: multiply`) reduziu a sobreposição visualmente, mas não resolve o caso de "quero ignorar um subconjunto de códigos durante esta análise".

Esta feature adiciona **toggle de visibilidade** em duas camadas:

1. **Global (sidebar)** — esconde/mostra um código em todos os docs
2. **Per-doc override (popover na view)** — exceção persistente por arquivo

Toggle é **visual-only** no editor. Analytics, export QDPX/CSV e consolidação de dados **não são afetados**.

---

## Decisões de design

| # | Decisão | Resposta |
|---|---------|----------|
| 1 | Mecanismo | 2 camadas complementares: global + per-doc override |
| 2 | Popover é | Bidirecional (liga e desliga qualquer código no doc) |
| 3 | Analytics | Não afetado — visibility é visual-only |
| 4 | Popover lista | Só códigos presentes no doc (com ≥ 1 marker) |
| 5 | Hierarquia | Flat (sem cascata de pai→filhos), pastas fora |
| 6 | UX sidebar | Eye icon sempre visível + row dimmed quando hidden |
| 7 | Schema | `hidden` no `CodeDefinition` + `visibilityOverrides` em data.json |
| 8 | Semântica override | **B — "exceção viva"** (self-cleaning quando coincide com global) |
| 9 | Marker totalmente oculto | Some totalmente do editor (A.1); "ghost cinza" no backlog |
| 10 | Render strategy | Pontual em 5 engines DOM-based; rebuild filtered no CM6 (natureza do framework) |
| 11 | E2E/visual regression | Pulados no MVP; smoke manual + unit suffice |

---

## Arquitetura

### Estado em dois níveis

**Global** — no `CodeDefinition`:

```ts
interface CodeDefinition {
  id: string;
  name: string;
  color: string;
  // ...existing fields
  hidden?: boolean;  // NEW — undefined/false = visível
}
```

**Per-doc overrides** — seção nova em `QualiaData`:

```ts
interface QualiaData {
  // ...existing sections
  visibilityOverrides: Record<fileId, Record<codeId, boolean>>;
}
```

- `fileId` = path do arquivo no vault (igual ao pattern dos markers)
- Valor `boolean` = estado efetivo "visible" (`true`) ou "hidden" (`false`) naquele doc
- Se não há entry `[fileId][codeId]` → herda do global

### Composição (helper único no registry)

```ts
registry.isCodeVisibleInFile(codeId: string, fileId: string): boolean {
  const override = data.visibilityOverrides[fileId]?.[codeId];
  if (override !== undefined) return override;
  return !registry.getCode(codeId)?.hidden;
}
```

Esse é o **único ponto** que os 6 engines consultam.

### Semântica B — "Exceção viva" (self-cleaning)

Override só existe enquanto diverge do global. Detalhes:

**Self-cleaning na entrada** (`setDocOverride`):
- Se o novo valor coincide com o global, **não grava** o override (já é o default).
- Se já existia um override e o novo valor coincide com o global, **deleta** o entry.

**Self-cleaning na saída** (`setGlobalHidden`):
- Após mudar `code.hidden`, varre `visibilityOverrides[*][codeId]`.
- Pra cada entry que agora coincide com o novo estado global, deleta.
- Se `overrides[fileId]` fica vazio, deleta a chave.

**Efeito prático:**
- `data.json` só guarda overrides que são divergências reais.
- Mudanças no global propagam transparentemente pros docs sem override específico.
- Zero overrides redundantes, auditoria fácil.

### Eventos

```ts
registry.on('visibility-changed', (detail: {
  codeIds: Set<string>;
  fileIds?: Set<string>;  // presente quando change é per-doc; ausente = global
}) => void);
```

Um evento único cobre todos os casos (global toggle, override per-doc, reset de overrides via link "Resetar"). Reset emite com `codeIds = allCodesAffectedInFile` e `fileIds = {fileId}`.

Todos os subscribers (6 engines, sidebar, popover) escutam `visibility-changed` e chamam `refreshVisibility(detail.codeIds)` apropriadamente.

**Subscription scope:** cada **instância de view** se inscreve (não por arquivo). Se o mesmo doc tá aberto em 2 leaves, ambas recebem o evento e re-renderizam. Unsubscribe no `onunload` da view.

---

## Componentes UI

### Sidebar Code Explorer

Adicionar eye icon inline na row (`src/core/codebookTreeRenderer.ts`).

Layout:

```
▸ [■] Alegria              👁  12
▸ [■] Tristeza             👁  8
▸ [◌] Raiva (dimmed 0.5)  🚫  3     ← hidden
```

- `ExtraButtonComponent` com Lucide `eye` / `eye-off`
- Posição: antes do contador
- Click direto alterna `code.hidden` via `registry.setGlobalHidden(codeId, !current)`
- Classe CSS `.qc-code-row-hidden` → opacity 0.5 + eye-off
- Contador de markers **não muda** (reflete dados, não visibility)

### Popover na view

Padrão idêntico ao Case Variables — `view.addAction('eye', tooltip, handler)` no header de cada engine.

**Ícone no header:**
- Com overrides no doc: `eye` + dot indicator (`·`) pra sinalizar "tem exceção aqui"
- Sem overrides: `eye` neutro

**Popover aberto:**

```
┌─ Códigos neste documento ─────────────┐
│                                       │
│ [■] Alegria              👁 visível   │
│ [■] Tristeza             👁 visível   │
│ [◌] Raiva                🚫 oculto    │
│ [■] Saudade              👁 visível   │
│                                       │
│ Resetar                               │  ← link discreto, só com overrides
└───────────────────────────────────────┘
```

**Comportamento:**
- Lista só códigos com ≥ 1 marker no doc atual
  - Pra CSV: combina `SegmentMarker` + `RowMarker` (ambos contam como "presença no doc")
- Cada linha: swatch + nome + eye-toggle
- Estado exibido é o **efetivo** (resultado da composição global+override), não o estado bruto
- Click no eye grava via `registry.setDocOverride(fileId, codeId, newValue)` (self-cleaning aplicado)
- Link "Resetar" (estilo link, não botão — menos ênfase visual):
  - Só aparece se `overrides[fileId]` tem ≥ 1 entry
  - Click deleta a key inteira `overrides[fileId]`, doc volta a seguir global

**Localização:**
- `src/core/codeVisibilityPopover.ts` (novo) — componente compartilhado
- Injection via `view.addAction` em cada engine:
  - **Markdown** (`MarkdownView`) e **PDF** (`PdfView` interno) — via `workspace.on('file-open')`, mas com **dedupe**: check se a action já existe no header da view antes de adicionar (evento pode disparar múltiplas vezes pra mesma view)
  - **CSV/Image/Audio/Video** (custom `FileView`) — via `addAction` direto no `onOpen` da view

---

## Data flow / render

### API única por engine

```ts
interface VisibilityRefreshable {
  refreshVisibility(affectedCodeIds: Set<string>): void;
}
```

Cada engine implementa como faz sentido internamente:

| Engine | Implementação |
|--------|---------------|
| **CM6** (markdown) | Rebuild `DecorationSet` filtrado. Framework-atomic, não permite update cirúrgico de decorations individuais. O filtro `isCodeVisibleInFile` aplica no loop que gera decorations. |
| **PDF** | Localiza markers que contêm os `affectedCodeIds`, remove os highlight rects correspondentes via `renderPage` segmentado. |
| **CSV** | `refreshCells({rowNodes: filteredByCodeIds, force: true})` — AG Grid API pontual. |
| **Image** | Marca dirty só as Fabric regions cujos markers contêm `affectedCodeIds`; `canvas.requestRenderAll()`. |
| **Audio/Video** | Remove/adiciona só as wavesurfer regions afetadas. |

### rAF coalescing

Múltiplos toggles dentro do mesmo animation frame (~16ms) batcham em **1 refresh**:

```ts
class VisibilityEventBus {
  private pendingCodeIds = new Set<string>();
  private rafId: number | null = null;

  notify(codeIds: Set<string>) {
    codeIds.forEach(id => this.pendingCodeIds.add(id));
    if (this.rafId) return;
    this.rafId = requestAnimationFrame(() => {
      const batch = this.pendingCodeIds;
      this.pendingCodeIds = new Set();
      this.rafId = null;
      this.subscribers.forEach(s => s.refreshVisibility(batch));
    });
  }
}
```

Cobre o caso sequencial (usuário clica 10 eyes rapidamente) sem precisar debounce explícito no UI.

### Fluxo de um click no popover

```
User clica eye no popover
  ↓
popover.onToggle(codeId, fileId)
  ↓
registry.setDocOverride(fileId, codeId, newValue)
  ↓
[self-cleaning: se newValue === !global.hidden → não grava]
  ↓
data.json save (debounced 500ms via DataManager)
  ↓
emit 'visibility-changed' { codeIds: {codeId}, fileIds: {fileId} }
  ↓
VisibilityEventBus.notify({codeId})
  ↓ (rAF coalesce)
  ↓
Todos os 6 engines abertos chamam refreshVisibility({codeId})
Sidebar re-renderiza linha do codeId
Popover re-renderiza lista (atualiza estado exibido)
```

---

## Error handling

### Eventos de vault

Plugin já escuta `vault.on('rename')`, `vault.on('delete')` pra orphan marker cleanup. Adicionar chamadas extras:

| Evento | Ação |
|--------|------|
| `vault.on('rename', oldPath, file)` | Move `overrides[oldPath] → overrides[file.path]` |
| `vault.on('delete', file)` | Deleta `overrides[file.path]` |
| `vault.on('create', file)` | Nada (começa sem override) |

### Ciclo de vida de códigos

| Ação | Cleanup |
|------|---------|
| `registry.removeCode(codeId)` | Propriedade `hidden` some junto. Varre `visibilityOverrides[*][codeId]` e deleta todas as entries. |
| `registry.mergeCode(sourceId, targetId)` | Markers reassociados (já existe). Overrides de `sourceId` **deletados** (target mantém estado próprio, sem herdar baggage). |
| `registry.renameCode(id, newName)` | Zero ação — IDs são estáveis. |

### Load/save robustness

**Load com `data.json` parcial/corrompido:**
- `visibilityOverrides` ausente → inicia como `{}`
- Entry referenciando `codeId` inexistente → remove no load (registry carrega síncrono, safe)
- Entry referenciando `fileId` que não existe no vault → **não** limpar no load. Obsidian pode não ter o vault totalmente enumerado em `onload` (attachment folders, etc.), e orphan overrides são inofensivos (1 boolean por arquivo morto). O evento `vault.on('delete')` já faz o cleanup correto no momento certo.

**Save:**
- Via DataManager (debounce 500ms já existente), sem cerimônia extra

### Import QDPX

- Códigos importados entram com `hidden: undefined` (default visível)
- `visibilityOverrides` não carregam do QDPX (não é padrão REFI-QDA)
- Novos arquivos importados começam sem overrides

### Hot-reload (dev)

- Registry reset no `onunload`, listeners desregistram
- Estado recarregado do `data.json` no próximo `onload`
- Sem estado de sessão a preservar (feature é 100% persistida)

---

## Arquivos afetados

### Novos

| Arquivo | Propósito | Estimativa |
|---------|-----------|------------|
| `src/core/codeVisibility.ts` | Helpers puros (compose, self-cleaning logic) | ~60 LOC |
| `src/core/codeVisibilityPopover.ts` | Componente popover compartilhado | ~150 LOC |
| `src/core/visibilityEventBus.ts` | rAF coalescing bus | ~30 LOC |

### Modificados

| Arquivo | Mudança |
|---------|---------|
| `src/core/types.ts` | `hidden?: boolean` em `CodeDefinition`; seção `visibilityOverrides` em `QualiaData`; atualizar `createDefaultData()` |
| `src/core/codeDefinitionRegistry.ts` | Métodos `setGlobalHidden`, `setDocOverride`, `clearDocOverride`, `isCodeVisibleInFile`; self-cleaning logic; events |
| `src/core/dataManager.ts` | Nova seção registrada |
| `src/core/codebookTreeRenderer.ts` | Eye icon inline, classe `.qc-code-row-hidden` |
| `src/main.ts` | Listeners de `vault.on('rename'/'delete')` ganham chamada pra limpar overrides; bootstrap do popover em cada engine |
| `src/markdown/cm6/markerViewPlugin.ts` | `refreshVisibility(codeIds)` via ViewPlugin; filter no decorator builder |
| `src/pdf/highlightRenderer.ts` (+ `pageObserver`) | `refreshVisibility` pontual; filter no `resolveCodeColors` |
| `src/csv/csvCodingCellRenderer.ts` (+ `csvCodingView`) | Filter no chip loop; `refreshCells` pontual |
| `src/image/regionLabels.ts` + `regionHighlight.ts` | Filter no render de regions; Fabric `markDirty` pontual |
| `src/media/regionRenderer.ts` | Filter nas regions; wavesurfer region remove/add pontual |
| `styles.css` | `.qc-code-row-hidden`, `.qc-popover-visibility`, link "Resetar" |

---

## Testes

### Unit (vitest + jsdom)

| Suite | Cobertura |
|-------|-----------|
| `codeVisibility.test.ts` | Composição global + override; self-cleaning entrada/saída; `isCodeVisibleInFile` em todas as combinações de estado |
| `codeDefinitionRegistry.test.ts` | `setGlobalHidden`/`setDocOverride`/`clearDocOverride` emitem eventos corretos; cleanup em `removeCode` e `mergeCode` |
| `codeVisibilityPopover.test.ts` | Lista só códigos presentes no doc; eye toggle grava override; link "Resetar" aparece só com overrides; click no link limpa a key; re-render on change |
| `visibilityEventBus.test.ts` | rAF coalescing batcha múltiplas chamadas em 1 frame |
| `vaultEvents.test.ts` (ou estender suite existente) | Rename de arquivo move overrides; delete limpa overrides |
| `<engine>.test.ts` pros 6 engines | Render com fixture de markers misturando visible/hidden; marker totalmente hidden **não renderiza**; marker com 1 de 2 visible renderiza só o visível |

### Smoke manual pós-implementação

Checklist a executar no vault de workbench após build:

- [ ] Toggle global via sidebar — marker some em markdown, PDF, CSV, image, audio, video
- [ ] Popover abre em cada um dos 6 engines com a lista correta
- [ ] Per-doc override persiste após fechar e reabrir o doc
- [ ] Global muda e override coincidente desaparece (semântica B)
- [ ] Link "Resetar" aparece só com overrides e limpa o doc
- [ ] Multi-pane: 2 leaves do mesmo doc atualizam em sync
- [ ] Rename de arquivo: overrides seguem pro novo path
- [ ] Delete de arquivo: overrides limpos
- [ ] Merge de código: overrides do source removidos; target mantém seu estado
- [ ] Import QDPX em vault com hidden global: códigos importados vêm visíveis (default)
- [ ] Hot-reload: estado persiste através de reload do plugin

### Pulados no MVP

- **E2E wdio**: unit + smoke cobrem o necessário; plugin é dev-only zero users
- **Visual regression (ui-inspect)**: mudanças visuais são triviais, sem ganho em baseline

---

## Follow-ups (pós-MVP)

Registrar no `docs/BACKLOG.md` após merge:

- **Ghost cinza** (Edge A.2): se A.1 — marker totalmente oculto some — causar confusão no uso real, experimentar render cinza neutro com hover tooltip "X códigos ocultos neste marker". Precisa decisões de design próprias (cor, opacidade, comportamento de drag handle CM6, tooltip).
- **Pastas com toggle de grupo**: "esconder todos deste grupo" como shortcut. Fora do escopo do MVP (pastas são puramente visuais).
- **Cascata de hierarquia**: esconder pai → cascata pros filhos. Se o user experimentar cascata intuitiva, reavaliar.
- **E2E coverage**: se aparecer bug de sync em produção/smoke, adicionar spec wdio targeted (ex: multi-pane sync).

---

## Follow-up pra aprovação após spec review

Após este design ser aprovado e passar pelo spec-document-reviewer, o próximo passo é invocar a skill `writing-plans` pra gerar o plano de implementação detalhado com fases, ordem de arquivos e checkpoints de teste.

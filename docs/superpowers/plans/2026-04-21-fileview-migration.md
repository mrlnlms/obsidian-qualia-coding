# FileView Migration Implementation Plan (Image, Audio, Video)

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar `ImageCodingView`, `AudioView` e `VideoView` de `ItemView` para `FileView` para alinhar com o padrão nativo do Obsidian (já adotado por `CsvCodingView`) e eliminar workarounds em Case Variables.

**Architecture:** As 3 views passam a herdar de `FileView`, usando `this.file` padrão do Obsidian em vez de campos custom (`currentFile`, `core.file`), `onLoadFile`/`onUnloadFile` como pontos de entrada em vez de `setState`. **As 3 mantêm `registerFileIntercept()`** — `plugin.registerExtensions()` não é utilizável porque Obsidian lança exceção em extensões core-native (`mp3`, `wav`, `mp4`, `png` etc. já têm handlers nativos). O ganho essencial da migração é o lifecycle `FileView`, não o mecanismo de associação de extensão. Como consequência, `getFileFromItemView()` e a flag `_caseVariablesActionAdded` em `main.ts` ficam dispensáveis.

**Learning from execution:** tentativa inicial em Audio Task 2.2 usou `plugin.registerExtensions([...AUDIO_EXTENSIONS], AUDIO_VIEW_TYPE)` — Obsidian jogou `Error: Attempting to register an existing file extension "mp3"` no onload, derrubando o plugin inteiro. Fix: reverter para `registerFileIntercept` (commit `0a46869`). Video e Image seguem o mesmo padrão.

**Tech Stack:** TypeScript strict, Obsidian API 1.5+, Vitest + jsdom (1902 testes em 90 suites), wdio + Obsidian real (65 testes e2e em 19 specs).

---

## Pré-requisitos

- Branch dedicada: `feat/fileview-migration` (criar a partir de `main`).
- Testes verdes na baseline antes de começar: `npm run test` deve passar os 1902.
- Plugin rodando em `demo/` para smoke tests após cada fase.
- **Contexto de skills:** antes de mexer em lifecycle/events/workspace, consultar skill `obsidian-core`. Não é esperado tocar CM6 ou CSS.

## File Structure (mapa de mudanças)

### Criar
- _(nenhum arquivo novo)_

### Modificar
| Caminho | Mudança |
|---|---|
| `src/audio/audioView.ts` | `ItemView` → `FileView`; remover `setState`/`getState`/`onClose`/`loadAudio`; implementar `onLoadFile`/`onUnloadFile`/`canAcceptExtension`. |
| `src/video/videoView.ts` | idem `audioView.ts`; preservar passagem de `videoFit` pro `MediaViewCore`. |
| `src/image/views/imageView.ts` | `ItemView` → `FileView`; remover `currentFile`/`setState`/`getState`/`loadImage`/`onClose`/`get file()`; usar `this.file`; implementar `onLoadFile`/`onUnloadFile`/`canAcceptExtension`. |
| `src/audio/index.ts` | **Manter** `registerFileIntercept(...)`; ajustar `openAudioAndSeek` (usar `view.file?.path`). |
| `src/video/index.ts` | **Manter** `registerFileIntercept(...)`; ajustar qualquer uso de `getState()` se houver. |
| `src/image/index.ts` | **Manter** `registerFileIntercept` (setting `autoOpenImages`); ajustar `qualia-image:navigate` para usar `view.file?.path` em vez de `view.getState().file`. |
| `src/main.ts` | Remover `getFileFromItemView`; relaxar tipo de `caseVariablesViewListeners` para `Map<View, () => void>`; reescrever `addCaseVariablesActionToView` para aceitar `View` e derivar file via `view instanceof FileView`. |

### Documentação
| Caminho | Mudança |
|---|---|
| `docs/BACKLOG.md` | Marcar §13 como FEITO com data; mover p/ topo da lista de concluídos. |
| `docs/ARCHITECTURE.md` | Atualizar menção a padrão de view: Image/Audio/Video/CSV agora todas são `FileView`. |
| `docs/TECHNICAL-PATTERNS.md` | Adicionar pattern: "FileView lifecycle — `onLoadFile` é chamado automaticamente por `setViewState({state:{file}})`; não precisa de `setState` manual". |

### Não tocar
- `src/media/mediaViewCore.ts` — já recebe `contentEl` por parâmetro, é agnóstico a ItemView/FileView.
- `src/core/fileInterceptor.ts` — continua necessário para Image (setting `autoOpenImages`) e para rename tracking global.
- `src/csv/csvCodingView.ts` — modelo de referência, nada muda.
- `src/pdf/*` — usa viewer nativo do Obsidian, fora do escopo.

---

## Chunk 1: Baseline & Branch

### Task 1.1: Criar branch e confirmar baseline

**Files:**
- _(nenhum; branch + CI)_

- [ ] **Step 1: Criar branch a partir de main**

```bash
git checkout main
git pull --ff-only
git checkout -b feat/fileview-migration
```

- [ ] **Step 2: Rodar baseline de testes**

```bash
npm run test
```
Expected: `Test Files  90 passed`, `Tests  1902 passed`. Se não passar, parar aqui — migrar sobre baseline vermelha mascara regressões.

- [ ] **Step 3: Build baseline**

```bash
npm run build
```
Expected: `tsc` e `esbuild` sem erro.

- [ ] **Step 4: Smoke test manual no demo**

Abrir `demo/` no Obsidian e validar os 5 tipos (md com markers, pdf, image, csv, audio, video) abrem sem erro. Este é o "antes" — vai comparar com "depois" ao final.

---

## Chunk 2: Audio (FileView + registerExtensions)

### Task 2.1: Migrar `AudioView` para `FileView`

**Files:**
- Modify: `src/audio/audioView.ts` (substituição completa)

- [ ] **Step 1: Reescrever `src/audio/audioView.ts`**

```ts
import { FileView, WorkspaceLeaf, TFile } from 'obsidian';
import type QualiaCodingPlugin from '../main';
import { MediaViewCore } from '../media/mediaViewCore';
import type { AudioCodingModel } from './audioCodingModel';
import { openAudioCodingPopover } from './audioCodingMenu';

export const AUDIO_VIEW_TYPE = 'qualia-audio-view';

const AUDIO_EXTENSIONS = new Set(['mp3', 'm4a', 'wav', 'ogg', 'flac', 'aac', 'wma', 'aiff', 'opus', 'webm']);

export class AudioView extends FileView {
  readonly core: MediaViewCore;

  constructor(leaf: WorkspaceLeaf, plugin: QualiaCodingPlugin, model: AudioCodingModel) {
    super(leaf);
    this.core = new MediaViewCore(this.app, plugin, model, {
      viewType: AUDIO_VIEW_TYPE,
      displayLabel: 'Audio Coding',
      icon: 'audio-lines',
      cssPrefix: 'codemarker-audio',
      hasVideoElement: false,
      openPopover: openAudioCodingPopover,
    });
  }

  getViewType(): string { return AUDIO_VIEW_TYPE; }
  getDisplayText(): string { return this.file?.basename ?? 'Audio Coding'; }
  getIcon(): string { return 'audio-lines'; }
  canAcceptExtension(ext: string): boolean { return AUDIO_EXTENSIONS.has(ext.toLowerCase()); }
  get renderer() { return this.core.renderer; }

  async onLoadFile(file: TFile): Promise<void> {
    await this.core.loadMedia(this.contentEl, file, (ref) => this.registerEvent(ref));
    this.leaf.updateHeader?.();
  }

  async onUnloadFile(_file: TFile): Promise<void> {
    this.core.cleanup();
    this.contentEl.empty();
  }
}
```

Notas:
- Removidos: `setState`, `getState`, `onOpen`, `onClose`, `loadAudio`.
- `FileView.onLoadFile` é chamado automaticamente quando `leaf.setViewState({state:{file}})` é invocado; substitui o `setState` manual.
- `FileView.onUnloadFile` substitui o `onClose` (é chamado tanto em close quanto em troca de arquivo).
- `AUDIO_EXTENSIONS` duplica o Set em `audio/index.ts`. Aceito temporariamente — os dois Sets já existiam; consolidar em passo posterior se virar dor.

- [ ] **Step 2: Rodar type-check**

```bash
npm run build
```
Expected: sem erros de tipo.

- [ ] **Step 3: Rodar suíte de testes**

```bash
npm run test
```
Expected: 1902 passam. Se falhar em `baseSidebarAdapter.test.ts` ou outros que referenciem `AudioView`, investigar e ajustar — provavelmente ajuste de tipo de mock.

### Task 2.2: Migrar `audio/index.ts` para `registerExtensions`

**Files:**
- Modify: `src/audio/index.ts:29-32`

- [ ] **Step 1: Substituir `registerFileIntercept` por `registerExtensions`**

Trocar o bloco:
```ts
registerFileIntercept({
  extensions: AUDIO_EXTENSIONS,
  targetViewType: AUDIO_VIEW_TYPE,
});
```
Por:
```ts
plugin.registerExtensions([...AUDIO_EXTENSIONS], AUDIO_VIEW_TYPE);
```

- [ ] **Step 2: Remover import não usado**

Se `registerFileIntercept` deixou de ser usado neste arquivo, remover do import. `registerFileRename` continua usado.

- [ ] **Step 3: Ajustar `openAudioAndSeek` para não depender de `getState`**

Antes de substituir, confirmar que `getState()` só é usado para comparação de file:

```bash
grep -n "getState" src/audio/index.ts
```

Esperado: só a linha dentro de `openAudioAndSeek`. Se houver outras, revisar cada uma antes de substituir. Depois, trocar:
```ts
const state = view.getState();
if (state.file === filePath) {
```
Por:
```ts
if (view.file?.path === filePath) {
```
Razão: `FileView.getState()` do Obsidian retorna shape diferente; melhor usar `this.file` padrão.

- [ ] **Step 4: Type-check + testes**

```bash
npm run build && npm run test
```
Expected: passa.

### Task 2.3: Smoke test Audio

- [ ] **Step 1: Rebuild e copy para demo**

```bash
npm run build
cp -p main.js manifest.json styles.css demo/.obsidian/plugins/qualia-coding/
```

- [ ] **Step 2: Validar no Obsidian (demo)**

Fluxo obrigatório:
- Abrir um `.mp3` — deve abrir direto em Audio Coding (sem flash pelo viewer nativo).
- Tocar, pausar, seekar, criar região, codificar região — fluxo completo funciona.
- Renomear o arquivo no Explorer — markers migram, título da aba atualiza.
- Reload do Obsidian — aba reabre no arquivo certo com zoom/position preservados.
- Fechar aba e reabrir — estado novo (esperado).
- Command palette → "Open current audio in Audio Coding" com `.mp3` ativo no Explorer — funciona.

Se algo quebrar, documentar no plano (adicionar Task de correção) antes de avançar.

### Task 2.4: Commit Audio

- [ ] **Step 1: Commit**

```bash
git add src/audio/audioView.ts src/audio/index.ts
~/.claude/scripts/commit.sh "refactor: AudioView migra para FileView + registerExtensions"
```

---

## Chunk 3: Video (FileView + registerExtensions)

### Task 3.1: Migrar `VideoView` para `FileView`

**Files:**
- Modify: `src/video/videoView.ts` (substituição completa)

- [ ] **Step 1: Reescrever `src/video/videoView.ts`**

```ts
import { FileView, WorkspaceLeaf, TFile } from 'obsidian';
import type QualiaCodingPlugin from '../main';
import { MediaViewCore } from '../media/mediaViewCore';
import type { VideoCodingModel } from './videoCodingModel';
import { openVideoCodingPopover } from './videoCodingMenu';

export const VIDEO_VIEW_TYPE = 'qualia-video-view';

const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'ogv']);

export class VideoView extends FileView {
  readonly core: MediaViewCore;

  constructor(leaf: WorkspaceLeaf, plugin: QualiaCodingPlugin, model: VideoCodingModel) {
    super(leaf);
    this.core = new MediaViewCore(this.app, plugin, model, {
      viewType: VIDEO_VIEW_TYPE,
      displayLabel: 'Video Coding',
      icon: 'video',
      cssPrefix: 'codemarker-video',
      hasVideoElement: true,
      videoFit: model.settings.videoFit,
      openPopover: openVideoCodingPopover,
    });
  }

  getViewType(): string { return VIDEO_VIEW_TYPE; }
  getDisplayText(): string { return this.file?.basename ?? 'Video Coding'; }
  getIcon(): string { return 'video'; }
  canAcceptExtension(ext: string): boolean { return VIDEO_EXTENSIONS.has(ext.toLowerCase()); }
  get renderer() { return this.core.renderer; }

  async onLoadFile(file: TFile): Promise<void> {
    await this.core.loadMedia(this.contentEl, file, (ref) => this.registerEvent(ref));
    this.leaf.updateHeader?.();
  }

  async onUnloadFile(_file: TFile): Promise<void> {
    this.core.cleanup();
    this.contentEl.empty();
  }
}
```

- [ ] **Step 2: Type-check + testes**

```bash
npm run build && npm run test
```
Expected: passa.

### Task 3.2: Ajustar `video/index.ts` — **manter** `registerFileIntercept`

**Files:**
- Modify: `src/video/index.ts`

**Learning from Audio**: `plugin.registerExtensions` falha com extensões core-native (`mp4`, `webm`, `ogv` são tratados pelo video player nativo). Mantemos o interceptor, igual Audio e Image.

- [ ] **Step 1: Ajustar qualquer uso de `view.getState()` para `view.file?.path`**

Buscar:
```bash
grep -n "getState" src/video/index.ts
```
Se houver uso análogo ao de `audio/index.ts`, aplicar a mesma correção. Caso contrário, nenhuma mudança neste arquivo.

- [ ] **Step 2: Type-check + testes**

```bash
npm run build && npm run test
```

### Task 3.3: Smoke test Video

- [ ] **Step 1: Rebuild e copy para demo**

```bash
npm run build && cp -p main.js manifest.json styles.css demo/.obsidian/plugins/qualia-coding/
```

- [ ] **Step 2: Validar no Obsidian**

Fluxo: abrir `.mp4` → toca, pausa, cria regiões, codifica, troca `videoFit` nas settings e confirma que pega ao reabrir. Renomear arquivo, reload, fechar/reabrir. Tudo como o smoke test do Audio.

### Task 3.4: Commit Video

- [ ] **Step 1: Commit**

```bash
git add src/video/videoView.ts src/video/index.ts
~/.claude/scripts/commit.sh "refactor: VideoView migra para FileView + registerExtensions"
```

---

## Chunk 4: Image (FileView com registerFileIntercept preservado)

### Task 4.1: Migrar `ImageCodingView` para `FileView`

**Files:**
- Modify: `src/image/views/imageView.ts` (substituição parcial)

**Atenção:** a lógica interna de `loadImage` (setup de fabric, RegionManager, CodingMenu, toolbar, zoom/pan, listener de `qualia:clear-all`) permanece idêntica — muda apenas o invólucro (nome do método, remoção de `currentFile`, remoção de `setState`/`getState`, uso de `this.file`).

- [ ] **Step 1: Renomear `loadImage(file)` para `onLoadFile(file)` e remover wrappers**

Mudanças pontuais no arquivo:

(a) **Imports:** trocar `ItemView` por `FileView`:
```ts
import { FileView, TFile, WorkspaceLeaf } from 'obsidian';
```

(b) **Assinatura da classe:**
```ts
export class ImageCodingView extends FileView {
```

(c) **Remover campo `currentFile` e o getter `get file()`.** Eles são substituídos pelo `this.file` nativo de `FileView`.

Remover:
```ts
private currentFile: TFile | null = null;
...
get file(): TFile | null { return this.currentFile; }
```

(d) **Adicionar `canAcceptExtension`**:
```ts
const IMAGE_EXTENSIONS_LOCAL = new Set(['png','jpg','jpeg','gif','bmp','webp','avif','svg']);
...
canAcceptExtension(ext: string): boolean {
  return IMAGE_EXTENSIONS_LOCAL.has(ext.toLowerCase());
}
```

(e) **Remover `setState` e `getState`** inteiramente.

(f) **Renomear `loadImage` para `onLoadFile`** e ajustar o corpo:
- Trocar `this.currentFile = file;` → remover essa linha (FileView já fez isso antes de chamar `onLoadFile`).
- Qualquer referência a `this.currentFile` dentro do método passa a ser `this.file` (readonly TFile garantido durante `onLoadFile`).
- `getDisplayText` passa a usar `this.file?.basename`.

O método vira:
```ts
async onLoadFile(file: TFile): Promise<void> {
  this.cleanup();
  this.readyPromise = new Promise<void>(resolve => { this.readyResolve = resolve; });
  const thisGeneration = ++this.loadGeneration;
  // this.file já foi setado pelo FileView antes desta chamada
  this.leaf.updateHeader?.();

  const { contentEl } = this;
  // ... resto do corpo do loadImage, trocando `this.currentFile` por `this.file` ou `file`
}
```

Atenção especial à callback `saveView` dentro de `createToolbar`. Por causa do TS strict com narrowing dentro de arrow functions, capturar o file em uma const local no topo do `onLoadFile` é mais seguro que depender de `this.file` dentro do closure:
```ts
async onLoadFile(file: TFile): Promise<void> {
  this.cleanup();
  // ... setup inicial
  // file é garantido non-null aqui (parâmetro); usar em closures abaixo
  ...
  const saveView = () => {
    if (this.fabricState) {
      const c = this.fabricState.canvas;
      const vt = c.viewportTransform;
      this.model.saveFileViewState(file.path, c.getZoom(), vt[4], vt[5]);
    }
    this.regionLabels?.refreshAll();
  };
}
```
Usar `file.path` (parâmetro capturado) em vez de `this.file.path` — evita narrowing loss e é equivalente semanticamente.

(g) **Substituir `onClose` por `onUnloadFile`:**
```ts
async onUnloadFile(_file: TFile): Promise<void> {
  this.cleanup();
}
```

Remover `onClose` completamente (FileView usa `onUnloadFile` como equivalente de cleanup por arquivo, e o fim da view é gerenciado automaticamente).

(h) **`getDisplayText()`** passa a retornar `this.file?.basename ?? 'Image Coding'`.

- [ ] **Step 2: Type-check + testes**

```bash
npm run build && npm run test
```
Expected: passa. Se falhar em algum teste que ainda referencia `view.currentFile` ou `view.loadImage`, ajustar.

### Task 4.2: Ajustar `image/index.ts` — **manter** `registerFileIntercept`, corrigir navegação

**Files:**
- Modify: `src/image/index.ts:74-94` (apenas o handler `qualia-image:navigate`)

- [ ] **Step 1: Substituir `getState().file` por `file?.path` no handler de navegação**

Trocar:
```ts
const existingLeaf = leaves.find(l => (l.view as ImageCodingView).getState().file === data.file);
```
Por:
```ts
const existingLeaf = leaves.find(l => (l.view as ImageCodingView).file?.path === data.file);
```

Resto do arquivo não muda — `registerFileIntercept` com `shouldIntercept: () => model.settings.autoOpenImages` continua intacto. Quando a setting está `true`, o interceptor chama `setViewState({type: IMAGE_CODING_VIEW_TYPE, state: { file }})`; o Obsidian, ao ver que a view de destino é `FileView`, chama `onLoadFile(file)` automaticamente.

- [ ] **Step 2: Type-check + testes**

```bash
npm run build && npm run test
```

### Task 4.3: Smoke test Image (crítico — os dois modos da setting)

- [ ] **Step 1: Rebuild e copy para demo**

```bash
npm run build && cp -p main.js manifest.json styles.css demo/.obsidian/plugins/qualia-coding/
```

- [ ] **Step 2: Validar modo `autoOpenImages = true` (default)**

- Abrir `.png` via Explorer → abre em Image Coding (pode ter flash breve do viewer nativo, igual antes).
- Criar região (retângulo), codificar, abrir CodingMenu, salvar zoom/pan.
- Fechar aba, reabrir — zoom/pan persistem via `model.saveFileViewState`.
- Renomear arquivo — markers migram, título atualiza.
- Sidebar de imagem hover highlight + navegação funcionam.

- [ ] **Step 3: Validar modo `autoOpenImages = false`**

- Settings → desligar "Auto-open images".
- Abrir `.png` → deve abrir no viewer nativo do Obsidian (sem flash pra view custom).
- Command palette → "Open image in coding view" → abre em Image Coding.
- File menu (right-click no `.png` no Explorer) → "Open in Image Coding" → abre.
- Reabilitar "Auto-open images" e confirmar volta pro comportamento default.

- [ ] **Step 4: Validar reload Obsidian com Image Coding leaf aberto + `autoOpenImages=false`**

Cenário crítico levantado no Risk Register: a aba já está aberta em Image Coding, mas a setting está desligada. Ao reload:

- Deixar `autoOpenImages=false`.
- Com um `.png` aberto em Image Coding (via command/menu), fazer reload do Obsidian (`Ctrl+R`).
- Expected: aba reabre em Image Coding (não no viewer nativo), pois o leaf persistiu o type `qualia-image-coding`. `FileView.onLoadFile` é chamado pelo mecanismo de restore do Obsidian, independente do interceptor.
- Se em vez disso a aba abrir vazia, em viewer nativo, ou em erro → falha crítica. Investigar: provavelmente `FileView` precisa de `registerExtensions` pra restore funcionar sem o interceptor, e o plano precisa reavaliar a decisão de opção (2).

**Este é o ponto que justifica ter escolhido opção (2).** Se qualquer um dos três cenários falhar, parar e investigar.

### Task 4.4: Commit Image

- [ ] **Step 1: Commit**

```bash
git add src/image/views/imageView.ts src/image/index.ts
~/.claude/scripts/commit.sh "refactor: ImageCodingView migra para FileView (autoOpenImages preservada)"
```

---

## Chunk 5: Case Variables — remover workarounds

Pré-condição: as 3 views agora são `FileView`. Isso habilita a simplificação.

### Task 5.1: Simplificar `main.ts` — remover `getFileFromItemView` e relaxar tipos

**Files:**
- Modify: `src/main.ts:77-93` (active-leaf-change listener)
- Modify: `src/main.ts:339-387` (helpers de Case Variables)

- [ ] **Step 1: Relaxar tipo de `caseVariablesViewListeners` para aceitar `View`**

Localizar a declaração do campo (grep no arquivo):
```bash
grep -n "caseVariablesViewListeners" src/main.ts
```

Mudar:
```ts
private caseVariablesViewListeners: Map<ItemView, () => void> = new Map();
```
Para:
```ts
private caseVariablesViewListeners: Map<View, () => void> = new Map();
```

Adicionar `View` ao import de `obsidian` (já tem `ItemView`, `FileView`, etc.; adicionar `View`).

- [ ] **Step 2: Remover `getFileFromItemView`**

Deletar completamente o método:
```ts
private getFileFromItemView(view: ItemView): TFile | null {
  if (view instanceof FileView) return view.file;
  if (view instanceof ImageCodingView) return view.file;
  if (view instanceof AudioView || view instanceof VideoView) return view.core.file;
  return null;
}
```

- [ ] **Step 3: Reescrever `addCaseVariablesActionToView` sem a flag e sem o helper**

Nova assinatura aceita `View` (não só `ItemView`) e deriva o file diretamente:

```ts
private addCaseVariablesActionToView(view: View): void {
  if (!(view instanceof FileView)) return;
  if (this.caseVariablesViewListeners.has(view)) return; // dedupe via Map em vez de flag inline
  if (!view.file) return;

  const currentFileId = (): string | null => view.file?.path ?? null;

  let closeCurrent: (() => void) | null = null;
  const button = view.addAction('clipboard-list', 'Case Variables', () => {
    if (closeCurrent) { closeCurrent(); return; }
    if (!currentFileId()) return;
    closeCurrent = openPropertiesPopover(button, {
      fileId: currentFileId,
      registry: this.caseVariablesRegistry,
      onClose: () => { closeCurrent = null; },
    });
  });
  button.addClass('case-variables-action');

  const updateBadge = () => {
    try {
      if (!button.isConnected) return;
      const fileId = currentFileId();
      if (!fileId) return;
      const count = Object.keys(this.caseVariablesRegistry.getVariables(fileId)).length;
      button.toggleClass('has-properties', count > 0);
      button.setAttribute('data-count', String(count));
    } catch {
      // button pode estar desconectado durante teardown
    }
  };
  updateBadge();

  const listener = () => updateBadge();
  this.caseVariablesRegistry.addOnMutate(listener);
  this.caseVariablesViewListeners.set(view, listener);
}
```

Mudanças vs. versão atual:
- Parâmetro `view: View` em vez de `ItemView`.
- Guard explícito `view instanceof FileView` (agora vale pra md, pdf nativo, csv, image, audio, video).
- Dedupe via `caseVariablesViewListeners.has(view)` em vez da flag inline `_caseVariablesActionAdded`.
- Remover toda referência ao tipo `{ _caseVariablesActionAdded?: boolean }` (duas ocorrências).

- [ ] **Step 4: Ajustar os dois listeners de workspace**

Localizar:
```ts
this.registerEvent(this.app.workspace.on('active-leaf-change', (leaf) => {
  const view = leaf?.view;
  if (view instanceof ItemView) {
    this.addCaseVariablesActionToView(view);
  }
}));

// Cover leaves que não disparam active-leaf-change
const addActionToAllLeaves = () => {
  this.app.workspace.iterateAllLeaves((leaf) => {
    if (leaf.view instanceof ItemView) {
      this.addCaseVariablesActionToView(leaf.view);
    }
  });
};
```

Trocar ambos os `instanceof ItemView` por `instanceof FileView`:

```ts
this.registerEvent(this.app.workspace.on('active-leaf-change', (leaf) => {
  const view = leaf?.view;
  if (view instanceof FileView) {
    this.addCaseVariablesActionToView(view);
  }
}));

const addActionToAllLeaves = () => {
  this.app.workspace.iterateAllLeaves((leaf) => {
    if (leaf.view instanceof FileView) {
      this.addCaseVariablesActionToView(leaf.view);
    }
  });
};
```

Razão: `ItemView` era o superset mais amplo; agora que o guard real é "tem arquivo", usar `FileView` diretamente é mais preciso e dispensa o `view.file` check interno antes do return (o guard já está no instanceof — embora mantenhamos o `if (!view.file)` por segurança em edge cases de transição).

- [ ] **Step 5: Limpar imports não usados**

Se `ItemView` não for mais usado em `main.ts` após as mudanças acima, remover do import. `ImageCodingView`, `AudioView`, `VideoView` provavelmente deixam de ser referenciados por `getFileFromItemView` (que foi removido) — checar se ainda são usados em outro lugar; se não, remover imports órfãos.

```bash
grep -n "ImageCodingView\|AudioView\|VideoView\|ItemView" src/main.ts
```

- [ ] **Step 6: Type-check + testes**

```bash
npm run build && npm run test
```
Expected: 1902 passam. Qualquer teste que mockava `_caseVariablesActionAdded` precisa ser atualizado — provavelmente não há nenhum (é flag interna), mas verificar com grep:
```bash
grep -rn "_caseVariablesActionAdded" tests/ src/
```
Deve retornar nenhum match após esta task.

### Task 5.2: Smoke test Case Variables em todas as views

- [ ] **Step 1: Rebuild + copy demo**

```bash
npm run build && cp -p main.js manifest.json styles.css demo/.obsidian/plugins/qualia-coding/
```

- [ ] **Step 2: Validar botão Case Variables aparece e persiste**

Para cada tipo: `.md`, `.csv`, `.png` (com `autoOpenImages=true`), `.mp3`, `.mp4`:
- Abrir o arquivo.
- Confirmar que o botão "clipboard-list" aparece na toolbar da view.
- Clicar — popover abre.
- Adicionar uma property — count atualiza no badge.
- Trocar de aba e voltar — botão ainda está lá (não duplica).
- Hot-reload do plugin (`Ctrl+P` → "Reload app without saving" ou via BRAT) — botão reaparece, dados persistem.

**Edge case crítico:** abrir 2 panes do mesmo arquivo lado a lado. Cada view tem seu próprio botão, ambos funcionam, não há listener leak.

- [ ] **Step 3: Validar dedupe**

- `layout-change` dispara várias vezes em boot de vault grande. Após `addActionToAllLeaves` rodar múltiplas vezes, só um botão por view. Verificar inspecionando o DOM: `document.querySelectorAll('.case-variables-action').length` deve igualar o número de views abertas com arquivo.

### Task 5.3: Commit Case Variables cleanup

- [ ] **Step 1: Commit**

```bash
git add src/main.ts
~/.claude/scripts/commit.sh "refactor: Case Variables usa FileView.file direto, sem getFileFromItemView"
```

---

## Chunk 6: Validação final + docs

### Task 6.0: Regression sweep — grep por referências órfãs

- [ ] **Step 1: Procurar referências a APIs removidas**

```bash
grep -rn "currentFile\|loadImage\|loadAudio\|loadVideo\|_caseVariablesActionAdded\|getFileFromItemView" src/ tests/
```

Expected output: apenas referências legítimas que sobrevivem (ex: `currentFile` pode continuar existindo em outros módulos não relacionados a essas 3 views — verificar cada match). Matches em `views/imageView.ts`, `audioView.ts`, `videoView.ts` ou `main.ts` devem retornar zero.

Se houver match inesperado, investigar e corrigir antes de rodar testes.

### Task 6.1: Full test suite + e2e

- [ ] **Step 1: Rodar suíte completa**

```bash
npm run test
```
Expected: 1902 passam.

- [ ] **Step 2: Rodar e2e (se harness disponível)**

```bash
npm run test:e2e
```
Expected: 65 passam em 19 specs. Os especs que tocam Image/Audio/Video são os de maior risco. Se algum falhar por depender de `currentFile` ou `loadImage`/`loadAudio`/`loadVideo`, corrigir o spec para usar `view.file` ou o gatilho via `setViewState`.

- [ ] **Step 3: Build final**

```bash
npm run build
```

### Task 6.2: Atualizar docs

**Files:**
- Modify: `docs/BACKLOG.md:264-287` (marcar §13 como FEITO)
- Modify: `docs/ARCHITECTURE.md` (menção a padrão de view)
- Modify: `docs/TECHNICAL-PATTERNS.md` (novo pattern)
- Modify: `CLAUDE.md` (estrutura de arquivos mudou? verificar contagem de testes — deve permanecer 1902)

- [ ] **Step 1: Marcar §13 como FEITO no BACKLOG**

Riscar o header (`## ~~13. Migrar ...~~ — FEITO (2026-04-21)`). Adicionar nota breve das mudanças: "Image/Audio/Video agora estendem FileView; Audio e Video via registerExtensions, Image mantém registerFileIntercept para preservar setting `autoOpenImages`. `getFileFromItemView` e `_caseVariablesActionAdded` removidos."

- [ ] **Step 2: Atualizar ARCHITECTURE.md**

Procurar seção sobre views/engines. Atualizar para refletir:
- Todas as views com arquivo agora são `FileView` (md, pdf nativo, csv, image, audio, video).
- Image usa `registerFileIntercept` + setting `autoOpenImages`; Audio/Video/CSV usam `registerExtensions`.

- [ ] **Step 3: Adicionar pattern em TECHNICAL-PATTERNS.md**

Novo entry (estilo curto, como os outros):

> **FileView lifecycle**: `onLoadFile(file)` é chamado automaticamente pelo Obsidian quando `leaf.setViewState({type, state: {file}})` é invocado em uma view que herda de `FileView`. Não é preciso `setState` manual. `onUnloadFile(file)` é chamado antes de `onLoadFile` de outro arquivo (troca de arquivo no mesmo leaf) e no fechamento da view. `this.file: TFile` é garantido readonly durante `onLoadFile` execution.

- [ ] **Step 4: CLAUDE.md (só se estrutura mudou)**

Conferir a contagem de testes no output de `npm run test` (última linha do summary do Vitest, formato `Tests  N passed`). Se mudou em relação a 1902, atualizar o número em CLAUDE.md. Também atualizar referências a `ItemView` na seção "Convencoes" se existirem — as 3 views agora são `FileView`.

### Task 6.3: Commit docs + merge

- [ ] **Step 1: Commit docs**

```bash
git add docs/
~/.claude/scripts/commit.sh "docs: FileView migration — BACKLOG §13 FEITO, pattern em TECHNICAL-PATTERNS"
```

- [ ] **Step 2: Decisão de merge**

Usuário decide:
- **Merge direto em main** (refactor internos, sem breaking externo): `git checkout main && git merge --no-ff feat/fileview-migration`.
- **PR review**: `gh pr create`.

Esta decisão não é do agente. Apresentar ao usuário no final.

---

## Risk Register (o que pode dar errado)

| Risco | Sinal | Mitigação |
|---|---|---|
| Obsidian não chama `onLoadFile` para leaf restaurado no boot | Abas reabrem vazias após reload | Falha provável em Image com `autoOpenImages=false` — mas nesse modo o viewer nativo assume. Testar explicitamente em Task 4.3 Step 2/3. |
| `FileView` força associação mesmo sem `registerExtensions`? | Não — `registerExtensions` só adiciona associação; `FileView` sozinho não registra nada | Image segue ok usando só `registerFileIntercept`. |
| Hot-reload duplica botão Case Variables | `.case-variables-action` aparece 2x no DOM | Dedupe via `caseVariablesViewListeners.has(view)` cobre. Validar em Task 5.2 Step 3. |
| Testes e2e dependem de `view.loadAudio(file)` etc. | wdio spec quebra com "loadAudio is not a function" | Substituir por `leaf.setViewState({type, state:{file}})` e aguardar `view.core.waitUntilReady()`. |
| `openAudioAndSeek` chama `view.getState()` que muda shape em FileView | `state.file` vira undefined | Já corrigido na Task 2.2 Step 3. |
| ~~`registerExtensions` conflita com outro plugin que registrou a mesma extensão~~ | — | **Materializou-se diferente:** Obsidian joga `Error: Attempting to register an existing file extension` em extensões core-native (mp3/mp4/etc.), derrubando o plugin. Mitigado voltando Audio/Video pra `registerFileIntercept`. |

---

## Non-goals (explicitamente fora do escopo)

- Remover ou unificar a setting `autoOpenImages`. Discutido; decidimos manter.
- Introduzir toggle por botão para carregar Audio/Video Coding (ideia do usuário sobre futuro). Fora desta iteração.
- Consolidar os Sets `IMAGE_EXTENSIONS`/`AUDIO_EXTENSIONS`/`VIDEO_EXTENSIONS` duplicados entre view e index — cosmetic, fazer em refactor separado se virar dor. **Ação:** após execução, adicionar 1 linha em `docs/BACKLOG.md` registrando essa dívida técnica para não esquecer.
- Tocar PDF — usa viewer nativo; não entra.
- Tocar MediaViewCore — já é agnóstico, não precisa.
- Adicionar testes unit novos para lifecycle de views — é difícil testar `onLoadFile` sem mockar muito do Obsidian; confiar em smoke tests e e2e.

---

## Execution Checkpoint

Após cada chunk (Audio, Video, Image, Case Vars): plugin continua utilizável em `demo/`. Se algum smoke test falhar, **parar**, investigar, adicionar correção como nova Task no chunk atual antes de avançar.

Commits frequentes (1 por chunk) permitem rollback cirúrgico: se Image der problema depois de Audio/Video estarem ok, `git revert` afeta só Image.

**Bail-out crítico após Chunk 2:** Se o smoke test de Audio revelar que a premissa fundamental — `FileView.onLoadFile` disparando automaticamente via `setViewState({state:{file}})` — está errada, **parar antes de iniciar Chunk 3**. Toda a migração compartilha essa premissa; se ela quebrou em Audio (cenário mais simples), vai quebrar em Video e Image também. Nesse caso: reavaliar, consultar skill `obsidian-core`, possivelmente pesquisar docs Obsidian ou código do próprio CSV (que já funciona). Não insistir executando as chunks restantes.

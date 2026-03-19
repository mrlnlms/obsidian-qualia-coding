# Unify Audio/Video via Composition — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unificar audioView.ts (387 LOC) e videoView.ts (393 LOC) eliminando ~350 LOC de duplicacao, usando composicao em vez de heranca (evita edge case do Obsidian com ItemView).

**Architecture:** Em vez de `AudioView extends MediaView extends ItemView` (que falhou), usar composicao: `AudioView extends ItemView` mantem a heranca direta que o Obsidian espera, e delega toda a logica de transporte/waveform/regions pra um `MediaViewCore` instanciado internamente. Cada view continua como thin wrapper — constructor cria o core, lifecycle methods delegam, Obsidian nao ve diferenca.

**Tech Stack:** TypeScript, Obsidian ItemView, WaveSurfer.js

---

## Por que composicao em vez de heranca

A tentativa anterior (`AudioView extends MediaView extends ItemView`) falhou — o Obsidian nao carregava as views corretamente. Hipotese: o runtime do Obsidian espera `view.constructor` herdando diretamente de ItemView, ou esbuild otimiza a cadeia de heranca de forma inesperada.

Composicao evita esse problema: `AudioView extends ItemView` (direto), com a logica compartilhada em `MediaViewCore` que NAO herda de nada — e so uma classe helper que recebe o `contentEl` e constroi o DOM.

## Arquivos

| Arquivo | Acao | LOC estimado |
|---|---|---|
| `src/media/mediaViewCore.ts` | Criar | ~320 |
| `src/media/mediaViewConfig.ts` | Manter (ja existe) | ~30 |
| `src/audio/audioView.ts` | Reescrever (387 → ~40) | 40 |
| `src/video/videoView.ts` | Reescrever (393 → ~45) | 45 |

**Nao muda**: index.ts (audio/video), menus, models, types, region/waveform renderers

---

## Chunk 1: Criar MediaViewCore

### Task 1: Criar mediaViewCore.ts

**Files:**
- Create: `src/media/mediaViewCore.ts`
- Keep: `src/media/mediaViewConfig.ts` (ja existe no disco)

- [ ] **Step 1: Criar mediaViewCore.ts**

A classe recebe: `contentEl`, `app`, `plugin`, `model`, `config`. Tem metodos publicos: `loadMedia()`, `cleanup()`, `getState()`, `getRenderer()`, `getCurrentFile()`. Toda a logica de DOM, transport, zoom, volume, speed, regions, keyboard shortcuts vive aqui.

```typescript
// src/media/mediaViewCore.ts

import { TFile, setIcon, type App } from 'obsidian';
import type QualiaCodingPlugin from '../main';
import { WaveformRenderer } from './waveformRenderer';
import { MediaRegionRenderer } from './regionRenderer';
import { formatTime } from './formatTime';
import type { MediaCodingModel } from './mediaCodingModel';
import type { MediaViewConfig } from './mediaViewConfig';

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export class MediaViewCore {
  readonly renderer: WaveformRenderer;
  private regionRenderer: MediaRegionRenderer | null = null;
  private currentFile: TFile | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private waveformEl: HTMLElement | null = null;
  private playBtn: HTMLElement | null = null;
  private timeEl: HTMLElement | null = null;
  private zoomSlider: HTMLInputElement | null = null;
  private zoomLabel: HTMLElement | null = null;
  private volumeSlider: HTMLInputElement | null = null;
  private speedBtn: HTMLElement | null = null;
  private speedIndex: number = 2;
  private timeInterval: ReturnType<typeof setInterval> | null = null;
  private changeListener: (() => void) | null = null;

  constructor(
    private app: App,
    private plugin: QualiaCodingPlugin,
    private model: MediaCodingModel<any, any, any>,
    private config: MediaViewConfig,
  ) {
    this.renderer = new WaveformRenderer();
  }

  get file(): TFile | null { return this.currentFile; }

  getState(): Record<string, unknown> {
    return { file: this.currentFile?.path ?? '' };
  }

  // Toda a logica de loadMedia copiada do audioView.ts original,
  // parametrizada por config.cssPrefix e config.hasVideoElement.
  // Recebe contentEl como parametro (vem do ItemView).
  async loadMedia(contentEl: HTMLElement, file: TFile, registerEvent: (ref: any) => void): Promise<void> {
    // ... corpo identico ao mediaView.ts que ja foi criado,
    // mas recebe contentEl em vez de usar this.contentEl
    // (porque nao herda de ItemView)
  }

  cleanup(): void {
    this.saveScrollPosition();
    this.stopTimeUpdates();
    if (this.changeListener) {
      this.model.offChange(this.changeListener);
      this.changeListener = null;
    }
    if (this.regionRenderer) {
      this.regionRenderer.unsubscribeFromHover();
      this.regionRenderer.clear();
      this.regionRenderer = null;
    }
    this.renderer.destroy();
  }

  // ... private helpers (updatePlayIcon, updateTimeDisplay, etc.)
}
```

A implementacao real copia o corpo de `src/media/mediaView.ts` (o arquivo que ja existe no disco), adaptando:
- `this.contentEl` → parametro `contentEl`
- `this.app` → `this.app` (recebido no constructor)
- `this.plugin.registerEvent(...)` → `registerEvent(...)` (callback)
- `this.leaf.updateHeader?.()` → callback `onFileChanged?.()`

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/media/mediaViewCore.ts src/media/mediaViewConfig.ts
~/.claude/scripts/commit.sh "feat: cria MediaViewCore — logica compartilhada audio/video via composicao"
```

---

## Chunk 2: Converter views pra usar MediaViewCore

### Task 2: Converter audioView.ts

**Files:**
- Modify: `src/audio/audioView.ts` (387 → ~40 LOC)

- [ ] **Step 1: Reescrever audioView.ts usando composicao**

```typescript
// src/audio/audioView.ts

import { ItemView, WorkspaceLeaf, TFile } from 'obsidian';
import type QualiaCodingPlugin from '../main';
import { MediaViewCore } from '../media/mediaViewCore';
import type { AudioCodingModel } from './audioCodingModel';
import { openAudioCodingPopover } from './audioCodingMenu';

export const AUDIO_VIEW_TYPE = 'qualia-audio-view';

export class AudioView extends ItemView {
  private core: MediaViewCore;

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
  getDisplayText(): string { return this.core.file?.basename ?? 'Audio Coding'; }
  getIcon(): string { return 'audio-lines'; }
  get renderer() { return this.core.renderer; }

  async setState(state: unknown, result: any): Promise<void> {
    const s = state as Record<string, unknown>;
    const filePath = s?.file as string | undefined;
    if (filePath) {
      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (file instanceof TFile) {
        await this.core.loadMedia(this.contentEl, file, (ref) => this.registerEvent(ref));
        this.leaf.updateHeader?.();
      }
    }
    await super.setState(state, result);
  }

  getState(): Record<string, unknown> { return this.core.getState(); }
  async onOpen(): Promise<void> {}
  async onClose(): Promise<void> {
    this.core.cleanup();
    this.contentEl.empty();
  }

  async loadAudio(file: TFile): Promise<void> {
    await this.core.loadMedia(this.contentEl, file, (ref) => this.registerEvent(ref));
    this.leaf.updateHeader?.();
  }
}
```

**Chave:** `AudioView extends ItemView` direto — o Obsidian ve exatamente o que esperava. A logica de media esta no `core`.

- [ ] **Step 2: Build + test**

Run: `npm run build && npm run test`
Expected: PASS

- [ ] **Step 3: Testar manualmente no Obsidian**

Abrir um arquivo .mp3 no demo vault. Verificar que:
- A view "Audio Coding" aparece (nao o player padrao)
- Waveform renderiza
- Play/pause funciona
- Zoom funciona

Se funcionar: continuar. Se nao: debugar antes de prosseguir.

- [ ] **Step 4: Commit**

```bash
git add src/audio/audioView.ts
~/.claude/scripts/commit.sh "refactor: audioView usa MediaViewCore via composicao (~40 LOC)"
```

### Task 3: Converter videoView.ts

**Files:**
- Modify: `src/video/videoView.ts` (393 → ~45 LOC)

- [ ] **Step 1: Reescrever videoView.ts usando composicao**

```typescript
// src/video/videoView.ts

import { ItemView, WorkspaceLeaf, TFile } from 'obsidian';
import type QualiaCodingPlugin from '../main';
import { MediaViewCore } from '../media/mediaViewCore';
import type { VideoCodingModel } from './videoCodingModel';
import { openVideoCodingPopover } from './videoCodingMenu';

export const VIDEO_VIEW_TYPE = 'qualia-video-view';

export class VideoView extends ItemView {
  private core: MediaViewCore;

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
  getDisplayText(): string { return this.core.file?.basename ?? 'Video Coding'; }
  getIcon(): string { return 'video'; }
  get renderer() { return this.core.renderer; }

  async setState(state: unknown, result: any): Promise<void> {
    const s = state as Record<string, unknown>;
    const filePath = s?.file as string | undefined;
    if (filePath) {
      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (file instanceof TFile) {
        await this.core.loadMedia(this.contentEl, file, (ref) => this.registerEvent(ref));
        this.leaf.updateHeader?.();
      }
    }
    await super.setState(state, result);
  }

  getState(): Record<string, unknown> { return this.core.getState(); }
  async onOpen(): Promise<void> {}
  async onClose(): Promise<void> {
    this.core.cleanup();
    this.contentEl.empty();
  }

  async loadVideo(file: TFile): Promise<void> {
    await this.core.loadMedia(this.contentEl, file, (ref) => this.registerEvent(ref));
    this.leaf.updateHeader?.();
  }
}
```

- [ ] **Step 2: Build + test**

Run: `npm run build && npm run test`
Expected: PASS

- [ ] **Step 3: Testar manualmente no Obsidian**

Abrir um arquivo .mp4 no demo vault. Verificar que:
- A view "Video Coding" aparece (nao o player padrao)
- Video renderiza com waveform abaixo
- Play/pause funciona
- Zoom funciona

- [ ] **Step 4: Commit**

```bash
git add src/video/videoView.ts
~/.claude/scripts/commit.sh "refactor: videoView usa MediaViewCore via composicao (~45 LOC)"
```

---

## Chunk 3: Validacao + cleanup

### Task 4: Rodar e2e tests

- [ ] **Step 1: Rodar audio e video e2e**

Run: `npm run test:e2e -- --spec test/e2e/specs/audio-view.e2e.ts --spec test/e2e/specs/video-view.e2e.ts`
Expected: PASS (ou atualizar baselines se layout mudou: `npm run test:visual:update`)

- [ ] **Step 2: Rodar suite completa**

Run: `npm run build && npm run test && npm run test:e2e`
Expected: Tudo verde

- [ ] **Step 3: Remover arquivo antigo mediaView.ts**

O `src/media/mediaView.ts` (tentativa de heranca) pode ser removido — foi substituido por `mediaViewCore.ts`.

```bash
rm src/media/mediaView.ts
```

- [ ] **Step 4: Commit**

```bash
~/.claude/scripts/commit.sh "test: valida MediaViewCore — audio + video e2e passam"
```

### Task 5: Atualizar docs

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/BACKLOG.md`

- [ ] **Step 1: Atualizar CLAUDE.md**

Na secao media/:
```
  media/
    mediaViewCore.ts       — logica compartilhada audio/video: transport, zoom, regions, keyboard
    mediaViewConfig.ts     — interface de configuracao (video element, CSS prefix, popover)
    mediaCodingModel.ts    — base class generica para audio/video models
    ...
```

- [ ] **Step 2: Atualizar BACKLOG.md**

Marcar "Unificacao Audio/Video View" como FEITO (via composicao).

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md docs/BACKLOG.md
~/.claude/scripts/commit.sh "docs: MediaViewCore via composicao — audio/video unificados"
```

---

## Verificacao final

- `npm run build` — zero erros TS
- `npm run test` — 1269 testes passam
- `npm run test:e2e` — audio-view e video-view specs passam
- AudioView/VideoView herdam direto de ItemView (Obsidian compativel)
- Logica compartilhada em MediaViewCore (~320 LOC)
- audioView.ts: 387 → ~40 LOC
- videoView.ts: 393 → ~45 LOC
- **~350 LOC eliminadas**

## Notas importantes

- `AudioView extends ItemView` e `VideoView extends ItemView` — NAO herdam de MediaView. Obsidian espera heranca direta.
- `MediaViewCore` NAO herda de nada — e pura composicao (recebe contentEl, app, plugin como parametros)
- `view.renderer` continua acessivel via getter — index.ts nao precisa mudar
- `loadAudio()` e `loadVideo()` continuam como metodos publicos delegando pra `core.loadMedia()` — backwards compatible
- `registerEvent` e passado como callback pra evitar dependencia do lifecycle do ItemView

# Unify Audio/Video View — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unificar audioView.ts (387 LOC) e videoView.ts (393 LOC) numa unica MediaView generica, eliminando ~350 LOC de duplicacao.

**Architecture:** Criar `MediaView` em `src/media/mediaView.ts` parametrizada por um config object (`MediaViewConfig`) que captura as 3 diferencas reais: (1) video element sim/nao, (2) como WaveSurfer e inicializado, (3) CSS class prefix. Audio e video viram thin wrappers de ~15 LOC cada. Menus e models ja estao em wrappers thin e ficam como estao.

**Tech Stack:** TypeScript, Obsidian ItemView, WaveSurfer.js

---

## Diferencas reais entre Audio e Video

| Aspecto | Audio | Video |
|---------|-------|-------|
| Video element | Nenhum | `<video>` com controls=false, objectFit |
| WaveSurfer init | `renderer.create(el, url)` | `renderer.create(el, videoElement)` |
| CSS prefix | `codemarker-audio-*` | `codemarker-video-*` |
| View type | `qualia-audio-view` | `qualia-video-view` |
| Icon | `audio-lines` | `video` |
| Display text | `Audio Coding` | `Video Coding` |
| Popover fn | `openAudioCodingPopover` | `openVideoCodingPopover` |
| Settings extra | — | `videoFit: 'contain' \| 'cover'` |

Tudo o resto (transport bar, zoom, volume, speed, regions, keyboard shortcuts, state persistence, time display) e identico.

## Arquivos

| Arquivo | Acao | LOC estimado |
|---|---|---|
| `src/media/mediaView.ts` | Criar | ~350 |
| `src/media/mediaViewConfig.ts` | Criar | ~30 |
| `src/audio/audioView.ts` | Reescrever (387 → ~20) | 20 |
| `src/video/videoView.ts` | Reescrever (393 → ~25) | 25 |
| `styles.css` | Modificar — unificar classes | — |

**Nao muda**: audioCodingModel, videoCodingModel, audioCodingMenu, videoCodingMenu, audioCodingTypes, videoCodingTypes, audio/index.ts, video/index.ts, media/*.ts (waveformRenderer, regionRenderer, etc.)

---

## Chunk 1: Criar MediaView + Config

### Task 1: Criar mediaViewConfig.ts

**Files:**
- Create: `src/media/mediaViewConfig.ts`

- [ ] **Step 1: Criar config interface**

```typescript
// src/media/mediaViewConfig.ts

import type { App } from 'obsidian';
import type { MediaCodingModel } from './mediaCodingModel';
import type { MediaRegionRenderer } from './regionRenderer';

export interface MediaViewConfig {
  /** View type ID registered with Obsidian */
  viewType: string;
  /** Display text when no file is loaded */
  displayLabel: string;
  /** Obsidian icon name */
  icon: string;
  /** CSS class prefix (e.g. 'codemarker-audio' or 'codemarker-video') */
  cssPrefix: string;
  /** Whether to create a <video> element above the waveform */
  hasVideoElement: boolean;
  /** CSS object-fit for video element (only used if hasVideoElement) */
  videoFit?: string;
  /** Function to open the coding popover for this media type */
  openPopover: (
    event: MouseEvent,
    model: MediaCodingModel<any, any, any>,
    filePath: string,
    from: number,
    to: number,
    regionRenderer: MediaRegionRenderer,
    onCancel: () => void,
    app: App,
  ) => void;
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/media/mediaViewConfig.ts
~/.claude/scripts/commit.sh "feat: cria MediaViewConfig — interface de configuracao pra views audio/video"
```

### Task 2: Criar MediaView

**Files:**
- Create: `src/media/mediaView.ts`

- [ ] **Step 1: Criar MediaView generica**

Copiar `audioView.ts` como base, parametrizar com `MediaViewConfig`:

```typescript
// src/media/mediaView.ts

import { ItemView, WorkspaceLeaf, TFile, setIcon } from 'obsidian';
import type QualiaCodingPlugin from '../main';
import { WaveformRenderer } from './waveformRenderer';
import { MediaRegionRenderer } from './regionRenderer';
import { formatTime } from './formatTime';
import type { MediaCodingModel } from './mediaCodingModel';
import type { MediaViewConfig } from './mediaViewConfig';

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export class MediaView extends ItemView {
  private plugin: QualiaCodingPlugin;
  private model: MediaCodingModel<any, any, any>;
  private config: MediaViewConfig;
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
    leaf: WorkspaceLeaf,
    plugin: QualiaCodingPlugin,
    model: MediaCodingModel<any, any, any>,
    config: MediaViewConfig,
  ) {
    super(leaf);
    this.plugin = plugin;
    this.model = model;
    this.config = config;
    this.renderer = new WaveformRenderer();
  }

  getViewType(): string { return this.config.viewType; }
  getDisplayText(): string { return this.currentFile?.basename ?? this.config.displayLabel; }
  getIcon(): string { return this.config.icon; }

  // --- State persistence (identical) ---
  async setState(state: unknown, result: any): Promise<void> { /* same as current */ }
  getState(): Record<string, unknown> { /* same as current */ }

  async onOpen(): Promise<void> {}

  async onClose(): Promise<void> { /* same as current — cleanup renderer, regions, listener */ }

  // --- Load media file ---
  async loadMedia(file: TFile): Promise<void> {
    // Same as current loadAudio/loadVideo, but:

    // 1. Use config.cssPrefix for all class names
    contentEl.addClass(`${this.config.cssPrefix}-view`);

    // 2. Conditionally create video element
    if (this.config.hasVideoElement) {
      const videoEl = document.createElement('video');
      videoEl.controls = false;
      videoEl.preload = 'auto';
      videoEl.playsInline = true;
      if (this.config.videoFit) videoEl.style.objectFit = this.config.videoFit;
      this.videoElement = videoEl;
      const playerContainer = contentEl.createDiv({ cls: `${this.config.cssPrefix}-player` });
      playerContainer.appendChild(videoEl);
    }

    // 3. WaveSurfer init differs:
    const url = this.app.vault.getResourcePath(file);
    if (this.config.hasVideoElement && this.videoElement) {
      this.videoElement.src = url;
      this.renderer.create(this.waveformEl!, this.videoElement);
    } else {
      this.renderer.create(this.waveformEl!, url);
    }

    // 4. Use config.openPopover for region events
    // ... region-created → this.config.openPopover(...)
    // ... region-clicked → this.config.openPopover(...)

    // Everything else (transport, zoom, volume, speed, keyboard, ready/error handlers)
    // is identical — just uses this.config.cssPrefix for class names
  }

  // --- Private helpers (identical) ---
  private updatePlayIcon(): void { /* same */ }
  private updateTimeDisplay(): void { /* same */ }
  private startTimeUpdates(): void { /* same */ }
  private stopTimeUpdates(): void { /* same */ }
  private saveScrollPosition(): void { /* same */ }
}
```

A implementacao real copia o corpo completo de `audioView.ts`, substituindo:
- `'codemarker-audio-*'` → `` `${this.config.cssPrefix}-*` ``
- `openAudioCodingPopover(...)` → `this.config.openPopover(...)`
- O bloco de video element: `if (this.config.hasVideoElement) { ... }`
- `this.renderer.create(el, url)` vs `this.renderer.create(el, videoElement)`: condicionado por `hasVideoElement`

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: PASS (ninguem importa ainda)

- [ ] **Step 3: Commit**

```bash
git add src/media/mediaView.ts
~/.claude/scripts/commit.sh "feat: cria MediaView generica — unifica logica audio/video em ~350 LOC"
```

---

## Chunk 2: Converter Audio e Video para wrappers

### Task 3: Converter audioView.ts

**Files:**
- Modify: `src/audio/audioView.ts` (387 → ~20 LOC)

- [ ] **Step 1: Reescrever audioView.ts como wrapper**

```typescript
// src/audio/audioView.ts

import type { WorkspaceLeaf } from 'obsidian';
import type QualiaCodingPlugin from '../main';
import { MediaView } from '../media/mediaView';
import type { AudioCodingModel } from './audioCodingModel';
import { openAudioCodingPopover } from './audioCodingMenu';

export const AUDIO_VIEW_TYPE = 'qualia-audio-view';

export class AudioView extends MediaView {
  constructor(leaf: WorkspaceLeaf, plugin: QualiaCodingPlugin, model: AudioCodingModel) {
    super(leaf, plugin, model, {
      viewType: AUDIO_VIEW_TYPE,
      displayLabel: 'Audio Coding',
      icon: 'audio-lines',
      cssPrefix: 'codemarker-audio',
      hasVideoElement: false,
      openPopover: openAudioCodingPopover,
    });
  }
}
```

- [ ] **Step 2: Build + test**

Run: `npm run build && npm run test`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/audio/audioView.ts
~/.claude/scripts/commit.sh "refactor: audioView vira wrapper de MediaView (~20 LOC)"
```

### Task 4: Converter videoView.ts

**Files:**
- Modify: `src/video/videoView.ts` (393 → ~25 LOC)

- [ ] **Step 1: Reescrever videoView.ts como wrapper**

```typescript
// src/video/videoView.ts

import type { WorkspaceLeaf } from 'obsidian';
import type QualiaCodingPlugin from '../main';
import { MediaView } from '../media/mediaView';
import type { VideoCodingModel } from './videoCodingModel';
import { openVideoCodingPopover } from './videoCodingMenu';

export const VIDEO_VIEW_TYPE = 'qualia-video-view';

export class VideoView extends MediaView {
  constructor(leaf: WorkspaceLeaf, plugin: QualiaCodingPlugin, model: VideoCodingModel) {
    super(leaf, plugin, model, {
      viewType: VIDEO_VIEW_TYPE,
      displayLabel: 'Video Coding',
      icon: 'video',
      cssPrefix: 'codemarker-video',
      hasVideoElement: true,
      videoFit: model.settings.videoFit,
      openPopover: openVideoCodingPopover,
    });
  }
}
```

- [ ] **Step 2: Build + test**

Run: `npm run build && npm run test`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/video/videoView.ts
~/.claude/scripts/commit.sh "refactor: videoView vira wrapper de MediaView (~25 LOC)"
```

---

## Chunk 3: CSS + validacao

### Task 5: Unificar CSS classes (opcional)

**Files:**
- Modify: `styles.css` (se necessario)

As classes CSS atuais usam prefixos separados (`codemarker-audio-*` e `codemarker-video-*`). Como a MediaView usa `config.cssPrefix` dinamicamente, **nao precisa mudar o CSS** — cada engine continua gerando suas proprias classes. Se quiser unificar no futuro (ex: `codemarker-media-*`), e so mudar os prefixos nos configs.

- [ ] **Step 1: Verificar que CSS nao quebrou**

Run: `npm run test:e2e -- --spec test/e2e/specs/audio-view.e2e.ts`
Run: `npm run test:e2e -- --spec test/e2e/specs/video-view.e2e.ts`
Expected: PASS

- [ ] **Step 2: Rodar suite completa**

Run: `npm run build && npm run test && npm run test:e2e`
Expected: Tudo verde

- [ ] **Step 3: Commit**

```bash
~/.claude/scripts/commit.sh "test: valida MediaView unificada — audio + video e2e passam"
```

### Task 6: Atualizar docs

**Files:**
- Modify: `CLAUDE.md` — adicionar mediaView.ts na estrutura
- Modify: `docs/BACKLOG.md` — marcar item como FEITO

- [ ] **Step 1: Atualizar CLAUDE.md**

Na secao media/:
```
  media/
    mediaView.ts           — MediaView generica: transport, zoom, regions, keyboard (~350 LOC)
    mediaViewConfig.ts     — interface de configuracao (video element, CSS prefix, popover)
    mediaCodingModel.ts    — base class generica para audio/video models
    ...
```

- [ ] **Step 2: Atualizar BACKLOG.md**

Marcar "Unificacao Audio/Video View" como FEITO. Atualizar metricas.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md docs/BACKLOG.md
~/.claude/scripts/commit.sh "docs: MediaView unificada — audio/video wrappers de ~20 LOC cada"
```

---

## Verificacao final

- `npm run build` — zero erros TS
- `npm run test` — todos os testes unitarios passam
- `npm run test:e2e` — audio-view e video-view specs passam
- `audioView.ts` caiu de 387 para ~20 LOC
- `videoView.ts` caiu de 393 para ~25 LOC
- `mediaView.ts` novo com ~350 LOC (logica unificada)
- Nenhum consumer externo quebrou (index.ts de audio/video importam as mesmas classes)

## LOC impact

| Arquivo | Antes | Depois |
|---------|-------|--------|
| audioView.ts | 387 | ~20 |
| videoView.ts | 393 | ~25 |
| mediaView.ts | — | ~350 |
| mediaViewConfig.ts | — | ~30 |
| **Total** | 780 | ~425 |
| **Eliminado** | | **~355 LOC** |

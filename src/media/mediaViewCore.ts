import { TFile, setIcon, type App, type EventRef } from 'obsidian';
import type QualiaCodingPlugin from '../main';
import { WaveformRenderer } from './waveformRenderer';
import { MediaRegionRenderer } from './regionRenderer';
import { formatTime } from './formatTime';
import type { MediaCodingModel } from './mediaCodingModel';
import type { MediaViewConfig } from './mediaViewConfig';

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

/**
 * Shared media view logic — used via composition by AudioView and VideoView.
 * Does NOT inherit from ItemView. Receives contentEl and callbacks from the host view.
 */
export class MediaViewCore {
  readonly renderer: WaveformRenderer;
  private readyResolve: (() => void) | null = null;
  private readyPromise: Promise<void> = new Promise(r => { this.readyResolve = r; });
  private regionRenderer: MediaRegionRenderer | null = null;
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;
  private keydownEl: HTMLElement | null = null;
  // Internal tracking for save-scroll when loadMedia runs without a prior cleanup
  // (safety net for rapid file swaps). NOT a mirror of view.file — do not expose.
  private loadedFile: TFile | null = null;
  // Local mirror of the WaveSurfer scroll position. We can't rely on
  // renderer.getScroll() at cleanup time: between the user's last scroll
  // gesture and Obsidian's onUnloadFile callback, WaveSurfer's internal
  // scroll state gets reset to 0 (likely due to DOM teardown). Keeping a
  // mirror updated from the 'scroll' event captures the last known value
  // before the reset.
  private lastKnownScroll = 0;
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
  private cssChangeRef: EventRef | null = null;

  constructor(
    private app: App,
    private plugin: QualiaCodingPlugin,
    private model: MediaCodingModel<any, any, any>,
    private config: MediaViewConfig,
  ) {
    this.renderer = new WaveformRenderer();
  }

  waitUntilReady(): Promise<void> { return this.readyPromise; }

  async loadMedia(
    contentEl: HTMLElement,
    file: TFile,
    registerEvent: (ref: EventRef) => void,
  ): Promise<void> {
    this.readyPromise = new Promise(r => { this.readyResolve = r; });
    // Safety net: if cleanup(file) wasn't called (e.g. rapid swap without unload),
    // persist scroll of the previously loaded file before discarding state.
    if (this.loadedFile) this.saveScrollPosition(this.loadedFile);
    this.lastKnownScroll = 0;
    this.stopTimeUpdates();
    if (this.changeListener) {
      this.model.offChange(this.changeListener);
      this.changeListener = null;
    }
    if (this.regionRenderer) {
      this.regionRenderer.clear();
      this.regionRenderer = null;
    }
    this.renderer.destroy();

    this.loadedFile = file;

    const prefix = this.config.cssPrefix;
    contentEl.empty();
    contentEl.addClass(`${prefix}-view`);

    // Video element (only for video)
    if (this.config.hasVideoElement) {
      const videoEl = document.createElement('video');
      videoEl.controls = false;
      videoEl.preload = 'auto';
      videoEl.playsInline = true;
      if (this.config.videoFit) videoEl.style.objectFit = this.config.videoFit;
      this.videoElement = videoEl;
      const playerContainer = contentEl.createDiv({ cls: `${prefix}-player` });
      playerContainer.appendChild(videoEl);
    }

    // Waveform container
    this.waveformEl = contentEl.createDiv({ cls: `${prefix}-waveform` });

    // Loading indicator
    const loadingEl = this.waveformEl.createDiv({ cls: `${prefix}-loading`, text: `Loading ${this.config.displayLabel.toLowerCase()}...` });

    // Timeline ruler
    const timelineEl = contentEl.createDiv({ cls: `${prefix}-timeline` });
    this.renderer.setTimelineContainer(timelineEl);

    // Transport bar
    const transport = contentEl.createDiv({ cls: `${prefix}-transport` });

    this.playBtn = transport.createDiv({ cls: `${prefix}-play-btn`, attr: { 'aria-label': 'Play / Pause' } });
    setIcon(this.playBtn, 'play');
    this.playBtn.addEventListener('click', () => {
      this.renderer.playPause();
      this.updatePlayIcon();
    });

    this.timeEl = transport.createDiv({ cls: `${prefix}-time`, text: '0:00.0 / 0:00.0' });

    // Spacer
    transport.createDiv({ cls: `${prefix}-spacer` });

    // Zoom
    const defaultZoom = this.model.settings.defaultZoom;
    const fileState = this.model.settings.fileStates[file.path];
    const initialZoom = fileState?.zoom ?? defaultZoom;
    this.zoomLabel = transport.createDiv({ cls: `${prefix}-zoom-label`, text: `Zoom ${initialZoom}` });
    this.zoomSlider = transport.createEl('input', {
      cls: `${prefix}-zoom`,
      attr: { type: 'range', min: '10', max: '200', value: String(initialZoom), 'aria-label': 'Zoom' },
    });
    this.zoomSlider.addEventListener('input', () => {
      const val = parseInt(this.zoomSlider!.value);
      this.renderer.zoom(val);
      if (this.zoomLabel) this.zoomLabel.textContent = `Zoom ${val}`;
      const states = this.model.settings.fileStates;
      states[file.path] = {
        ...(states[file.path] ?? { lastPosition: 0 }),
        zoom: val,
      };
      this.model.save();
    });

    // Separator
    transport.createDiv({ cls: `${prefix}-separator` });

    // Volume
    const volumeIcon = transport.createDiv({ cls: `${prefix}-volume-icon` });
    setIcon(volumeIcon, 'volume-2');
    this.volumeSlider = transport.createEl('input', {
      cls: `${prefix}-volume`,
      attr: { type: 'range', min: '0', max: '1', step: '0.05', value: '1', 'aria-label': 'Volume' },
    });
    this.volumeSlider.addEventListener('input', () => {
      const vol = parseFloat(this.volumeSlider!.value);
      this.renderer.setVolume(vol);
    });

    // Speed
    this.speedIndex = 2;
    this.speedBtn = transport.createDiv({
      cls: `${prefix}-speed-btn`,
      text: '1×',
      attr: { 'aria-label': 'Playback speed' },
    });
    this.speedBtn.addEventListener('click', () => {
      this.speedIndex = (this.speedIndex + 1) % SPEED_OPTIONS.length;
      const rate = SPEED_OPTIONS[this.speedIndex]!;
      this.renderer.setPlaybackRate(rate);
      if (this.speedBtn) this.speedBtn.textContent = rate + '×';
    });

    // Theme change listener (remove previous to avoid accumulation on file switch)
    if (this.cssChangeRef) this.app.workspace.offref(this.cssChangeRef);
    this.cssChangeRef = this.app.workspace.on('css-change', () => this.renderer.applyThemeColors());
    registerEvent(this.cssChangeRef);

    // Create WaveSurfer — audio: URL only, video: video element as media source
    const url = this.app.vault.getResourcePath(file);
    if (this.config.hasVideoElement && this.videoElement) {
      this.videoElement.src = url;
      this.renderer.create(this.waveformEl, this.videoElement);
    } else {
      this.renderer.create(this.waveformEl, url);
    }

    // Create region renderer
    this.regionRenderer = new MediaRegionRenderer(this.renderer, this.model);
    this.regionRenderer.setNavigateCallback((mid, cn) => {
      document.dispatchEvent(new CustomEvent('codemarker:label-click', {
        detail: { markerId: mid, codeName: cn },
      }));
    });
    this.regionRenderer.subscribeToHover();

    // When ready, restore regions, zoom, and update display
    this.renderer.on('ready', () => {
      this.readyResolve?.();
      loadingEl.remove();
      this.updateTimeDisplay();
      this.startTimeUpdates();

      this.regionRenderer?.restoreRegions(file.path);

      this.changeListener = () => {
        this.regionRenderer?.restoreRegions(file.path);
      };
      this.model.onChange(this.changeListener);

      const savedState = this.model.settings.fileStates[file.path];
      const zoom = savedState?.zoom ?? this.model.settings.defaultZoom;
      this.renderer.zoom(zoom);
      if (this.zoomSlider) this.zoomSlider.value = String(zoom);
      if (this.zoomLabel) this.zoomLabel.textContent = `Zoom ${zoom}`;

      // Mirror WaveSurfer's scroll position as it changes. Needed because
      // getScroll() at cleanup time returns 0 (WaveSurfer resets its internal
      // state before onUnloadFile runs).
      this.renderer.on('scroll', (_visibleStart: number, _visibleEnd: number, scrollLeft: number) => {
        this.lastKnownScroll = scrollLeft;
      });

      const scrollPos = savedState?.lastPosition ?? 0;
      const currentTime = savedState?.lastCurrentTime ?? 0;
      if (scrollPos > 0 || currentTime > 0) {
        // autoCenter: true (WaveSurfer option) would center the playhead in the
        // viewport and override our setScroll. Keep it OFF during the restore;
        // re-enable it on 'play' below — that's when autoCenter is actually
        // useful (playhead following during playback).
        this.renderer.setAutoCenter(false);
        if (currentTime > 0) this.renderer.seekTo(currentTime);
        if (scrollPos > 0) {
          requestAnimationFrame(() => this.renderer.setScroll(scrollPos));
        }
      }
    });

    // Error state — also resolve readiness so callers don't hang
    this.renderer.on('error', (err: Error) => {
      this.readyResolve?.();
      loadingEl?.remove();
      this.waveformEl!.createDiv({
        cls: `${prefix}-error`,
        text: 'Failed to load: ' + (err?.message || 'Unknown error'),
      });
    });

    // ── Region events ──
    const regionsPlugin = this.renderer.getRegionsPlugin();
    if (regionsPlugin) {
      regionsPlugin.on('region-created', (region: any) => {
        if (this.regionRenderer?.isRestoring) return;
        if (this.regionRenderer?.getMarkerIdForRegion(region.id)) return;

        const waveformRect = this.waveformEl?.getBoundingClientRect();
        const fakeEvent = {
          clientX: waveformRect ? waveformRect.left + waveformRect.width / 2 : 400,
          clientY: waveformRect ? waveformRect.top + 20 : 200,
        } as MouseEvent;

        this.config.openPopover(
          fakeEvent, this.model, file.path, region.start, region.end,
          this.regionRenderer!, () => { region.remove(); }, this.app,
        );
      });

      regionsPlugin.on('region-mouseenter', (region: any) => {
        const markerId = this.regionRenderer?.getMarkerIdForRegion(region.id);
        if (!markerId) return;
        const marker = this.model.findMarkerById(markerId);
        const firstCodeName = marker?.codes[0] ? (this.model.registry.getById(marker.codes[0].codeId)?.name ?? null) : null;
        this.model.setHoverState(markerId, firstCodeName);
      });
      regionsPlugin.on('region-mouseleave', () => {
        this.model.setHoverState(null, null);
      });

      regionsPlugin.on('region-update-end', (region: any) => {
        const markerId = this.regionRenderer?.getMarkerIdForRegion(region.id);
        if (!markerId) return;
        this.model.updateMarkerBounds(markerId, region.start, region.end);
        this.regionRenderer?.refreshRegion(markerId);
      });

      regionsPlugin.on('region-double-clicked', (region: any, e: MouseEvent) => {
        e.stopPropagation();
        region.play();
        this.updatePlayIcon();
      });

      regionsPlugin.on('region-clicked', (region: any, e: MouseEvent) => {
        const markerId = this.regionRenderer?.getMarkerIdForRegion(region.id);
        if (!markerId) return;
        const marker = this.model.findMarkerById(markerId);
        if (!marker) return;
        e.stopPropagation();

        this.config.openPopover(
          e, this.model, file.path, marker.from, marker.to,
          this.regionRenderer!, () => {}, this.app,
        );
      });
    }

    // Update play icon on play/pause events
    this.renderer.on('play', () => {
      // Re-enable autoCenter on first play — now the playhead should follow
      // the viewport. (Disabled during restore to protect the saved scroll.)
      this.renderer.setAutoCenter(true);
      this.updatePlayIcon();
    });
    this.renderer.on('pause', () => this.updatePlayIcon());
    this.renderer.on('finish', () => this.updatePlayIcon());
    this.renderer.on('seeking', () => this.updateTimeDisplay());

    // Remove previous keydown handler (prevents accumulation on file switch)
    if (this.keydownHandler && this.keydownEl) {
      this.keydownEl.removeEventListener('keydown', this.keydownHandler);
    }

    // Keyboard shortcuts
    contentEl.tabIndex = 0;
    this.keydownHandler = (e: KeyboardEvent) => {
      switch (e.key) {
        case ' ':
          e.preventDefault();
          this.renderer.playPause();
          this.updatePlayIcon();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          this.renderer.skip(e.shiftKey ? -1 : -5);
          this.updateTimeDisplay();
          break;
        case 'ArrowRight':
          e.preventDefault();
          this.renderer.skip(e.shiftKey ? 1 : 5);
          this.updateTimeDisplay();
          break;
      }
    };
    contentEl.addEventListener('keydown', this.keydownHandler);
    this.keydownEl = contentEl;
  }

  cleanup(file?: TFile): void {
    if (this.keydownHandler && this.keydownEl) {
      this.keydownEl.removeEventListener('keydown', this.keydownHandler);
      this.keydownHandler = null;
      this.keydownEl = null;
    }
    if (file) this.saveScrollPosition(file);
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
    this.loadedFile = null;
  }

  private updatePlayIcon(): void {
    if (!this.playBtn) return;
    this.playBtn.empty();
    setIcon(this.playBtn, this.renderer.isPlaying() ? 'pause' : 'play');
  }

  private updateTimeDisplay(): void {
    if (!this.timeEl) return;
    const current = formatTime(this.renderer.getCurrentTime());
    const total = formatTime(this.renderer.getDuration());
    this.timeEl.textContent = `${current} / ${total}`;
  }

  private startTimeUpdates(): void {
    this.stopTimeUpdates();
    this.timeInterval = setInterval(() => {
      if (this.renderer.isPlaying()) {
        this.updateTimeDisplay();
      }
    }, 100);
  }

  private stopTimeUpdates(): void {
    if (this.timeInterval) {
      clearInterval(this.timeInterval);
      this.timeInterval = null;
    }
  }

  private saveScrollPosition(file: TFile): void {
    const states = this.model.settings.fileStates;
    states[file.path] = {
      ...(states[file.path] ?? { zoom: this.model.settings.defaultZoom }),
      lastPosition: this.lastKnownScroll,
      lastCurrentTime: this.renderer.getCurrentTime(),
    };
    this.model.save();
  }
}

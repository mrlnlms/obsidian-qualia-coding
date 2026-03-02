import { ItemView, WorkspaceLeaf, TFile, setIcon } from 'obsidian';
import type QualiaCodingPlugin from '../main';
import { WaveformRenderer } from '../media/waveformRenderer';
import { MediaRegionRenderer } from '../media/regionRenderer';
import { formatTime } from '../media/formatTime';
import type { VideoCodingModel } from './videoCodingModel';
import { openVideoCodingPopover } from './videoCodingMenu';

export const VIDEO_VIEW_TYPE = 'qualia-video-view';
const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export class VideoView extends ItemView {
  private plugin: QualiaCodingPlugin;
  private model: VideoCodingModel;
  private renderer: WaveformRenderer;
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

  constructor(leaf: WorkspaceLeaf, plugin: QualiaCodingPlugin, model: VideoCodingModel) {
    super(leaf);
    this.plugin = plugin;
    this.model = model;
    this.renderer = new WaveformRenderer();
  }

  getViewType(): string {
    return VIDEO_VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.currentFile?.basename ?? 'Video Coding';
  }

  getIcon(): string {
    return 'video';
  }

  // ── State persistence ──

  async setState(state: unknown, result: any): Promise<void> {
    const s = state as Record<string, unknown>;
    const filePath = s?.file as string | undefined;
    if (filePath) {
      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (file instanceof TFile) {
        await this.loadVideo(file);
      }
    }
    await super.setState(state, result);
  }

  getState(): Record<string, unknown> {
    return {
      file: this.currentFile?.path ?? '',
    };
  }

  // ── Lifecycle ──

  async onOpen(): Promise<void> {}

  async onClose(): Promise<void> {
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
    this.contentEl.empty();
  }

  // ── Load video file ──

  async loadVideo(file: TFile): Promise<void> {
    this.saveScrollPosition();
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

    this.currentFile = file;
    (this.leaf as any).updateHeader?.();

    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('codemarker-video-view');

    // Video player container
    const videoEl = document.createElement('video');
    videoEl.controls = false;
    videoEl.preload = 'auto';
    videoEl.playsInline = true;
    videoEl.style.objectFit = this.model.settings.videoFit;
    this.videoElement = videoEl;

    const playerContainer = contentEl.createDiv({ cls: 'codemarker-video-player' });
    playerContainer.appendChild(videoEl);

    // Waveform container
    this.waveformEl = contentEl.createDiv({ cls: 'codemarker-video-waveform' });

    // Loading indicator
    const loadingEl = this.waveformEl.createDiv({ cls: 'codemarker-video-loading', text: 'Loading video...' });

    // Timeline ruler
    const timelineEl = contentEl.createDiv({ cls: 'codemarker-video-timeline' });
    this.renderer.setTimelineContainer(timelineEl);

    // Transport bar
    const transport = contentEl.createDiv({ cls: 'codemarker-video-transport' });

    this.playBtn = transport.createDiv({ cls: 'codemarker-video-play-btn', attr: { 'aria-label': 'Play / Pause' } });
    setIcon(this.playBtn, 'play');
    this.playBtn.addEventListener('click', () => {
      this.renderer.playPause();
      this.updatePlayIcon();
    });

    this.timeEl = transport.createDiv({ cls: 'codemarker-video-time', text: '0:00.0 / 0:00.0' });

    // Spacer
    transport.createDiv({ cls: 'codemarker-video-spacer' });

    // Zoom
    const defaultZoom = this.model.settings.defaultZoom;
    const fileState = this.model.settings.fileStates[file.path];
    const initialZoom = fileState?.zoom ?? defaultZoom;
    this.zoomLabel = transport.createDiv({ cls: 'codemarker-video-zoom-label', text: `Zoom ${initialZoom}` });
    this.zoomSlider = transport.createEl('input', {
      cls: 'codemarker-video-zoom',
      attr: { type: 'range', min: '10', max: '200', value: String(initialZoom), 'aria-label': 'Zoom' },
    });
    this.zoomSlider.addEventListener('input', () => {
      const val = parseInt(this.zoomSlider!.value);
      this.renderer.zoom(val);
      if (this.zoomLabel) this.zoomLabel.textContent = `Zoom ${val}`;
      if (this.currentFile) {
        const states = this.model.settings.fileStates;
        states[this.currentFile.path] = {
          ...(states[this.currentFile.path] ?? { lastPosition: 0 }),
          zoom: val,
        };
        this.model.scheduleSave();
      }
    });

    // Separator
    transport.createDiv({ cls: 'codemarker-video-separator' });

    // Volume
    const volumeIcon = transport.createDiv({ cls: 'codemarker-video-volume-icon' });
    setIcon(volumeIcon, 'volume-2');
    this.volumeSlider = transport.createEl('input', {
      cls: 'codemarker-video-volume',
      attr: { type: 'range', min: '0', max: '1', step: '0.05', value: '1', 'aria-label': 'Volume' },
    });
    this.volumeSlider.addEventListener('input', () => {
      const vol = parseFloat(this.volumeSlider!.value);
      this.renderer.setVolume(vol);
    });

    // Speed
    this.speedIndex = 2;
    this.speedBtn = transport.createDiv({
      cls: 'codemarker-video-speed-btn',
      text: '1×',
      attr: { 'aria-label': 'Playback speed' },
    });
    this.speedBtn.addEventListener('click', () => {
      this.speedIndex = (this.speedIndex + 1) % SPEED_OPTIONS.length;
      const rate = SPEED_OPTIONS[this.speedIndex]!;
      this.renderer.setPlaybackRate(rate);
      if (this.speedBtn) this.speedBtn.textContent = rate + '×';
    });

    // Theme change listener
    this.plugin.registerEvent(
      this.app.workspace.on('css-change', () => this.renderer.applyThemeColors())
    );

    // Create WaveSurfer with video element as media source
    const url = this.app.vault.getResourcePath(file);
    this.videoElement!.src = url;
    this.renderer.create(this.waveformEl, this.videoElement!);

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
      loadingEl.remove();
      this.updateTimeDisplay();
      this.startTimeUpdates();

      if (this.regionRenderer && this.currentFile) {
        this.regionRenderer.restoreRegions(this.currentFile.path);
      }

      this.changeListener = () => {
        if (this.regionRenderer && this.currentFile) {
          this.regionRenderer.restoreRegions(this.currentFile.path);
        }
      };
      this.model.onChange(this.changeListener);

      const savedState = this.model.settings.fileStates[file.path];
      const zoom = savedState?.zoom ?? this.model.settings.defaultZoom;
      this.renderer.zoom(zoom);
      if (this.zoomSlider) this.zoomSlider.value = String(zoom);
      if (this.zoomLabel) this.zoomLabel.textContent = `Zoom ${zoom}`;

      const scrollPos = savedState?.lastPosition ?? 0;
      if (scrollPos > 0) {
        requestAnimationFrame(() => this.renderer.setScroll(scrollPos));
      }
    });

    // Error state
    this.renderer.on('error', (err: Error) => {
      loadingEl?.remove();
      this.waveformEl!.createDiv({
        cls: 'codemarker-video-error',
        text: 'Failed to load: ' + (err?.message || 'Unknown error'),
      });
    });

    // ── Region events ──
    const regionsPlugin = this.renderer.getRegionsPlugin();
    if (regionsPlugin) {
      regionsPlugin.on('region-created', (region: any) => {
        if (this.regionRenderer?.getMarkerIdForRegion(region.id)) return;
        const filePath = this.currentFile?.path;
        if (!filePath) return;

        const waveformRect = this.waveformEl?.getBoundingClientRect();
        const fakeEvent = {
          clientX: waveformRect ? waveformRect.left + waveformRect.width / 2 : 400,
          clientY: waveformRect ? waveformRect.top + 20 : 200,
        } as MouseEvent;

        openVideoCodingPopover(
          fakeEvent,
          this.model,
          filePath,
          region.start,
          region.end,
          this.regionRenderer!,
          () => { region.remove(); },
          this.app,
        );
      });

      regionsPlugin.on('region-mouseenter', (region: any) => {
        const markerId = this.regionRenderer?.getMarkerIdForRegion(region.id);
        if (!markerId) return;
        const marker = this.model.findMarkerById(markerId);
        this.model.setHoverState(markerId, marker?.codes[0] ?? null);
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
        if (!marker || !this.currentFile) return;
        e.stopPropagation();

        openVideoCodingPopover(
          e,
          this.model,
          this.currentFile.path,
          marker.from,
          marker.to,
          this.regionRenderer!,
          () => {},
          this.app,
        );
      });
    }

    // Update play icon on play/pause events
    this.renderer.on('play', () => this.updatePlayIcon());
    this.renderer.on('pause', () => this.updatePlayIcon());
    this.renderer.on('finish', () => this.updatePlayIcon());
    this.renderer.on('seeking', () => this.updateTimeDisplay());

    // Keyboard shortcuts
    contentEl.tabIndex = 0;
    contentEl.addEventListener('keydown', (e: KeyboardEvent) => {
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
    });
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

  private saveScrollPosition(): void {
    if (!this.currentFile) return;
    const scroll = this.renderer.getScroll();
    const states = this.model.settings.fileStates;
    states[this.currentFile.path] = {
      ...(states[this.currentFile.path] ?? { zoom: this.model.settings.defaultZoom }),
      lastPosition: scroll,
    };
    this.model.scheduleSave();
  }
}

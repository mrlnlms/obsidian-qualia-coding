import { Plugin, ItemView, WorkspaceLeaf, TFile, Menu, setIcon } from "obsidian";
import { WaveformRenderer } from "./audio/waveformRenderer";
import { AudioRegionRenderer } from "./audio/regionRenderer";
import { AudioCodingModel } from "./coding/audioCodingModel";
import { openAudioCodingPopover } from "./menu/audioCodingMenu";
import { AudioCodeExplorerView, AUDIO_CODE_EXPLORER_VIEW_TYPE } from "./views/audioCodeExplorerView";
import { AudioCodeDetailView, AUDIO_CODE_DETAIL_VIEW_TYPE } from "./views/audioCodeDetailView";
import { formatTime } from "./utils/formatTime";
import { AudioSettingTab } from "./views/audioSettingTab";

const AUDIO_VIEW_TYPE = "codemarker-audio-view";
const AUDIO_EXTENSIONS = new Set(["mp3", "m4a", "wav", "ogg", "flac", "aac"]);
const AUDIO_EXTENSIONS_ARRAY = ["mp3", "m4a", "wav", "ogg", "flac", "aac"];
const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

// ── AudioView ──

class AudioView extends ItemView {
  private plugin: CodeMarkerAudioPlugin;
  private renderer: WaveformRenderer;
  private regionRenderer: AudioRegionRenderer | null = null;
  private currentFile: TFile | null = null;
  private waveformEl: HTMLElement | null = null;
  private playBtn: HTMLElement | null = null;
  private timeEl: HTMLElement | null = null;
  private zoomSlider: HTMLInputElement | null = null;
  private zoomLabel: HTMLElement | null = null;
  private volumeSlider: HTMLInputElement | null = null;
  private speedBtn: HTMLElement | null = null;
  private speedIndex: number = 2; // index into SPEED_OPTIONS (default 1×)
  private timeInterval: ReturnType<typeof setInterval> | null = null;
  private changeListener: (() => void) | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: CodeMarkerAudioPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.renderer = new WaveformRenderer();
  }

  getViewType(): string {
    return AUDIO_VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.currentFile?.basename ?? "CodeMarker Audio";
  }

  getIcon(): string {
    return "audio-lines";
  }

  // ── State persistence ──

  async setState(state: unknown, result: any): Promise<void> {
    const s = state as Record<string, unknown>;
    const filePath = s?.file as string | undefined;
    if (filePath) {
      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (file instanceof TFile) {
        await this.loadAudio(file);
      }
    }
    await super.setState(state, result);
  }

  getState(): Record<string, unknown> {
    return {
      file: this.currentFile?.path ?? "",
    };
  }

  // ── Lifecycle ──

  async onOpen(): Promise<void> {
    // DOM is built in loadAudio() after file is known
  }

  async onClose(): Promise<void> {
    this.saveScrollPosition();
    this.stopTimeUpdates();
    if (this.changeListener) {
      this.plugin.model.offChange(this.changeListener);
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

  // ── Load audio file ──

  async loadAudio(file: TFile): Promise<void> {
    // Cleanup previous
    this.saveScrollPosition();
    this.stopTimeUpdates();
    if (this.changeListener) {
      this.plugin.model.offChange(this.changeListener);
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
    contentEl.addClass("codemarker-audio-view");

    // Waveform container
    this.waveformEl = contentEl.createDiv({ cls: "codemarker-audio-waveform" });

    // Loading indicator
    const loadingEl = this.waveformEl.createDiv({ cls: "codemarker-audio-loading", text: "Loading audio..." });

    // Transport bar
    const transport = contentEl.createDiv({ cls: "codemarker-audio-transport" });

    this.playBtn = transport.createDiv({ cls: "codemarker-audio-play-btn", attr: { "aria-label": "Play / Pause" } });
    setIcon(this.playBtn, "play");
    this.playBtn.addEventListener("click", () => {
      this.renderer.playPause();
      this.updatePlayIcon();
    });

    this.timeEl = transport.createDiv({ cls: "codemarker-audio-time", text: "0:00.0 / 0:00.0" });

    // Spacer
    transport.createDiv({ cls: "codemarker-audio-spacer" });

    // Zoom
    const defaultZoom = this.plugin.model.settings.defaultZoom;
    const fileState = this.plugin.model.settings.fileStates[file.path];
    const initialZoom = fileState?.zoom ?? defaultZoom;
    this.zoomLabel = transport.createDiv({ cls: "codemarker-audio-zoom-label", text: `Zoom ${initialZoom}` });
    this.zoomSlider = transport.createEl("input", {
      cls: "codemarker-audio-zoom",
      attr: { type: "range", min: "10", max: "200", value: String(initialZoom), "aria-label": "Zoom" },
    });
    this.zoomSlider.addEventListener("input", () => {
      const val = parseInt(this.zoomSlider!.value);
      this.renderer.zoom(val);
      if (this.zoomLabel) this.zoomLabel.textContent = `Zoom ${val}`;
      if (this.currentFile) {
        const states = this.plugin.model.settings.fileStates;
        states[this.currentFile.path] = {
          ...(states[this.currentFile.path] ?? { lastPosition: 0 }),
          zoom: val,
        };
        this.plugin.model.scheduleSave();
      }
    });

    // Separator
    transport.createDiv({ cls: "codemarker-audio-separator" });

    // Volume
    const volumeIcon = transport.createDiv({ cls: "codemarker-audio-volume-icon" });
    setIcon(volumeIcon, "volume-2");
    this.volumeSlider = transport.createEl("input", {
      cls: "codemarker-audio-volume",
      attr: { type: "range", min: "0", max: "1", step: "0.05", value: "1", "aria-label": "Volume" },
    });
    this.volumeSlider.addEventListener("input", () => {
      const vol = parseFloat(this.volumeSlider!.value);
      this.renderer.setVolume(vol);
    });

    // Speed
    this.speedIndex = 2; // 1×
    this.speedBtn = transport.createDiv({
      cls: "codemarker-audio-speed-btn",
      text: "1×",
      attr: { "aria-label": "Playback speed" },
    });
    this.speedBtn.addEventListener("click", () => {
      this.speedIndex = (this.speedIndex + 1) % SPEED_OPTIONS.length;
      const rate = SPEED_OPTIONS[this.speedIndex];
      this.renderer.setPlaybackRate(rate);
      if (this.speedBtn) this.speedBtn.textContent = rate + "×";
    });

    // Theme change listener
    this.plugin.registerEvent(
      this.app.workspace.on("css-change", () => this.renderer.applyThemeColors())
    );

    // Create WaveSurfer
    const url = this.app.vault.getResourcePath(file);
    this.renderer.create(this.waveformEl, url);

    // Create region renderer
    this.regionRenderer = new AudioRegionRenderer(this.renderer, this.plugin.model);
    this.regionRenderer.setNavigateCallback((mid, cn) => this.plugin.revealAudioCodeDetailPanel(mid, cn));
    this.regionRenderer.subscribeToHover();

    // When ready, restore regions, zoom, and update display
    this.renderer.on("ready", () => {
      loadingEl.remove();
      this.updateTimeDisplay();
      this.startTimeUpdates();

      // Restore persisted regions
      if (this.regionRenderer && this.currentFile) {
        this.regionRenderer.restoreRegions(this.currentFile.path);
      }

      // Re-render regions when model/settings change
      this.changeListener = () => {
        if (this.regionRenderer && this.currentFile) {
          this.regionRenderer.restoreRegions(this.currentFile.path);
        }
      };
      this.plugin.model.onChange(this.changeListener);

      // Restore persisted zoom
      const savedState = this.plugin.model.settings.fileStates[file.path];
      const zoom = savedState?.zoom ?? this.plugin.model.settings.defaultZoom;
      this.renderer.zoom(zoom);
      if (this.zoomSlider) this.zoomSlider.value = String(zoom);
      if (this.zoomLabel) this.zoomLabel.textContent = `Zoom ${zoom}`;

      // Restore persisted scroll position (defer so zoom layout completes)
      const scrollPos = savedState?.lastPosition ?? 0;
      if (scrollPos > 0) {
        requestAnimationFrame(() => this.renderer.setScroll(scrollPos));
      }
    });

    // Error state
    this.renderer.on("error", (err: Error) => {
      loadingEl?.remove();
      this.waveformEl!.createDiv({
        cls: "codemarker-audio-error",
        text: "Failed to load: " + (err?.message || "Unknown error"),
      });
    });

    // ── Region events ──
    const regionsPlugin = this.renderer.getRegionsPlugin();
    if (regionsPlugin) {
      // New drag-created region
      regionsPlugin.on('region-created', (region: any) => {
        // Skip if this region was programmatically added (already has a marker)
        if (this.regionRenderer?.getMarkerIdForRegion(region.id)) return;

        const filePath = this.currentFile?.path;
        if (!filePath) return;

        // Open coding popover for the new region
        const waveformRect = this.waveformEl?.getBoundingClientRect();
        const fakeEvent = {
          clientX: waveformRect ? waveformRect.left + waveformRect.width / 2 : 400,
          clientY: waveformRect ? waveformRect.top + 20 : 200,
        } as MouseEvent;

        openAudioCodingPopover(
          fakeEvent,
          this.plugin.model,
          filePath,
          region.start,
          region.end,
          this.regionRenderer!,
          () => {
            // onDismissEmpty: remove the WaveSurfer region if no codes were added
            region.remove();
          },
          this.app,
          (mid, cn) => this.plugin.revealAudioCodeDetailPanel(mid, cn),
        );
      });

      // Hover on region
      regionsPlugin.on('region-mouseenter', (region: any) => {
        const markerId = this.regionRenderer?.getMarkerIdForRegion(region.id);
        if (!markerId) return;
        const marker = this.plugin.model.findMarkerById(markerId);
        this.plugin.model.setHoverState(markerId, marker?.codes[0] ?? null);
      });
      regionsPlugin.on('region-mouseleave', () => {
        this.plugin.model.setHoverState(null, null);
      });

      // Resize region
      regionsPlugin.on('region-update-end', (region: any) => {
        const markerId = this.regionRenderer?.getMarkerIdForRegion(region.id);
        if (!markerId) return;
        this.plugin.model.updateMarkerBounds(markerId, region.start, region.end);
        this.regionRenderer?.refreshRegion(markerId);
      });

      // Click on existing region
      regionsPlugin.on('region-clicked', (region: any, e: MouseEvent) => {
        const markerId = this.regionRenderer?.getMarkerIdForRegion(region.id);
        if (!markerId) return;

        const marker = this.plugin.model.findMarkerById(markerId);
        if (!marker || !this.currentFile) return;

        e.stopPropagation();

        openAudioCodingPopover(
          e,
          this.plugin.model,
          this.currentFile.path,
          marker.from,
          marker.to,
          this.regionRenderer!,
          () => {
            // Region already managed by regionRenderer
          },
          this.app,
          (mid, cn) => this.plugin.revealAudioCodeDetailPanel(mid, cn),
        );
      });
    }

    // Update play icon on play/pause events
    this.renderer.on("play", () => this.updatePlayIcon());
    this.renderer.on("pause", () => this.updatePlayIcon());
    this.renderer.on("finish", () => this.updatePlayIcon());

    // Click on waveform updates time
    this.renderer.on("seeking", () => this.updateTimeDisplay());

    // Keyboard shortcuts
    contentEl.tabIndex = 0;
    contentEl.addEventListener("keydown", (e: KeyboardEvent) => {
      switch (e.key) {
        case " ":
          e.preventDefault();
          this.renderer.playPause();
          this.updatePlayIcon();
          break;
        case "ArrowLeft":
          e.preventDefault();
          this.renderer.skip(e.shiftKey ? -1 : -5);
          this.updateTimeDisplay();
          break;
        case "ArrowRight":
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
    setIcon(this.playBtn, this.renderer.isPlaying() ? "pause" : "play");
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
    const states = this.plugin.model.settings.fileStates;
    states[this.currentFile.path] = {
      ...(states[this.currentFile.path] ?? { zoom: this.plugin.model.settings.defaultZoom }),
      lastPosition: scroll,
    };
    this.plugin.model.scheduleSave();
  }
}

// ── Plugin ──

export default class CodeMarkerAudioPlugin extends Plugin {
  model!: AudioCodingModel;

  async onload(): Promise<void> {
    console.log('[obsidian-codemarker-audio] v36.3 loaded — Timeline ruler + region lanes');
    // Initialize coding model
    this.model = new AudioCodingModel(this);
    await this.model.load();

    // Register views
    this.registerView(AUDIO_VIEW_TYPE, (leaf) => new AudioView(leaf, this));
    this.registerView(AUDIO_CODE_EXPLORER_VIEW_TYPE, (leaf) => new AudioCodeExplorerView(leaf, this.model, this));
    this.registerView(AUDIO_CODE_DETAIL_VIEW_TYPE, (leaf) => new AudioCodeDetailView(leaf, this.model, this));

    // Register audio extensions so clicking in file browser opens AudioView
    this.registerExtensions(AUDIO_EXTENSIONS_ARRAY, AUDIO_VIEW_TYPE);

    // Settings tab
    this.addSettingTab(new AudioSettingTab(this.app, this));

    // Context menu on audio files: "Open in CodeMarker Audio"
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu: Menu, file) => {
        if (!(file instanceof TFile)) return;
        if (!AUDIO_EXTENSIONS.has(file.extension.toLowerCase())) return;

        menu.addItem((item) => {
          item
            .setTitle("Open in CodeMarker Audio")
            .setIcon("audio-lines")
            .onClick(() => this.openAudio(file as TFile));
        });
      })
    );

    // Command: open current audio file
    this.addCommand({
      id: "open-audio-coding",
      name: "Open current audio in CodeMarker Audio",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || !AUDIO_EXTENSIONS.has(file.extension.toLowerCase()))
          return false;
        if (!checking) this.openAudio(file);
        return true;
      },
    });

    // Command: open audio explorer
    this.addCommand({
      id: "open-audio-explorer",
      name: "Open Audio Code Explorer",
      callback: () => this.revealAudioCodeExplorer(),
    });

    // Ribbon
    this.addRibbonIcon("audio-lines", "CodeMarker Audio", () => {
      const file = this.app.workspace.getActiveFile();
      if (file && AUDIO_EXTENSIONS.has(file.extension.toLowerCase())) {
        this.openAudio(file);
      }
    });

    // Audio seek from analytics / other plugins
    this.registerEvent(
      (this.app.workspace as any).on('codemarker-audio:seek',
        (payload: { file: string; seekTo: number }) => {
          this.openAudioAndSeek(payload.file, payload.seekTo);
        }
      )
    );

    // File rename tracking
    this.registerEvent(
      this.app.vault.on('rename', (file, oldPath) => {
        if (file instanceof TFile && AUDIO_EXTENSIONS.has(file.extension.toLowerCase())) {
          this.model.migrateFilePath(oldPath, file.path);
        }
      })
    );

    console.log("[CodeMarker Audio] Loaded");
  }

  async onunload(): Promise<void> {
    this.app.workspace.detachLeavesOfType(AUDIO_VIEW_TYPE);
    this.app.workspace.detachLeavesOfType(AUDIO_CODE_EXPLORER_VIEW_TYPE);
    this.app.workspace.detachLeavesOfType(AUDIO_CODE_DETAIL_VIEW_TYPE);
  }

  async openAudio(file: TFile): Promise<void> {
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({
      type: AUDIO_VIEW_TYPE,
      state: { file: file.path },
    });
    this.app.workspace.revealLeaf(leaf);
  }

  async openAudioAndSeek(filePath: string, seekTo: number): Promise<void> {
    // Find existing AudioView with this file
    const leaves = this.app.workspace.getLeavesOfType(AUDIO_VIEW_TYPE);
    for (const leaf of leaves) {
      const view = leaf.view as AudioView;
      const state = view.getState();
      if (state.file === filePath) {
        this.app.workspace.revealLeaf(leaf);
        // View already has the file loaded — just seek
        (view as any).renderer?.seekTo(seekTo);
        return;
      }
    }

    // No existing view — open new one
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) return;

    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({
      type: AUDIO_VIEW_TYPE,
      state: { file: filePath },
    });
    this.app.workspace.revealLeaf(leaf);

    // Seek after WaveSurfer is ready
    const view = leaf.view as AudioView;
    (view as any).renderer?.on("ready", () => {
      (view as any).renderer?.seekTo(seekTo);
    });
  }

  async revealAudioCodeExplorer(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(AUDIO_CODE_EXPLORER_VIEW_TYPE);
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = this.app.workspace.getRightLeaf(false);
    if (leaf) {
      await leaf.setViewState({ type: AUDIO_CODE_EXPLORER_VIEW_TYPE, active: true });
      this.app.workspace.revealLeaf(leaf);
    }
  }

  async revealAudioCodeDetailPanel(markerId: string, codeName: string): Promise<void> {
    let leaf: WorkspaceLeaf | null = null;
    const existing = this.app.workspace.getLeavesOfType(AUDIO_CODE_DETAIL_VIEW_TYPE);

    if (existing.length > 0) {
      leaf = existing[0];
    } else {
      leaf = this.app.workspace.getRightLeaf(false);
      if (leaf) {
        await leaf.setViewState({ type: AUDIO_CODE_DETAIL_VIEW_TYPE, active: true });
      }
    }

    if (leaf) {
      this.app.workspace.revealLeaf(leaf);
      const view = leaf.view as AudioCodeDetailView;
      if (view.setContext) {
        view.setContext(markerId, codeName);
      }
    }
  }
}

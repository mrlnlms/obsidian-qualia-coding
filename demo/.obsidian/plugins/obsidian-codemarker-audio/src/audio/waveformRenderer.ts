import WaveSurfer from "wavesurfer.js";
// @ts-ignore — moduleResolution 'node' can't resolve .esm.js subpath, but esbuild handles it
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions.esm.js";

export class WaveformRenderer {
  private ws: WaveSurfer | null = null;
  private regionsPlugin: RegionsPlugin | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private resizeTimer: ReturnType<typeof setTimeout> | null = null;

  create(container: HTMLElement, url: string): void {
    this.destroy();

    const colors = this.readThemeColors();

    this.regionsPlugin = RegionsPlugin.create();

    this.ws = WaveSurfer.create({
      container,
      url,
      waveColor: colors.wave,
      progressColor: colors.progress,
      cursorColor: colors.cursor,
      height: "auto",
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      normalize: true,
      interact: true,
      plugins: [this.regionsPlugin],
    });

    this.ws.on('ready', () => {
      const accent = this.readAccentHex();
      this.regionsPlugin!.enableDragSelection({
        color: accent + '26',
      });
    });

    this.resizeObserver = new ResizeObserver(() => {
      if (this.resizeTimer) clearTimeout(this.resizeTimer);
      this.resizeTimer = setTimeout(() => {
        if (this.ws) {
          const zoom = this.ws.options.minPxPerSec ?? 0;
          this.ws.zoom(zoom);
        }
      }, 100);
    });
    this.resizeObserver.observe(container);
  }

  destroy(): void {
    if (this.resizeTimer) clearTimeout(this.resizeTimer);
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.ws) {
      this.ws.destroy();
      this.ws = null;
    }
    this.regionsPlugin = null;
  }

  // ── Regions API ──

  getRegionsPlugin(): RegionsPlugin | null {
    return this.regionsPlugin;
  }

  addRegion(params: { id: string; start: number; end: number; color: string; content?: HTMLElement }): any {
    if (!this.regionsPlugin) return null;
    return this.regionsPlugin.addRegion(params);
  }

  clearRegions(): void {
    this.regionsPlugin?.clearRegions();
  }

  getRegionById(id: string): any | undefined {
    if (!this.regionsPlugin) return undefined;
    const regions = this.regionsPlugin.getRegions();
    return regions.find((r: any) => r.id === id);
  }

  // ── Playback ──

  play(): void {
    this.ws?.play();
  }

  pause(): void {
    this.ws?.pause();
  }

  playPause(): void {
    this.ws?.playPause();
  }

  isPlaying(): boolean {
    return this.ws?.isPlaying() ?? false;
  }

  getCurrentTime(): number {
    return this.ws?.getCurrentTime() ?? 0;
  }

  getDuration(): number {
    return this.ws?.getDuration() ?? 0;
  }

  zoom(pxPerSec: number): void {
    this.ws?.zoom(pxPerSec);
  }

  seekTo(seconds: number): void {
    if (!this.ws) return;
    const duration = this.ws.getDuration();
    if (duration > 0) {
      this.ws.seekTo(seconds / duration);
    }
  }

  setVolume(vol: number): void {
    this.ws?.setVolume(vol);
  }

  setPlaybackRate(rate: number): void {
    this.ws?.setPlaybackRate(rate);
  }

  skip(seconds: number): void {
    if (!this.ws) return;
    const current = this.ws.getCurrentTime();
    const duration = this.ws.getDuration();
    if (duration <= 0) return;
    const target = Math.max(0, Math.min(duration, current + seconds));
    this.ws.seekTo(target / duration);
  }

  on(event: string, callback: (...args: any[]) => void): void {
    this.ws?.on(event as any, callback);
  }

  applyThemeColors(): void {
    if (!this.ws) return;
    const colors = this.readThemeColors();
    this.ws.setOptions({
      waveColor: colors.wave,
      progressColor: colors.progress,
      cursorColor: colors.cursor,
    });
  }

  readAccentHex(): string {
    const style = getComputedStyle(document.body);
    const accent = style.getPropertyValue("--interactive-accent").trim();
    if (accent && accent.startsWith('#')) return accent;
    // Parse rgb(r, g, b) → #rrggbb
    const m = accent.match(/(\d+)/g);
    if (m && m.length >= 3) {
      const hex = (i: number) => parseInt(m[i]).toString(16).padStart(2, '0');
      return '#' + hex(0) + hex(1) + hex(2);
    }
    return '#6200EE';
  }

  private readThemeColors(): { wave: string; progress: string; cursor: string } {
    const style = getComputedStyle(document.body);
    const isDark = document.body.classList.contains("theme-dark");

    const wave = style.getPropertyValue("--color-base-50").trim() || (isDark ? "#555" : "#ccc");
    const progress = style.getPropertyValue("--interactive-accent").trim() || "#6200EE";
    const cursor = style.getPropertyValue("--text-accent").trim() || "#6200EE";

    return { wave, progress, cursor };
  }
}

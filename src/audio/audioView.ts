import { ItemView, WorkspaceLeaf, TFile } from 'obsidian';
import type QualiaCodingPlugin from '../main';
import { MediaViewCore } from '../media/mediaViewCore';
import type { AudioCodingModel } from './audioCodingModel';
import { openAudioCodingPopover } from './audioCodingMenu';

export const AUDIO_VIEW_TYPE = 'qualia-audio-view';

export class AudioView extends ItemView {
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

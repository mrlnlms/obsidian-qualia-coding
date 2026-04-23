import { FileView, WorkspaceLeaf, TFile } from 'obsidian';
import type QualiaCodingPlugin from '../main';
import { MediaViewCore } from '../media/mediaViewCore';
import type { AudioCodingModel } from './audioCodingModel';
import { openAudioCodingPopover } from './audioCodingMenu';
import { AUDIO_VIEW_TYPE } from '../core/mediaViewTypes';

export { AUDIO_VIEW_TYPE };

export const AUDIO_EXTENSIONS = new Set(['mp3', 'm4a', 'wav', 'ogg', 'flac', 'aac', 'wma', 'aiff', 'opus', 'webm']);

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

  async onUnloadFile(file: TFile): Promise<void> {
    this.core.cleanup(file);
    this.contentEl.empty();
  }
}

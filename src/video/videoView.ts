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

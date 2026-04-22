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

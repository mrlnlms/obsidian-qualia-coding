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
    model: any,
    filePath: string,
    from: number,
    to: number,
    regionRenderer: MediaRegionRenderer,
    onCancel: () => void,
    app: App,
  ) => void;
}

/**
 * Video coding popover — delegates to shared openMediaCodingPopover().
 */

import type { App } from 'obsidian';
import type { VideoCodingModel } from './videoCodingModel';
import type { MediaRegionRenderer } from '../media/regionRenderer';
import { openMediaCodingPopover } from '../media/mediaCodingMenu';

export function openVideoCodingPopover(
	mouseEvent: MouseEvent,
	model: VideoCodingModel,
	filePath: string,
	regionStart: number,
	regionEnd: number,
	regionRenderer: MediaRegionRenderer,
	onDismissEmpty: () => void,
	app: App,
	savedPos?: { x: number; y: number },
): void {
	openMediaCodingPopover(mouseEvent, model, filePath, regionStart, regionEnd, regionRenderer, onDismissEmpty, app, savedPos);
}

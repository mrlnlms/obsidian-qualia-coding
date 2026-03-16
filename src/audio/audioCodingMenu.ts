/**
 * Audio coding popover — delegates to shared openMediaCodingPopover().
 */

import type { App } from 'obsidian';
import type { AudioCodingModel } from './audioCodingModel';
import type { MediaRegionRenderer } from '../media/regionRenderer';
import { openMediaCodingPopover } from '../media/mediaCodingMenu';

export function openAudioCodingPopover(
	mouseEvent: MouseEvent,
	model: AudioCodingModel,
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

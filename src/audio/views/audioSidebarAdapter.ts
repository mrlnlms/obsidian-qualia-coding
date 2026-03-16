/**
 * AudioSidebarAdapter — thin subclass of MediaSidebarAdapter for audio engine.
 */

import type { AudioCodingModel } from '../audioCodingModel';
import type { AudioMarker } from '../audioCodingTypes';
import { MediaSidebarAdapter, type MediaBaseMarker } from '../../media/mediaSidebarAdapter';

export interface AudioBaseMarker extends MediaBaseMarker {
	mediaType: 'audio';
}

export class AudioSidebarAdapter extends MediaSidebarAdapter<AudioMarker, AudioBaseMarker> {
	constructor(model: AudioCodingModel) {
		super(model, 'audio');
	}
}

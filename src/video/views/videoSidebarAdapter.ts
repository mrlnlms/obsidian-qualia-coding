/**
 * VideoSidebarAdapter — thin subclass of MediaSidebarAdapter for video engine.
 */

import type { VideoCodingModel } from '../videoCodingModel';
import type { VideoMarker } from '../videoCodingTypes';
import { MediaSidebarAdapter, type MediaBaseMarker } from '../../media/mediaSidebarAdapter';

export interface VideoBaseMarker extends MediaBaseMarker {
	mediaType: 'video';
}

export class VideoSidebarAdapter extends MediaSidebarAdapter<VideoMarker, VideoBaseMarker> {
	constructor(model: VideoCodingModel) {
		super(model, 'video');
	}
}

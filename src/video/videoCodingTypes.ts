import type { MediaMarker, MediaFile, BaseMediaSettings } from '../media/mediaTypes';
import { DEFAULT_MEDIA_SETTINGS } from '../media/mediaTypes';

export interface VideoMarker extends MediaMarker {}

export interface VideoFile extends MediaFile<VideoMarker> {}

export interface VideoSettings extends BaseMediaSettings {
	videoFit: 'contain' | 'cover';
}

export const DEFAULT_VIDEO_SETTINGS: VideoSettings = {
	...DEFAULT_MEDIA_SETTINGS,
	videoFit: 'contain',
};

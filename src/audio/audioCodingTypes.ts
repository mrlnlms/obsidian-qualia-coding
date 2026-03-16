import type { MediaMarker, MediaFile, BaseMediaSettings } from '../media/mediaTypes';
import { DEFAULT_MEDIA_SETTINGS } from '../media/mediaTypes';

export interface AudioMarker extends MediaMarker {}

export interface AudioFile extends MediaFile<AudioMarker> {}

export interface AudioSettings extends BaseMediaSettings {}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
	...DEFAULT_MEDIA_SETTINGS,
};

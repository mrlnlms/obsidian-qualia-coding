import type { MediaMarker } from '../media/mediaTypes';

export interface VideoMarker extends MediaMarker {}

export interface VideoFile {
	path: string;
	markers: VideoMarker[];
}

export interface VideoSettings {
	defaultZoom: number;
	regionOpacity: number;
	showLabelsOnRegions: boolean;
	videoFit: 'contain' | 'cover';
	fileStates: Record<string, { zoom: number; lastPosition: number }>;
}

export const DEFAULT_VIDEO_SETTINGS: VideoSettings = {
	defaultZoom: 50,
	regionOpacity: 0.4,
	showLabelsOnRegions: true,
	videoFit: 'contain',
	fileStates: {},
};

export interface AudioMarker {
	id: string;
	from: number;
	to: number;
	codes: string[];
	memo?: string;
	createdAt: number;
}

export interface AudioFile {
	path: string;
	markers: AudioMarker[];
}

export interface AudioPluginData {
	files: AudioFile[];
	codeDefinitions: any;
	settings: AudioSettings;
}

export interface AudioSettings {
	defaultZoom: number;
	regionOpacity: number;
	showLabelsOnRegions: boolean;
	fileStates: Record<string, { zoom: number; lastPosition: number }>;
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
	defaultZoom: 50,
	regionOpacity: 0.4,
	showLabelsOnRegions: true,
	fileStates: {},
};

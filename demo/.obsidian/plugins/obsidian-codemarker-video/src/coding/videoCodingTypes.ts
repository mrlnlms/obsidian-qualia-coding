export interface VideoMarker {
	id: string;
	from: number;
	to: number;
	codes: string[];
	memo?: string;
	createdAt: number;
}

export interface VideoFile {
	path: string;
	markers: VideoMarker[];
}

export interface VideoPluginData {
	files: VideoFile[];
	codeDefinitions: any;
	settings: VideoSettings;
}

export interface VideoSettings {
	defaultZoom: number;
	regionOpacity: number;
	showLabelsOnRegions: boolean;
	videoFit: "contain" | "cover";
	fileStates: Record<string, { zoom: number; lastPosition: number }>;
}

export const DEFAULT_VIDEO_SETTINGS: VideoSettings = {
	defaultZoom: 50,
	regionOpacity: 0.4,
	showLabelsOnRegions: true,
	videoFit: "contain",
	fileStates: {},
};

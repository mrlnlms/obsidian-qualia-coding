import type { DataManager } from '../core/dataManager';
import type { VideoMarker, VideoFile, VideoSettings } from './videoCodingTypes';
import { DEFAULT_VIDEO_SETTINGS } from './videoCodingTypes';
import type { CodeDefinitionRegistry } from '../core/codeDefinitionRegistry';
import { MediaCodingModel } from '../media/mediaCodingModel';

export class VideoCodingModel extends MediaCodingModel<VideoMarker, VideoFile, VideoSettings> {
	constructor(dm: DataManager, registry: CodeDefinitionRegistry) {
		super(dm, registry, 'video', DEFAULT_VIDEO_SETTINGS);
	}

	/** @deprecated Use getOrCreateFile() instead. Kept for backward compatibility. */
	getOrCreateVideoFile(filePath: string): VideoFile {
		return this.getOrCreateFile(filePath);
	}
}

import type { VideoMarker, VideoFile, VideoSettings } from './videoCodingTypes';
import { DEFAULT_VIDEO_SETTINGS } from './videoCodingTypes';
import type { CodeDefinitionRegistry } from '../core/codeDefinitionRegistry';
import { MediaCodingModel } from '../media/mediaCodingModel';
import type QualiaCodingPlugin from '../main';

export class VideoCodingModel extends MediaCodingModel<VideoMarker, VideoFile, VideoSettings> {
	constructor(plugin: QualiaCodingPlugin, registry: CodeDefinitionRegistry) {
		super(plugin, registry, 'video', DEFAULT_VIDEO_SETTINGS);
	}

	/** @deprecated Use getOrCreateFile() instead. Kept for backward compatibility. */
	getOrCreateVideoFile(filePath: string): VideoFile {
		return this.getOrCreateFile(filePath);
	}
}

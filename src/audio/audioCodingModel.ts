import type { AudioMarker, AudioFile, AudioSettings } from './audioCodingTypes';
import { DEFAULT_AUDIO_SETTINGS } from './audioCodingTypes';
import type { CodeDefinitionRegistry } from '../core/codeDefinitionRegistry';
import { MediaCodingModel } from '../media/mediaCodingModel';
import type QualiaCodingPlugin from '../main';

export class AudioCodingModel extends MediaCodingModel<AudioMarker, AudioFile, AudioSettings> {
	constructor(plugin: QualiaCodingPlugin, registry: CodeDefinitionRegistry) {
		super(plugin, registry, 'audio', DEFAULT_AUDIO_SETTINGS);
	}

	/** @deprecated Use getOrCreateFile() instead. Kept for backward compatibility. */
	getOrCreateAudioFile(filePath: string): AudioFile {
		return this.getOrCreateFile(filePath);
	}
}

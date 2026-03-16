import type { DataManager } from '../core/dataManager';
import type { AudioMarker, AudioFile, AudioSettings } from './audioCodingTypes';
import { DEFAULT_AUDIO_SETTINGS } from './audioCodingTypes';
import type { CodeDefinitionRegistry } from '../core/codeDefinitionRegistry';
import { MediaCodingModel } from '../media/mediaCodingModel';

export class AudioCodingModel extends MediaCodingModel<AudioMarker, AudioFile, AudioSettings> {
	constructor(dm: DataManager, registry: CodeDefinitionRegistry) {
		super(dm, registry, 'audio', DEFAULT_AUDIO_SETTINGS);
	}

	/** @deprecated Use getOrCreateFile() instead. Kept for backward compatibility. */
	getOrCreateAudioFile(filePath: string): AudioFile {
		return this.getOrCreateFile(filePath);
	}
}

import { IMAGE_CODING_VIEW_TYPE, AUDIO_VIEW_TYPE, VIDEO_VIEW_TYPE } from './mediaViewTypes';

export type MediaKind = 'image' | 'audio' | 'video' | 'pdf';

const NATIVE_VIEW_TYPE: Record<MediaKind, string> = {
	image: 'image',
	audio: 'audio',
	video: 'video',
	pdf: 'pdf',
};

const CODING_VIEW_TYPE: Record<MediaKind, string> = {
	image: IMAGE_CODING_VIEW_TYPE,
	audio: AUDIO_VIEW_TYPE,
	video: VIDEO_VIEW_TYPE,
	pdf: 'pdf', // PDF coding happens in-place on the native view
};

/**
 * Given the current view type and the media kind, return the view type the toggle
 * action should switch TO. Returns null if the current view is not recognized
 * as either native or coding view for this kind.
 *
 * For PDF, the "toggle" does not swap view types — it signals the caller to turn
 * instrumentation on/off in-place. Callers detect this by receiving 'pdf' back.
 */
export function resolveToggleTarget(currentViewType: string, mediaKind: MediaKind): string | null {
	const native = NATIVE_VIEW_TYPE[mediaKind];
	const coding = CODING_VIEW_TYPE[mediaKind];

	if (mediaKind === 'pdf') {
		return currentViewType === 'pdf' ? 'pdf' : null;
	}
	if (currentViewType === native) return coding;
	if (currentViewType === coding) return native;
	return null;
}

export function isMediaViewType(viewType: string): MediaKind | null {
	for (const kind of ['image', 'audio', 'video', 'pdf'] as MediaKind[]) {
		if (NATIVE_VIEW_TYPE[kind] === viewType) return kind;
		if (CODING_VIEW_TYPE[kind] === viewType && kind !== 'pdf') return kind;
	}
	return null;
}

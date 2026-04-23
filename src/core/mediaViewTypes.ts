/**
 * View type constants for the plugin's media coding views.
 *
 * Isolated in a barebones module (no Obsidian imports) so unit tests — especially
 * those using only jsdom — can import these without dragging in the full view
 * class graph, which pulls in Obsidian API (FuzzySuggestModal etc.).
 */
export const IMAGE_CODING_VIEW_TYPE = 'qualia-image-coding';
export const AUDIO_VIEW_TYPE = 'qualia-audio-view';
export const VIDEO_VIEW_TYPE = 'qualia-video-view';

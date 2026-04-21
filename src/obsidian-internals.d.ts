/**
 * Ambient type augmentations for Obsidian internal APIs not exposed
 * in the public type definitions, plus custom Qualia workspace events.
 */

import type { EditorView } from '@codemirror/view';
import type { EventRef } from 'obsidian';

declare module 'obsidian' {
	interface Editor {
		/** Convert EditorPosition {line, ch} to a character offset in the document. */
		posToOffset(pos: EditorPosition): number;
		/** Convert a character offset to EditorPosition {line, ch}. */
		offsetToPos(offset: number): EditorPosition;
		/** The underlying CodeMirror 6 EditorView instance. */
		cm: EditorView;
	}

	interface WorkspaceLeaf {
		/** Internal method to refresh the leaf header (title, icon, etc.). */
		updateHeader?(): void;
	}

	interface Workspace {
		on(name: 'qualia-csv:navigate', callback: (data: { file: string; row: number; column?: string }) => void): EventRef;
		on(name: 'qualia-csv:detail', callback: (data: { markerId: string; codeName: string }) => void): EventRef;
		on(name: 'qualia-audio:navigate', callback: (data: { file: string; seekTo: number }) => void): EventRef;
		on(name: 'qualia-image:navigate', callback: (data: { file: string; markerId: string }) => void): EventRef;
		on(name: 'qualia-video:navigate', callback: (data: { file: string; seekTo: number }) => void): EventRef;
		on(name: 'qualia-pdf:navigate', callback: (data: { file: string; page: number }) => void): EventRef;

		trigger(name: 'qualia-csv:navigate', data: { file: string; row: number; column?: string }): void;
		trigger(name: 'qualia-csv:detail', data: { markerId: string; codeName: string }): void;
		trigger(name: 'qualia-audio:navigate', data: { file: string; seekTo: number }): void;
		trigger(name: 'qualia-image:navigate', data: { file: string; markerId: string }): void;
		trigger(name: 'qualia-video:navigate', data: { file: string; seekTo: number }): void;
		trigger(name: 'qualia-pdf:navigate', data: { file: string; page: number }): void;
	}

	interface App {
		metadataTypeManager?: {
			getTypeInfo?: (propertyName: string) => { type: string; widget?: unknown } | undefined;
			registeredTypeWidgets?: Record<string, unknown>;
		};
	}
}

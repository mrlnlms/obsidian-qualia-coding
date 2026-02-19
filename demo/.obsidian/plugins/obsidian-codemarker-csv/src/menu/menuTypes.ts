import { EditorView } from '@codemirror/view';

export interface CodeItem {
	name: string;
	color: string;
	createdAt: number;
}

export interface SelectionSnapshot {
	from: number;
	to: number;
	text: string;
	fileId: string;
	hoverMarkerId?: string;
}

export interface MenuContext {
	snapshot: SelectionSnapshot;
	editorView: EditorView;
}

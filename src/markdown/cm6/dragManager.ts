import { EditorView } from "@codemirror/view";
import { startDragEffect, updateDragEffect, endDragEffect } from "./markerStateField";
import type { CodeMarkerModel } from "../models/codeMarkerModel";
import { getViewForFile } from "./utils/viewLookupUtils";

export interface DragState {
	markerId: string;
	type: 'start' | 'end';
}

export class DragManager {
	current: DragState | null = null;
	private _lastDragUpdate = 0;

	constructor(private model: CodeMarkerModel) {}

	/** Start drag from overlay mousedown */
	start(view: EditorView, markerId: string, type: 'start' | 'end'): void {
		this.current = { markerId, type };

		document.body.classList.add('codemarker-dragging');
		document.body.classList.add(type === 'start' ? 'codemarker-dragging-start' : 'codemarker-dragging-end');

		view.dispatch({
			effects: startDragEffect.of({ markerId, type })
		});

		// Document-level mouseup to ensure drag always ends
		const onDocMouseUp = () => {
			document.removeEventListener('mouseup', onDocMouseUp, true);
			if (this.current) {
				this.end(view, this.current.markerId);
			}
		};
		document.addEventListener('mouseup', onDocMouseUp, true);
	}

	/** Handle mousemove during drag — throttled to ~60fps. Returns true if event was handled. */
	move(view: EditorView, event: MouseEvent, fileId: string): boolean {
		if (!this.current) return false;

		event.preventDefault();
		const now = Date.now();
		if (now - this._lastDragUpdate < 16) return true;
		this._lastDragUpdate = now;

		const coords = { x: event.clientX, y: event.clientY };
		let pos = view.posAtCoords(coords);
		if (pos === null) pos = view.posAtCoords(coords, false);

		if (pos !== null) {
			this.updateMarkerPosition(fileId, this.current.markerId, pos, this.current.type);
			view.dispatch({
				effects: updateDragEffect.of({
					markerId: this.current.markerId,
					pos,
					type: this.current.type
				})
			});
		}

		return true;
	}

	/** End drag */
	end(view: EditorView, markerId: string): void {
		this.current = null;
		document.body.classList.remove('codemarker-dragging', 'codemarker-dragging-start', 'codemarker-dragging-end');
		view.dispatch({
			effects: endDragEffect.of({ markerId })
		});
	}

	/** Update marker range boundary during drag */
	private updateMarkerPosition(fileId: string, markerId: string, newPos: number, type: 'start' | 'end'): void {
		const marker = this.model.getMarkerById(markerId);
		if (!marker || marker.fileId !== fileId) return;

		try {
			const targetView = getViewForFile(fileId, this.model.plugin.app);
			if (!targetView?.editor) return;

			const newPosConverted = targetView.editor.offsetToPos(newPos);
			if (!newPosConverted) return;

			const updatedMarker = { ...marker, range: { from: { ...marker.range.from }, to: { ...marker.range.to } } };

			if (type === 'start') {
				if (this.model.isPositionBefore(newPosConverted, marker.range.to) ||
					(newPosConverted.line === marker.range.to.line && newPosConverted.ch === marker.range.to.ch)) {
					updatedMarker.range.from = newPosConverted;
				}
			} else {
				if (this.model.isPositionAfter(newPosConverted, marker.range.from) ||
					(newPosConverted.line === marker.range.from.line && newPosConverted.ch === marker.range.from.ch)) {
					updatedMarker.range.to = newPosConverted;
				}
			}

			updatedMarker.updatedAt = Date.now();
			this.model.updateMarker(updatedMarker);
			this.model.updateMarkersForFile(fileId);

		} catch (e) {
			console.warn(`QualiaCoding: Error updating marker position`, e);
		}
	}
}

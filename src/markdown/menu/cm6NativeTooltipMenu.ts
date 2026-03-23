/**
 * CM6 Tooltip Menu — hosts the shared codingPopover inside a CM6 tooltip container.
 *
 * The shared popover handles all UX (search, toggles, memo, browse).
 * This file only provides: CM6 event blocking, adapter glue, and the
 * "Add New Code" button with markdown-specific behavior (selection preview).
 */

import { Notice } from 'obsidian';
import { EditorView } from '@codemirror/view';
import { CodeMarkerModel } from '../models/codeMarkerModel';
import { SelectionSnapshot } from './menuTypes';
import {
	addCodeAction,
	addCodeWithDetailsAction,
	removeCodeAction,
	removeAllCodesAction,
	getCodesAtSelection,
} from './menuActions';
import { CodeFormModal } from '../../core/codeFormModal';
import { setSelectionPreviewEffect } from '../cm6/markerStateField';
import {
	openCodingPopover,
	type CodingPopoverAdapter,
} from '../../core/codingPopover';
import { findCodeApplication, setMagnitude } from '../../core/codeApplicationHelpers';

export function buildNativeTooltipMenuDOM(
	view: EditorView,
	model: CodeMarkerModel,
	snapshot: SelectionSnapshot,
	onClose: () => void,
	onRecreate: () => void,
): HTMLElement {
	const container = document.createElement('div');
	container.className = 'menu codemarker-popover';

	// Block CM6 event propagation (prevents selection clearing on click)
	container.addEventListener('mousedown', (e) => {
		e.stopPropagation();
		e.preventDefault();
	});

	const existingMarker = snapshot.hoverMarkerId
		? model.getMarkerById(snapshot.hoverMarkerId)
		: model.findMarkerAtExactRange(snapshot);
	const isHoverMode = !!snapshot.hoverMarkerId && !!existingMarker;

	// ── Adapter: translates shared popover callbacks to markdown model ──
	const adapter: CodingPopoverAdapter = {
		registry: model.registry,
		getActiveCodes: () => getCodesAtSelection(model, snapshot),
		addCode: (name) => addCodeAction(model, snapshot, name),
		removeCode: (name) => removeCodeAction(model, snapshot, name),
		getMemo: () => existingMarker?.memo ?? '',
		setMemo: (value) => {
			const marker = snapshot.hoverMarkerId
				? model.getMarkerById(snapshot.hoverMarkerId)
				: model.findMarkerAtExactRange(snapshot);
			if (!marker) return;
			marker.memo = value || undefined;
			marker.updatedAt = Date.now();
			model.saveMarkers();
		},
		getMagnitudeForCode: (codeId) => {
			const marker = snapshot.hoverMarkerId
				? model.getMarkerById(snapshot.hoverMarkerId)
				: model.findMarkerAtExactRange(snapshot);
			if (!marker) return undefined;
			return findCodeApplication(marker.codes, codeId)?.magnitude;
		},
		setMagnitudeForCode: (codeId, value) => {
			const marker = snapshot.hoverMarkerId
				? model.getMarkerById(snapshot.hoverMarkerId)
				: model.findMarkerAtExactRange(snapshot);
			if (!marker) return;
			marker.codes = setMagnitude(marker.codes, codeId, value);
			marker.updatedAt = Date.now();
			model.saveMarkers();
		},
		getRelationsForCode: (codeId) => {
			const marker = snapshot.hoverMarkerId
				? model.getMarkerById(snapshot.hoverMarkerId)
				: model.findMarkerAtExactRange(snapshot);
			return findCodeApplication(marker?.codes ?? [], codeId)?.relations ?? [];
		},
		setRelationsForCode: (codeId, relations) => {
			const marker = snapshot.hoverMarkerId
				? model.getMarkerById(snapshot.hoverMarkerId)
				: model.findMarkerAtExactRange(snapshot);
			if (!marker) return;
			const ca = findCodeApplication(marker.codes, codeId);
			if (ca) {
				ca.relations = relations.length > 0 ? relations : undefined;
				marker.updatedAt = Date.now();
				model.saveMarkers();
			}
		},
		save: () => model.saveMarkers(),
		onRefresh: () => {},
		onNavClick: (codeName, isActive) => {
			if (isActive && existingMarker) {
				document.dispatchEvent(new CustomEvent('codemarker:label-click', {
					detail: { markerId: existingMarker.id, codeName },
				}));
			} else {
				document.dispatchEvent(new CustomEvent('codemarker:code-click', {
					detail: { codeName },
				}));
			}
		},
	};

	// ── Open shared popover into our CM6-managed container ──
	openCodingPopover(adapter, {
		pos: { x: 0, y: 0 }, // CM6 handles positioning
		app: model.plugin.app,
		isHoverMode,
		showMagnitudeSection: model.plugin.dataManager.section('general').showMagnitudeInPopover,
		showRelationsSection: model.plugin.dataManager.section('general').showRelationsInPopover,
		externalContainer: container,
		className: 'codemarker-popover',
		autoFocus: !isHoverMode,
		onClose,
		onRebuild: onRecreate,
		onBeforeModal: () => {
			// Markdown-specific: show selection preview while modal is open
			view.dispatch({
				effects: setSelectionPreviewEffect.of({ from: snapshot.from, to: snapshot.to }),
			});
		},
		modalDefaultColor: model.getSettings().defaultColor,
		onModalClose: onRecreate,
		deleteAction: isHoverMode ? {
			label: 'Delete Marker',
			icon: 'trash',
			onDelete: () => {
				removeAllCodesAction(model, snapshot);
				new Notice('Codes removed');
			},
		} : undefined,
	});

	return container;
}

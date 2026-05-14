/**
 * Markdown coding popover config — adapter + options for openCodingPopover.
 *
 * Markdown engine usa o mesmo popover floating (createPopover/positionAndClamp)
 * que image/pdf/media — sem CM6 native tooltip. Posicionamento é no cursor
 * do mouse (selection mode) ou nas coords do char (command/ribbon/right-click).
 */

import { Notice } from 'obsidian';
import { EditorView } from '@codemirror/view';
import { CodeMarkerModel } from '../models/codeMarkerModel';
import { SelectionSnapshot } from './menuTypes';
import { getMemoContent, setMemoContent } from '../../core/memoHelpers';
import {
	addCodeAction,
	removeCodeAction,
	removeAllCodesAction,
	getCodesAtSelection,
} from './menuActions';
import { setSelectionPreviewEffect } from '../cm6/markerStateField';
import type {
	CodingPopoverAdapter,
	CodingPopoverOptions,
} from '../../core/codingPopover';
import { findCodeApplication, setMagnitude } from '../../core/codeApplicationHelpers';

export interface MarkdownPopoverConfig {
	adapter: CodingPopoverAdapter;
	baseOptions: Omit<CodingPopoverOptions, 'anchor' | 'onClose' | 'onRebuild' | 'onModalClose'>;
	isHoverMode: boolean;
	cleanupOnClose: () => void;
}

/**
 * Builds the adapter + base options for the markdown coding popover.
 * Caller (menuController) supplies pos, onClose, onRebuild, onModalClose.
 */
export function buildMarkdownPopoverConfig(
	view: EditorView,
	model: CodeMarkerModel,
	snapshot: SelectionSnapshot,
): MarkdownPopoverConfig {
	const existingMarker = snapshot.hoverMarkerId
		? model.getMarkerById(snapshot.hoverMarkerId)
		: model.findMarkerAtExactRange(snapshot);
	const isHoverMode = !!snapshot.hoverMarkerId && !!existingMarker;

	const adapter: CodingPopoverAdapter = {
		registry: model.registry,
		getActiveCodes: () => getCodesAtSelection(model, snapshot),
		addCode: (name) => addCodeAction(model, snapshot, name),
		removeCode: (name) => removeCodeAction(model, snapshot, name),
		getMemo: () => getMemoContent(existingMarker?.memo),
		setMemo: (value) => {
			const marker = snapshot.hoverMarkerId
				? model.getMarkerById(snapshot.hoverMarkerId)
				: model.findMarkerAtExactRange(snapshot);
			if (!marker) return;
			marker.memo = setMemoContent(marker.memo, value);
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

	const baseOptions: MarkdownPopoverConfig['baseOptions'] = {
		app: model.plugin.app,
		isHoverMode,
		showMagnitudeSection: model.plugin.dataManager.section('general').showMagnitudeInPopover,
		showRelationsSection: model.plugin.dataManager.section('general').showRelationsInPopover,
		className: 'codemarker-popover',
		autoFocus: !isHoverMode,
		onBeforeModal: () => {
			// Markdown-specific: re-aplica selection preview decoration antes do modal
			// (foco vai pro modal e selection nativa some, mas a decoração mantém o visual).
			view.dispatch({
				effects: setSelectionPreviewEffect.of({ from: snapshot.from, to: snapshot.to }),
			});
		},
		modalDefaultColor: model.getSettings().defaultColor,
		deleteAction: isHoverMode ? {
			label: 'Delete Marker',
			icon: 'trash',
			onDelete: () => {
				removeAllCodesAction(model, snapshot);
				new Notice('Codes removed');
			},
		} : undefined,
	};

	// Cleanup ao fechar — limpa selection preview + empty marker em hover mode.
	const cleanupOnClose = () => {
		view.dispatch({
			effects: setSelectionPreviewEffect.of(null),
		});
		if (snapshot.hoverMarkerId) {
			model.cleanupEmptyMarker(snapshot.hoverMarkerId);
		}
	};

	return { adapter, baseOptions, isHoverMode, cleanupOnClose };
}

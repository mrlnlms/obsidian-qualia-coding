import type QualiaCodingPlugin from '../../../main';
import { UnifiedCompareCodersView, COMPARE_CODERS_VIEW_TYPE } from './unifiedCompareCodersView';

export interface OpenCompareCodersOptions {
	/** Se setado, carrega o saved após abrir a view. Excludente com `contextualCodeId`. */
	loadFromSavedId?: string;
	/** Atalho contextual: foca em 1 código específico (table mode), todos coders. Estado
	 *  ephemeral (não cria saved). Excludente com `loadFromSavedId`. */
	contextualCodeId?: string;
}

/**
 * Helper centralizado pra abrir a Compare Coders View (Slice E4). Reusa leaf existente
 * quando possível. Quando `loadFromSavedId` é passado, chama `view.loadFromSaved(id)`
 * após `setViewState` aguardar setup.
 */
export async function openCompareCodersView(
	plugin: QualiaCodingPlugin,
	options: OpenCompareCodersOptions = {},
): Promise<void> {
	const { workspace } = plugin.app;
	let leaf = workspace.getLeavesOfType(COMPARE_CODERS_VIEW_TYPE)[0];
	if (!leaf) {
		const newLeaf = workspace.getLeaf('tab');
		if (!newLeaf) return;
		await newLeaf.setViewState({ type: COMPARE_CODERS_VIEW_TYPE, active: true });
		leaf = newLeaf;
	}
	workspace.revealLeaf(leaf);
	const view = leaf.view;
	if (!(view instanceof UnifiedCompareCodersView)) return;
	if (options.loadFromSavedId) {
		view.loadFromSaved(options.loadFromSavedId);
	} else if (options.contextualCodeId) {
		view.loadContextualCode(options.contextualCodeId);
	}
}

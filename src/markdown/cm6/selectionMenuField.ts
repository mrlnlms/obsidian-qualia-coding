import { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { MenuController } from "../menu/menuController";

/**
 * Auto-close listener — fecha o popover quando a seleção colapsa (cursor sem range),
 * exceto em hover mode (popover aberto sobre marker existente, sem seleção real).
 *
 * Substituiu o antigo StateField + showTooltip flow (CM6 native tooltip) — markdown
 * agora usa o mesmo popover floating dos outros engines pra UX consistente.
 */
export const createSelectionMenuField = (menuController: MenuController): Extension => {
	return EditorView.updateListener.of((update) => {
		if (!update.selectionSet) return;
		if (!menuController.isOpen()) return;

		const snapshot = menuController.getCurrentSnapshot();
		if (!snapshot) return;
		// Hover mode (popover sobre marker existente): seleção do CM6 fica vazia,
		// mas o popover deve ficar aberto até o hover sair.
		if (snapshot.hoverMarkerId) return;

		const sel = update.state.selection.main;
		if (sel.from === sel.to) {
			menuController.closeMenu(update.view);
		}
	});
};

import { EditorView } from '@codemirror/view';
import { CodeMarkerModel } from '../models/codeMarkerModel';
import { SelectionSnapshot } from './menuTypes';
import { setSelectionPreviewEffect } from '../cm6/markerStateField';
import {
	openCodingPopover,
	type AnchorSpec,
	type CodingPopoverHandle,
} from '../../core/codingPopover';
import type { AnchorRect } from '../../core/baseCodingMenu';
import { buildMarkdownPopoverConfig } from './cm6NativeTooltipMenu';

/**
 * Menu controller — orquestra o popover floating (createPopover/positionAndClamp)
 * pro markdown engine. Mesmo pattern que image/pdf/media: o popover vive em
 * document.body, posicionado no cursor do mouse.
 */
export class MenuController {
	private model: CodeMarkerModel;
	private handle: CodingPopoverHandle | null = null;
	private currentView: EditorView | null = null;
	private currentSnapshot: SelectionSnapshot | null = null;

	constructor(model: CodeMarkerModel) {
		this.model = model;
	}

	isOpen(): boolean {
		return this.handle !== null;
	}

	getCurrentSnapshot(): SelectionSnapshot | null {
		return this.currentSnapshot;
	}

	closeMenu(_editorView?: EditorView): void {
		if (!this.handle) return;
		this.handle.close();
		// Handle vai pra null via onClose callback abaixo
	}

	openMenu(
		editorView: EditorView,
		snapshot: SelectionSnapshot,
		mousePos: { x: number; y: number },
	): void {
		// Re-abrir em cima de outro popover: fecha o anterior primeiro
		if (this.handle) this.handle.close();

		const config = buildMarkdownPopoverConfig(editorView, this.model, snapshot);

		// Selection preview decoration (mantém o visual da seleção mesmo após foco mudar)
		editorView.dispatch({
			effects: setSelectionPreviewEffect.of({ from: snapshot.from, to: snapshot.to }),
		});

		const anchor = this.buildAnchor(editorView, snapshot, mousePos);

		const onClose = () => {
			config.cleanupOnClose();
			this.handle = null;
			this.currentView = null;
			this.currentSnapshot = null;
			// Devolve foco pro editor — state.selection sobrevive, sem isso fica órfão no body
			editorView.focus();
		};

		const reopenWith = (newSnapshot: SelectionSnapshot, newMousePos: { x: number; y: number }) => {
			this.openMenu(editorView, newSnapshot, newMousePos);
		};

		this.handle = openCodingPopover(config.adapter, {
			...config.baseOptions,
			anchor,
			onClose,
			onRebuild: () => reopenWith(snapshot, mousePos),
			onModalClose: () => reopenWith(snapshot, mousePos),
		});

		// Re-emit eventos de mouseenter/mouseleave do popover pra hoverMenuExtension
		// ajustar o close timer (hover grace).
		this.handle.container.addEventListener('mouseenter', () => {
			document.dispatchEvent(new CustomEvent('codemarker-tooltip-mouseenter'));
		});
		this.handle.container.addEventListener('mouseleave', () => {
			document.dispatchEvent(new CustomEvent('codemarker-tooltip-mouseleave'));
		});

		this.currentView = editorView;
		this.currentSnapshot = snapshot;
	}

	/**
	 * Anchor = ponto do mouse (point degenerado). Popover aparece perto do cursor,
	 * não do bbox da seleção — em seleção longa o cursor pode estar muito longe
	 * do começo/fim do texto selecionado.
	 *
	 * Tracker translada o anchor pelo delta de scroll do editor — popover acompanha
	 * o conteúdo subjacente em scroll. Fecha se sair do viewport vertical.
	 *
	 * preferredSide via comparação mouseY vs centro do char range — mais robusta que
	 * head/anchor do CM6 (que tem casos edge em dispatches intermediários).
	 */
	private buildAnchor(
		view: EditorView,
		snapshot: SelectionSnapshot,
		mousePos: { x: number; y: number },
	): AnchorSpec {
		const initialScrollTop = view.scrollDOM.scrollTop;
		const initialMouseX = mousePos.x;
		const initialMouseY = mousePos.y;

		const computeRect = (): AnchorRect | null => {
			const deltaScroll = view.scrollDOM.scrollTop - initialScrollTop;
			const y = initialMouseY - deltaScroll;
			// Popover sai do viewport vertical → fecha
			if (y < 0 || y > window.innerHeight) return null;
			return { top: y, bottom: y, left: initialMouseX, right: initialMouseX };
		};

		// Direção da seleção pelo char range — se cursor (mouseY) está na metade
		// superior do range, é bottom-up → preferir above.
		let preferredSide: 'above' | 'below' = 'below';
		const start = view.coordsAtPos(snapshot.from);
		const end = view.coordsAtPos(snapshot.to);
		if (start && end) {
			const midY = (Math.min(start.top, end.top) + Math.max(start.bottom, end.bottom)) / 2;
			if (mousePos.y < midY) preferredSide = 'above';
		}

		return {
			rect: { top: initialMouseY, bottom: initialMouseY, left: initialMouseX, right: initialMouseX },
			preferredSide,
			tracker: { scrollEl: view.scrollDOM, computeRect },
		};
	}
}

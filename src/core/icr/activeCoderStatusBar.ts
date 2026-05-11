import { Menu, setIcon } from 'obsidian';
import type QualiaCodingPlugin from '../../main';
import { PromptModal } from '../dialogs';

/**
 * Status bar item pra coder ativo (Slice "Coder picker").
 *
 * Mostra "Coding as: {nome}" no status bar do Obsidian. Click abre menu com:
 *  - Lista de coders codáveis (humanos + LLMs; consensus excluído via getCodableCoders)
 *  - Item "+ Novo coder humano" → PromptModal
 *
 * O coder selecionado é stampado em todos os markers criados via popovers/menus das 5 engines.
 */
export function mountActiveCoderStatusBar(plugin: QualiaCodingPlugin): { unmount: () => void } {
	const el = plugin.addStatusBarItem();
	el.addClass('qc-active-coder-bar');
	el.style.cursor = 'pointer';
	el.setAttribute('aria-label', 'Trocar coder ativo');

	const render = () => {
		el.empty();
		const active = plugin.coderRegistry.getById(plugin.getActiveCoderId());
		const icon = el.createSpan({ cls: 'qc-active-coder-icon' });
		setIcon(icon, 'user');
		el.createSpan({ cls: 'qc-active-coder-label', text: ` Coding as: ${active?.name ?? '—'}` });
	};

	const onClick = (event: MouseEvent) => {
		const menu = new Menu();
		const activeId = plugin.getActiveCoderId();
		for (const coder of plugin.coderRegistry.getCodableCoders()) {
			menu.addItem(item => {
				item.setTitle(coder.name).setIcon('user')
					.setChecked(coder.id === activeId)
					.onClick(() => plugin.setActiveCoderId(coder.id));
			});
		}
		menu.addSeparator();
		menu.addItem(item => {
			item.setTitle('+ Novo coder humano').setIcon('user-plus').onClick(() => {
				new PromptModal({
					app: plugin.app,
					title: 'Novo coder humano',
					placeholder: 'Nome',
					onSubmit: (name) => {
						const c = plugin.coderRegistry.createHuman(name);
						plugin.setActiveCoderId(c.id);
					},
				}).open();
			});
		});
		menu.showAtMouseEvent(event);
	};

	el.addEventListener('click', onClick);
	plugin.coderRegistry.addOnMutate(render);
	const unsubActive = plugin.onActiveCoderChange(render);
	render();

	return {
		unmount: () => {
			el.removeEventListener('click', onClick);
			plugin.coderRegistry.removeOnMutate(render);
			unsubActive();
			el.remove();
		},
	};
}

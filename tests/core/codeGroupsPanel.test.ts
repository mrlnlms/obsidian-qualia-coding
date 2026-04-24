import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';
import { renderCodeGroupsPanel } from '../../src/core/codeGroupsPanel';

describe('codeGroupsPanel — render', () => {
	let container: HTMLElement;
	let registry: CodeDefinitionRegistry;

	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
		registry = new CodeDefinitionRegistry();
	});

	afterEach(() => {
		container.remove();
	});

	it('não renderiza nada quando não há groups (painel collapsed-invisible)', () => {
		renderCodeGroupsPanel(container, registry, {
			selectedGroupId: null,
			onSelectGroup: () => {},
			onCreateGroup: () => {},
			onChipContextMenu: () => {},
		});
		const panel = container.querySelector('.codebook-groups-panel');
		expect(panel).toBeTruthy();
		expect(container.querySelectorAll('.codebook-group-chip').length).toBe(0);
	});

	it('renderiza 1 chip por group existente no groupOrder', () => {
		registry.createGroup('RQ1');
		registry.createGroup('RQ2');
		renderCodeGroupsPanel(container, registry, {
			selectedGroupId: null,
			onSelectGroup: () => {},
			onCreateGroup: () => {},
			onChipContextMenu: () => {},
		});
		const chips = container.querySelectorAll('.codebook-group-chip');
		expect(chips.length).toBe(2);
		expect(chips[0]!.textContent).toContain('RQ1');
		expect(chips[1]!.textContent).toContain('RQ2');
	});

	it('chip mostra count de códigos membros', () => {
		const c1 = registry.create('c1');
		const c2 = registry.create('c2');
		const g = registry.createGroup('RQ1');
		registry.addCodeToGroup(c1.id, g.id);
		registry.addCodeToGroup(c2.id, g.id);

		renderCodeGroupsPanel(container, registry, {
			selectedGroupId: null,
			onSelectGroup: () => {},
			onCreateGroup: () => {},
			onChipContextMenu: () => {},
		});
		const chip = container.querySelector('.codebook-group-chip')!;
		expect(chip.textContent).toContain('RQ1');
		expect(chip.textContent).toContain('2');
	});

	it('aplica classe is-selected no chip ativo', () => {
		const g = registry.createGroup('RQ1');
		renderCodeGroupsPanel(container, registry, {
			selectedGroupId: g.id,
			onSelectGroup: () => {},
			onCreateGroup: () => {},
			onChipContextMenu: () => {},
		});
		const chip = container.querySelector('.codebook-group-chip')!;
		expect(chip.classList.contains('is-selected')).toBe(true);
	});

	it('click no chip chama onSelectGroup com o id', () => {
		const g = registry.createGroup('RQ1');
		let selectedId: string | null | undefined;
		renderCodeGroupsPanel(container, registry, {
			selectedGroupId: null,
			onSelectGroup: (id) => { selectedId = id; },
			onCreateGroup: () => {},
			onChipContextMenu: () => {},
		});
		(container.querySelector('.codebook-group-chip') as HTMLElement).click();
		expect(selectedId).toBe(g.id);
	});

	it('click no chip já selecionado des-seleciona (onSelectGroup(null))', () => {
		const g = registry.createGroup('RQ1');
		let selectedId: string | null | undefined = 'initial';
		renderCodeGroupsPanel(container, registry, {
			selectedGroupId: g.id,
			onSelectGroup: (id) => { selectedId = id; },
			onCreateGroup: () => {},
			onChipContextMenu: () => {},
		});
		(container.querySelector('.codebook-group-chip') as HTMLElement).click();
		expect(selectedId).toBeNull();
	});

	it('click no botão [+] dispara onCreateGroup', () => {
		let called = false;
		renderCodeGroupsPanel(container, registry, {
			selectedGroupId: null,
			onSelectGroup: () => {},
			onCreateGroup: () => { called = true; },
			onChipContextMenu: () => {},
		});
		(container.querySelector('.codebook-groups-add-btn') as HTMLElement).click();
		expect(called).toBe(true);
	});

	it('right-click no chip dispara onChipContextMenu com id e event', () => {
		const g = registry.createGroup('RQ1');
		let capturedId: string | null = null;
		renderCodeGroupsPanel(container, registry, {
			selectedGroupId: null,
			onSelectGroup: () => {},
			onCreateGroup: () => {},
			onChipContextMenu: (id) => { capturedId = id; },
		});
		const chip = container.querySelector('.codebook-group-chip') as HTMLElement;
		chip.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
		expect(capturedId).toBe(g.id);
	});
});

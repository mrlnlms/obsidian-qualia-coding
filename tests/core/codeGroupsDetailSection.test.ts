import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';
import { renderGroupsSection } from '../../src/core/detailCodeRenderer';

describe('Code Detail — Groups section', () => {
	let container: HTMLElement;
	let registry: CodeDefinitionRegistry;

	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
		registry = new CodeDefinitionRegistry();
	});

	afterEach(() => { container.remove(); });

	it('renderiza header + [+] mesmo quando código não tem groups', () => {
		const c = registry.create('c1');
		renderGroupsSection(container, c.id, registry, {
			onAddGroup: () => {},
			onRemoveGroup: () => {},
		});
		expect(container.querySelector('.codemarker-detail-groups')).toBeTruthy();
		expect(container.querySelectorAll('.codemarker-detail-group-chip').length).toBe(0);
		expect(container.querySelector('.codemarker-detail-groups-add-btn')).toBeTruthy();
	});

	it('renderiza chips dos groups do código com botão × pra remover', () => {
		const c = registry.create('c1');
		const g1 = registry.createGroup('RQ1');
		const g2 = registry.createGroup('Wave1');
		registry.addCodeToGroup(c.id, g1.id);
		registry.addCodeToGroup(c.id, g2.id);

		renderGroupsSection(container, c.id, registry, {
			onAddGroup: () => {},
			onRemoveGroup: () => {},
		});

		const chips = container.querySelectorAll('.codemarker-detail-group-chip');
		expect(chips.length).toBe(2);
		expect(chips[0]!.textContent).toContain('RQ1');
		expect(chips[1]!.textContent).toContain('Wave1');
		expect(container.querySelectorAll('.codemarker-detail-group-chip-remove').length).toBe(2);
	});

	it('click no × dispara onRemoveGroup com codeId e groupId', () => {
		const c = registry.create('c1');
		const g = registry.createGroup('RQ1');
		registry.addCodeToGroup(c.id, g.id);

		let capturedGroupId: string | null = null;
		renderGroupsSection(container, c.id, registry, {
			onAddGroup: () => {},
			onRemoveGroup: (_codeId, gid) => { capturedGroupId = gid; },
		});

		(container.querySelector('.codemarker-detail-group-chip-remove') as HTMLElement).click();
		expect(capturedGroupId).toBe(g.id);
	});

	it('click no [+] dispara onAddGroup com codeId', () => {
		const c = registry.create('c1');
		let capturedCodeId: string | null = null;
		renderGroupsSection(container, c.id, registry, {
			onAddGroup: (codeId) => { capturedCodeId = codeId; },
			onRemoveGroup: () => {},
		});
		(container.querySelector('.codemarker-detail-groups-add-btn') as HTMLElement).click();
		expect(capturedCodeId).toBe(c.id);
	});

	it('estado misto: código em alguns groups, outros groups disponíveis — renderiza chips dos membros + [+] ainda visível', () => {
		const c = registry.create('c1');
		const g1 = registry.createGroup('RQ1');
		registry.createGroup('RQ2');
		registry.addCodeToGroup(c.id, g1.id);

		renderGroupsSection(container, c.id, registry, {
			onAddGroup: () => {},
			onRemoveGroup: () => {},
		});

		expect(container.querySelectorAll('.codemarker-detail-group-chip').length).toBe(1);
		expect(container.querySelector('.codemarker-detail-group-chip')!.textContent).toContain('RQ1');
		expect(container.querySelector('.codemarker-detail-groups-add-btn')).toBeTruthy();
	});
});

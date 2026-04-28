import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';
import { renderCodebookTree, type CodebookTreeState, type CodebookTreeCallbacks } from '../../src/core/codebookTreeRenderer';
import type { SidebarModelInterface } from '../../src/core/types';

/** Minimal in-memory model pra exercitar o renderer. */
function makeModel(registry: CodeDefinitionRegistry): SidebarModelInterface {
	return {
		registry,
		getAllMarkers: () => [],
	} as unknown as SidebarModelInterface;
}

function makeCallbacks(overrides: Partial<CodebookTreeCallbacks> = {}): CodebookTreeCallbacks {
	return {
		onCodeClick: () => {},
		onCodeRightClick: () => {},
		onToggleExpand: () => {},
		onFolderToggleExpand: () => {},
		onFolderRightClick: () => {},
		onToggleVisibility: () => {},
		...overrides,
	} as CodebookTreeCallbacks;
}

function makeState(): CodebookTreeState {
	return { expanded: { codes: new Set(), folders: new Set() } as any, searchQuery: '', dragMode: 'reorganize', selectedGroupId: null, selectedCodeIds: new Set<string>() };
}

describe('codebookTreeRenderer — visibility UI', () => {
	let container: HTMLElement;
	let registry: CodeDefinitionRegistry;

	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
		Object.assign(container.style, { height: '400px', overflow: 'auto' });
		registry = new CodeDefinitionRegistry();
	});

	it('renders eye icon button in each code row', () => {
		const c1 = registry.create('c1');
		registry.rootOrder = [c1.id];
		renderCodebookTree(container, makeModel(registry), makeState(), makeCallbacks());

		const eye = container.querySelector('.qc-code-row-eye');
		expect(eye).toBeTruthy();
	});

	it('applies qc-code-row-hidden class when code.hidden is true', () => {
		const c1 = registry.create('c1');
		registry.setGlobalHidden(c1.id, true);
		registry.rootOrder = [c1.id];
		renderCodebookTree(container, makeModel(registry), makeState(), makeCallbacks());

		const row = container.querySelector('.codebook-tree-row');
		expect(row!.classList.contains('qc-code-row-hidden')).toBe(true);
	});

	it('clicking eye invokes onToggleVisibility callback with codeId', () => {
		const c1 = registry.create('c1');
		registry.rootOrder = [c1.id];
		const spy = vi.fn();
		renderCodebookTree(container, makeModel(registry), makeState(), makeCallbacks({ onToggleVisibility: spy }));

		const eye = container.querySelector('.qc-code-row-eye') as HTMLElement;
		eye.click();
		expect(spy).toHaveBeenCalledWith(c1.id);
	});
});

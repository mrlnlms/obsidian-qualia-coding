import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('obsidian', () => {
  class ItemView {
    leaf: any;
    containerEl: any;
    constructor(leaf: any) {
      this.leaf = leaf;
      this.containerEl = { children: [document.createElement('div'), document.createElement('div')] };
    }
  }
  class WorkspaceLeaf {}
  return { ItemView, WorkspaceLeaf };
});

import { CaseVariablesView } from '../../../src/core/caseVariables/caseVariablesView';

function makeView(plugin: any) {
  const leaf = {} as any;
  const view = new CaseVariablesView(leaf, plugin);
  // containerEl already set in mock constructor
  return view;
}

describe('CaseVariablesView', () => {
  it('returns correct view type, display text, icon', () => {
    const plugin = { caseVariablesRegistry: { addOnMutate: vi.fn(), removeOnMutate: vi.fn() } } as any;
    const view = makeView(plugin);
    expect(view.getViewType()).toBe('qualia-case-variables');
    expect(view.getDisplayText()).toBe('Case Variables');
    expect(view.getIcon()).toBe('clipboard-list');
  });

  it('shows empty state when no variables', async () => {
    const plugin = {
      caseVariablesRegistry: {
        getAllVariableNames: () => [],
        addOnMutate: vi.fn(), removeOnMutate: vi.fn(),
      },
    } as any;
    const view = makeView(plugin);
    await view.onOpen();
    const container = view.containerEl.children[1] as HTMLElement;
    expect(container.querySelector('.case-variables-empty')).toBeTruthy();
  });

  it('renders one row per variable with count', async () => {
    const plugin = {
      caseVariablesRegistry: {
        getAllVariableNames: () => ['idade', 'grupo'],
        getType: (n: string) => n === 'idade' ? 'number' : 'text',
        getFilesByVariable: (n: string) => n === 'idade' ? ['a', 'b'] : ['a', 'b', 'c'],
        addOnMutate: vi.fn(), removeOnMutate: vi.fn(),
      },
    } as any;
    const view = makeView(plugin);
    await view.onOpen();
    const container = view.containerEl.children[1] as HTMLElement;
    const rows = container.querySelectorAll('.case-variables-panel-row');
    expect(rows).toHaveLength(2);
  });
});

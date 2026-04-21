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

function patchEl(el: HTMLElement): HTMLElement {
  if (!('empty' in el)) (el as any).empty = function () { this.innerHTML = ''; };
  if (!('addClass' in el)) (el as any).addClass = function (...cls: string[]) { this.classList.add(...cls); };
  if (!('createDiv' in el)) (el as any).createDiv = function (opts?: { cls?: string; text?: string }) {
    const div = document.createElement('div');
    if (opts?.cls) div.className = opts.cls;
    if (opts?.text) div.textContent = opts.text;
    patchEl(div);
    this.appendChild(div);
    return div;
  };
  if (!('createEl' in el)) (el as any).createEl = function (tag: string, opts?: { cls?: string; text?: string }) {
    const child = document.createElement(tag);
    if (opts?.cls) child.className = opts.cls;
    if (opts?.text) child.textContent = opts.text;
    patchEl(child);
    this.appendChild(child);
    return child;
  };
  if (!('createSpan' in el)) (el as any).createSpan = function (opts?: { cls?: string; text?: string }) {
    const span = document.createElement('span');
    if (opts?.cls) span.className = opts.cls;
    if (opts?.text) span.textContent = opts.text;
    patchEl(span);
    this.appendChild(span);
    return span;
  };
  return el;
}

const origCreateElement = document.createElement.bind(document);
document.createElement = function (tag: string, options?: ElementCreationOptions) {
  const el = origCreateElement(tag, options);
  patchEl(el);
  return el;
} as typeof document.createElement;

import { CaseVariablesView } from '../../../src/core/caseVariables/caseVariablesView';

function makeView(plugin: any) {
  const leaf = {} as any;
  const view = new CaseVariablesView(leaf, plugin);
  // containerEl already set in mock constructor
  // Ensure container children[1] is patched (it's created via document.createElement — already patched by the override above)
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

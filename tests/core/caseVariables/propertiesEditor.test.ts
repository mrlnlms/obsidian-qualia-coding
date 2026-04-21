import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock obsidian ────────────────────────────────────────────────────
vi.mock('obsidian', () => ({
  setIcon: vi.fn(),
}));

// ── Patch HTMLElement with Obsidian-specific DOM helpers ─────────────
function patchEl(el: HTMLElement): HTMLElement {
  if (!('empty' in el)) {
    (el as any).empty = function () { this.innerHTML = ''; };
  }
  if (!('addClass' in el)) {
    (el as any).addClass = function (...cls: string[]) { this.classList.add(...cls); };
  }
  if (!('createDiv' in el)) {
    (el as any).createDiv = function (opts?: { cls?: string; text?: string }) {
      const div = document.createElement('div');
      if (opts?.cls) div.className = opts.cls;
      if (opts?.text) div.textContent = opts.text;
      patchEl(div);
      this.appendChild(div);
      return div;
    };
  }
  if (!('createEl' in el)) {
    (el as any).createEl = function (tag: string, opts?: { cls?: string; text?: string; type?: string; attr?: Record<string, string> }) {
      const child = document.createElement(tag);
      if (opts?.cls) child.className = opts.cls;
      if (opts?.text) child.textContent = opts.text;
      if (opts?.type) (child as any).type = opts.type;
      if (opts?.attr) for (const [k, v] of Object.entries(opts.attr)) child.setAttribute(k, v);
      patchEl(child);
      this.appendChild(child);
      return child;
    };
  }
  if (!('createSpan' in el)) {
    (el as any).createSpan = function (opts?: { cls?: string; text?: string }) {
      const span = document.createElement('span');
      if (opts?.cls) span.className = opts.cls;
      if (opts?.text) span.textContent = opts.text;
      patchEl(span);
      this.appendChild(span);
      return span;
    };
  }
  return el;
}

const origCreateElement = document.createElement.bind(document);
document.createElement = function (tag: string, options?: ElementCreationOptions) {
  const el = origCreateElement(tag, options);
  patchEl(el);
  return el;
} as typeof document.createElement;

// ── Imports ──────────────────────────────────────────────────────────
import { PropertiesEditor } from '../../../src/core/caseVariables/propertiesEditor';

describe('PropertiesEditor — rendering', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('renders a row per variable', () => {
    const registry = {
      getVariables: () => ({ idade: 30, grupo: 'controle' }),
      getType: (name: string) => name === 'idade' ? 'number' : 'text',
      getAllVariableNames: () => ['idade', 'grupo'],
      getValuesForVariable: () => [],
      addOnMutate: vi.fn(),
      removeOnMutate: vi.fn(),
      setVariable: vi.fn(),
      removeVariable: vi.fn(),
    } as any;

    new PropertiesEditor(container, { fileId: 'jane.jpg', registry });

    const rows = container.querySelectorAll('.case-variables-row');
    expect(rows).toHaveLength(2);
  });

  it('shows empty state when no variables', () => {
    const registry = {
      getVariables: () => ({}),
      getType: () => 'text',
      getAllVariableNames: () => [],
      getValuesForVariable: () => [],
      addOnMutate: vi.fn(),
      removeOnMutate: vi.fn(),
      setVariable: vi.fn(),
      removeVariable: vi.fn(),
    } as any;

    new PropertiesEditor(container, { fileId: 'empty.jpg', registry });

    expect(container.querySelector('.case-variables-empty')).toBeTruthy();
  });
});

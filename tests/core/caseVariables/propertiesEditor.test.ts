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

describe('PropertiesEditor — inline edit', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('renders text input for text type', () => {
    const registry = {
      getVariables: () => ({ grupo: 'controle' }),
      getType: () => 'text',
      getAllVariableNames: () => ['grupo'],
      getValuesForVariable: () => [],
      setVariable: vi.fn(), removeVariable: vi.fn(),
      addOnMutate: vi.fn(), removeOnMutate: vi.fn(),
    } as any;

    new PropertiesEditor(container, { fileId: 'jane.jpg', registry });
    const input = container.querySelector('.case-variables-row input[type="text"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.value).toBe('controle');
  });

  it('calls setVariable on text input blur', () => {
    const setVariable = vi.fn();
    const registry = {
      getVariables: () => ({ grupo: 'controle' }),
      getType: () => 'text',
      getAllVariableNames: () => ['grupo'],
      getValuesForVariable: () => [],
      setVariable, removeVariable: vi.fn(),
      addOnMutate: vi.fn(), removeOnMutate: vi.fn(),
    } as any;

    new PropertiesEditor(container, { fileId: 'jane.jpg', registry });
    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    input.value = 'tratamento';
    input.dispatchEvent(new Event('blur'));

    expect(setVariable).toHaveBeenCalledWith('jane.jpg', 'grupo', 'tratamento');
  });

  it('renders number input for number type and coerces value', () => {
    const setVariable = vi.fn();
    const registry = {
      getVariables: () => ({ idade: 30 }),
      getType: () => 'number',
      getAllVariableNames: () => ['idade'],
      getValuesForVariable: () => [],
      setVariable, removeVariable: vi.fn(),
      addOnMutate: vi.fn(), removeOnMutate: vi.fn(),
    } as any;

    new PropertiesEditor(container, { fileId: 'jane.jpg', registry });
    const input = container.querySelector('input[type="number"]') as HTMLInputElement;
    input.value = '35';
    input.dispatchEvent(new Event('blur'));

    expect(setVariable).toHaveBeenCalledWith('jane.jpg', 'idade', 35);
  });

  it('renders checkbox for checkbox type', () => {
    const setVariable = vi.fn();
    const registry = {
      getVariables: () => ({ ativo: true }),
      getType: () => 'checkbox',
      getAllVariableNames: () => ['ativo'],
      getValuesForVariable: () => [],
      setVariable, removeVariable: vi.fn(),
      addOnMutate: vi.fn(), removeOnMutate: vi.fn(),
    } as any;

    new PropertiesEditor(container, { fileId: 'jane.jpg', registry });
    const cb = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(cb.checked).toBe(true);
    cb.checked = false;
    cb.dispatchEvent(new Event('change'));

    expect(setVariable).toHaveBeenCalledWith('jane.jpg', 'ativo', false);
  });

  it('shows confirmation modal on remove click', async () => {
    const removeVariable = vi.fn();
    const registry = {
      getVariables: () => ({ grupo: 'controle' }),
      getType: () => 'text',
      getAllVariableNames: () => ['grupo'],
      getValuesForVariable: () => [],
      setVariable: vi.fn(), removeVariable,
      addOnMutate: vi.fn(), removeOnMutate: vi.fn(),
    } as any;

    new PropertiesEditor(container, { fileId: 'jane.jpg', registry });
    const removeBtn = container.querySelector('.case-variables-remove') as HTMLElement;
    removeBtn.click();

    const modal = document.querySelector('.case-variables-confirm-modal');
    expect(modal).toBeTruthy();

    const confirmBtn = modal!.querySelector('button.mod-warning') as HTMLButtonElement;
    confirmBtn.click();
    await Promise.resolve();

    expect(removeVariable).toHaveBeenCalledWith('jane.jpg', 'grupo');
  });
});

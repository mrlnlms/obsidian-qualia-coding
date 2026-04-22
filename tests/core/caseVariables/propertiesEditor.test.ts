import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock obsidian ────────────────────────────────────────────────────
const NoticeSpy = vi.fn();
vi.mock('obsidian', () => ({
  setIcon: vi.fn((el: HTMLElement, name: string) => {
    el.setAttribute('data-icon', name);
  }),
  Notice: class {
    constructor(msg: string) { NoticeSpy(msg); }
  },
}));

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

  it('resolves fileId via function — supports rename mid-edit', () => {
    const setVariable = vi.fn();
    const getVariables = vi.fn(() => ({ grupo: 'controle' }));
    let currentPath = 'old.jpg';
    const registry = {
      getVariables,
      getType: () => 'text',
      getAllVariableNames: () => ['grupo'],
      getValuesForVariable: () => [],
      setVariable, removeVariable: vi.fn(),
      addOnMutate: vi.fn(), removeOnMutate: vi.fn(),
    } as any;

    new PropertiesEditor(container, { fileId: () => currentPath, registry });

    expect(getVariables).toHaveBeenLastCalledWith('old.jpg');

    // Simulate rename: function now returns the new path.
    currentPath = 'new.jpg';
    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    input.value = 'tratamento';
    input.dispatchEvent(new Event('blur'));

    expect(setVariable).toHaveBeenCalledWith('new.jpg', 'grupo', 'tratamento');
  });

  it('infers icon type from value when registry returns text (for dates, datetime, booleans)', () => {
    const registry = {
      getVariables: () => ({ data: '2026-04-21', datahora: '2026-04-21T14:30', booleano: true, texto: 'livre' }),
      getType: () => 'text',  // stored type is text for all
      getAllVariableNames: () => ['data', 'datahora', 'booleano', 'texto'],
      getValuesForVariable: () => [],
      addOnMutate: vi.fn(), removeOnMutate: vi.fn(),
      setVariable: vi.fn(), removeVariable: vi.fn(),
    } as any;

    new PropertiesEditor(container, { fileId: 'jane.md', registry });

    const rows = container.querySelectorAll('.case-variables-row');
    const icons = Array.from(rows).map(r => r.querySelector('.case-variables-icon')?.getAttribute('data-icon'));
    // TYPE_ICONS: date=calendar, datetime=calendar-clock, checkbox=check-square, text=type
    expect(icons).toEqual(['calendar', 'calendar-clock', 'check-square', 'type']);
  });

  it('blocks adding Obsidian-reserved names (tags, aliases, cssclasses, position)', async () => {
    NoticeSpy.mockClear();
    const setVariable = vi.fn();
    const registry = {
      getVariables: () => ({}),
      getType: () => 'text',
      getAllVariableNames: () => [],
      getValuesForVariable: () => [],
      setVariable, removeVariable: vi.fn(),
      addOnMutate: vi.fn(), removeOnMutate: vi.fn(),
    } as any;

    new PropertiesEditor(container, { fileId: 'jane.md', registry });
    const nameInput = container.querySelector('.case-variables-add-row input[data-role="name"]') as HTMLInputElement;
    const valueInput = container.querySelector('.case-variables-add-row input[data-role="value"]') as HTMLInputElement;
    const addBtn = container.querySelector('.case-variables-add-row button') as HTMLButtonElement;

    nameInput.value = 'tags';
    valueInput.value = 'foo';
    addBtn.click();
    await Promise.resolve();

    expect(setVariable).not.toHaveBeenCalled();
    expect(NoticeSpy).toHaveBeenCalledTimes(1);
    expect(NoticeSpy.mock.calls[0][0]).toContain('"tags"');
  });

  it('shows fallback empty state when fileId function returns null (file deleted)', () => {
    const registry = {
      getVariables: vi.fn(),
      getType: () => 'text',
      getAllVariableNames: () => [],
      getValuesForVariable: () => [],
      setVariable: vi.fn(), removeVariable: vi.fn(),
      addOnMutate: vi.fn(), removeOnMutate: vi.fn(),
    } as any;

    new PropertiesEditor(container, { fileId: () => null, registry });

    expect(registry.getVariables).not.toHaveBeenCalled();
    expect(container.querySelector('.case-variables-empty')?.textContent).toBe('File no longer available');
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

describe('PropertiesEditor — add row', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  function makeAddRowContext() {
    const setVariable = vi.fn();
    const registry = {
      getVariables: () => ({}),
      getType: () => 'text',
      getAllVariableNames: () => [],
      getValuesForVariable: () => [],
      setVariable, removeVariable: vi.fn(),
      addOnMutate: vi.fn(), removeOnMutate: vi.fn(),
    } as any;

    new PropertiesEditor(container, { fileId: 'jane.jpg', registry });
    const addRow = container.querySelector('.case-variables-add-row') as HTMLElement;
    return {
      setVariable,
      nameInput: addRow.querySelector('input[data-role="name"]') as HTMLInputElement,
      valueInput: addRow.querySelector('input[data-role="value"]') as HTMLInputElement,
      addBtn: addRow.querySelector('button[data-role="add"]') as HTMLButtonElement,
    };
  }

  it('creates new property via add row (type inferred)', async () => {
    const { setVariable, nameInput, valueInput, addBtn } = makeAddRowContext();
    nameInput.value = 'idade';
    valueInput.value = '30';
    addBtn.click();
    await Promise.resolve();
    expect(setVariable).toHaveBeenCalledWith('jane.jpg', 'idade', 30);
  });

  it('rejects empty value with Notice', async () => {
    NoticeSpy.mockClear();
    const { setVariable, nameInput, valueInput, addBtn } = makeAddRowContext();
    nameInput.value = 'mood';
    valueInput.value = '';
    addBtn.click();
    await Promise.resolve();
    expect(setVariable).not.toHaveBeenCalled();
    expect(NoticeSpy).toHaveBeenCalledWith(expect.stringContaining('value'));
  });

  it('rejects whitespace-only value', async () => {
    NoticeSpy.mockClear();
    const { setVariable, nameInput, valueInput, addBtn } = makeAddRowContext();
    nameInput.value = 'mood';
    valueInput.value = '   ';
    addBtn.click();
    await Promise.resolve();
    expect(setVariable).not.toHaveBeenCalled();
  });

  it('accepts emoji in property name', async () => {
    const { setVariable, nameInput, valueInput, addBtn } = makeAddRowContext();
    nameInput.value = '🌟 mood';
    valueInput.value = 'great';
    addBtn.click();
    await Promise.resolve();
    expect(setVariable).toHaveBeenCalledWith('jane.jpg', '🌟 mood', 'great');
  });

  it('accepts accented characters in value', async () => {
    const { setVariable, nameInput, valueInput, addBtn } = makeAddRowContext();
    nameInput.value = 'cidade';
    valueInput.value = 'São Paulo';
    addBtn.click();
    await Promise.resolve();
    expect(setVariable).toHaveBeenCalledWith('jane.jpg', 'cidade', 'São Paulo');
  });
});

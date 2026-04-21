import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('obsidian', () => ({
  setIcon: vi.fn(),
}));

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

import { openPropertiesPopover } from '../../../src/core/caseVariables/propertiesPopover';

describe('openPropertiesPopover', () => {
  let trigger: HTMLElement;

  beforeEach(() => {
    trigger = document.createElement('button');
    document.body.appendChild(trigger);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  const makeRegistry = () => ({
    getVariables: () => ({}),
    getType: () => 'text',
    getAllVariableNames: () => [],
    getValuesForVariable: () => [],
    setVariable: vi.fn(), removeVariable: vi.fn(),
    addOnMutate: vi.fn(), removeOnMutate: vi.fn(),
  } as any);

  it('creates a popover element attached to body', () => {
    openPropertiesPopover(trigger, { fileId: 'jane.jpg', registry: makeRegistry() });
    expect(document.querySelector('.case-variables-popover')).toBeTruthy();
  });

  it('closes on × click', () => {
    openPropertiesPopover(trigger, { fileId: 'jane.jpg', registry: makeRegistry() });
    const closeBtn = document.querySelector('.case-variables-popover-close') as HTMLElement;
    closeBtn.click();
    expect(document.querySelector('.case-variables-popover')).toBeFalsy();
  });

  it('calls onClose callback when closed', () => {
    const onClose = vi.fn();
    openPropertiesPopover(trigger, { fileId: 'jane.jpg', registry: makeRegistry(), onClose });
    const closeBtn = document.querySelector('.case-variables-popover-close') as HTMLElement;
    closeBtn.click();
    expect(onClose).toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('obsidian', () => ({
  setIcon: vi.fn(),
}));

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

import { describe, it, expect, vi } from 'vitest';
import { CaseVariablesRegistry } from '../../../src/core/caseVariables/caseVariablesRegistry';
import type { App } from 'obsidian';

function mockApp(obsidianTypes: Record<string, string> = {}): App {
  return {
    vault: { getMarkdownFiles: () => [] },
    metadataCache: { getFileCache: () => undefined, on: vi.fn(() => ({})), offref: vi.fn() },
    workspace: { layoutReady: true, onLayoutReady: vi.fn((cb: () => void) => cb()) },
    metadataTypeManager: {
      getTypeInfo: (name: string) => obsidianTypes[name] ? { type: obsidianTypes[name] } : undefined,
    },
  } as unknown as App;
}

const mockData = (types: Record<string, string> = {}) => ({
  section: vi.fn(() => ({ values: {}, types })),
  setSection: vi.fn(),
});

describe('CaseVariablesRegistry — getType priority', () => {
  it('returns Obsidian type when available', async () => {
    const app = mockApp({ idade: 'number' });
    const reg = new CaseVariablesRegistry(app, mockData() as any);
    await reg.initialize();

    expect(reg.getType('idade')).toBe('number');
  });

  it('falls back to plugin registry when Obsidian has no type', async () => {
    const app = mockApp();
    const reg = new CaseVariablesRegistry(app, mockData({ grupo: 'text' }) as any);
    await reg.initialize();

    expect(reg.getType('grupo')).toBe('text');
  });

  it('defaults to text when neither has the type', async () => {
    const app = mockApp();
    const reg = new CaseVariablesRegistry(app, mockData() as any);
    await reg.initialize();

    expect(reg.getType('desconhecida')).toBe('text');
  });

  it('Obsidian type wins over plugin type', async () => {
    const app = mockApp({ idade: 'number' });
    const reg = new CaseVariablesRegistry(app, mockData({ idade: 'text' }) as any);
    await reg.initialize();

    expect(reg.getType('idade')).toBe('number');
  });
});

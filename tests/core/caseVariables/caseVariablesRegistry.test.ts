import { describe, it, expect, vi } from 'vitest';
import { CaseVariablesRegistry } from '../../../src/core/caseVariables/caseVariablesRegistry';
import type { App, TFile } from 'obsidian';

function createMockApp(opts: {
  mdFiles?: Array<{ path: string; frontmatter?: Record<string, unknown> }>;
} = {}): App {
  const mdFiles = (opts.mdFiles ?? []).map(f => ({
    path: f.path,
    extension: 'md',
  } as TFile));

  const metadataCache = {
    getFileCache: (file: TFile) => ({
      frontmatter: opts.mdFiles?.find(f => f.path === file.path)?.frontmatter,
    }),
    on: vi.fn(() => ({ id: 'event' })),
    offref: vi.fn(),
  };

  return {
    vault: { getMarkdownFiles: () => mdFiles },
    metadataCache,
    workspace: { layoutReady: true, onLayoutReady: vi.fn((cb: () => void) => cb()) },
  } as unknown as App;
}

function createMockDataManager(initialSection: { values: Record<string, Record<string, unknown>>; types: Record<string, string> } = { values: {}, types: {} }) {
  let stored = initialSection;
  return {
    section: vi.fn((_name: string) => stored),
    setSection: vi.fn((_name: string, value: any) => { stored = value; }),
    _get: () => stored,
  };
}

describe('CaseVariablesRegistry — initialize', () => {
  it('loads empty mirror from default schema', async () => {
    const app = createMockApp();
    const data = createMockDataManager();
    const reg = new CaseVariablesRegistry(app, data as any);

    await reg.initialize();

    expect(reg.getAllVariableNames()).toEqual([]);
    expect(reg.getVariables('any.md')).toEqual({});
  });

  it('loads persisted data from DataManager', async () => {
    const app = createMockApp();
    const data = createMockDataManager({
      values: { 'jane-photo.jpg': { idade: 30, grupo: 'controle' } },
      types: { grupo: 'text' },
    });
    const reg = new CaseVariablesRegistry(app, data as any);

    await reg.initialize();

    expect(reg.getVariables('jane-photo.jpg')).toEqual({ idade: 30, grupo: 'controle' });
  });
});

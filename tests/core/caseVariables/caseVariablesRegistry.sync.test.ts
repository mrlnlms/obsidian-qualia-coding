import { describe, it, expect, vi } from 'vitest';
import { CaseVariablesRegistry } from '../../../src/core/caseVariables/caseVariablesRegistry';
import type { App, TFile } from 'obsidian';

function mockAppWithMdFiles(files: Array<{ path: string; frontmatter?: Record<string, unknown> }>): App {
  return {
    vault: {
      getMarkdownFiles: () => files.map(f => ({ path: f.path, extension: 'md' } as TFile)),
    },
    metadataCache: {
      getFileCache: (file: TFile) => ({
        frontmatter: files.find(f => f.path === file.path)?.frontmatter,
      }),
      on: vi.fn(() => ({ id: 'event' })),
      offref: vi.fn(),
    },
    workspace: { layoutReady: true, onLayoutReady: vi.fn((cb: () => void) => cb()) },
  } as unknown as App;
}

const mockData = () => ({
  section: vi.fn(() => ({ values: {}, types: {} })),
  setSection: vi.fn(),
});

describe('CaseVariablesRegistry — syncFromFrontmatter', () => {
  it('populates mirror from frontmatter of all md files on init', async () => {
    const app = mockAppWithMdFiles([
      { path: 'jane.md', frontmatter: { idade: 30, grupo: 'controle' } },
      { path: 'john.md', frontmatter: { idade: 25 } },
    ]);
    const reg = new CaseVariablesRegistry(app, mockData() as any);

    await reg.initialize();

    expect(reg.getVariables('jane.md')).toEqual({ idade: 30, grupo: 'controle' });
    expect(reg.getVariables('john.md')).toEqual({ idade: 25 });
  });

  it('filters OBSIDIAN_RESERVED properties', async () => {
    const app = mockAppWithMdFiles([
      { path: 'note.md', frontmatter: { idade: 30, aliases: ['alt'], tags: ['foo'], cssclasses: ['c'], position: {} } },
    ]);
    const reg = new CaseVariablesRegistry(app, mockData() as any);

    await reg.initialize();

    expect(reg.getVariables('note.md')).toEqual({ idade: 30 });
  });

  it('removes mirror entry when frontmatter is fully empty', async () => {
    const app = mockAppWithMdFiles([{ path: 'empty.md', frontmatter: {} }]);
    const reg = new CaseVariablesRegistry(app, mockData() as any);

    await reg.initialize();

    expect(reg.getVariables('empty.md')).toEqual({});
    expect(reg.getAllVariableNames()).toEqual([]);
  });

  it('registers metadataCache listener after initial scan', async () => {
    const app = mockAppWithMdFiles([]);
    const reg = new CaseVariablesRegistry(app, mockData() as any);

    await reg.initialize();

    expect(app.metadataCache.on).toHaveBeenCalledWith('changed', expect.any(Function));
  });

  it('re-syncs and notifies listeners when frontmatter changes (multi-pane edit)', async () => {
    const files = [{ path: 'jane.md', frontmatter: { mood: 'happy' } }];
    let changedHandler: ((file: TFile) => void) = () => {};
    const app = {
      vault: { getMarkdownFiles: () => files.map(f => ({ path: f.path, extension: 'md' } as TFile)) },
      metadataCache: {
        getFileCache: (file: TFile) => ({ frontmatter: files.find(f => f.path === file.path)?.frontmatter }),
        on: vi.fn((_evt: string, fn: (file: TFile) => void) => { changedHandler = fn; return { id: 'event' }; }),
        offref: vi.fn(),
      },
      workspace: { layoutReady: true, onLayoutReady: vi.fn((cb: () => void) => cb()) },
    } as unknown as App;

    const reg = new CaseVariablesRegistry(app, mockData() as any);
    await reg.initialize();

    const listener = vi.fn();
    reg.addOnMutate(listener);

    // Simulate external edit: user changes frontmatter directly in a markdown editor,
    // Obsidian fires metadataCache 'changed'.
    files[0]!.frontmatter = { mood: 'excited' };
    changedHandler({ path: 'jane.md', extension: 'md' } as TFile);

    expect(reg.getVariables('jane.md')).toEqual({ mood: 'excited' });
    expect(listener).toHaveBeenCalled();
  });
});

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

describe('CaseVariablesRegistry — setVariable (binary)', () => {
  it('writes to mirror and persists', async () => {
    const app = createMockApp();
    const data = createMockDataManager();
    const reg = new CaseVariablesRegistry(app, data as any);
    await reg.initialize();

    await reg.setVariable('jane.jpg', 'idade', 30);

    expect(reg.getVariables('jane.jpg')).toEqual({ idade: 30 });
    expect(data.setSection).toHaveBeenCalledWith('caseVariables', expect.objectContaining({
      values: { 'jane.jpg': { idade: 30 } },
    }));
  });

  it('notifies listeners on write', async () => {
    const app = createMockApp();
    const reg = new CaseVariablesRegistry(app, createMockDataManager() as any);
    await reg.initialize();
    const listener = vi.fn();
    reg.addOnMutate(listener);

    await reg.setVariable('jane.jpg', 'idade', 30);

    expect(listener).toHaveBeenCalled();
  });
});

describe('CaseVariablesRegistry — setVariable (markdown)', () => {
  it('calls processFrontMatter to write to md file', async () => {
    const processFrontMatter = vi.fn(async (_file: any, fn: (fm: any) => void) => {
      const fm: Record<string, unknown> = {};
      fn(fm);
    });
    const vault = {
      getMarkdownFiles: () => [],
      getAbstractFileByPath: (p: string) => ({ path: p, extension: 'md' }),
    };
    const app = {
      vault,
      fileManager: { processFrontMatter },
      metadataCache: { getFileCache: () => undefined, on: vi.fn(() => ({})), offref: vi.fn() },
      workspace: { layoutReady: true, onLayoutReady: vi.fn((cb: () => void) => cb()) },
    } as unknown as App;

    const reg = new CaseVariablesRegistry(app, createMockDataManager() as any);
    await reg.initialize();

    await reg.setVariable('jane.md', 'idade', 30);

    expect(processFrontMatter).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'jane.md' }),
      expect.any(Function),
    );
  });

  it('marks writingInProgress during processFrontMatter call', async () => {
    let wasGuarded = false;
    let reg: CaseVariablesRegistry;

    const processFrontMatter = vi.fn(async (_file: any, fn: (fm: any) => void) => {
      // durante o processFrontMatter, o guard deve estar ativo
      wasGuarded = (reg as unknown as { writingInProgress: Set<string> }).writingInProgress.has('jane.md');
      fn({});
    });
    const app = {
      vault: {
        getMarkdownFiles: () => [],
        getAbstractFileByPath: (p: string) => ({ path: p, extension: 'md' }),
      },
      fileManager: { processFrontMatter },
      metadataCache: { getFileCache: () => undefined, on: vi.fn(() => ({})), offref: vi.fn() },
      workspace: { layoutReady: true, onLayoutReady: vi.fn((cb: () => void) => cb()) },
    } as unknown as App;

    reg = new CaseVariablesRegistry(app, createMockDataManager() as any);
    await reg.initialize();

    await reg.setVariable('jane.md', 'idade', 30);

    expect(wasGuarded).toBe(true);
  });
});

describe('CaseVariablesRegistry — removeVariable / removeAllForFile / migrateFilePath', () => {
  it('removes a single variable from binary', async () => {
    const app = createMockApp();
    const data = createMockDataManager({ values: { 'jane.jpg': { idade: 30, grupo: 'c' } }, types: {} });
    const reg = new CaseVariablesRegistry(app, data as any);
    await reg.initialize();

    await reg.removeVariable('jane.jpg', 'idade');

    expect(reg.getVariables('jane.jpg')).toEqual({ grupo: 'c' });
  });

  it('removes all variables of a file', async () => {
    const app = createMockApp();
    const data = createMockDataManager({ values: { 'jane.jpg': { idade: 30 } }, types: {} });
    const reg = new CaseVariablesRegistry(app, data as any);
    await reg.initialize();

    reg.removeAllForFile('jane.jpg');

    expect(reg.getVariables('jane.jpg')).toEqual({});
  });

  it('migrates file path on rename', async () => {
    const app = createMockApp();
    const data = createMockDataManager({ values: { 'old.jpg': { idade: 30 } }, types: {} });
    const reg = new CaseVariablesRegistry(app, data as any);
    await reg.initialize();

    reg.migrateFilePath('old.jpg', 'new.jpg');

    expect(reg.getVariables('old.jpg')).toEqual({});
    expect(reg.getVariables('new.jpg')).toEqual({ idade: 30 });
  });

  it('calls processFrontMatter with delete on markdown path', async () => {
    let deletedKey: string | undefined;
    const processFrontMatter = vi.fn(async (_file: any, fn: (fm: any) => void) => {
      const fm: Record<string, unknown> = { idade: 30, grupo: 'c' };
      fn(fm);
      deletedKey = 'idade' in fm ? undefined : 'idade';
    });
    const app = {
      vault: {
        getMarkdownFiles: () => [],
        getAbstractFileByPath: (p: string) => ({ path: p, extension: 'md' }),
      },
      fileManager: { processFrontMatter },
      metadataCache: { getFileCache: () => undefined, on: vi.fn(() => ({})), offref: vi.fn() },
      workspace: { layoutReady: true, onLayoutReady: vi.fn((cb: () => void) => cb()) },
    } as unknown as App;

    const reg = new CaseVariablesRegistry(app, createMockDataManager() as any);
    await reg.initialize();

    await reg.removeVariable('jane.md', 'idade');

    expect(processFrontMatter).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'jane.md' }),
      expect.any(Function),
    );
    expect(deletedKey).toBe('idade');
  });
});

describe('CaseVariablesRegistry — autocomplete helpers', () => {
  it('returns all values for a variable across files', async () => {
    const app = createMockApp();
    const data = createMockDataManager({
      values: {
        'a.jpg': { grupo: 'controle' },
        'b.jpg': { grupo: 'tratamento' },
        'c.jpg': { grupo: 'controle' },  // duplicado — deduplicado no retorno
      },
      types: {},
    });
    const reg = new CaseVariablesRegistry(app, data as any);
    await reg.initialize();

    const values = reg.getValuesForVariable('grupo');
    expect(values.sort()).toEqual(['controle', 'tratamento']);
  });

  it('returns files that have a specific variable', async () => {
    const app = createMockApp();
    const data = createMockDataManager({
      values: {
        'a.jpg': { grupo: 'c' },
        'b.jpg': { idade: 30 },
      },
      types: {},
    });
    const reg = new CaseVariablesRegistry(app, data as any);
    await reg.initialize();

    expect(reg.getFilesByVariable('grupo').sort()).toEqual(['a.jpg']);
    expect(reg.getFilesByVariable('idade').sort()).toEqual(['b.jpg']);
  });

  it('filters files by exact variable value', async () => {
    const app = createMockApp();
    const data = createMockDataManager({
      values: {
        'a.jpg': { grupo: 'controle' },
        'b.jpg': { grupo: 'tratamento' },
        'c.jpg': { grupo: 'controle' },
      },
      types: {},
    });
    const reg = new CaseVariablesRegistry(app, data as any);
    await reg.initialize();

    expect(reg.getFilesByVariable('grupo', 'controle').sort()).toEqual(['a.jpg', 'c.jpg']);
    expect(reg.getFilesByVariable('grupo', 'inexistente')).toEqual([]);
  });
});

import { describe, it, expect, vi } from 'vitest';
import { reconcileBoard, buildSummary, type ReconcileResult } from '../../src/analytics/board/boardReconciler';

// Mock Fabric canvas com getObjects/remove/renderAll
function mockCanvas(objects: any[]) {
  return {
    getObjects: () => [...objects],
    remove: vi.fn((...objs: any[]) => {
      for (const obj of objs) {
        const idx = objects.indexOf(obj);
        if (idx >= 0) objects.splice(idx, 1);
      }
    }),
  } as any;
}

// Mock registry
function mockRegistry(codes: Array<{ name: string; color: string }>) {
  const map = new Map(codes.map(c => [c.name, c]));
  return {
    getByName: (name: string) => map.get(name),
  } as any;
}

// Mock app.vault
function mockApp(existingFiles: string[]) {
  const set = new Set(existingFiles);
  return {
    vault: {
      getAbstractFileByPath: (path: string) => set.has(path) ? { path } : null,
    },
  } as any;
}

// Mock ConsolidatedData
function mockData(markers: Array<{ codes: string[]; source: string }>) {
  return { markers } as any;
}

function mkCodeCard(name: string, color: string, count: number, sources: string[] = []) {
  return {
    boardType: 'codeCard',
    boardId: `cc-${name}`,
    boardCodeName: name,
    boardColor: color,
    boardMarkerCount: count,
    boardSources: sources,
  };
}

function mkExcerpt(file: string, codes: string[], colors: string[]) {
  return {
    boardType: 'excerpt',
    boardId: `ex-${file}`,
    boardFile: file,
    boardCodes: [...codes],
    boardCodeColors: [...colors],
  };
}

function mkArrow(fromId: string, toId: string) {
  return {
    boardType: 'arrow-line',
    boardId: `arrow-${fromId}-${toId}`,
    boardFromId: fromId,
    boardToId: toId,
  };
}

function mkArrowHead(arrowId: string) {
  return {
    boardType: 'arrow-head',
    boardId: arrowId,
  };
}

function mkCluster(codeNames: string[]) {
  return {
    boardType: 'cluster-frame',
    boardId: `cluster-1`,
    boardCodeNames: [...codeNames],
  };
}

describe('reconcileBoard', () => {
  it('returns zeros when nothing changed', () => {
    const card = mkCodeCard('A', '#f00', 2, ['markdown']);
    const canvas = mockCanvas([card]);
    const registry = mockRegistry([{ name: 'A', color: '#f00' }]);
    const data = mockData([
      { codes: ['A'], source: 'markdown' },
      { codes: ['A'], source: 'markdown' },
    ]);
    const app = mockApp([]);
    const result = reconcileBoard(canvas, registry, data, app);
    expect(result.colorsUpdated).toBe(0);
    expect(result.namesUpdated).toBe(0);
    expect(result.countsUpdated).toBe(0);
    expect(result.codesMarkedDeleted).toBe(0);
  });

  it('updates CodeCard color when registry color changed', () => {
    const card = mkCodeCard('A', '#f00', 1);
    const canvas = mockCanvas([card]);
    const registry = mockRegistry([{ name: 'A', color: '#0f0' }]);
    const data = mockData([{ codes: ['A'], source: 'markdown' }]);
    const result = reconcileBoard(canvas, registry, data, mockApp([]));
    expect(result.colorsUpdated).toBe(1);
    expect(card.boardColor).toBe('#0f0');
  });

  it('updates CodeCard marker count', () => {
    const card = mkCodeCard('A', '#f00', 1);
    const canvas = mockCanvas([card]);
    const registry = mockRegistry([{ name: 'A', color: '#f00' }]);
    const data = mockData([
      { codes: ['A'], source: 'markdown' },
      { codes: ['A'], source: 'csv-segment' },
      { codes: ['A'], source: 'markdown' },
    ]);
    const result = reconcileBoard(canvas, registry, data, mockApp([]));
    expect(result.countsUpdated).toBe(1);
    expect(card.boardMarkerCount).toBe(3);
  });

  it('marks CodeCard as deleted when code not in registry', () => {
    const card = mkCodeCard('Deleted', '#f00', 5);
    const canvas = mockCanvas([card]);
    const registry = mockRegistry([]);
    const data = mockData([]);
    const result = reconcileBoard(canvas, registry, data, mockApp([]));
    expect(result.codesMarkedDeleted).toBe(1);
    expect(card.boardCodeName).toContain('(deletado)');
    expect(card.boardColor).toBe('#888');
  });

  it('does not re-mark already deleted CodeCard', () => {
    const card = mkCodeCard('(deletado) X', '#888', 0);
    (card as any).boardDeleted = true;
    const canvas = mockCanvas([card]);
    const registry = mockRegistry([]);
    const data = mockData([]);
    const result = reconcileBoard(canvas, registry, data, mockApp([]));
    expect(result.codesMarkedDeleted).toBe(0);
  });

  it('marks Excerpt as orphaned when file missing', () => {
    const excerpt = mkExcerpt('deleted.md', ['A'], ['#f00']);
    const canvas = mockCanvas([excerpt]);
    const registry = mockRegistry([{ name: 'A', color: '#f00' }]);
    const result = reconcileBoard(canvas, registry, mockData([]), mockApp([]));
    expect(result.excerptsOrphaned).toBe(1);
    expect((excerpt as any).boardOrphaned).toBe(true);
  });

  it('does not mark Excerpt orphaned when file exists', () => {
    const excerpt = mkExcerpt('exists.md', ['A'], ['#f00']);
    const canvas = mockCanvas([excerpt]);
    const registry = mockRegistry([{ name: 'A', color: '#f00' }]);
    const result = reconcileBoard(canvas, registry, mockData([]), mockApp(['exists.md']));
    expect(result.excerptsOrphaned).toBe(0);
  });

  it('removes deleted code from Excerpt chips', () => {
    const excerpt = mkExcerpt('f.md', ['A', 'B'], ['#f00', '#0f0']);
    const canvas = mockCanvas([excerpt]);
    const registry = mockRegistry([{ name: 'A', color: '#f00' }]);
    const result = reconcileBoard(canvas, registry, mockData([]), mockApp(['f.md']));
    expect(excerpt.boardCodes).toEqual(['A']);
    expect(excerpt.boardCodeColors).toEqual(['#f00']);
  });

  it('removes orphaned Arrow', () => {
    const card = mkCodeCard('A', '#f00', 1);
    const arrow = mkArrow('cc-A', 'cc-GONE');
    const head = mkArrowHead(arrow.boardId);
    const objects = [card, arrow, head];
    const canvas = mockCanvas(objects);
    const registry = mockRegistry([{ name: 'A', color: '#f00' }]);
    const result = reconcileBoard(canvas, registry, mockData([{ codes: ['A'], source: 'markdown' }]), mockApp([]));
    expect(result.arrowsRemoved).toBe(1);
    expect(canvas.remove).toHaveBeenCalled();
  });

  it('removes codes from Cluster and removes empty cluster', () => {
    const cluster = mkCluster(['A', 'B']);
    const objects = [cluster];
    const canvas = mockCanvas(objects);
    const registry = mockRegistry([{ name: 'A', color: '#f00' }]);
    const result = reconcileBoard(canvas, registry, mockData([]), mockApp([]));
    expect(result.clustersUpdated).toBe(1);
    expect(cluster.boardCodeNames).toEqual(['A']);
  });

  it('removes cluster when all codes deleted', () => {
    const cluster = mkCluster(['X', 'Y']);
    const objects = [cluster];
    const canvas = mockCanvas(objects);
    const registry = mockRegistry([]);
    const result = reconcileBoard(canvas, registry, mockData([]), mockApp([]));
    expect(result.clustersUpdated).toBe(1);
    expect(canvas.remove).toHaveBeenCalled();
  });
});

describe('buildSummary', () => {
  it('returns empty string for no changes', () => {
    const r: ReconcileResult = { colorsUpdated: 0, namesUpdated: 0, countsUpdated: 0, codesMarkedDeleted: 0, excerptsOrphaned: 0, arrowsRemoved: 0, clustersUpdated: 0 };
    expect(buildSummary(r)).toBe('');
  });

  it('builds summary with multiple changes', () => {
    const r: ReconcileResult = { colorsUpdated: 2, namesUpdated: 1, countsUpdated: 3, codesMarkedDeleted: 0, excerptsOrphaned: 0, arrowsRemoved: 1, clustersUpdated: 0 };
    const s = buildSummary(r);
    expect(s).toContain('2 cores');
    expect(s).toContain('1 nome');
    expect(s).toContain('3 contagens');
    expect(s).toContain('1 arrow');
  });
});

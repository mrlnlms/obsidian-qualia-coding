import { describe, it, expect } from 'vitest';
import { applyFilters } from '../../src/analytics/data/statsHelpers';
import type { ConsolidatedData, UnifiedMarker } from '../../src/analytics/data/dataTypes';

const markers: UnifiedMarker[] = [
  { id: '1', fileId: 'a.md', source: 'markdown', codes: [] } as any,
  { id: '2', fileId: 'b.md', source: 'markdown', codes: [] } as any,
  { id: '3', fileId: 'c.jpg', source: 'image', codes: [] } as any,
];
const data: ConsolidatedData = { markers } as any;

const registry = {
  getVariables: (fileId: string) => {
    if (fileId === 'a.md') return { grupo: 'controle' };
    if (fileId === 'b.md') return { grupo: 'tratamento' };
    if (fileId === 'c.jpg') return { grupo: 'controle' };
    return {};
  },
} as any;

const baseFilter = {
  sources: ['markdown', 'image', 'pdf', 'csv', 'audio', 'video'],
  codes: [],
  excludeCodes: [],
  minFrequency: 0,
} as any;

describe('applyFilters — caseVariableFilter', () => {
  it('filters markers by variable equality', () => {
    const filtered = applyFilters(
      data,
      { ...baseFilter, caseVariableFilter: { name: 'grupo', value: 'controle' } },
      registry,
    );
    expect(filtered.map(m => m.fileId).sort()).toEqual(['a.md', 'c.jpg']);
  });

  it('returns all markers when no caseVariableFilter', () => {
    const filtered = applyFilters(data, baseFilter);
    expect(filtered).toHaveLength(3);
  });

  it('excludes markers whose file has no such variable', () => {
    const filtered = applyFilters(
      data,
      { ...baseFilter, caseVariableFilter: { name: 'grupo', value: 'outro' } },
      registry,
    );
    expect(filtered).toHaveLength(0);
  });

  it('skips filtering when registry is not provided', () => {
    // With filter set but no registry, defensive-skip: return all passing other filters
    const filtered = applyFilters(
      data,
      { ...baseFilter, caseVariableFilter: { name: 'grupo', value: 'controle' } },
    );
    expect(filtered).toHaveLength(3);
  });
});

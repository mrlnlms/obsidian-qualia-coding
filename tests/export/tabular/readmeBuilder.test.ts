import { describe, it, expect } from 'vitest';
import { buildReadme } from '../../../src/export/tabular/readmeBuilder';

describe('buildReadme', () => {
  const baseOpts = {
    pluginVersion: '0.1.0',
    includeRelations: true,
    includeShapeCoords: true,
    warnings: [] as string[],
  };

  it('includes header with timestamp and plugin version', () => {
    const md = buildReadme(baseOpts);
    expect(md).toContain('# Qualia Coding — Tabular Export');
    expect(md).toContain('0.1.0');
    expect(md).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('includes table schema for all 4 mandatory files', () => {
    const md = buildReadme(baseOpts);
    expect(md).toContain('segments.csv');
    expect(md).toContain('code_applications.csv');
    expect(md).toContain('codes.csv');
    expect(md).toContain('case_variables.csv');
  });

  it('includes relations.csv schema only when includeRelations=true', () => {
    expect(buildReadme({ ...baseOpts, includeRelations: true })).toContain('relations.csv');
    expect(buildReadme({ ...baseOpts, includeRelations: false })).not.toContain('relations.csv');
  });

  it('mentions shape_coords columns only when includeShapeCoords=true', () => {
    expect(buildReadme({ ...baseOpts, includeShapeCoords: true })).toContain('shape_coords');
    expect(buildReadme({ ...baseOpts, includeShapeCoords: false })).not.toContain('shape_coords');
  });

  it('includes R and Python code snippets', () => {
    const md = buildReadme(baseOpts);
    expect(md).toMatch(/```r/);
    expect(md).toContain('library(tidyverse)');
    expect(md).toMatch(/```python/);
    expect(md).toContain('import pandas');
  });

  it('appends Warnings section when warnings provided', () => {
    const md = buildReadme({ ...baseOpts, warnings: ['W1', 'W2'] });
    expect(md).toContain('## Warnings (2)');
    expect(md).toContain('- W1');
    expect(md).toContain('- W2');
  });

  it('omits Warnings section when list is empty', () => {
    const md = buildReadme({ ...baseOpts, warnings: [] });
    expect(md).not.toContain('## Warnings');
  });
});

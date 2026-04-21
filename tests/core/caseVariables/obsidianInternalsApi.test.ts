import { describe, it, expect } from 'vitest';
import type { App } from 'obsidian';
import { getObsidianPropertyType } from '../../../src/core/caseVariables/obsidianInternalsApi';

describe('getObsidianPropertyType', () => {
  it('returns type from metadataTypeManager if available', () => {
    const app = {
      metadataTypeManager: {
        getTypeInfo: (name: string) => name === 'idade' ? { type: 'number' } : undefined,
      },
    } as unknown as App;
    expect(getObsidianPropertyType(app, 'idade')).toBe('number');
    expect(getObsidianPropertyType(app, 'grupo')).toBe(undefined);
  });

  it('returns undefined if metadataTypeManager is unavailable', () => {
    const app = {} as App;
    expect(getObsidianPropertyType(app, 'idade')).toBe(undefined);
  });

  it('returns undefined if getTypeInfo throws', () => {
    const app = {
      metadataTypeManager: { getTypeInfo: () => { throw new Error('boom'); } },
    } as unknown as App;
    expect(getObsidianPropertyType(app, 'idade')).toBe(undefined);
  });

  it('returns undefined when type is not in VALID_TYPES whitelist', () => {
    const app = {
      metadataTypeManager: {
        getTypeInfo: (name: string) => name === 'futuro' ? { type: 'link' } : undefined,
      },
    } as unknown as App;
    expect(getObsidianPropertyType(app, 'futuro')).toBe(undefined);
  });
});

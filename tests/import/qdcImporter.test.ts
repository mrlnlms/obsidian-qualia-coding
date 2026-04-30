import { describe, it, expect } from 'vitest';
import { parseCodebook, applyCodebook } from '../../src/import/qdcImporter';
import { parseXml } from '../../src/import/xmlParser';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';

describe('parseCodebook', () => {
  it('parses flat codes with color and description', () => {
    const xml = `<CodeBook><Codes>
      <Code guid="c1" name="Theme A" color="#ff0000" isCodable="true">
        <Description>A theme about stuff</Description>
      </Code>
      <Code guid="c2" name="Theme B" color="#00ff00" isCodable="true"/>
    </Codes></CodeBook>`;
    const doc = parseXml(`<?xml version="1.0"?><Project>${xml}</Project>`);
    const result = parseCodebook(doc);
    expect(result.codes).toHaveLength(2);
    const a = result.codes.find(c => c.guid === 'c1')!;
    expect(a.name).toBe('Theme A');
    expect(a.color).toBe('#ff0000');
    expect(a.description).toBe('A theme about stuff');
    expect(a.parentGuid).toBeUndefined();
    const b = result.codes.find(c => c.guid === 'c2')!;
    expect(b.name).toBe('Theme B');
    expect(b.description).toBeUndefined();
  });

  it('parses nested codes (hierarchy)', () => {
    const xml = `<CodeBook><Codes>
      <Code guid="parent" name="Emotions" color="#ff0000" isCodable="true">
        <Code guid="child1" name="Joy" color="#00ff00" isCodable="true"/>
        <Code guid="child2" name="Frustration" color="#0000ff" isCodable="true"/>
      </Code>
    </Codes></CodeBook>`;
    const doc = parseXml(`<?xml version="1.0"?><Project>${xml}</Project>`);
    const result = parseCodebook(doc);
    expect(result.codes).toHaveLength(3);
    const parent = result.codes.find(c => c.guid === 'parent')!;
    expect(parent.parentGuid).toBeUndefined();
    expect(parent.childrenGuids).toEqual(['child1', 'child2']);
    const child1 = result.codes.find(c => c.guid === 'child1')!;
    expect(child1.parentGuid).toBe('parent');
    expect(child1.name).toBe('Joy');
  });

  it('parses deeply nested hierarchy (3 levels)', () => {
    const xml = `<CodeBook><Codes>
      <Code guid="l1" name="L1" color="#ff0000" isCodable="true">
        <Code guid="l2" name="L2" color="#00ff00" isCodable="true">
          <Code guid="l3" name="L3" color="#0000ff" isCodable="true"/>
        </Code>
      </Code>
    </Codes></CodeBook>`;
    const doc = parseXml(`<?xml version="1.0"?><Project>${xml}</Project>`);
    const result = parseCodebook(doc);
    expect(result.codes).toHaveLength(3);
    const l2 = result.codes.find(c => c.guid === 'l2')!;
    expect(l2.parentGuid).toBe('l1');
    expect(l2.childrenGuids).toEqual(['l3']);
    const l3 = result.codes.find(c => c.guid === 'l3')!;
    expect(l3.parentGuid).toBe('l2');
  });

  it('handles isCodable=false as normal code', () => {
    const xml = `<CodeBook><Codes>
      <Code guid="folder" name="Group" color="#ff0000" isCodable="false">
        <Code guid="inside" name="Inside" color="#00ff00" isCodable="true"/>
      </Code>
    </Codes></CodeBook>`;
    const doc = parseXml(`<?xml version="1.0"?><Project>${xml}</Project>`);
    const result = parseCodebook(doc);
    expect(result.codes).toHaveLength(2);
    expect(result.codes.find(c => c.guid === 'folder')).toBeDefined();
  });

  it('returns empty array for empty codebook', () => {
    const doc = parseXml(`<?xml version="1.0"?><Project><CodeBook><Codes/></CodeBook></Project>`);
    const result = parseCodebook(doc);
    expect(result.codes).toHaveLength(0);
  });
});

describe('applyCodebook', () => {
  it('creates flat codes in registry', () => {
    const registry = new CodeDefinitionRegistry();
    const codebook = {
      codes: [
        { guid: 'g1', name: 'Alpha', color: '#ff0000', childrenGuids: [], noteGuids: [] },
        { guid: 'g2', name: 'Beta', color: '#00ff00', childrenGuids: [], noteGuids: [] },
      ],
    };
    const result = applyCodebook(codebook, registry, 'merge');
    expect(result.created).toBe(2);
    expect(result.merged).toBe(0);
    expect(registry.getByName('Alpha')).toBeDefined();
    expect(registry.getByName('Beta')).toBeDefined();
  });

  it('creates hierarchy (parent → children)', () => {
    const registry = new CodeDefinitionRegistry();
    const codebook = {
      codes: [
        { guid: 'p', name: 'Parent', color: '#ff0000', childrenGuids: ['c1', 'c2'], noteGuids: [] },
        { guid: 'c1', name: 'Child 1', color: '#00ff00', parentGuid: 'p', childrenGuids: [], noteGuids: [] },
        { guid: 'c2', name: 'Child 2', color: '#0000ff', parentGuid: 'p', childrenGuids: [], noteGuids: [] },
      ],
    };
    const result = applyCodebook(codebook, registry, 'merge');
    expect(result.created).toBe(3);
    const parent = registry.getByName('Parent')!;
    const children = registry.getChildren(parent.id);
    expect(children).toHaveLength(2);
    expect(children[0]!.name).toBe('Child 1');
  });

  it('merges conflicting codes when strategy=merge', () => {
    const registry = new CodeDefinitionRegistry();
    registry.create('Existing', '#ff0000');
    const codebook = {
      codes: [
        { guid: 'g1', name: 'Existing', color: '#00ff00', childrenGuids: [], noteGuids: [] },
        { guid: 'g2', name: 'New', color: '#0000ff', childrenGuids: [], noteGuids: [] },
      ],
    };
    const result = applyCodebook(codebook, registry, 'merge');
    expect(result.merged).toBe(1);
    expect(result.created).toBe(1);
    expect(registry.getAll()).toHaveLength(2);
    expect(registry.getByName('Existing')!.color).toBe('#ff0000');
  });

  it('creates separate codes when strategy=separate', () => {
    const registry = new CodeDefinitionRegistry();
    registry.create('Existing', '#ff0000');
    const codebook = {
      codes: [
        { guid: 'g1', name: 'Existing', color: '#00ff00', childrenGuids: [], noteGuids: [] },
      ],
    };
    const result = applyCodebook(codebook, registry, 'separate');
    expect(result.created).toBe(1);
    expect(registry.getByName('Existing (imported)')).toBeDefined();
  });

  it('codeGuidMap maps QDPX GUIDs to Qualia IDs', () => {
    const registry = new CodeDefinitionRegistry();
    const codebook = {
      codes: [{ guid: 'qdpx-guid-123', name: 'Code', color: '#ff0000', childrenGuids: [], noteGuids: [] }],
    };
    const result = applyCodebook(codebook, registry, 'merge');
    const qualiaId = result.codeGuidMap.get('qdpx-guid-123');
    expect(qualiaId).toBeDefined();
    expect(registry.getById(qualiaId!)).toBeDefined();
  });
});

describe('parseCodebook — MemoText', () => {
  it('parses MemoText in Code', () => {
    const xml = `<?xml version="1.0"?>
<Project>
  <CodeBook>
    <Codes>
      <Code guid="g1" name="frustration" color="#FF0000" isCodable="true">
        <MemoText>reflexão analítica</MemoText>
      </Code>
    </Codes>
  </CodeBook>
</Project>`;
    const doc = parseXml(xml);
    const cb = parseCodebook(doc);
    expect(cb.codes[0]!.memo).toBe('reflexão analítica');
  });

  it('returns undefined memo when MemoText absent', () => {
    const xml = `<?xml version="1.0"?>
<Project><CodeBook><Codes>
  <Code guid="g1" name="x" isCodable="true"/>
</Codes></CodeBook></Project>`;
    const doc = parseXml(xml);
    const cb = parseCodebook(doc);
    expect(cb.codes[0]!.memo).toBeUndefined();
  });
});

describe('applyCodebook — memo', () => {
  it('applies memo when creating new code', () => {
    const registry = new CodeDefinitionRegistry();
    const codebook = {
      codes: [{ guid: 'g1', name: 'New', color: '#ff0000', memo: 'imported memo', childrenGuids: [], noteGuids: [] }],
    };
    applyCodebook(codebook, registry, 'merge');
    expect(registry.getByName('New')!.memo?.content).toBe('imported memo');
  });

  it('mergeMemos when importing into existing code with memo', () => {
    const registry = new CodeDefinitionRegistry();
    const def = registry.create('Existing', '#ff0000');
    registry.update(def.id, { memo: 'existing' });
    const codebook = {
      codes: [{ guid: 'g1', name: 'Existing', color: '#00ff00', memo: 'imported', childrenGuids: [], noteGuids: [] }],
    };
    applyCodebook(codebook, registry, 'merge');
    const updated = registry.getByName('Existing')!;
    expect(updated.memo?.content).toContain('existing');
    expect(updated.memo?.content).toContain('--- Imported memo ---');
    expect(updated.memo?.content).toContain('imported');
  });

  it('uses imported memo when existing code has no memo', () => {
    const registry = new CodeDefinitionRegistry();
    registry.create('Existing', '#ff0000');
    const codebook = {
      codes: [{ guid: 'g1', name: 'Existing', color: '#00ff00', memo: 'imported', childrenGuids: [], noteGuids: [] }],
    };
    applyCodebook(codebook, registry, 'merge');
    expect(registry.getByName('Existing')!.memo?.content).toBe('imported');
  });

  it('separate strategy: applies memo on (imported) duplicate', () => {
    const registry = new CodeDefinitionRegistry();
    registry.create('Existing', '#ff0000');
    const codebook = {
      codes: [{ guid: 'g1', name: 'Existing', color: '#00ff00', memo: 'mine', childrenGuids: [], noteGuids: [] }],
    };
    applyCodebook(codebook, registry, 'separate');
    expect(registry.getByName('Existing (imported)')!.memo?.content).toBe('mine');
  });
});

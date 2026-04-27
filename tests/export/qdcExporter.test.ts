import { describe, it, expect, beforeEach } from 'vitest';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';
import { buildCodebookXml, buildQdcFile } from '../../src/export/qdcExporter';

describe('buildCodebookXml', () => {
  let registry: CodeDefinitionRegistry;

  beforeEach(() => {
    registry = new CodeDefinitionRegistry();
  });

  it('generates empty Codes element for empty registry', () => {
    const xml = buildCodebookXml(registry);
    expect(xml).toContain('<Codes/>');
  });

  it('generates Code elements for flat codes', () => {
    const c1 = registry.create('Theme A', '#ff0000');
    const c2 = registry.create('Theme B', '#00ff00', 'A description');
    const xml = buildCodebookXml(registry);

    expect(xml).toContain(`guid="${c1.id}"`);
    expect(xml).toContain('name="Theme A"');
    expect(xml).toContain('color="#ff0000"');
    expect(xml).toContain('isCodable="true"');
    expect(xml).toContain(`guid="${c2.id}"`);
    expect(xml).toContain('<Description>A description</Description>');
  });

  it('escapes special characters in names and descriptions', () => {
    registry.create('A & B', '#000000', 'Use < and >');
    const xml = buildCodebookXml(registry);
    expect(xml).toContain('name="A &amp; B"');
    expect(xml).toContain('<Description>Use &lt; and &gt;</Description>');
  });

  it('omits namespace when called without parameter (project embedding)', () => {
    const xml = buildCodebookXml(registry);
    expect(xml).not.toContain('xmlns=');
  });

  it('includes namespace when provided (standalone QDC)', () => {
    const xml = buildCodebookXml(registry, { namespace: 'urn:QDA-XML:codebook:1.0' });
    expect(xml).toContain('xmlns="urn:QDA-XML:codebook:1.0"');
  });
});

describe('buildQdcFile', () => {
  it('produces complete QDC file with declaration and namespace', () => {
    const registry = new CodeDefinitionRegistry();
    registry.create('Test', '#aabbcc');
    const qdc = buildQdcFile(registry);
    expect(qdc).toMatch(/^<\?xml version="1.0" encoding="utf-8"\?>/);
    expect(qdc).toContain('xmlns="urn:QDA-XML:codebook:1.0"');
    expect(qdc).toContain('<Codes>');
    expect(qdc).toContain('name="Test"');
  });
});

describe('buildCodebookXml — hierarchy', () => {
  it('nests children inside parent Code elements', () => {
    const registry = new CodeDefinitionRegistry();
    const parent = registry.create('Emotions', '#ff6600');
    const child1 = registry.create('Joy', '#33cc33', undefined, parent.id);
    const child2 = registry.create('Anger', '#ff0000', undefined, parent.id);

    const xml = buildCodebookXml(registry);

    const parentMatch = xml.match(/<Code[^>]*name="Emotions"[^>]*>([\s\S]*?)<\/Code>/);
    expect(parentMatch).toBeTruthy();
    expect(parentMatch![1]).toContain('name="Joy"');
    expect(parentMatch![1]).toContain('name="Anger"');
  });

  it('handles multi-level hierarchy', () => {
    const registry = new CodeDefinitionRegistry();
    const root = registry.create('Root', '#000000');
    const mid = registry.create('Mid', '#111111', undefined, root.id);
    const leaf = registry.create('Leaf', '#222222', undefined, mid.id);

    const xml = buildCodebookXml(registry);

    expect(xml).toContain('name="Root"');
    expect(xml).toContain('name="Mid"');
    expect(xml).toContain('name="Leaf"');

    const rootIdx = xml.indexOf('name="Root"');
    const leafIdx = xml.indexOf('name="Leaf"');
    expect(leafIdx).toBeGreaterThan(rootIdx);
  });
});

describe('MemoText emit', () => {
  it('emits MemoText in Code when memo present', () => {
    const reg = new CodeDefinitionRegistry();
    const def = reg.create('frustacao', '#FF0000');
    reg.update(def.id, { memo: 'reflexão' });
    const xml = buildCodebookXml(reg);
    expect(xml).toContain('<MemoText>reflexão</MemoText>');
  });

  it('omits MemoText in Code when memo empty', () => {
    const reg = new CodeDefinitionRegistry();
    reg.create('frustacao', '#FF0000');
    const xml = buildCodebookXml(reg);
    expect(xml).not.toContain('<MemoText>');
  });

  it('emits MemoText in Set when memo present', () => {
    const reg = new CodeDefinitionRegistry();
    const g = reg.createGroup('Theme');
    reg.setGroupMemo(g.id, 'group memo');
    const xml = buildCodebookXml(reg);
    expect(xml).toContain('<MemoText>group memo</MemoText>');
  });

  it('Code self-closing branch turns to open/close when memo added', () => {
    const reg = new CodeDefinitionRegistry();
    const def = reg.create('no-memo', '#FF0000');
    expect(buildCodebookXml(reg)).toMatch(/<Code [^>]*\/>/);

    reg.update(def.id, { memo: 'has memo now' });
    const xml = buildCodebookXml(reg);
    expect(xml).toMatch(/<Code [^>]*>[\s\S]*<\/Code>/);
    expect(xml).toContain('<MemoText>has memo now</MemoText>');
  });

  it('Set self-closing branch turns to open/close when memo added', () => {
    const reg = new CodeDefinitionRegistry();
    const g = reg.createGroup('Theme');
    expect(buildCodebookXml(reg)).toMatch(/<Set [^>]*\/>/);

    reg.setGroupMemo(g.id, 'set memo');
    const xml = buildCodebookXml(reg);
    expect(xml).toMatch(/<Set [^>]*>[\s\S]*<\/Set>/);
    expect(xml).toContain('<MemoText>set memo</MemoText>');
  });

  it('escapes XML special chars in memo', () => {
    const reg = new CodeDefinitionRegistry();
    const def = reg.create('x', '#000000');
    reg.update(def.id, { memo: '<bad> & "stuff"' });
    const xml = buildCodebookXml(reg);
    expect(xml).toContain('<MemoText>&lt;bad&gt; &amp; &quot;stuff&quot;</MemoText>');
  });
});

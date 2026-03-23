# QDPX Import Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full REFI-QDA import module (QDC + QDPX) with support for hierarchy, magnitude, and relations.

**Architecture:** New `src/import/` module with 6 files: XML parser, coordinate converters, QDC importer (codebook), QDPX importer (full project), import modal (conflict UI), and import commands. Pure functions for parsing/conversion, Obsidian APIs only in modal and commands. Export gets a small update to encode magnitude in Notes.

**Tech Stack:** DOMParser (browser-native XML), fflate (ZIP), Obsidian Modal/Setting/Notice APIs.

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/import/xmlParser.ts` | Extract elements/attributes from REFI-QDA XML via DOMParser |
| Create | `src/import/coordConverters.ts` | Inverse coordinate conversion (offset→line:ch, pixels→normalized, ms→seconds) |
| Create | `src/import/qdcImporter.ts` | Parse codebook XML → CodeDefinitions with hierarchy, handle conflicts |
| Create | `src/import/qdpxImporter.ts` | Orchestrate full QDPX import (ZIP→vault): sources, segments, memos, magnitude, relations |
| Create | `src/import/importModal.ts` | Modal UI: file picker result, preview, conflict resolution |
| Create | `src/import/importCommands.ts` | Register palette commands + analytics button factory |
| Modify | `src/export/qdpxExporter.ts:41-48` | Encode magnitude in Notes on Coding elements |
| Modify | `src/main.ts:24,87` | Wire `registerImportCommands` |
| Modify | `src/analytics/index.ts:27,91` | Add `openImportModal` to analytics plugin interface |
| Modify | `src/analytics/views/analyticsView.ts:260-266` | Add import button next to export button |
| Create | `tests/import/xmlParser.test.ts` | Tests for XML parsing helpers |
| Create | `tests/import/coordConverters.test.ts` | Tests for inverse coordinate converters |
| Create | `tests/import/qdcImporter.test.ts` | Tests for codebook import with hierarchy + conflicts |
| Create | `tests/import/qdpxImporter.test.ts` | Tests for full QDPX import orchestration |
| Create | `tests/import/magnitudeRoundTrip.test.ts` | Tests for magnitude export+import round-trip |

---

## Chunk 1: XML Parser + Coordinate Converters

### Task 1: XML Parser helpers

**Files:**
- Create: `src/import/xmlParser.ts`
- Test: `tests/import/xmlParser.test.ts`

- [ ] **Step 1: Write tests for xmlParser**

```typescript
// tests/import/xmlParser.test.ts
import { describe, it, expect } from 'vitest';
import { parseXml, getChildElements, getAttr, getTextContent, getAllElements } from '../../src/import/xmlParser';

describe('parseXml', () => {
  it('parses valid XML string into Document', () => {
    const doc = parseXml('<Root><Child name="a"/></Root>');
    expect(doc.documentElement.tagName).toBe('Root');
  });

  it('throws on invalid XML', () => {
    expect(() => parseXml('<Root><Unclosed>')).toThrow();
  });
});

describe('getChildElements', () => {
  it('returns direct child elements by tag name', () => {
    const doc = parseXml('<Root><Code name="A"/><Code name="B"/><Other/></Root>');
    const codes = getChildElements(doc.documentElement, 'Code');
    expect(codes).toHaveLength(2);
    expect(codes[0]!.getAttribute('name')).toBe('A');
  });

  it('does not return grandchildren', () => {
    const doc = parseXml('<Root><Parent><Code name="nested"/></Parent></Root>');
    const codes = getChildElements(doc.documentElement, 'Code');
    expect(codes).toHaveLength(0);
  });

  it('returns all direct children when no tag specified', () => {
    const doc = parseXml('<Root><A/><B/><C/></Root>');
    const all = getChildElements(doc.documentElement);
    expect(all).toHaveLength(3);
  });
});

describe('getAttr', () => {
  it('returns attribute value', () => {
    const doc = parseXml('<Code name="Theme" color="#ff0000"/>');
    expect(getAttr(doc.documentElement, 'name')).toBe('Theme');
    expect(getAttr(doc.documentElement, 'color')).toBe('#ff0000');
  });

  it('returns undefined for missing attribute', () => {
    const doc = parseXml('<Code name="Theme"/>');
    expect(getAttr(doc.documentElement, 'missing')).toBeUndefined();
  });
});

describe('getTextContent', () => {
  it('returns text content of first matching child element', () => {
    const doc = parseXml('<Code><Description>Hello world</Description></Code>');
    expect(getTextContent(doc.documentElement, 'Description')).toBe('Hello world');
  });

  it('returns undefined if child not found', () => {
    const doc = parseXml('<Code name="A"/>');
    expect(getTextContent(doc.documentElement, 'Description')).toBeUndefined();
  });
});

describe('getAllElements', () => {
  it('returns all elements with given tag name at any depth', () => {
    const doc = parseXml('<Root><A><B/></A><B/></Root>');
    const bs = getAllElements(doc.documentElement, 'B');
    expect(bs).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/import/xmlParser.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement xmlParser.ts**

```typescript
// src/import/xmlParser.ts

/** Parse XML string into a Document. Throws on parse errors. */
export function parseXml(xml: string): Document {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');
  const error = doc.querySelector('parsererror');
  if (error) {
    throw new Error(`XML parse error: ${error.textContent}`);
  }
  return doc;
}

/** Get direct child elements, optionally filtered by tag name. */
export function getChildElements(parent: Element, tagName?: string): Element[] {
  const result: Element[] = [];
  for (let i = 0; i < parent.children.length; i++) {
    const child = parent.children[i]!;
    if (!tagName || child.tagName === tagName) {
      result.push(child);
    }
  }
  return result;
}

/** Get attribute value or undefined if absent. */
export function getAttr(el: Element, name: string): string | undefined {
  return el.hasAttribute(name) ? el.getAttribute(name)! : undefined;
}

/** Get numeric attribute value or undefined. */
export function getNumAttr(el: Element, name: string): number | undefined {
  const v = getAttr(el, name);
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isNaN(n) ? undefined : n;
}

/** Get text content of the first child element with given tag name. */
export function getTextContent(parent: Element, childTag: string): string | undefined {
  const child = getChildElements(parent, childTag)[0];
  return child?.textContent ?? undefined;
}

/** Get all descendant elements with a given tag name (any depth). */
export function getAllElements(parent: Element, tagName: string): Element[] {
  return Array.from(parent.getElementsByTagName(tagName));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/import/xmlParser.test.ts`
Expected: PASS (all 9 tests)

- [ ] **Step 5: Commit**

```bash
~/.claude/scripts/commit.sh "feat: xmlParser helpers para import REFI-QDA"
```

---

### Task 2: Inverse coordinate converters

**Files:**
- Create: `src/import/coordConverters.ts`
- Test: `tests/import/coordConverters.test.ts`

- [ ] **Step 1: Write tests for coordinate converters**

```typescript
// tests/import/coordConverters.test.ts
import { describe, it, expect } from 'vitest';
import { offsetToLineCh, pdfRectToNormalized, pixelsToNormalized, msToSeconds } from '../../src/import/coordConverters';

describe('offsetToLineCh', () => {
  const content = 'line 0\nline 1\nline 2 has content';

  it('converts offset 0 to line 0 ch 0', () => {
    expect(offsetToLineCh(content, 0)).toEqual({ line: 0, ch: 0 });
  });

  it('converts offset at start of line 1', () => {
    // "line 0\n" = 7 codepoints → offset 7 = line 1, ch 0
    expect(offsetToLineCh(content, 7)).toEqual({ line: 1, ch: 0 });
  });

  it('converts offset mid-line', () => {
    // "line 0\nline 1\n" = 14 codepoints → offset 14 = line 2, ch 0
    // offset 19 = line 2, ch 5
    expect(offsetToLineCh(content, 19)).toEqual({ line: 2, ch: 5 });
  });

  it('handles surrogate pairs (emoji)', () => {
    const text = 'a\u{1F600}b\nc'; // "a😀b\nc" — 3 codepoints on line 0
    // offset 0 = a, offset 1 = emoji, offset 2 = b, offset 3 = \n, offset 4 = c
    const result = offsetToLineCh(text, 2);
    // 'b' is at ch 3 in UTF-16 (a=1, emoji=2 code units, b=3)
    expect(result).toEqual({ line: 0, ch: 3 });
  });

  it('returns null for offset past end', () => {
    expect(offsetToLineCh('abc', 10)).toBeNull();
  });
});

describe('pdfRectToNormalized', () => {
  it('converts PDF points (bottom-left origin) to normalized coords', () => {
    // PDF: firstX=61.2, firstY=633.6, secondX=244.8, secondY=316.8
    // Page: 612 x 792
    // x = 61.2/612 = 0.1, y = 1 - 633.6/792 = 0.2
    // w = (244.8-61.2)/612 = 0.3, h = (633.6-316.8)/792 = 0.4
    const result = pdfRectToNormalized(61.2, 633.6, 244.8, 316.8, 612, 792);
    expect(result.x).toBeCloseTo(0.1, 5);
    expect(result.y).toBeCloseTo(0.2, 5);
    expect(result.w).toBeCloseTo(0.3, 5);
    expect(result.h).toBeCloseTo(0.4, 5);
  });
});

describe('pixelsToNormalized', () => {
  it('converts pixel coords to normalized 0-1', () => {
    const result = pixelsToNormalized(100, 200, 600, 500, 1000, 1000);
    expect(result).toEqual({ type: 'rect', x: 0.1, y: 0.2, w: 0.5, h: 0.3 });
  });
});

describe('msToSeconds', () => {
  it('converts milliseconds to seconds', () => {
    expect(msToSeconds(16176)).toBeCloseTo(16.176);
    expect(msToSeconds(0)).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/import/coordConverters.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement coordConverters.ts**

```typescript
// src/import/coordConverters.ts

/**
 * Convert Unicode codepoint offset to CM6 line:ch (0-based).
 * Inverse of export's lineChToOffset.
 * Returns null if offset is out of range.
 */
export function offsetToLineCh(content: string, cpOffset: number): { line: number; ch: number } | null {
  let cp = 0;
  let line = 0;
  let lineStartCu = 0; // UTF-16 code unit offset of current line start
  let cu = 0;

  while (cp < cpOffset && cu < content.length) {
    const code = content.charCodeAt(cu);
    if (code === 0x0A) { // newline
      line++;
      cu++;
      lineStartCu = cu;
      cp++;
      continue;
    }
    if (code >= 0xD800 && code <= 0xDBFF) {
      cu += 2; // surrogate pair = 1 codepoint
    } else {
      cu += 1;
    }
    cp++;
  }

  if (cp < cpOffset) return null; // offset past end
  return { line, ch: cu - lineStartCu };
}

/**
 * Convert REFI-QDA PDF rect (bottom-left origin, in points) to normalized 0-1.
 * Inverse of export's pdfShapeToRect.
 */
export function pdfRectToNormalized(
  firstX: number, firstY: number,
  secondX: number, secondY: number,
  pageWidth: number, pageHeight: number,
): { type: 'rect'; x: number; y: number; w: number; h: number } {
  // Export does: firstX = x * pageWidth, firstY = (1-y) * pageHeight
  //              secondX = (x+w) * pageWidth, secondY = (1-y-h) * pageHeight
  // Inverse: x = firstX/pageWidth, 1-y = firstY/pageHeight → y = 1 - firstY/pageHeight
  //          w = (secondX-firstX)/pageWidth, h = (firstY-secondY)/pageHeight
  const x = firstX / pageWidth;
  const y = 1 - firstY / pageHeight;
  const w = (secondX - firstX) / pageWidth;
  const h = (firstY - secondY) / pageHeight;
  return { type: 'rect', x, y, w, h };
}

/**
 * Convert pixel bounding box to normalized 0-1 image coords.
 * Inverse of export's imageToPixels.
 */
export function pixelsToNormalized(
  firstX: number, firstY: number,
  secondX: number, secondY: number,
  imgWidth: number, imgHeight: number,
): { type: 'rect'; x: number; y: number; w: number; h: number } {
  return {
    type: 'rect',
    x: firstX / imgWidth,
    y: firstY / imgHeight,
    w: (secondX - firstX) / imgWidth,
    h: (secondY - firstY) / imgHeight,
  };
}

/** Convert milliseconds (integer) to seconds (float). Inverse of export's mediaToMs. */
export function msToSeconds(ms: number): number {
  return ms / 1000;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/import/coordConverters.test.ts`
Expected: PASS (all 7 tests)

- [ ] **Step 5: Commit**

```bash
~/.claude/scripts/commit.sh "feat: coordConverters inversas para import REFI-QDA"
```

---

## Chunk 2: QDC Importer (Codebook with Hierarchy)

### Task 3: QDC Importer — codebook parsing with hierarchy and conflicts

**Files:**
- Create: `src/import/qdcImporter.ts`
- Test: `tests/import/qdcImporter.test.ts`

- [ ] **Step 1: Write tests for codebook import**

```typescript
// tests/import/qdcImporter.test.ts
import { describe, it, expect } from 'vitest';
import { parseCodebook } from '../../src/import/qdcImporter';
import { parseXml } from '../../src/import/xmlParser';

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

  it('handles isCodable=false as normal code (Qualia has no folders yet)', () => {
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/import/qdcImporter.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement qdcImporter.ts**

```typescript
// src/import/qdcImporter.ts
import { getChildElements, getAttr, getTextContent, getAllElements } from './xmlParser';
import type { CodeDefinitionRegistry } from '../core/codeDefinitionRegistry';

/** Parsed code from REFI-QDA XML. */
export interface ParsedCode {
  guid: string;
  name: string;
  color?: string;
  description?: string;
  parentGuid?: string;
  childrenGuids: string[];
  noteGuids: string[]; // NoteRef targets on this Code
}

export interface ParsedCodebook {
  codes: ParsedCode[];
}

/** Conflict resolution strategy chosen by the user. */
export type ConflictStrategy = 'merge' | 'separate';

/** Result of applying a codebook to the registry. */
export interface CodebookImportResult {
  /** QDPX GUID → Qualia code ID */
  guidMap: Map<string, string>;
  created: number;
  merged: number;
  warnings: string[];
}

/** Parse the <CodeBook> section from a REFI-QDA project Document. */
export function parseCodebook(doc: Document): ParsedCodebook {
  const codes: ParsedCode[] = [];
  const codebook = getAllElements(doc.documentElement, 'CodeBook')[0];
  if (!codebook) return { codes };

  const codesEl = getChildElements(codebook, 'Codes')[0];
  if (!codesEl) return { codes };

  const rootCodeEls = getChildElements(codesEl, 'Code');
  for (const el of rootCodeEls) {
    parseCodeElement(el, undefined, codes);
  }
  return { codes };
}

/** Recursively parse a <Code> element and its children. */
function parseCodeElement(el: Element, parentGuid: string | undefined, out: ParsedCode[]): void {
  const guid = getAttr(el, 'guid');
  if (!guid) return;

  const childEls = getChildElements(el, 'Code');
  const childrenGuids: string[] = [];
  for (const child of childEls) {
    const childGuid = getAttr(child, 'guid');
    if (childGuid) childrenGuids.push(childGuid);
  }

  // Collect NoteRef targets
  const noteGuids: string[] = [];
  for (const noteRef of getChildElements(el, 'NoteRef')) {
    const ng = getAttr(noteRef, 'targetGUID');
    if (ng) noteGuids.push(ng);
  }

  out.push({
    guid,
    name: getAttr(el, 'name') ?? 'Unnamed',
    color: getAttr(el, 'color'),
    description: getTextContent(el, 'Description'),
    parentGuid,
    childrenGuids,
    noteGuids,
  });

  // Recurse into children
  for (const child of childEls) {
    parseCodeElement(child, guid, out);
  }
}

/**
 * Apply parsed codebook to the registry.
 * Creates codes in top-down order so parents exist before children.
 * Returns a GUID→qualiaId map for resolving CodeRef targets.
 */
/**
 * Apply parsed codebook to the registry.
 * Notes map is used to resolve NoteRef on Code elements → description.
 */
export function applyCodebook(
  codebook: ParsedCodebook,
  registry: CodeDefinitionRegistry,
  strategy: ConflictStrategy,
  notes?: Map<string, { text: string; magnitude?: string }>,
): CodebookImportResult {
  const guidMap = new Map<string, string>();
  let created = 0;
  let merged = 0;
  const warnings: string[] = [];

  // Process in document order (parseCodebook already provides top-down)
  for (const pc of codebook.codes) {
    const existing = registry.getByName(pc.name);

    if (existing) {
      if (strategy === 'merge') {
        // Map QDPX GUID to existing Qualia id
        guidMap.set(pc.guid, existing.id);
        merged++;
        continue;
      }
      // strategy === 'separate': create with suffix
      const newName = `${pc.name} (imported)`;
      const parentId = pc.parentGuid ? guidMap.get(pc.parentGuid) : undefined;
      const def = registry.create(newName, pc.color, pc.description, parentId);
      guidMap.set(pc.guid, def.id);
      created++;
      continue;
    }

    // No conflict — create new code
    const parentId = pc.parentGuid ? guidMap.get(pc.parentGuid) : undefined;
    // Resolve NoteRef on Code → append to description
    const noteDesc = resolveCodeNotes(pc.noteGuids, notes);
    const description = mergeDescriptions(pc.description, noteDesc);
    const def = registry.create(pc.name, pc.color, description, parentId);
    guidMap.set(pc.guid, def.id);
    created++;
  }

  return { guidMap, created, merged, warnings };
}

/** Resolve NoteRef targets on a Code element into a single description string. */
function resolveCodeNotes(
  noteGuids: string[],
  notes?: Map<string, { text: string; magnitude?: string }>,
): string | undefined {
  if (!notes || noteGuids.length === 0) return undefined;
  const texts: string[] = [];
  for (const guid of noteGuids) {
    const note = notes.get(guid);
    if (note && !note.magnitude) texts.push(note.text);
  }
  return texts.length > 0 ? texts.join('\n\n') : undefined;
}

/** Merge XML Description with NoteRef text. */
function mergeDescriptions(xmlDesc?: string, noteDesc?: string): string | undefined {
  if (!xmlDesc && !noteDesc) return undefined;
  if (!xmlDesc) return noteDesc;
  if (!noteDesc) return xmlDesc;
  return `${xmlDesc}\n\n--- Imported memo ---\n${noteDesc}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/import/qdcImporter.test.ts`
Expected: PASS (all 5 tests)

- [ ] **Step 5: Write tests for applyCodebook**

```typescript
// Append to tests/import/qdcImporter.test.ts
import { applyCodebook } from '../../src/import/qdcImporter';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';

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
    // Color stays original
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

  it('guidMap maps QDPX GUIDs to Qualia IDs', () => {
    const registry = new CodeDefinitionRegistry();
    const codebook = {
      codes: [{ guid: 'qdpx-guid-123', name: 'Code', color: '#ff0000', childrenGuids: [], noteGuids: [] }],
    };
    const result = applyCodebook(codebook, registry, 'merge');
    const qualiaId = result.guidMap.get('qdpx-guid-123');
    expect(qualiaId).toBeDefined();
    expect(registry.getById(qualiaId!)).toBeDefined();
  });
});
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/import/qdcImporter.test.ts`
Expected: PASS (all 10 tests)

- [ ] **Step 7: Commit**

```bash
~/.claude/scripts/commit.sh "feat: qdcImporter com hierarquia e resolucao de conflitos"
```

---

## Chunk 3: QDPX Importer Core

### Task 4: QDPX Importer — ZIP extraction, sources, segments, memos

**Files:**
- Create: `src/import/qdpxImporter.ts`
- Test: `tests/import/qdpxImporter.test.ts`

- [ ] **Step 1: Write tests for source/selection/note parsing**

```typescript
// tests/import/qdpxImporter.test.ts
import { describe, it, expect } from 'vitest';
import { parseXml } from '../../src/import/xmlParser';
import {
  parseSources,
  parseNotes,
  parseLinks,
  applyLinks,
  type ParsedSource,
  type ParsedSelection,
  type ParsedNote,
  type ParsedLink,
} from '../../src/import/qdpxImporter';

describe('parseSources', () => {
  it('parses TextSource with PlainTextSelection', () => {
    const xml = `<Project>
      <Sources>
        <TextSource guid="s1" name="interview.txt" plainTextPath="internal://s1.txt">
          <PlainTextSelection guid="sel1" startPosition="10" endPosition="25" creationDateTime="2026-01-01T00:00:00Z">
            <Coding guid="cod1" creationDateTime="2026-01-01T00:00:00Z">
              <CodeRef targetGUID="code-guid-1"/>
            </Coding>
            <NoteRef targetGUID="note1"/>
          </PlainTextSelection>
        </TextSource>
      </Sources>
    </Project>`;
    const doc = parseXml(xml);
    const sources = parseSources(doc);
    expect(sources).toHaveLength(1);

    const src = sources[0]!;
    expect(src.type).toBe('text');
    expect(src.guid).toBe('s1');
    expect(src.name).toBe('interview.txt');
    expect(src.selections).toHaveLength(1);

    const sel = src.selections[0]!;
    expect(sel.type).toBe('PlainTextSelection');
    expect(sel.startPosition).toBe(10);
    expect(sel.endPosition).toBe(25);
    expect(sel.codeGuids).toEqual(['code-guid-1']);
    expect(sel.noteGuids).toEqual(['note1']);
  });

  it('parses AudioSource with AudioSelection', () => {
    const xml = `<Project><Sources>
      <AudioSource guid="a1" name="audio.m4a" path="internal://a1.m4a">
        <AudioSelection guid="as1" begin="1500" end="3700">
          <Coding guid="c1"><CodeRef targetGUID="cg1"/></Coding>
        </AudioSelection>
      </AudioSource>
    </Sources></Project>`;
    const doc = parseXml(xml);
    const sources = parseSources(doc);
    expect(sources).toHaveLength(1);
    expect(sources[0]!.type).toBe('audio');
    expect(sources[0]!.selections[0]!.begin).toBe(1500);
    expect(sources[0]!.selections[0]!.end).toBe(3700);
  });

  it('parses VideoSource with VideoSelection', () => {
    const xml = `<Project><Sources>
      <VideoSource guid="v1" name="video.mp4" path="internal://v1.mp4">
        <VideoSelection guid="vs1" begin="0" end="5000">
          <Coding guid="c1"><CodeRef targetGUID="cg1"/></Coding>
        </VideoSelection>
      </VideoSource>
    </Sources></Project>`;
    const doc = parseXml(xml);
    const sources = parseSources(doc);
    expect(sources[0]!.type).toBe('video');
  });

  it('parses PictureSource with PictureSelection', () => {
    const xml = `<Project><Sources>
      <PictureSource guid="p1" name="photo.jpg" path="internal://p1.jpg">
        <PictureSelection guid="ps1" firstX="100" firstY="200" secondX="600" secondY="500">
          <Coding guid="c1"><CodeRef targetGUID="cg1"/></Coding>
        </PictureSelection>
      </PictureSource>
    </Sources></Project>`;
    const doc = parseXml(xml);
    const sources = parseSources(doc);
    expect(sources[0]!.type).toBe('picture');
    const sel = sources[0]!.selections[0]!;
    expect(sel.firstX).toBe(100);
    expect(sel.firstY).toBe(200);
    expect(sel.secondX).toBe(600);
    expect(sel.secondY).toBe(500);
  });

  it('parses PDFSource with PDFSelection and PlainTextSelection', () => {
    const xml = `<Project><Sources>
      <PDFSource guid="pdf1" name="paper.pdf" path="internal://pdf1.pdf">
        <Representation guid="repr1" plainTextPath="internal://repr1.txt"/>
        <PlainTextSelection guid="pts1" startPosition="42" endPosition="98">
          <Coding guid="c1"><CodeRef targetGUID="cg1"/></Coding>
        </PlainTextSelection>
        <PDFSelection guid="pdfs1" page="0" firstX="61.2" firstY="633.6" secondX="244.8" secondY="316.8">
          <Coding guid="c2"><CodeRef targetGUID="cg2"/></Coding>
        </PDFSelection>
      </PDFSource>
    </Sources></Project>`;
    const doc = parseXml(xml);
    const sources = parseSources(doc);
    expect(sources).toHaveLength(1);
    expect(sources[0]!.type).toBe('pdf');
    expect(sources[0]!.selections).toHaveLength(2);
    expect(sources[0]!.selections[0]!.type).toBe('PlainTextSelection');
    expect(sources[0]!.selections[1]!.type).toBe('PDFSelection');
    expect(sources[0]!.selections[1]!.page).toBe(0);
  });

  it('parses multiple codings per selection', () => {
    const xml = `<Project><Sources>
      <TextSource guid="s1" name="t.txt" plainTextPath="internal://s1.txt">
        <PlainTextSelection guid="sel1" startPosition="0" endPosition="5">
          <Coding guid="c1"><CodeRef targetGUID="g1"/></Coding>
          <Coding guid="c2"><CodeRef targetGUID="g2"/></Coding>
        </PlainTextSelection>
      </TextSource>
    </Sources></Project>`;
    const doc = parseXml(xml);
    const sources = parseSources(doc);
    expect(sources[0]!.selections[0]!.codeGuids).toEqual(['g1', 'g2']);
  });
});

describe('parseNotes', () => {
  it('parses Note elements with PlainTextContent', () => {
    const xml = `<Project><Notes>
      <Note guid="n1" name="Memo 1" creationDateTime="2026-01-01T00:00:00Z">
        <PlainTextContent>This is a memo</PlainTextContent>
      </Note>
    </Notes></Project>`;
    const doc = parseXml(xml);
    const notes = parseNotes(doc);
    expect(notes.size).toBe(1);
    const note = notes.get('n1')!;
    expect(note.name).toBe('Memo 1');
    expect(note.text).toBe('This is a memo');
  });

  it('detects magnitude prefix in note text', () => {
    const xml = `<Project><Notes>
      <Note guid="n1" name="Magnitude" creationDateTime="2026-01-01T00:00:00Z">
        <PlainTextContent>[Magnitude: High]</PlainTextContent>
      </Note>
    </Notes></Project>`;
    const doc = parseXml(xml);
    const notes = parseNotes(doc);
    const note = notes.get('n1')!;
    expect(note.magnitude).toBe('High');
  });
});

describe('parseLinks', () => {
  it('parses Link elements into relations', () => {
    const xml = `<Project><Links>
      <Link guid="l1" name="causes" direction="OneWay" originGUID="c1" targetGUID="c2"/>
      <Link guid="l2" name="relates" direction="Associative" originGUID="c3" targetGUID="c4"/>
    </Links></Project>`;
    const doc = parseXml(xml);
    const links = parseLinks(doc);
    expect(links).toHaveLength(2);
    expect(links[0]).toEqual({
      guid: 'l1', label: 'causes', directed: true, originGuid: 'c1', targetGuid: 'c2',
    });
    expect(links[1]).toEqual({
      guid: 'l2', label: 'relates', directed: false, originGuid: 'c3', targetGuid: 'c4',
    });
  });

  it('returns empty array when no Links section', () => {
    const doc = parseXml('<Project></Project>');
    expect(parseLinks(doc)).toEqual([]);
  });
});

describe('applyLinks', () => {
  it('applies code-level relation from Link', () => {
    const { CodeDefinitionRegistry } = require('../../src/core/codeDefinitionRegistry');
    const registry = new CodeDefinitionRegistry();
    const c1 = registry.create('A', '#f00');
    const c2 = registry.create('B', '#0f0');

    const guidMap = new Map<string, string>();
    guidMap.set('g1', c1.id);
    guidMap.set('g2', c2.id);

    const links: ParsedLink[] = [
      { guid: 'l1', label: 'causes', directed: true, originGuid: 'g1', targetGuid: 'g2' },
    ];

    // Mock dataManager not needed for code-level relations
    const mockDm = { section: () => ({ markers: {}, shapes: [], files: [] }), setSection: () => {} } as any;
    const count = applyLinks(links, guidMap, registry, mockDm);
    expect(count).toBe(1);
    expect(registry.getById(c1.id)!.relations).toHaveLength(1);
    expect(registry.getById(c1.id)!.relations![0]!.label).toBe('causes');
    expect(registry.getById(c1.id)!.relations![0]!.directed).toBe(true);
  });

  it('skips links with unmapped GUIDs', () => {
    const { CodeDefinitionRegistry } = require('../../src/core/codeDefinitionRegistry');
    const registry = new CodeDefinitionRegistry();
    const guidMap = new Map<string, string>();
    const links: ParsedLink[] = [
      { guid: 'l1', label: 'x', directed: false, originGuid: 'unknown1', targetGuid: 'unknown2' },
    ];
    const mockDm = { section: () => ({ markers: {}, shapes: [], files: [] }), setSection: () => {} } as any;
    const count = applyLinks(links, guidMap, registry, mockDm);
    expect(count).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/import/qdpxImporter.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement qdpxImporter.ts — parsing functions**

```typescript
// src/import/qdpxImporter.ts
import { unzipSync, strFromU8 } from 'fflate';
import type { App, TFile, Vault } from 'obsidian';
import type { DataManager } from '../core/dataManager';
import type { CodeDefinitionRegistry } from '../core/codeDefinitionRegistry';
import type { CodeApplication, CodeRelation } from '../core/types';
import type { Marker } from '../markdown/models/codeMarkerModel';
import type { MediaMarker } from '../media/mediaTypes';
import type { ImageMarker } from '../image/imageCodingTypes';
import type { PdfMarker, PdfShapeMarker } from '../pdf/pdfCodingTypes';
import type { AudioFile } from '../audio/audioCodingTypes';
import type { VideoFile } from '../video/videoCodingTypes';
import { parseXml, getChildElements, getAttr, getNumAttr, getTextContent, getAllElements } from './xmlParser';
import { offsetToLineCh, pdfRectToNormalized, pixelsToNormalized, msToSeconds } from './coordConverters';
import { parseCodebook, applyCodebook, type ConflictStrategy } from './qdcImporter';

// ─── Parsed types ───

export interface ParsedSelection {
  guid: string;
  type: 'PlainTextSelection' | 'PDFSelection' | 'PictureSelection' | 'AudioSelection' | 'VideoSelection';
  codeGuids: string[];
  noteGuids: string[];
  createdAt?: string;
  // Text selections
  startPosition?: number;
  endPosition?: number;
  // PDF/Picture/rect selections
  page?: number;
  firstX?: number;
  firstY?: number;
  secondX?: number;
  secondY?: number;
  // Media selections
  begin?: number;
  end?: number;
}

export interface ParsedSource {
  guid: string;
  name: string;
  type: 'text' | 'pdf' | 'picture' | 'audio' | 'video';
  path?: string;           // internal:// or relative://
  plainTextPath?: string;  // for TextSource and PDF Representation
  selections: ParsedSelection[];
}

export interface ParsedNote {
  guid: string;
  name: string;
  text: string;
  createdAt?: string;
  /** Detected magnitude value from "[Magnitude: X]" prefix. */
  magnitude?: string;
}

export interface ParsedLink {
  guid: string;
  label: string;
  directed: boolean;
  originGuid: string;
  targetGuid: string;
}

export interface ImportResult {
  codesCreated: number;
  codesMerged: number;
  sourcesImported: number;
  segmentsCreated: number;
  memosImported: number;
  relationsImported: number;
  warnings: string[];
}

// ─── Parsing ───

const MAGNITUDE_RE = /^\[Magnitude:\s*(.+?)\]$/;

/** Parse <Sources> section into structured data. */
export function parseSources(doc: Document): ParsedSource[] {
  const sources: ParsedSource[] = [];
  const sourcesEl = getAllElements(doc.documentElement, 'Sources')[0];
  if (!sourcesEl) return sources;

  const typeMap: Record<string, ParsedSource['type']> = {
    TextSource: 'text',
    PDFSource: 'pdf',
    PictureSource: 'picture',
    AudioSource: 'audio',
    VideoSource: 'video',
  };

  for (const [tag, type] of Object.entries(typeMap)) {
    for (const el of getChildElements(sourcesEl, tag)) {
      const guid = getAttr(el, 'guid');
      if (!guid) continue;

      const src: ParsedSource = {
        guid,
        name: getAttr(el, 'name') ?? 'unknown',
        type,
        path: getAttr(el, 'path') ?? getAttr(el, 'plainTextPath'),
        plainTextPath: getAttr(el, 'plainTextPath'),
        selections: [],
      };

      // For PDF, capture Representation plainTextPath
      if (type === 'pdf') {
        const repr = getChildElements(el, 'Representation')[0];
        if (repr) {
          src.plainTextPath = getAttr(repr, 'plainTextPath');
        }
      }

      // Parse selections
      const selectionTags = ['PlainTextSelection', 'PDFSelection', 'PictureSelection', 'AudioSelection', 'VideoSelection'];
      for (const selTag of selectionTags) {
        for (const selEl of getChildElements(el, selTag)) {
          src.selections.push(parseSelection(selEl, selTag as ParsedSelection['type']));
        }
      }

      sources.push(src);
    }
  }

  return sources;
}

function parseSelection(el: Element, type: ParsedSelection['type']): ParsedSelection {
  const codeGuids: string[] = [];
  const noteGuids: string[] = [];

  for (const coding of getChildElements(el, 'Coding')) {
    const codeRef = getChildElements(coding, 'CodeRef')[0];
    const targetGuid = codeRef ? getAttr(codeRef, 'targetGUID') : undefined;
    if (targetGuid) codeGuids.push(targetGuid);

    // NoteRef inside Coding (for magnitude)
    for (const noteRef of getChildElements(coding, 'NoteRef')) {
      const ng = getAttr(noteRef, 'targetGUID');
      if (ng) noteGuids.push(ng);
    }
  }

  // NoteRef directly on selection (for memos)
  for (const noteRef of getChildElements(el, 'NoteRef')) {
    const ng = getAttr(noteRef, 'targetGUID');
    if (ng && !noteGuids.includes(ng)) noteGuids.push(ng);
  }

  return {
    guid: getAttr(el, 'guid') ?? '',
    type,
    codeGuids,
    noteGuids,
    createdAt: getAttr(el, 'creationDateTime'),
    startPosition: getNumAttr(el, 'startPosition'),
    endPosition: getNumAttr(el, 'endPosition'),
    page: getNumAttr(el, 'page'),
    firstX: getNumAttr(el, 'firstX'),
    firstY: getNumAttr(el, 'firstY'),
    secondX: getNumAttr(el, 'secondX'),
    secondY: getNumAttr(el, 'secondY'),
    begin: getNumAttr(el, 'begin'),
    end: getNumAttr(el, 'end'),
  };
}

/** Parse <Notes> section. Returns Map<guid, ParsedNote>. */
export function parseNotes(doc: Document): Map<string, ParsedNote> {
  const map = new Map<string, ParsedNote>();
  const notesEl = getAllElements(doc.documentElement, 'Notes')[0];
  if (!notesEl) return map;

  for (const el of getChildElements(notesEl, 'Note')) {
    const guid = getAttr(el, 'guid');
    if (!guid) continue;
    const text = getTextContent(el, 'PlainTextContent') ?? '';
    const magnitudeMatch = MAGNITUDE_RE.exec(text);
    map.set(guid, {
      guid,
      name: getAttr(el, 'name') ?? '',
      text,
      createdAt: getAttr(el, 'creationDateTime'),
      magnitude: magnitudeMatch ? magnitudeMatch[1] : undefined,
    });
  }
  return map;
}

/** Parse <Links> section into relation data. */
export function parseLinks(doc: Document): ParsedLink[] {
  const links: ParsedLink[] = [];
  const linksEl = getAllElements(doc.documentElement, 'Links')[0];
  if (!linksEl) return links;

  for (const el of getChildElements(linksEl, 'Link')) {
    const guid = getAttr(el, 'guid');
    const label = getAttr(el, 'name');
    const direction = getAttr(el, 'direction');
    const originGuid = getAttr(el, 'originGUID');
    const targetGuid = getAttr(el, 'targetGUID');
    if (!guid || !label || !originGuid || !targetGuid) continue;

    links.push({
      guid,
      label,
      directed: direction === 'OneWay',
      originGuid,
      targetGuid,
    });
  }
  return links;
}

// ─── Import orchestration ───

export interface ImportOptions {
  conflictStrategy: ConflictStrategy;
  keepOriginalSources: boolean;
  projectName: string;
}

/** Preview info extracted from a QDPX before full import. */
export interface ImportPreview {
  projectName: string;
  origin?: string;
  codeCount: number;
  hierarchyCount: number;
  selectionCount: number;
  sourceCount: number;
  noteCount: number;
  linkCount: number;
  conflictingCodes: string[];
}

/** Extract preview info from QDPX ZIP data. */
export function previewQdpx(
  zipData: ArrayBuffer,
  registry: CodeDefinitionRegistry,
): ImportPreview {
  const files = unzipSync(new Uint8Array(zipData));
  const qdeData = files['project.qde'];
  if (!qdeData) throw new Error('Invalid QDPX: no project.qde found');

  const xml = strFromU8(qdeData);
  const doc = parseXml(xml);

  const origin = getAttr(doc.documentElement, 'origin');
  const projectName = getAttr(doc.documentElement, 'name') ?? 'Imported Project';
  const codebook = parseCodebook(doc);
  const sources = parseSources(doc);
  const notes = parseNotes(doc);
  const links = parseLinks(doc);

  const hierarchyCount = codebook.codes.filter(c => c.parentGuid).length;
  const selectionCount = sources.reduce((sum, s) => sum + s.selections.length, 0);
  const conflictingCodes = codebook.codes
    .filter(c => registry.getByName(c.name) !== undefined)
    .map(c => c.name);

  return {
    projectName,
    origin,
    codeCount: codebook.codes.length,
    hierarchyCount,
    selectionCount,
    sourceCount: sources.length,
    noteCount: notes.size,
    linkCount: links.length,
    conflictingCodes,
  };
}

/** Full import of a QDPX file into the vault. */
export async function importQdpx(
  zipData: ArrayBuffer,
  app: App,
  dataManager: DataManager,
  registry: CodeDefinitionRegistry,
  options: ImportOptions,
): Promise<ImportResult> {
  const result: ImportResult = {
    codesCreated: 0, codesMerged: 0, sourcesImported: 0,
    segmentsCreated: 0, memosImported: 0, relationsImported: 0,
    warnings: [],
  };

  // 1. Unzip
  const files = unzipSync(new Uint8Array(zipData));
  const qdeData = files['project.qde'];
  if (!qdeData) throw new Error('Invalid QDPX: no project.qde found');

  const xml = strFromU8(qdeData);
  const doc = parseXml(xml);

  // 2. Parse all sections
  const codebook = parseCodebook(doc);
  const sources = parseSources(doc);
  const notes = parseNotes(doc);
  const links = parseLinks(doc);

  // 3. Import codes
  const cbResult = applyCodebook(codebook, registry, options.conflictStrategy, notes);
  result.codesCreated = cbResult.created;
  result.codesMerged = cbResult.merged;
  result.warnings.push(...cbResult.warnings);
  const guidMap = cbResult.guidMap; // QDPX GUID → Qualia ID

  // 4. Extract source files to vault
  const importDir = `imports/${options.projectName}`;
  await ensureFolder(app.vault, importDir);

  for (const src of sources) {
    try {
      const filePath = await extractSource(src, files, app.vault, importDir, options.keepOriginalSources);
      if (filePath) {
        guidMap.set(src.guid, filePath); // map source GUID to vault path
        result.sourcesImported++;

        // 5. Create markers from selections
        const created = await createMarkersForSource(
          src, filePath, guidMap, notes, app, dataManager, result,
        );
        result.segmentsCreated += created;
      }
    } catch (err) {
      result.warnings.push(`Source ${src.name}: ${(err as Error).message}`);
    }
  }

  // 6. Create text markers (second pass — needs file content for offset→lineCh)
  const textResult = await createTextMarkers(sources, guidMap, notes, app, dataManager, registry);
  result.segmentsCreated += textResult.count;
  result.warnings.push(...textResult.warnings);

  // 7. Import standalone memos (Source-level, Project-level, loose)
  result.memosImported += await importStandaloneMemos(doc, sources, notes, guidMap, app.vault, importDir);

  // 8. Import relations (Links)
  result.relationsImported = applyLinks(links, guidMap, registry, dataManager);

  // 9. Flush
  dataManager.markDirty();
  await dataManager.flush();

  return result;
}

// ─── Source extraction ───

async function ensureFolder(vault: Vault, path: string): Promise<void> {
  if (!vault.getAbstractFileByPath(path)) {
    await vault.createFolder(path);
  }
}

async function extractSource(
  src: ParsedSource,
  zipFiles: Record<string, Uint8Array>,
  vault: Vault,
  importDir: string,
  keepOriginal: boolean,
): Promise<string | null> {
  const destPath = `${importDir}/${src.name}`;

  if (src.type === 'text') {
    // TextSource → .md
    const txtPath = resolveInternalPath(src.plainTextPath);
    const txtData = txtPath ? zipFiles[txtPath] : undefined;
    if (!txtData) return null;

    const text = strFromU8(txtData);
    const mdPath = destPath.replace(/\.\w+$/, '.md');
    const frontmatter = [
      '---',
      'imported_from: "QDPX"',
      `original_name: "${src.name}"`,
      `original_guid: "${src.guid}"`,
      `import_date: "${new Date().toISOString().split('T')[0]}"`,
      '---',
      '',
    ].join('\n');
    await vault.create(mdPath, frontmatter + text);
    return mdPath;
  }

  // Binary sources (PDF, image, audio, video)
  const binPath = resolveInternalPath(src.path);
  const binData = binPath ? zipFiles[binPath] : undefined;
  if (!binData) return null;
  await vault.createBinary(destPath, binData.buffer as ArrayBuffer);
  return destPath;
}

function resolveInternalPath(path: string | undefined): string | undefined {
  if (!path) return undefined;
  if (path.startsWith('internal://')) {
    return `sources/${path.slice('internal://'.length)}`;
  }
  if (path.startsWith('relative://')) {
    return path.slice('relative://'.length);
  }
  return undefined;
}

// ─── Marker creation ───

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

function resolveTimestamp(isoStr?: string): number {
  if (!isoStr) return Date.now();
  const ts = new Date(isoStr).getTime();
  return Number.isNaN(ts) ? Date.now() : ts;
}

function resolveCodeApplications(
  sel: ParsedSelection,
  guidMap: Map<string, string>,
  notes: Map<string, ParsedNote>,
): CodeApplication[] {
  return sel.codeGuids.map(codeGuid => {
    const codeId = guidMap.get(codeGuid);
    if (!codeId) return null;
    const ca: CodeApplication = { codeId };

    // Check NoteRefs inside the selection's Codings for magnitude
    for (const noteGuid of sel.noteGuids) {
      const note = notes.get(noteGuid);
      if (note?.magnitude) {
        ca.magnitude = note.magnitude;
        break;
      }
    }
    return ca;
  }).filter((ca): ca is CodeApplication => ca !== null);
}

function resolveMemo(sel: ParsedSelection, notes: Map<string, ParsedNote>): string | undefined {
  for (const noteGuid of sel.noteGuids) {
    const note = notes.get(noteGuid);
    if (note && !note.magnitude) {
      return note.text;
    }
  }
  return undefined;
}

async function createMarkersForSource(
  src: ParsedSource,
  filePath: string,
  guidMap: Map<string, string>,
  notes: Map<string, ParsedNote>,
  app: App,
  dataManager: DataManager,
  result: ImportResult,
): Promise<number> {
  let count = 0;

  for (const sel of src.selections) {
    try {
      const codes = resolveCodeApplications(sel, guidMap, notes);
      if (codes.length === 0) continue;

      const memo = resolveMemo(sel, notes);
      const ts = resolveTimestamp(sel.createdAt);

      switch (src.type) {
        case 'text':
          count += createTextMarker(sel, filePath, codes, memo, ts, app, dataManager, result);
          break;
        case 'pdf':
          count += createPdfMarker(sel, filePath, codes, memo, ts, dataManager, result);
          break;
        case 'picture':
          count += await createImageMarker(sel, filePath, codes, memo, ts, app, dataManager, result);
          break;
        case 'audio':
          count += createMediaMarker(sel, filePath, codes, memo, ts, dataManager, 'audio', result);
          break;
        case 'video':
          count += createMediaMarker(sel, filePath, codes, memo, ts, dataManager, 'video', result);
          break;
      }

      // Map selection GUID for link resolution
      if (sel.guid) {
        const markerId = `import_${sel.guid}`;
        guidMap.set(sel.guid, markerId);
      }

      if (memo) result.memosImported++;
    } catch (err) {
      result.warnings.push(`Selection ${sel.guid} in ${src.name}: ${(err as Error).message}`);
    }
  }
  return count;
}

function createTextMarker(
  sel: ParsedSelection,
  filePath: string,
  codes: CodeApplication[],
  memo: string | undefined,
  ts: number,
  app: App,
  dataManager: DataManager,
  result: ImportResult,
): number {
  if (sel.startPosition === undefined || sel.endPosition === undefined) return 0;

  const file = app.vault.getAbstractFileByPath(filePath);
  if (!file) {
    result.warnings.push(`File not found for text marker: ${filePath}`);
    return 0;
  }

  // We need file content to convert offsets — but we can't do async here easily.
  // Store markers with offsets and convert later, OR read synchronously via cache.
  // For now, store raw offsets and convert in a batch step.
  // Actually, the file was just created, so we can use cachedRead... but this is sync context.
  // Workaround: store the raw positions and mark for post-processing.

  // Since we created the file ourselves, we know the content. We'll use a simplified approach:
  // Read the content from the vault cache.
  const mdData = dataManager.section('markdown');
  if (!mdData.markers[filePath]) {
    mdData.markers[filePath] = [];
  }

  // We need to defer offset conversion — store temporarily with special flag
  // Actually, let's just return 0 and handle text markers in a separate batch after all sources are extracted.
  // This is cleaner because we need file content for offset→lineCh conversion.
  return 0;
}

function createPdfMarker(
  sel: ParsedSelection,
  filePath: string,
  codes: CodeApplication[],
  memo: string | undefined,
  ts: number,
  dataManager: DataManager,
  result: ImportResult,
): number {
  const pdfData = dataManager.section('pdf');

  if (sel.type === 'PlainTextSelection') {
    // PDF text selection — needs plain text for offset mapping. Skip for now with warning.
    result.warnings.push(`PDF text selection ${sel.guid}: text offset mapping not yet supported`);
    return 0;
  }

  if (sel.type === 'PDFSelection') {
    if (sel.firstX === undefined || sel.firstY === undefined ||
        sel.secondX === undefined || sel.secondY === undefined || sel.page === undefined) {
      return 0;
    }
    // We don't know page dimensions at import time. Store as approximate.
    // For now, use default PDF page size 612x792 (US Letter).
    const coords = pdfRectToNormalized(sel.firstX, sel.firstY, sel.secondX, sel.secondY, 612, 792);
    const marker: PdfShapeMarker = {
      id: `import_${sel.guid}`,
      fileId: filePath,
      codes,
      shape: 'rect',
      coords,
      page: sel.page,
      memo,
      createdAt: ts,
      updatedAt: ts,
    };
    pdfData.shapes.push(marker);
    dataManager.setSection('pdf', pdfData);
    return 1;
  }
  return 0;
}

async function createImageMarker(
  sel: ParsedSelection,
  filePath: string,
  codes: CodeApplication[],
  memo: string | undefined,
  ts: number,
  app: App,
  dataManager: DataManager,
  result: ImportResult,
): Promise<number> {
  if (sel.firstX === undefined || sel.firstY === undefined ||
      sel.secondX === undefined || sel.secondY === undefined) {
    return 0;
  }

  // Get image dimensions
  let imgWidth = 1000, imgHeight = 1000; // fallback
  try {
    const file = app.vault.getAbstractFileByPath(filePath);
    if (file && 'extension' in file) {
      const data = await app.vault.readBinary(file as TFile);
      const blob = new Blob([data]);
      const bitmap = await createImageBitmap(blob);
      imgWidth = bitmap.width;
      imgHeight = bitmap.height;
      bitmap.close();
    }
  } catch {
    result.warnings.push(`Cannot read dimensions for ${filePath}, using fallback`);
  }

  const coords = pixelsToNormalized(sel.firstX, sel.firstY, sel.secondX, sel.secondY, imgWidth, imgHeight);
  const imgData = dataManager.section('image');
  const marker: ImageMarker = {
    id: `import_${sel.guid}`,
    fileId: filePath,
    codes,
    shape: 'rect',
    coords,
    memo,
    createdAt: ts,
    updatedAt: ts,
  };
  imgData.markers.push(marker);
  dataManager.setSection('image', imgData);
  return 1;
}

function createMediaMarker(
  sel: ParsedSelection,
  filePath: string,
  codes: CodeApplication[],
  memo: string | undefined,
  ts: number,
  dataManager: DataManager,
  engine: 'audio' | 'video',
  result: ImportResult,
): number {
  if (sel.begin === undefined || sel.end === undefined) return 0;

  const data = dataManager.section(engine);
  let fileEntry = data.files.find((f: { path: string }) => f.path === filePath);
  if (!fileEntry) {
    fileEntry = { path: filePath, markers: [] } as any;
    data.files.push(fileEntry as any);
  }

  const marker: MediaMarker = {
    id: `import_${sel.guid}`,
    fileId: filePath,
    codes,
    from: msToSeconds(sel.begin),
    to: msToSeconds(sel.end),
    memo,
    createdAt: ts,
    updatedAt: ts,
  };
  (fileEntry as any).markers.push(marker);
  dataManager.setSection(engine, data);
  return 1;
}

// ─── Text marker batch processing ───

/**
 * Create text markers after all sources are extracted.
 * Called as a second pass with file contents available.
 */
export async function createTextMarkers(
  sources: ParsedSource[],
  guidMap: Map<string, string>,
  notes: Map<string, ParsedNote>,
  app: App,
  dataManager: DataManager,
  registry: CodeDefinitionRegistry,
): Promise<{ count: number; warnings: string[] }> {
  const warnings: string[] = [];
  let count = 0;

  const textSources = sources.filter(s => s.type === 'text');
  for (const src of textSources) {
    const filePath = guidMap.get(src.guid);
    if (!filePath) continue;

    const file = app.vault.getAbstractFileByPath(filePath);
    if (!file || !('extension' in file)) continue;

    const content = await app.vault.cachedRead(file as TFile);
    // Strip frontmatter for offset calculation
    const fmEnd = content.indexOf('\n---\n', 4);
    const bodyStart = fmEnd >= 0 ? fmEnd + 5 : 0;
    const body = content.slice(bodyStart);

    const mdData = dataManager.section('markdown');
    if (!mdData.markers[filePath]) mdData.markers[filePath] = [];

    for (const sel of src.selections) {
      if (sel.type !== 'PlainTextSelection') continue;
      if (sel.startPosition === undefined || sel.endPosition === undefined) continue;

      const fromPos = offsetToLineCh(body, sel.startPosition);
      const toPos = offsetToLineCh(body, sel.endPosition);
      if (!fromPos || !toPos) {
        warnings.push(`Text offset out of range in ${src.name}: ${sel.startPosition}-${sel.endPosition}`);
        continue;
      }

      const codes = resolveCodeApplications(sel, guidMap, notes);
      if (codes.length === 0) continue;

      const memo = resolveMemo(sel, notes);
      const ts = resolveTimestamp(sel.createdAt);
      const firstCodeId = codes[0]!.codeId;
      const codeDef = registry.getById(firstCodeId);
      const color = codeDef?.color ?? '#6200EE';

      const marker: Marker = {
        markerType: 'markdown',
        id: `import_${sel.guid}`,
        fileId: filePath,
        codes,
        color,
        range: { from: fromPos, to: toPos },
        memo,
        createdAt: ts,
        updatedAt: ts,
      };
      mdData.markers[filePath]!.push(marker);
      guidMap.set(sel.guid, marker.id);
      count++;
    }
    dataManager.setSection('markdown', mdData);
  }

  return { count, warnings };
}

// ─── Relations ───

/**
 * Apply <Link> elements as relations on CodeDefinitions and CodeApplications.
 * Returns count of relations applied.
 */
export function applyLinks(
  links: ParsedLink[],
  guidMap: Map<string, string>,
  registry: CodeDefinitionRegistry,
  dataManager: DataManager,
): number {
  let applied = 0;

  for (const link of links) {
    const originId = guidMap.get(link.originGuid);
    const targetId = guidMap.get(link.targetGuid);
    if (!originId || !targetId) continue;

    const relation: CodeRelation = {
      label: link.label,
      target: targetId,
      directed: link.directed,
    };

    // Try code-level first
    const originDef = registry.getById(originId);
    if (originDef) {
      const existing = originDef.relations ?? [];
      const dup = existing.some(r => r.label === relation.label && r.target === relation.target);
      if (!dup) {
        registry.update(originId, { relations: [...existing, relation] });
        applied++;
      }
      continue;
    }

    // Otherwise, try segment-level (marker → code relation)
    // Walk all engine markers looking for marker with this id
    const markerRelation = applyMarkerRelation(originId, relation, dataManager);
    if (markerRelation) applied++;
  }

  return applied;
}

function applyMarkerRelation(
  markerId: string,
  relation: CodeRelation,
  dataManager: DataManager,
): boolean {
  // Check markdown markers
  const mdData = dataManager.section('markdown');
  for (const markers of Object.values(mdData.markers)) {
    const marker = markers.find(m => m.id === markerId);
    if (marker && marker.codes.length > 0) {
      const ca = marker.codes[0]!;
      const existing = ca.relations ?? [];
      ca.relations = [...existing, relation];
      dataManager.setSection('markdown', mdData);
      return true;
    }
  }

  // Check PDF
  const pdfData = dataManager.section('pdf');
  for (const marker of [...pdfData.markers, ...pdfData.shapes]) {
    if (marker.id === markerId && marker.codes.length > 0) {
      const ca = marker.codes[0]!;
      ca.relations = [...(ca.relations ?? []), relation];
      dataManager.setSection('pdf', pdfData);
      return true;
    }
  }

  // Check image
  const imgData = dataManager.section('image');
  const imgMarker = imgData.markers.find(m => m.id === markerId);
  if (imgMarker && imgMarker.codes.length > 0) {
    imgMarker.codes[0]!.relations = [...(imgMarker.codes[0]!.relations ?? []), relation];
    dataManager.setSection('image', imgData);
    return true;
  }

  // Check audio/video
  for (const engine of ['audio', 'video'] as const) {
    const data = dataManager.section(engine);
    for (const fileEntry of data.files) {
      const marker = (fileEntry as any).markers.find((m: any) => m.id === markerId);
      if (marker && marker.codes.length > 0) {
        marker.codes[0].relations = [...(marker.codes[0].relations ?? []), relation];
        dataManager.setSection(engine, data);
        return true;
      }
    }
  }

  return false;
}

// ─── Standalone memos (Source, Project, loose) ───

/**
 * Import memos that don't map to marker.memo or code.description.
 * Creates .md files in imports/{project}/memos/.
 */
async function importStandaloneMemos(
  doc: Document,
  sources: ParsedSource[],
  notes: Map<string, ParsedNote>,
  guidMap: Map<string, string>,
  vault: Vault,
  importDir: string,
): Promise<number> {
  // Collect all note GUIDs already consumed (by selections and codes)
  const consumed = new Set<string>();
  for (const src of sources) {
    for (const sel of src.selections) {
      for (const ng of sel.noteGuids) consumed.add(ng);
    }
  }
  // Code-level notes consumed by applyCodebook
  const codebook = getAllElements(doc.documentElement, 'Code');
  for (const el of codebook) {
    for (const noteRef of getChildElements(el, 'NoteRef')) {
      const ng = getAttr(noteRef, 'targetGUID');
      if (ng) consumed.add(ng);
    }
  }

  // Remaining notes → .md files
  const memosDir = `${importDir}/memos`;
  let count = 0;

  for (const [guid, note] of notes) {
    if (consumed.has(guid)) continue;
    if (note.magnitude) continue; // magnitude notes are data, not memos

    await ensureFolder(vault, memosDir);
    const safeName = note.name.replace(/[/\\:]/g, '_').slice(0, 100);
    const filename = `${memosDir}/${safeName}.md`;

    // Determine linked entity
    let linkedTo = 'project';
    let linkedName = '';

    // Check if NoteRef appears on a Source element
    for (const src of sources) {
      const srcEl = getAllElements(doc.documentElement, 'TextSource')
        .concat(getAllElements(doc.documentElement, 'PDFSource'))
        .concat(getAllElements(doc.documentElement, 'PictureSource'))
        .concat(getAllElements(doc.documentElement, 'AudioSource'))
        .concat(getAllElements(doc.documentElement, 'VideoSource'))
        .find(el => {
          for (const nr of getChildElements(el, 'NoteRef')) {
            if (getAttr(nr, 'targetGUID') === guid) return true;
          }
          return false;
        });
      if (srcEl) {
        linkedTo = 'document';
        linkedName = getAttr(srcEl, 'name') ?? '';
        break;
      }
    }

    const frontmatter = [
      '---',
      'type: memo',
      `linked_to: "${linkedTo}"`,
      `linked_guid: "${guid}"`,
      linkedName ? `linked_name: "${linkedName}"` : '',
      note.createdAt ? `created: "${note.createdAt}"` : '',
      'imported_from: "QDPX"',
      '---',
      '',
    ].filter(Boolean).join('\n');

    await vault.create(filename, frontmatter + note.text);
    count++;
  }

  return count;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/import/qdpxImporter.test.ts`
Expected: PASS (all 11 tests)

- [ ] **Step 5: Commit**

```bash
~/.claude/scripts/commit.sh "feat: qdpxImporter com parsing de sources, notes, links e import completo"
```

---

## Chunk 4: Export Magnitude + Import Modal + Commands

### Task 5: Export magnitude in Notes

**Files:**
- Modify: `src/export/qdpxExporter.ts:41-48`
- Test: `tests/import/magnitudeRoundTrip.test.ts`

- [ ] **Step 1: Write round-trip test for magnitude**

```typescript
// tests/import/magnitudeRoundTrip.test.ts
import { describe, it, expect } from 'vitest';
import { buildCodingXml, buildNoteXml } from '../../src/export/qdpxExporter';
import { parseNotes } from '../../src/import/qdpxImporter';
import { parseXml } from '../../src/import/xmlParser';
import type { CodeApplication } from '../../src/core/types';

describe('magnitude export', () => {
  it('encodes magnitude as Note with [Magnitude: X] prefix', () => {
    const codes: CodeApplication[] = [{ codeId: 'c1', magnitude: 'High' }];
    const guidMap = new Map<string, string>();
    const notes: string[] = [];
    const xml = buildCodingXml(codes, guidMap, Date.now(), notes);

    expect(xml).toContain('<NoteRef');
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain('[Magnitude: High]');
  });

  it('does not create Note when no magnitude', () => {
    const codes: CodeApplication[] = [{ codeId: 'c1' }];
    const guidMap = new Map<string, string>();
    const notes: string[] = [];
    const xml = buildCodingXml(codes, guidMap, Date.now(), notes);

    expect(xml).not.toContain('NoteRef');
    expect(notes).toHaveLength(0);
  });
});

describe('magnitude round-trip', () => {
  it('exported magnitude can be imported back', () => {
    const codes: CodeApplication[] = [{ codeId: 'c1', magnitude: 'Medium' }];
    const guidMap = new Map<string, string>();
    const notes: string[] = [];
    buildCodingXml(codes, guidMap, Date.now(), notes);

    // Wrap in Project/Notes for parsing
    const notesXml = `<Project><Notes>\n${notes.join('\n')}\n</Notes></Project>`;
    const doc = parseXml(notesXml);
    const parsed = parseNotes(doc);

    const noteEntries = Array.from(parsed.values());
    expect(noteEntries).toHaveLength(1);
    expect(noteEntries[0]!.magnitude).toBe('Medium');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/import/magnitudeRoundTrip.test.ts`
Expected: FAIL — buildCodingXml doesn't accept notes parameter yet

- [ ] **Step 3: Update buildCodingXml to encode magnitude**

Modify `src/export/qdpxExporter.ts`. The `buildCodingXml` function signature changes to accept an optional `notes` array for magnitude encoding. Update all call sites to pass `notes`.

Current signature (line 41):
```typescript
export function buildCodingXml(codes: CodeApplication[], guidMap: Map<string, string>, createdAt?: number): string {
```

New signature:
```typescript
export function buildCodingXml(codes: CodeApplication[], guidMap: Map<string, string>, createdAt?: number, notes?: string[]): string {
```

Updated implementation:
```typescript
export function buildCodingXml(codes: CodeApplication[], guidMap: Map<string, string>, createdAt?: number, notes?: string[]): string {
  const dateStr = createdAt ? new Date(createdAt).toISOString() : new Date().toISOString();
  return codes.map(ca => {
    const codingGuid = uuidV4();
    const codeGuid = ensureGuid(ca.codeId, guidMap);
    let noteRef = '';
    if (ca.magnitude && notes) {
      const noteGuid = `mag_${codingGuid}`;
      notes.push(buildNoteXml(noteGuid, 'Magnitude', `[Magnitude: ${ca.magnitude}]`));
      noteRef = `\n${buildNoteRefXml(noteGuid)}`;
    }
    return `<Coding ${xmlAttr('guid', codingGuid)} ${xmlAttr('creationDateTime', dateStr)}>\n<CodeRef ${xmlAttr('targetGUID', codeGuid)}/>${noteRef}\n</Coding>`;
  }).join('\n');
}
```

Then update all call sites in `qdpxExporter.ts` to pass `notes`:
- `buildTextSourceXml` (line 86): `buildCodingXml(m.codes, guidMap, m.createdAt, notes)`
- `buildMediaSourceXml` (line 125): `buildCodingXml(m.codes, guidMap, m.createdAt, notes)`
- `buildImageSourceXml` (line 177): `buildCodingXml(m.codes, guidMap, m.createdAt, notes)`
- `buildPdfSourceXml` text (line 226): `buildCodingXml(m.codes, guidMap, m.createdAt, notes)`
- `buildPdfSourceXml` shapes (line 245): `buildCodingXml(m.codes, guidMap, m.createdAt, notes)`

- [ ] **Step 4: Run all export tests + magnitude test**

Run: `npx vitest run tests/export/ tests/import/magnitudeRoundTrip.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
~/.claude/scripts/commit.sh "feat: export magnitude como Note [Magnitude: X] no QDPX"
```

---

### Task 6: Import Modal

**Files:**
- Create: `src/import/importModal.ts`

- [ ] **Step 1: Implement import modal**

```typescript
// src/import/importModal.ts
import { Modal, Setting, Notice } from 'obsidian';
import type { App } from 'obsidian';
import type { DataManager } from '../core/dataManager';
import type { CodeDefinitionRegistry } from '../core/codeDefinitionRegistry';
import { previewQdpx, importQdpx, createTextMarkers, parseSources, parseNotes, type ImportOptions, type ImportPreview } from './qdpxImporter';
import { parseCodebook, applyCodebook, type ConflictStrategy } from './qdcImporter';
import { parseXml } from './xmlParser';

export class ImportModal extends Modal {
  private dataManager: DataManager;
  private registry: CodeDefinitionRegistry;
  private format: 'qdpx' | 'qdc';
  private zipData: ArrayBuffer | null = null;
  private xmlString: string | null = null;
  private preview: ImportPreview | null = null;
  private conflictStrategy: ConflictStrategy = 'merge';
  private keepOriginalSources = false;

  constructor(
    app: App,
    dataManager: DataManager,
    registry: CodeDefinitionRegistry,
    format: 'qdpx' | 'qdc',
  ) {
    super(app);
    this.dataManager = dataManager;
    this.registry = registry;
    this.format = format;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: 'Import REFI-QDA' });

    // File input
    const inputContainer = contentEl.createDiv({ cls: 'qualia-import-file-input' });
    const fileInput = inputContainer.createEl('input', { type: 'file' });
    fileInput.accept = this.format === 'qdpx' ? '.qdpx' : '.qdc';
    fileInput.addEventListener('change', () => this.onFileSelected(fileInput));

    // Dynamic content area
    this.dynamicEl = contentEl.createDiv();
  }

  private dynamicEl!: HTMLElement;

  private async onFileSelected(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    if (!file) return;

    try {
      if (this.format === 'qdpx') {
        this.zipData = await file.arrayBuffer();
        this.preview = previewQdpx(this.zipData, this.registry);
        this.renderPreview();
      } else {
        this.xmlString = await file.text();
        this.renderQdcPreview();
      }
    } catch (err) {
      new Notice(`Failed to read file: ${(err as Error).message}`);
    }
  }

  private renderPreview(): void {
    if (!this.preview) return;
    this.dynamicEl.empty();
    const p = this.preview;

    const info = this.dynamicEl.createDiv({ cls: 'qualia-import-preview' });
    info.createEl('p', { text: `File: ${p.projectName}` });
    if (p.origin) info.createEl('p', { text: `Origin: ${p.origin}` });
    info.createEl('p', { text: `Found: ${p.codeCount} codes${p.hierarchyCount > 0 ? ` (${p.hierarchyCount} with hierarchy)` : ''}, ${p.selectionCount} segments, ${p.sourceCount} sources, ${p.noteCount} memos${p.linkCount > 0 ? `, ${p.linkCount} relations` : ''}` });

    // Conflicts
    if (p.conflictingCodes.length > 0) {
      const conflictEl = this.dynamicEl.createDiv({ cls: 'qualia-import-conflicts' });
      conflictEl.createEl('p', { text: `⚠ ${p.conflictingCodes.length} codes already exist: ${p.conflictingCodes.join(', ')}` });

      new Setting(conflictEl)
        .setName('Conflict resolution')
        .addDropdown(dd => {
          dd.addOption('merge', 'Merge (use existing codes)');
          dd.addOption('separate', 'Create separate (suffix "imported")');
          dd.setValue(this.conflictStrategy);
          dd.onChange(v => { this.conflictStrategy = v as ConflictStrategy; });
        });
    }

    if (this.format === 'qdpx') {
      new Setting(this.dynamicEl)
        .setName('Keep original source files')
        .setDesc('.docx, .txt alongside .md')
        .addToggle(t => {
          t.setValue(this.keepOriginalSources);
          t.onChange(v => { this.keepOriginalSources = v; });
        });
    }

    // Buttons
    new Setting(this.dynamicEl)
      .addButton(btn => btn.setButtonText('Cancel').onClick(() => this.close()))
      .addButton(btn => btn.setButtonText('Import').setCta().onClick(() => this.doImport()));
  }

  private renderQdcPreview(): void {
    this.dynamicEl.empty();
    if (!this.xmlString) return;

    try {
      const doc = parseXml(this.xmlString);
      const codebook = parseCodebook(doc);
      const conflicting = codebook.codes.filter(c => this.registry.getByName(c.name));

      const info = this.dynamicEl.createDiv();
      info.createEl('p', { text: `Found: ${codebook.codes.length} codes` });

      if (conflicting.length > 0) {
        info.createEl('p', { text: `⚠ ${conflicting.length} already exist: ${conflicting.map(c => c.name).join(', ')}` });

        new Setting(this.dynamicEl)
          .setName('Conflict resolution')
          .addDropdown(dd => {
            dd.addOption('merge', 'Merge (use existing codes)');
            dd.addOption('separate', 'Create separate (suffix "imported")');
            dd.setValue(this.conflictStrategy);
            dd.onChange(v => { this.conflictStrategy = v as ConflictStrategy; });
          });
      }

      new Setting(this.dynamicEl)
        .addButton(btn => btn.setButtonText('Cancel').onClick(() => this.close()))
        .addButton(btn => btn.setButtonText('Import').setCta().onClick(() => this.doQdcImport(codebook)));
    } catch (err) {
      new Notice(`Invalid QDC file: ${(err as Error).message}`);
    }
  }

  private async doImport(): Promise<void> {
    if (!this.zipData || !this.preview) return;

    try {
      const result = await importQdpx(this.zipData, this.app, this.dataManager, this.registry, {
        conflictStrategy: this.conflictStrategy,
        keepOriginalSources: this.keepOriginalSources,
        projectName: this.preview.projectName,
      });

      const parts = [
        `${result.codesCreated} codes created`,
        result.codesMerged > 0 ? `${result.codesMerged} merged` : '',
        `${result.sourcesImported} sources`,
        `${result.segmentsCreated} segments`,
        result.relationsImported > 0 ? `${result.relationsImported} relations` : '',
      ].filter(Boolean);

      new Notice(`Import complete: ${parts.join(', ')}`, 8000);
      if (result.warnings.length > 0) {
        console.warn('[Qualia Import] Warnings:', result.warnings);
      }
      this.close();
    } catch (err) {
      new Notice(`Import failed: ${(err as Error).message}`);
      console.error('[Qualia Import]', err);
    }
  }

  private async doQdcImport(codebook: ReturnType<typeof parseCodebook>): Promise<void> {
    const result = applyCodebook(codebook, this.registry, this.conflictStrategy);
    this.dataManager.setSection('registry', this.registry.toJSON());
    this.dataManager.markDirty();
    await this.dataManager.flush();

    new Notice(`Codebook imported: ${result.created} created, ${result.merged} merged`);
    this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
```

- [ ] **Step 2: Commit**

```bash
~/.claude/scripts/commit.sh "feat: importModal com preview, conflitos e opcoes de import"
```

---

### Task 7: Import Commands + main.ts wiring

**Files:**
- Create: `src/import/importCommands.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Implement importCommands.ts**

```typescript
// src/import/importCommands.ts
import type QualiaCodingPlugin from '../main';
import { ImportModal } from './importModal';

export function registerImportCommands(plugin: QualiaCodingPlugin): void {
  plugin.addCommand({
    id: 'import-qdpx',
    name: 'Import project (QDPX)',
    callback: () => {
      new ImportModal(
        plugin.app,
        plugin.dataManager,
        plugin.sharedRegistry,
        'qdpx',
      ).open();
    },
  });

  plugin.addCommand({
    id: 'import-qdc',
    name: 'Import codebook (QDC)',
    callback: () => {
      new ImportModal(
        plugin.app,
        plugin.dataManager,
        plugin.sharedRegistry,
        'qdc',
      ).open();
    },
  });
}

/** Factory for analytics toolbar — avoids importing ImportModal in analytics view. */
export function openImportModal(plugin: QualiaCodingPlugin, defaultFormat: 'qdc' | 'qdpx' = 'qdpx'): void {
  new ImportModal(
    plugin.app,
    plugin.dataManager,
    plugin.sharedRegistry,
    defaultFormat,
  ).open();
}
```

- [ ] **Step 2: Wire in main.ts**

Add import to `src/main.ts` near line 24 (after export import):
```typescript
import { registerImportCommands } from './import/importCommands';
```

Add registration near line 87 (after `registerExportCommands(this)`):
```typescript
registerImportCommands(this);
```

- [ ] **Step 3: Wire import button in analytics view**

Add to `src/analytics/index.ts` — import at top (near line 3):
```typescript
import { openImportModal } from '../import/importCommands';
```

Add to plugin interface (near line 27, after `openExportModal`):
```typescript
openImportModal(defaultFormat?: 'qdc' | 'qdpx'): void;
```

Add implementation (near line 93, after `openExportModal`):
```typescript
openImportModal(defaultFormat: 'qdc' | 'qdpx' = 'qdpx'): void {
  openImportModal(plugin, defaultFormat);
},
```

Add import button in `src/analytics/views/analyticsView.ts` — after the export REFI button (near line 266):
```typescript
const importBtn = toolbar.createDiv({ cls: "codemarker-analytics-toolbar-btn" });
importBtn.createSpan({ text: "Import REFI-QDA" });
importBtn.setAttribute("aria-label", "Import REFI-QDA (QDPX/QDC)");
importBtn.addEventListener("click", () => {
  this.plugin.openImportModal();
});
```

- [ ] **Step 4: Build to verify no TypeScript errors**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
~/.claude/scripts/commit.sh "feat: importCommands registrados na palette + analytics button + wiring no main.ts"
```

---

### Task 8: Run full test suite

- [ ] **Step 1: Run all tests**

Run: `npm run test`
Expected: All existing tests pass + new import tests pass

- [ ] **Step 2: Fix any failures**

If any test breaks, investigate and fix. Most likely issues:
- `buildCodingXml` signature change may break existing export tests (the `notes` param is optional, so should be backward compatible)

- [ ] **Step 3: Final commit if fixes needed**

```bash
~/.claude/scripts/commit.sh "fix: ajustes de compatibilidade apos import REFI-QDA"
```

---

## Summary

| What | Status |
|------|--------|
| XML parser helpers | Task 1 |
| Inverse coordinate converters | Task 2 |
| QDC importer (codebook + hierarchy + conflicts + NoteRef→description) | Task 3 |
| QDPX importer (sources, segments, memos, magnitude, relations, standalone memos) | Task 4 |
| Export magnitude in Notes | Task 5 |
| Import modal UI | Task 6 |
| Import commands + main.ts + analytics button wiring | Task 7 |
| Full test suite validation | Task 8 |

### Spec coverage

| Spec item | Implementation |
|-----------|---------------|
| QDC import (codebook only) | Task 3 + Task 6 (modal QDC flow) |
| QDPX import (full project) | Task 4 |
| 5 source types (text, PDF, image, audio, video) | parseSources + engine-specific marker creation |
| Hierarchy (nested codes) | parseCodebook recursive + applyCodebook with parentId |
| Magnitude (Phase D) | parseNotes MAGNITUDE_RE + export buildCodingXml |
| Relations (Phase E) | parseLinks + applyLinks + export buildLinksXml (already existed) |
| Conflict resolution (merge/separate) | ImportModal + applyCodebook strategy param |
| Memos: segment → marker.memo | resolveMemo from NoteRef on Selection |
| Memos: code → description | NoteRef on Code + resolveCodeNotes + mergeDescriptions |
| Memos: source/project/loose → .md | importStandaloneMemos |
| Entry points: palette commands | importCommands.ts |
| Entry points: analytics button | analyticsView.ts import button |
| Coordinate conversion (inverse) | coordConverters.ts (offset→lineCh, pdfRect→normalized, pixels→normalized, ms→seconds) |
| Source files to vault | extractSource → imports/{project-name}/ |
| relative:// path resolution | resolveInternalPath handles both internal:// and relative:// |

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
  noteGuids: string[];
}

export interface ParsedCodebook {
  codes: ParsedCode[];
}

export type ConflictStrategy = 'merge' | 'separate';

export interface CodebookImportResult {
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

function parseCodeElement(el: Element, parentGuid: string | undefined, out: ParsedCode[]): void {
  const guid = getAttr(el, 'guid');
  if (!guid) return;

  const childEls = getChildElements(el, 'Code');
  const childrenGuids: string[] = [];
  for (const child of childEls) {
    const childGuid = getAttr(child, 'guid');
    if (childGuid) childrenGuids.push(childGuid);
  }

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

  for (const child of childEls) {
    parseCodeElement(child, guid, out);
  }
}

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

  for (const pc of codebook.codes) {
    const existing = registry.getByName(pc.name);

    if (existing) {
      if (strategy === 'merge') {
        guidMap.set(pc.guid, existing.id);
        merged++;
        continue;
      }
      const newName = `${pc.name} (imported)`;
      const parentId = pc.parentGuid ? guidMap.get(pc.parentGuid) : undefined;
      const def = registry.create(newName, pc.color, pc.description, parentId);
      guidMap.set(pc.guid, def.id);
      created++;
      continue;
    }

    const parentId = pc.parentGuid ? guidMap.get(pc.parentGuid) : undefined;
    const noteDesc = resolveCodeNotes(pc.noteGuids, notes);
    const description = mergeDescriptions(pc.description, noteDesc);
    const def = registry.create(pc.name, pc.color, description, parentId);
    guidMap.set(pc.guid, def.id);
    created++;
  }

  return { guidMap, created, merged, warnings };
}

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

function mergeDescriptions(xmlDesc?: string, noteDesc?: string): string | undefined {
  if (!xmlDesc && !noteDesc) return undefined;
  if (!xmlDesc) return noteDesc;
  if (!noteDesc) return xmlDesc;
  return `${xmlDesc}\n\n--- Imported memo ---\n${noteDesc}`;
}

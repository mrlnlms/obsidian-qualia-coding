import { getChildElements, getAttr, getTextContent, getAllElements } from './xmlParser';
import type { CodeDefinitionRegistry } from '../core/codeDefinitionRegistry';
import type { CodeDefinition } from '../core/types';
import { getMemoContent } from '../core/memoHelpers';

/** Parsed code from REFI-QDA XML. */
export interface ParsedCode {
  guid: string;
  name: string;
  color?: string;
  description?: string;
  memo?: string;
  parentGuid?: string;
  childrenGuids: string[];
  noteGuids: string[];
  magnitude?: CodeDefinition['magnitude'];
}

export interface ParsedCodebook {
  codes: ParsedCode[];
}

export type ConflictStrategy = 'merge' | 'separate';

export interface CodebookImportResult {
  codeGuidMap: Map<string, string>;
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
    memo: getTextContent(el, 'MemoText'),
    parentGuid,
    childrenGuids,
    noteGuids,
    magnitude: parseQualiaMagnitude(getAttr(el, 'qualia:magnitude')),
  });

  for (const child of childEls) {
    parseCodeElement(child, guid, out);
  }
}

function parseQualiaMagnitude(raw: string | undefined): CodeDefinition['magnitude'] | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as { type?: unknown; values?: unknown };
    if (
      (parsed.type === 'nominal' || parsed.type === 'ordinal' || parsed.type === 'continuous')
      && Array.isArray(parsed.values)
      && parsed.values.every(value => typeof value === 'string')
    ) {
      return { type: parsed.type, values: [...parsed.values] };
    }
  } catch {
    // Foreign or malformed extension metadata must not block a REFI import.
  }
  return undefined;
}

const QUALIA_MAGNITUDE_DEFINITION_RE = /^\[Qualia Magnitude Definition:\s*(\{[\s\S]*\})\]$/;

function isQualiaMagnitudeDefinition(text: string): boolean {
  return QUALIA_MAGNITUDE_DEFINITION_RE.test(text);
}

function resolveCodeMagnitude(
  code: ParsedCode,
  notes?: Map<string, { text: string; magnitude?: string }>,
): CodeDefinition['magnitude'] | undefined {
  // Read the short-lived attribute representation for backward compatibility.
  if (code.magnitude) return code.magnitude;
  if (!notes) return undefined;
  for (const guid of code.noteGuids) {
    const match = QUALIA_MAGNITUDE_DEFINITION_RE.exec(notes.get(guid)?.text ?? '');
    const parsed = parseQualiaMagnitude(match?.[1]);
    if (parsed) return parsed;
  }
  return undefined;
}

export function applyCodebook(
  codebook: ParsedCodebook,
  registry: CodeDefinitionRegistry,
  strategy: ConflictStrategy,
  notes?: Map<string, { text: string; magnitude?: string }>,
): CodebookImportResult {
  const codeGuidMap = new Map<string, string>();
  let created = 0;
  let merged = 0;
  const warnings: string[] = [];

  for (const pc of codebook.codes) {
    const existing = registry.getByName(pc.name);
    const importedMagnitude = resolveCodeMagnitude(pc, notes);

    if (existing) {
      if (strategy === 'merge') {
        codeGuidMap.set(pc.guid, existing.id);
        if (importedMagnitude && !existing.magnitude) {
          registry.update(existing.id, { magnitude: importedMagnitude });
        }
        if (pc.memo) {
          const existingContent = getMemoContent(existing.memo);
          const mergedMemo = mergeMemos(existingContent || undefined, pc.memo);
          if (mergedMemo !== existingContent) {
            registry.update(existing.id, { memo: mergedMemo ?? '' });
          }
        }
        merged++;
        continue;
      }
      const newName = `${pc.name} (imported)`;
      const parentId = pc.parentGuid ? codeGuidMap.get(pc.parentGuid) : undefined;
      const def = registry.create(newName, pc.color, pc.description, parentId);
      if (pc.memo) registry.update(def.id, { memo: pc.memo });
      if (importedMagnitude) registry.update(def.id, { magnitude: importedMagnitude });
      codeGuidMap.set(pc.guid, def.id);
      created++;
      continue;
    }

    const parentId = pc.parentGuid ? codeGuidMap.get(pc.parentGuid) : undefined;
    const noteDesc = resolveCodeNotes(pc.noteGuids, notes);
    const description = mergeDescriptions(pc.description, noteDesc);
    const def = registry.create(pc.name, pc.color, description, parentId);
    if (pc.memo) registry.update(def.id, { memo: pc.memo });
    if (importedMagnitude) registry.update(def.id, { magnitude: importedMagnitude });
    codeGuidMap.set(pc.guid, def.id);
    created++;
  }

  return { codeGuidMap, created, merged, warnings };
}

function resolveCodeNotes(
  noteGuids: string[],
  notes?: Map<string, { text: string; magnitude?: string }>,
): string | undefined {
  if (!notes || noteGuids.length === 0) return undefined;
  const texts: string[] = [];
  for (const guid of noteGuids) {
    const note = notes.get(guid);
    if (note && !note.magnitude && !isQualiaMagnitudeDefinition(note.text)) texts.push(note.text);
  }
  return texts.length > 0 ? texts.join('\n\n') : undefined;
}

function mergeDescriptions(xmlDesc?: string, noteDesc?: string): string | undefined {
  if (!xmlDesc && !noteDesc) return undefined;
  if (!xmlDesc) return noteDesc;
  if (!noteDesc) return xmlDesc;
  return `${xmlDesc}\n\n--- Imported memo ---\n${noteDesc}`;
}

export function mergeMemos(existing: string | undefined, imported: string | undefined): string | undefined {
  if (!existing && !imported) return undefined;
  if (!existing) return imported;
  if (!imported) return existing;
  return `${existing}\n\n--- Imported memo ---\n${imported}`;
}

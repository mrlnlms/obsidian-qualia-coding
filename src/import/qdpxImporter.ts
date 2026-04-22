// src/import/qdpxImporter.ts
import { unzipSync, strFromU8 } from 'fflate';
import type { App, TFile, Vault } from 'obsidian';
import type { DataManager } from '../core/dataManager';
import type { CodeDefinitionRegistry } from '../core/codeDefinitionRegistry';
import type { CodeApplication, CodeRelation } from '../core/types';
import { getImageDimensions } from '../core/imageDimensions';
import type { Marker } from '../markdown/models/codeMarkerModel';
import type { MediaMarker } from '../media/mediaTypes';
import type { ImageMarker } from '../image/imageCodingTypes';
import type { PdfMarker, PdfShapeMarker } from '../pdf/pdfCodingTypes';
import type { AudioFile } from '../audio/audioCodingTypes';
import type { VideoFile } from '../video/videoCodingTypes';
import { parseXml, getChildElements, getAttr, getNumAttr, getTextContent, getAllElements } from './xmlParser';
import { offsetToLineCh, pdfRectToNormalized, pixelsToNormalized, msToSeconds } from './coordConverters';
import { parseCodebook, applyCodebook, type ConflictStrategy } from './qdcImporter';

import type { CaseVariablesRegistry } from '../core/caseVariables/caseVariablesRegistry';
import type { VariableValue } from '../core/caseVariables/caseVariablesTypes';

// ─── Parsed types ───

export interface ParsedVariable {
  name: string;
  value: string | number | boolean | string[];
}

export interface ParsedCase {
  name: string;
  sourceGuids: string[];
}

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
  variables: ParsedVariable[];
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

/**
 * Resolves QDPX GUIDs to their Qualia-side equivalents during import.
 * Each category lives in its own Map to prevent cross-namespace collisions
 * (a source GUID should never resolve to a code id, etc.).
 */
export interface GuidResolver {
  /** QDPX code guid → Qualia CodeDefinition.id */
  codes: Map<string, string>;
  /** QDPX source guid → vault file path */
  sources: Map<string, string>;
  /** QDPX selection guid → Qualia marker id */
  selections: Map<string, string>;
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
        variables: [],
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

      // Parse <Variable> children
      for (const varEl of getChildElements(el, 'Variable')) {
        src.variables.push(parseVariableElement(varEl));
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

/** Parse a single <Variable> element into a typed ParsedVariable. */
export function parseVariableElement(el: Element): ParsedVariable {
  const name = getAttr(el, 'name') ?? '';
  const qdpxType = getAttr(el, 'typeOfVariable') ?? 'Text';
  const values: string[] = [];
  for (const vEl of getChildElements(el, 'VariableValue')) {
    values.push(vEl.textContent ?? '');
  }

  if (values.length === 0) return { name, value: '' };
  if (values.length > 1) return { name, value: values };

  const raw = values[0] ?? '';
  let coerced: ParsedVariable['value'] = raw;
  if (qdpxType === 'Float' || qdpxType === 'Integer') coerced = Number(raw);
  else if (qdpxType === 'Boolean') coerced = /^true$/i.test(raw);
  return { name, value: coerced };
}

/** Parse <Cases> section into case groupings. */
export function parseCases(doc: Document): ParsedCase[] {
  const cases: ParsedCase[] = [];
  const casesEl = getAllElements(doc.documentElement, 'Cases')[0];
  if (!casesEl) return cases;

  for (const caseEl of getChildElements(casesEl, 'Case')) {
    const name = getAttr(caseEl, 'name') ?? '';
    const sourceGuids: string[] = [];
    for (const ref of getChildElements(caseEl, 'SourceRef')) {
      const g = getAttr(ref, 'targetGUID');
      if (g) sourceGuids.push(g);
    }
    cases.push({ name, sourceGuids });
  }

  return cases;
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
  caseVariablesRegistry?: CaseVariablesRegistry,
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
  const resolver: GuidResolver = {
    codes: cbResult.codeGuidMap,
    sources: new Map(),
    selections: new Map(),
  };

  // 4. Extract source files to vault
  const importDir = `imports/${options.projectName}`;
  await ensureFolder(app.vault, importDir);

  for (const src of sources) {
    try {
      const filePath = await extractSource(src, files, app.vault, importDir, options.keepOriginalSources);
      if (filePath) {
        resolver.sources.set(src.guid, filePath);
        result.sourcesImported++;

        // 5. Create markers from selections
        const created = await createMarkersForSource(
          src, filePath, resolver, notes, app, dataManager, result,
        );
        result.segmentsCreated += created;
      }
    } catch (err) {
      result.warnings.push(`Source ${src.name}: ${(err as Error).message}`);
    }
  }

  // 6. Create text markers (second pass — needs file content for offset→lineCh)
  const textResult = await createTextMarkers(sources, resolver, notes, app, dataManager, registry);
  result.segmentsCreated += textResult.count;
  result.warnings.push(...textResult.warnings);

  // 6b. Apply case variables (Variables per source + Case groupings)
  if (caseVariablesRegistry) {
    for (const src of sources) {
      const fileId = resolver.sources.get(src.guid);
      if (!fileId || src.variables.length === 0) continue;
      await caseVariablesRegistry.applyVariablesBatch(
        fileId,
        src.variables.map(v => ({ name: v.name, value: v.value as VariableValue })),
      );
    }

    const cases = parseCases(doc);
    for (const c of cases) {
      for (const guid of c.sourceGuids) {
        const fileId = resolver.sources.get(guid);
        if (fileId) {
          await caseVariablesRegistry.setVariable(fileId, 'caseId', c.name);
        }
      }
    }
  }

  // 7. Import standalone memos (Source-level, Project-level, loose)
  result.memosImported += await importStandaloneMemos(doc, sources, notes, app.vault, importDir);

  // 8. Import relations (Links)
  result.relationsImported = applyLinks(links, resolver, registry, dataManager);

  // 9. Flush
  dataManager.markDirty();
  await dataManager.flush();

  return result;
}

// ─── Source extraction ───

async function ensureFolder(vault: Vault, path: string): Promise<void> {
  if (!(await vault.adapter.exists(path))) {
    await vault.adapter.mkdir(path);
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
    // TextSource → .md. Write the plainText as-is so QDPX offsets map 1:1 to the vault file.
    // Use adapter.write (direct FS) so files persist even if Obsidian closes before vault flush.
    const txtPath = resolveInternalPath(src.plainTextPath);
    const txtData = txtPath ? zipFiles[txtPath] : undefined;
    if (!txtData) return null;

    const text = strFromU8(txtData);
    const mdPath = destPath.replace(/\.\w+$/, '.md');
    await vault.adapter.write(mdPath, text);
    return mdPath;
  }

  // Binary sources (PDF, image, audio, video)
  const binPath = resolveInternalPath(src.path);
  const binData = binPath ? zipFiles[binPath] : undefined;
  if (!binData) return null;
  await vault.adapter.writeBinary(destPath, binData.buffer as ArrayBuffer);
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
  resolver: GuidResolver,
  notes: Map<string, ParsedNote>,
): CodeApplication[] {
  return sel.codeGuids.map(codeGuid => {
    const codeId = resolver.codes.get(codeGuid);
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
  resolver: GuidResolver,
  notes: Map<string, ParsedNote>,
  app: App,
  dataManager: DataManager,
  result: ImportResult,
): Promise<number> {
  let count = 0;

  for (const sel of src.selections) {
    try {
      const codes = resolveCodeApplications(sel, resolver, notes);
      if (codes.length === 0) continue;

      const memo = resolveMemo(sel, notes);
      const ts = resolveTimestamp(sel.createdAt);

      switch (src.type) {
        // 'text' is handled in a separate batch after sources are extracted
        // (see createTextMarkers below — needs file content for offset→lineCh).
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
        resolver.selections.set(sel.guid, markerId);
      }

      if (memo) result.memosImported++;
    } catch (err) {
      result.warnings.push(`Selection ${sel.guid} in ${src.name}: ${(err as Error).message}`);
    }
  }
  return count;
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

  // Get image dimensions (tries createImageBitmap, falls back to <img> decode for SVG/TIFF/HEIC etc.)
  let imgWidth = 1000, imgHeight = 1000; // fallback for truly unsupported formats
  const dims = await getImageDimensions(app.vault, filePath);
  if (dims) {
    imgWidth = dims.width;
    imgHeight = dims.height;
  } else {
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
  resolver: GuidResolver,
  notes: Map<string, ParsedNote>,
  app: App,
  dataManager: DataManager,
  registry: CodeDefinitionRegistry,
): Promise<{ count: number; warnings: string[] }> {
  const warnings: string[] = [];
  let count = 0;

  const textSources = sources.filter(s => s.type === 'text');
  for (const src of textSources) {
    const filePath = resolver.sources.get(src.guid);
    if (!filePath) continue;

    // Read via adapter (direct FS) instead of cachedRead — file was written with adapter.write
    // and vault cache may not have picked it up yet.
    if (!(await app.vault.adapter.exists(filePath))) continue;
    const content = await app.vault.adapter.read(filePath);

    const mdData = dataManager.section('markdown');
    if (!mdData.markers[filePath]) mdData.markers[filePath] = [];

    for (const sel of src.selections) {
      if (sel.type !== 'PlainTextSelection') continue;
      if (sel.startPosition === undefined || sel.endPosition === undefined) continue;

      const fromPos = offsetToLineCh(content, sel.startPosition);
      const toPos = offsetToLineCh(content, sel.endPosition);
      if (!fromPos || !toPos) {
        warnings.push(`Text offset out of range in ${src.name}: ${sel.startPosition}-${sel.endPosition}`);
        continue;
      }

      const codes = resolveCodeApplications(sel, resolver, notes);
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
      resolver.selections.set(sel.guid, marker.id);
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
  resolver: GuidResolver,
  registry: CodeDefinitionRegistry,
  dataManager: DataManager,
): number {
  let applied = 0;

  for (const link of links) {
    // Target can be either a code or a marker (segment). Resolve both namespaces
    // — whichever hits first wins. Same for origin (code vs marker).
    const targetId = resolver.codes.get(link.targetGuid) ?? resolver.selections.get(link.targetGuid);
    if (!targetId) continue;

    const relation: CodeRelation = {
      label: link.label,
      target: targetId,
      directed: link.directed,
    };

    // Try code-level origin first
    const originCodeId = resolver.codes.get(link.originGuid);
    if (originCodeId) {
      const originDef = registry.getById(originCodeId);
      if (originDef) {
        const existing = originDef.relations ?? [];
        const dup = existing.some(r => r.label === relation.label && r.target === relation.target);
        if (!dup) {
          registry.update(originCodeId, { relations: [...existing, relation] });
          applied++;
        }
      }
      continue;
    }

    // Otherwise, segment-level (marker → code/marker relation)
    const originMarkerId = resolver.selections.get(link.originGuid);
    if (originMarkerId) {
      const markerRelation = applyMarkerRelation(originMarkerId, relation, dataManager);
      if (markerRelation) applied++;
    }
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

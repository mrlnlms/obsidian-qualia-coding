// src/import/qdpxImporter.ts
import { unzipSync, strFromU8 } from 'fflate';
import type { App, TFile, Vault } from 'obsidian';
import type { DataManager } from '../core/dataManager';
import type { CodeDefinitionRegistry } from '../core/codeDefinitionRegistry';
import type { CodeApplication, CodeRelation } from '../core/types';
import type { CoderId } from '../core/icr/coderTypes';
import { DEFAULT_CODER_ID } from '../core/icr/coderTypes';
import type QualiaCodingPlugin from '../main';
import { GROUP_PALETTE } from '../core/types';
import { getImageDimensions } from '../core/imageDimensions';
import type { Marker } from '../markdown/models/codeMarkerModel';
import type { MediaMarker } from '../media/mediaTypes';
import type { ImageMarker } from '../image/imageCodingTypes';
import type { ImportedPdfTextContext, PdfMarker, PdfShapeMarker, QdpxMultipageFragmentHint } from '../pdf/pdfCodingTypes';
import type { SegmentMarker, RowMarker } from '../csv/csvCodingTypes';
import type { AudioFile } from '../audio/audioCodingTypes';
import type { VideoFile } from '../video/videoCodingTypes';
import { parseXml, getChildElements, getAttr, getNumAttr, getTextContent, getAllElements } from './xmlParser';
import {
  groupCodingsByUser,
  mergePairedCodings,
  mergeQdpxRepresentationCodings,
  parseQdpxCodings,
  parseQdpxUsers,
  type ParsedQdpxCoding,
  type ParsedQdpxUser,
} from './qdpxAuthoring';
import { atlasPdfTextRectToNormalized, offsetToLineCh, pdfRectToNormalized, pixelsToNormalized, msToSeconds } from './coordConverters';
import { parseCodebook, applyCodebook, type ConflictStrategy } from './qdcImporter';
import { loadPdfExportData, type PdfExportData } from '../pdf/pdfExportData';
import {
  detectQdpxPdfMultipageGroups,
  resolveQdpxMultipageRange,
  type QdpxMultipageResolution,
  type QdpxPdfMultipageGroup,
} from './qdpxMultipage';
import { syncPdfMarkerFirstSegmentProjection } from '../pdf/pdfMarkerSegments';

import type { CaseVariablesRegistry } from '../core/caseVariables/caseVariablesRegistry';
import type { VariableValue } from '../core/caseVariables/caseVariablesTypes';
import {
  advanceQdpxCodepoints,
  qdpxCodepointLength,
  qdpxCodepointToCodeUnit,
  sliceQdpxCodepoints,
} from './qdpxTextOffsets';

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
  type: 'PlainTextSelection' | 'PDFSelection' | 'PictureSelection' | 'AudioSelection' | 'VideoSelection' | 'qualia:CellSelection';
  name?: string;
  creatingUserGuid?: string;
  codings: ParsedQdpxCoding[];
  /** Compatibility projection for non-PDF creators during Marco 1. */
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
  // Tabular cell selections (qualia:CellSelection — custom namespace)
  sourceRowId?: number;
  column?: string;
  cellFrom?: number;
  cellTo?: number;
  qdpxMultipageFragment?: QdpxMultipageFragmentHint;
}

export interface ImportedPdfTextResolution {
  text: string | null;
  strategy: 'offset' | 'name+length' | 'name+prefix' | 'unresolved';
}

export interface ParsedSource {
  guid: string;
  name: string;
  type: 'text' | 'pdf' | 'picture' | 'audio' | 'video' | 'tabular';
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
  memo?: string;
}

export interface ImportResult {
  codesCreated: number;
  codesMerged: number;
  sourcesImported: number;
  segmentsCreated: number;
  memosImported: number;
  relationsImported: number;
  /** Vault-relative audit written alongside the imported source files. */
  auditPath?: string;
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
  /** QDPX selection guid → every Qualia marker created from that selection. */
  selections: Map<string, string[]>;
  /** QDPX smart code guid → Qualia SmartCodeDefinition.id (Tier 3 custom namespace) */
  smartCodes: Map<string, string>;
}

function addResolvedSelection(resolver: GuidResolver, guid: string, markerId: string): void {
  const ids = resolver.selections.get(guid) ?? [];
  if (!ids.includes(markerId)) resolver.selections.set(guid, [...ids, markerId]);
}

function getResolvedSelections(resolver: GuidResolver, guid: string): string[] {
  return resolver.selections.get(guid) ?? [];
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
    'qualia:TabularSource': 'tabular',
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

      // ATLAS.ti may nest PlainTextSelection under Representation instead of
      // directly under PDFSource. Keep those selections so text anchors can be
      // merged with the visual PDFSelection below.
      if (type === 'pdf') {
        const repr = getChildElements(el, 'Representation')[0];
        if (repr) {
          src.plainTextPath = getAttr(repr, 'plainTextPath');
          for (const selEl of getChildElements(repr, 'PlainTextSelection')) {
            src.selections.push(parseSelection(selEl, 'PlainTextSelection'));
          }
        }
      }

      // Parse selections
      const selectionTags = ['PlainTextSelection', 'PDFSelection', 'PictureSelection', 'AudioSelection', 'VideoSelection', 'qualia:CellSelection'];
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
  const codings = parseQdpxCodings(el);
  const codeGuids = codings.map((coding) => coding.codeGuid);
  const noteGuids = codings.flatMap((coding) => coding.noteGuids);

  // NoteRef directly on selection (for memos)
  for (const noteRef of getChildElements(el, 'NoteRef')) {
    const ng = getAttr(noteRef, 'targetGUID');
    if (ng && !noteGuids.includes(ng)) noteGuids.push(ng);
  }

  return {
    guid: getAttr(el, 'guid') ?? '',
    type,
    name: getAttr(el, 'name'),
    creatingUserGuid: getAttr(el, 'creatingUser'),
    codings,
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
    // Tabular: attributes use the qualia: prefix literally — DOM keeps the
    // prefix in the attribute name when no namespace is declared mid-doc.
    sourceRowId: getNumAttr(el, 'qualia:sourceRowId'),
    column: getAttr(el, 'qualia:column'),
    cellFrom: getNumAttr(el, 'qualia:from'),
    cellTo: getNumAttr(el, 'qualia:to'),
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

    const memo = getTextContent(el, 'MemoText');
    links.push({
      guid,
      label,
      directed: direction === 'OneWay',
      originGuid,
      targetGuid,
      memo,
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
  participation: ImportParticipation;
}

export type ImportParticipation =
  | { mode: 'read-only' }
  | { mode: 'imported-coder'; userGuid: string }
  | { mode: 'local-default' };

/** Preview info extracted from a QDPX before full import. */
export interface ImportPreview {
  projectName: string;
  origin?: string;
  codeCount: number;
  codingCount: number;
  /** Declared users that authored at least one importable QDPX coding. */
  participatingUsers: ParsedQdpxUser[];
  users: ParsedQdpxUser[];
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

  const qdeKey = files['project.qde'] ? 'project.qde' : Object.keys(files).find(k => k.endsWith('.qde'));
  if (!qdeKey) throw new Error('Invalid QDPX: no .qde file found');
  const qdeData = files[qdeKey]!;
  if (!qdeData) throw new Error('Invalid QDPX: .qde entry is empty');

  const xml = strFromU8(qdeData);
  const doc = parseXml(xml);

  const origin = getAttr(doc.documentElement, 'origin');
  const projectName = getAttr(doc.documentElement, 'name') ?? 'Imported Project';
  const codebook = parseCodebook(doc);
  const sources = parseSources(doc);
  const users = parseQdpxUsers(doc);

  const participatingUsers = getParticipatingQdpxUsers(users, sources);
  const notes = parseNotes(doc);
  const links = parseLinks(doc);

  const hierarchyCount = codebook.codes.filter(c => c.parentGuid).length;
  const selectionCount = sources.reduce((sum, s) => sum + s.selections.length, 0);
  const codingCount = sources.reduce(
    (total, source) => total + source.selections.reduce((sum, selection) => sum + selection.codings.length, 0),
    0,
  );
  const conflictingCodes = codebook.codes
    .filter(c => registry.getByName(c.name) !== undefined)
    .map(c => c.name);

  return {
    projectName,
    origin,
    codeCount: codebook.codes.length,
    codingCount,
    participatingUsers,
    users,
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
  plugin: Pick<QualiaCodingPlugin, 'coderRegistry' | 'setCodingParticipation'>,
  caseVariablesRegistry?: CaseVariablesRegistry,
  sourceHashRegistry?: import('../core/icr/sourceHashRegistry').SourceHashRegistry,
): Promise<ImportResult> {
  const result: ImportResult = {
    codesCreated: 0, codesMerged: 0, sourcesImported: 0,
    segmentsCreated: 0, memosImported: 0, relationsImported: 0,
    warnings: [],
  };

  // 1. Unzip
  const files = unzipSync(new Uint8Array(zipData));
  const qdeKey = files['project.qde'] ? 'project.qde' : Object.keys(files).find(k => k.endsWith('.qde'));
  if (!qdeKey) throw new Error('Invalid QDPX: no .qde file found');
  const qdeData = files[qdeKey]!;
  if (!qdeData) throw new Error('Invalid QDPX: .qde entry is empty');

  const xml = strFromU8(qdeData);
  const doc = parseXml(xml);

  // 2. Parse all sections
  const codebook = parseCodebook(doc);
  const sources = parseSources(doc);
  const parsedUsers = parseQdpxUsers(doc);

  const participatingUsers = getParticipatingQdpxUsers(parsedUsers, sources);
  const notes = parseNotes(doc);
  const links = parseLinks(doc);

  const userGuidToCoderId = new Map<string, CoderId>();
  for (const user of participatingUsers) {
    const coder = plugin.coderRegistry.resolveOrCreateExternalHuman(user.name, {
      scheme: 'refi-qda-user-guid',
      value: user.guid,
    });
    userGuidToCoderId.set(user.guid, coder.id);
  }

  if (options.participation.mode === 'read-only') {
    plugin.setCodingParticipation('read-only');
  } else if (options.participation.mode === 'local-default') {
    plugin.setCodingParticipation('active', DEFAULT_CODER_ID);
  } else {
    const coderId = userGuidToCoderId.get(options.participation.userGuid);
    if (!coderId) throw new Error('Selected QDPX coder was not found in the imported Users registry');
    plugin.setCodingParticipation('active', coderId);
  }

  // 3. Import codes
  const cbResult = applyCodebook(codebook, registry, options.conflictStrategy, notes);
  result.codesCreated = cbResult.created;
  result.codesMerged = cbResult.merged;
  result.warnings.push(...cbResult.warnings);
  const resolver: GuidResolver = {
    codes: cbResult.codeGuidMap,
    sources: new Map(),
    selections: new Map(),
    smartCodes: new Map(),
  };

  // 3b. Parse <Sets> (Code Groups) — pure regex over the raw XML
  const setsResult = parseSetsFromXml(xml);
  for (const groupData of setsResult.groups) {
    const g = registry.createGroup(groupData.name);
    if (groupData.hadExplicitColor) {
      registry.setGroupColor(g.id, groupData.color);
    }
    if (groupData.description) {
      registry.setGroupDescription(g.id, groupData.description);
    }
    if (groupData.memo) {
      registry.setGroupMemo(g.id, groupData.memo);
    }
    const membership = setsResult.memberships.find(m => m.groupName === groupData.name);
    if (membership) {
      for (const memberGuid of membership.memberCodeGuids) {
        const codeId = cbResult.codeGuidMap.get(memberGuid);
        if (codeId) {
          registry.addCodeToGroup(codeId, g.id);
        } else {
          result.warnings.push(`Set "${groupData.name}": MemberCode guid ${memberGuid} não resolve a código conhecido`);
        }
      }
    }
  }
  result.warnings.push(...setsResult.warnings);

  // 4. Extract source files to vault
  const importDir = `imports/${options.projectName}`;
  await ensureFolder(app.vault, importDir);

  for (const src of sources) {
    try {
      const filePath = await extractSource(src, files, app.vault, importDir, options.keepOriginalSources, sourceHashRegistry);
      if (filePath) {
        resolver.sources.set(src.guid, filePath);
        result.sourcesImported++;

        // 5. Create markers from selections
        const created = await createMarkersForSource(
          src, filePath, resolver, notes, userGuidToCoderId, app, dataManager, result, files,
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
  annotatePdfMarkersWithContinuedBy(links, resolver, dataManager);

  // 8b. Import Smart Codes (Tier 3) — após sets/cases pra resolver refs corretamente
  const scResult = parseSmartCodes(xml, resolver);
  if (scResult.smartCodes.length > 0) {
    const data = (dataManager as any).getDataRef();
    if (!data.smartCodes) data.smartCodes = { definitions: {}, order: [], nextPaletteIndex: 0 };
    for (const sc of scResult.smartCodes) {
      data.smartCodes.definitions[sc.id] = sc;
      data.smartCodes.order.push(sc.id);
    }
    dataManager.setSection('smartCodes', data.smartCodes);
  }
  if (scResult.smartCodes.length > 0) {
    result.warnings.push(`Imported ${scResult.smartCodes.length} smart codes`);
  }
  result.warnings.push(...scResult.warnings);

  reportQdpxPdfImportDiagnostics(sources, links, resolver, dataManager);

  try {
    result.auditPath = await writeQdpxImportAudit(
      app.vault,
      importDir,
      options.projectName,
      options.participation,
      sources,
      parsedUsers,
      participatingUsers,
      userGuidToCoderId,
      resolver,
      dataManager,
    );
  } catch (err) {
    result.warnings.push(`Could not write QDPX import audit: ${(err as Error).message}`);
  }

  // 9. Flush
  dataManager.markDirty();
  await dataManager.flush();

  return result;
}

function hasPdfSelectionBBox(sel: ParsedSelection): boolean {
	return sel.firstX !== undefined && sel.firstY !== undefined
		&& sel.secondX !== undefined && sel.secondY !== undefined;
}

export function buildPdfMultipageFragmentHints(src: ParsedSource): Map<string, QdpxMultipageFragmentHint> {
	const hints = new Map<string, QdpxMultipageFragmentHint>();
	for (const group of detectQdpxPdfMultipageGroups(src.selections)) {
		for (const sel of group.fragments) {
			hints.set(sel.guid, {
				source: 'qdpx-multipage-fragment',
				groupId: group.anchorGuid,
				role: sel.guid === group.anchorGuid ? 'anchor' : 'continuation',
				relatedSelectionGuids: group.selectionGuids,
			});
		}
	}

	return hints;
}

function collectPairedPdfSelectionStats(src: ParsedSource): {
	pdfSelections: number;
	pdfSelectionsWithBBox: number;
	plainTextSelections: number;
	pairedSelections: number;
	pairedSelectionsWithBBox: number;
} {
	const byGuid = new Map<string, { pdf?: ParsedSelection; text?: ParsedSelection }>();
	let pdfSelections = 0;
	let pdfSelectionsWithBBox = 0;
	let plainTextSelections = 0;

	for (const sel of src.selections) {
		if (!sel.guid) continue;
		const entry = byGuid.get(sel.guid) ?? {};
		if (sel.type === 'PDFSelection') {
			pdfSelections++;
			if (hasPdfSelectionBBox(sel)) pdfSelectionsWithBBox++;
			entry.pdf = sel;
		} else if (sel.type === 'PlainTextSelection') {
			plainTextSelections++;
			entry.text = sel;
		}
		byGuid.set(sel.guid, entry);
	}

	let pairedSelections = 0;
	let pairedSelectionsWithBBox = 0;
	for (const pair of byGuid.values()) {
		if (!pair.pdf || !pair.text) continue;
		pairedSelections++;
		if (hasPdfSelectionBBox(pair.pdf)) pairedSelectionsWithBBox++;
	}

	return { pdfSelections, pdfSelectionsWithBBox, plainTextSelections, pairedSelections, pairedSelectionsWithBBox };
}

function reportQdpxPdfImportDiagnostics(
	sources: ParsedSource[],
	links: ParsedLink[],
	resolver: GuidResolver,
	dataManager: DataManager,
): void {
	const pdfSources = sources.filter((src) => src.type === 'pdf');
	if (pdfSources.length === 0) return;

	const markers = dataManager.section('pdf').markers as PdfMarker[];
	const rows = pdfSources.map((src) => {
		const filePath = resolver.sources.get(src.guid) ?? '';
		const sourceMarkers = markers.filter((m) => m.fileId === filePath);
		const pending = sourceMarkers.filter((m) => m.beginIndex === 0 && m.beginOffset === 0 && m.endIndex === 0 && m.endOffset === 0);
		const stats = collectPairedPdfSelectionStats(src);
		return {
			source: src.name,
			filePath,
			pdfSelections: stats.pdfSelections,
			pdfSelectionsWithBBox: stats.pdfSelectionsWithBBox,
			plainTextSelections: stats.plainTextSelections,
			pairedSelections: stats.pairedSelections,
			pairedSelectionsWithBBox: stats.pairedSelectionsWithBBox,
			textMarkers: sourceMarkers.length,
			textMarkersWithBBox: sourceMarkers.filter((m) => !!m.importedPdfSelectionBBox).length,
			pendingTextMarkers: pending.length,
			pendingTextMarkersWithBBox: pending.filter((m) => !!m.importedPdfSelectionBBox).length,
		};
	});

	const samples = markers
		.filter((m) => m.id.startsWith('import_') && !m.importedPdfSelectionBBox)
		.slice(0, 20)
		.map((m) => ({
			filePath: m.fileId,
			page: m.page,
			markerId: m.id,
			textLength: m.text?.length ?? 0,
			textPreview: (m.text ?? '').replace(/\s+/g, ' ').slice(0, 120),
		}));

	console.groupCollapsed(`[qualia-coding] QDPX PDF import bbox diagnostics (${rows.length} PDF sources)`);
	console.table(rows);
	if (samples.length > 0) {
		console.table(samples);
	}
	console.groupEnd();

	reportQdpxPdfContinuedByDiagnostics(sources, links, resolver, markers);
}

interface QdpxPdfAuditStats {
	markers: number;
	applications: number;
	segments: number;
}

/**
 * Writes a human-readable snapshot of the imported PDF coding distribution.
 * It intentionally reports every declared QDPX user, including users with zero
 * applications, so an absent coder is distinguishable from a failed import.
 */
async function writeQdpxImportAudit(
	vault: Vault,
	importDir: string,
	projectName: string,
	participation: ImportParticipation,
	sources: ParsedSource[],
	declaredUsers: ParsedQdpxUser[],
	participatingUsers: ParsedQdpxUser[],
	userGuidToCoderId: Map<string, CoderId>,
	resolver: GuidResolver,
	dataManager: DataManager,
): Promise<string> {
	const pdfSources = sources.filter((source) => source.type === 'pdf');
	const importedMarkers = (dataManager.section('pdf').markers as PdfMarker[])
		.filter((marker) => marker.id.startsWith('import_'));
	const userColumns = participatingUsers.map((user) => ({
		name: user.name,
		coderId: userGuidToCoderId.get(user.guid),
	}));

	const statsFor = (fileId: string | undefined, coderId?: CoderId): QdpxPdfAuditStats => {
		if (!coderId) return { markers: 0, applications: 0, segments: 0 };
		const markers = importedMarkers.filter((marker) =>
			marker.fileId === fileId && marker.codedBy === coderId,
		);
		return {
			markers: markers.length,
			applications: markers.reduce((total, marker) => total + marker.codes.length, 0),
			segments: markers.reduce((total, marker) => total + (marker.segments?.length ?? 1), 0),
		};
	};
	const unattributedStatsFor = (fileId: string | undefined): QdpxPdfAuditStats => {
		const markers = importedMarkers.filter((marker) =>
			marker.fileId === fileId && !marker.codedBy,
		);
		return {
			markers: markers.length,
			applications: markers.reduce((total, marker) => total + marker.codes.length, 0),
			segments: markers.reduce((total, marker) => total + (marker.segments?.length ?? 1), 0),
		};
	};
	const totalFor = (coderId?: CoderId): QdpxPdfAuditStats => ({
		markers: coderId ? importedMarkers.filter((marker) => marker.codedBy === coderId).length : 0,
		applications: importedMarkers
			.filter((marker) => coderId !== undefined && marker.codedBy === coderId)
			.reduce((total, marker) => total + marker.codes.length, 0),
		segments: coderId
			? importedMarkers
				.filter((marker) => marker.codedBy === coderId)
				.reduce((total, marker) => total + (marker.segments?.length ?? 1), 0)
			: 0,
	});
	const totalUnattributed = (): QdpxPdfAuditStats => ({
		markers: importedMarkers.filter((marker) => !marker.codedBy).length,
		applications: importedMarkers
			.filter((marker) => !marker.codedBy)
			.reduce((total, marker) => total + marker.codes.length, 0),
		segments: importedMarkers
			.filter((marker) => !marker.codedBy)
			.reduce((total, marker) => total + (marker.segments?.length ?? 1), 0),
	});
	const cell = (stats: QdpxPdfAuditStats) => `${stats.markers} / ${stats.applications} / ${stats.segments}`;
	const escapeCell = (value: string) => value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
	const participationLabel = describeQdpxImportParticipation(participation, declaredUsers);
	const declaredWithoutCodings = declaredUsers.filter((declared) =>
		!participatingUsers.some((participant) => participant.guid === declared.guid),
	);
	const header = ['Documento', ...userColumns.map((user) => escapeCell(user.name)), 'Sem autoria'];
	const separator = header.map(() => '---');
	const rows = pdfSources.map((source) => {
		const fileId = resolver.sources.get(source.guid);
		return [
			escapeCell(source.name),
			...userColumns.map((user) => cell(statsFor(fileId, user.coderId))),
			cell(unattributedStatsFor(fileId)),
		];
	});
	const totals = [
		'**Total**',
		...userColumns.map((user) => cell(totalFor(user.coderId))),
		cell(totalUnattributed()),
	];
	const lines = [
		`# Auditoria da importação QDPX — ${projectName}`,
		'',
		`Gerado em: ${new Date().toISOString()}`,
		`Participação selecionada após a importação: ${participationLabel}`,
		'',
		'## Como ler',
		'',
		'- Cada célula usa `markers / aplicações de código / segmentos PDF`.',
		'- A pessoa selecionada controla apenas quais markers podem ser editados. Todos os markers importados continuam visíveis.',
		'- Um valor `0 / 0 / 0` é uma ausência declarada no arquivo importado, não uma inferência da interface.',
		'- “Sem autoria” reúne aplicações cujo proprietário não pôde ser resolvido; esses markers permanecem somente leitura.',
		'',
		'## PDF por pessoa',
		'',
		`| ${header.join(' | ')} |`,
		`| ${separator.join(' | ')} |`,
		...rows.map((row) => `| ${row.join(' | ')} |`),
		`| ${totals.join(' | ')} |`,
		'',
		'## Codificadores participantes',
		'',
		...participatingUsers.map((user) => `- ${user.name}`),
		'',
		'## Usuários declarados sem aplicações',
		'',
		...(declaredWithoutCodings.length > 0
			? declaredWithoutCodings.map((user) => `- ${user.name}`)
			: ['- Nenhum.']),
		'',
		'_Este arquivo é um artefato de auditoria da importação; não é usado pelo plugin durante a codificação._',
		'',
	];
	const auditPath = `${importDir}/qdpx-import-audit.md`;
	await vault.adapter.write(auditPath, lines.join('\n'));
	return auditPath;
}

/**
 * QDPX may declare application accounts that never coded the exported project
 * (for example, a product account or the person who only opened the file).
 * Only people referenced by a Coding element participate in Qualia's ICR UI.
 */
function getParticipatingQdpxUsers(
	users: ParsedQdpxUser[],
	sources: ParsedSource[],
): ParsedQdpxUser[] {
	const authorGuids = new Set<string>();
	for (const source of sources) {
		for (const selection of source.selections) {
			for (const coding of selection.codings) {
				if (coding.creatingUserGuid) authorGuids.add(coding.creatingUserGuid);
			}
		}
	}
	return users.filter((user) => authorGuids.has(user.guid));
}

function describeQdpxImportParticipation(
	participation: ImportParticipation,
	users: ParsedQdpxUser[],
): string {
	if (participation.mode === 'read-only') return 'Somente leitura — não interferir no ICR';
	if (participation.mode === 'local-default') return 'Perfil padrão deste vault — participar como novo codificador';
	return users.find((user) => user.guid === participation.userGuid)?.name
		?? 'Codificador importado não identificado';
}

function annotatePdfMarkersWithContinuedBy(
	links: ParsedLink[],
	resolver: GuidResolver,
	dataManager: DataManager,
): void {
	const continuedByLinks = links.filter((link) => link.label.trim().toLowerCase() === 'continued by');
	if (continuedByLinks.length === 0) return;

	const pdfData = dataManager.section('pdf');
	const markerById = new Map((pdfData.markers as PdfMarker[]).map((marker) => [marker.id, marker]));
	let changed = false;

	for (const link of continuedByLinks) {
		for (const originMarkerId of getResolvedSelections(resolver, link.originGuid)) {
			const marker = markerById.get(originMarkerId);
			if (marker) {
				addContinuedByHint(marker, 'origin', link.guid, link.targetGuid);
				changed = true;
			}
		}
		for (const targetMarkerId of getResolvedSelections(resolver, link.targetGuid)) {
			const marker = markerById.get(targetMarkerId);
			if (marker) {
				addContinuedByHint(marker, 'target', link.guid, link.originGuid);
				changed = true;
			}
		}
	}

	if (changed) dataManager.setSection('pdf', pdfData);
}

function addContinuedByHint(
	marker: PdfMarker,
	role: 'origin' | 'target',
	linkId: string,
	relatedSelectionGuid: string,
): void {
	const current = marker.importedQdpxContinuedBy;
	if (!current) {
		marker.importedQdpxContinuedBy = {
			source: 'qdpx-continued-by',
			role,
			linkIds: [linkId],
			relatedSelectionGuids: [relatedSelectionGuid],
		};
		return;
	}

	current.role = current.role === role ? current.role : 'both';
	if (!current.linkIds.includes(linkId)) current.linkIds.push(linkId);
	if (!current.relatedSelectionGuids.includes(relatedSelectionGuid)) {
		current.relatedSelectionGuids.push(relatedSelectionGuid);
	}
}

interface QdpxPdfContinuedByDiagnostics {
	rows: Array<{
		source: string;
		filePath: string;
		pdfSelections: number;
		plainTextSelections: number;
		pairedSelections: number;
		continuedByLinks: number;
		continuedBySelectionEndpoints: number;
		continuedByMappedMarkers: number;
		continuedByPendingMarkers: number;
		continuedByShortTextMarkersLt64: number;
		continuedByPendingShortTextMarkersLt64: number;
		continuedByMarkersWithBBox: number;
		continuedByPendingMarkersWithBBox: number;
		continuedByUnmappedEndpoints: number;
	}>;
	samples: Array<{
		source: string;
		filePath: string;
		linkId: string;
		originGuid: string;
		targetGuid: string;
		originMarkerId: string | undefined;
		targetMarkerId: string | undefined;
		originPending: boolean | undefined;
		targetPending: boolean | undefined;
		originTextLength: number | undefined;
		targetTextLength: number | undefined;
		originTextPreview: string;
		targetTextPreview: string;
		originHasBBox: boolean | undefined;
		targetHasBBox: boolean | undefined;
	}>;
}

export function collectQdpxPdfContinuedByDiagnostics(
	sources: ParsedSource[],
	links: ParsedLink[],
	resolver: GuidResolver,
	markers: PdfMarker[],
): QdpxPdfContinuedByDiagnostics {
	const pdfSources = sources.filter((src) => src.type === 'pdf');
	const selectionToSource = new Map<string, ParsedSource>();
	const selectionToParsed = new Map<string, ParsedSelection>();
	const markerById = new Map(markers.map((m) => [m.id, m]));
	const continuedByLinks = links.filter((link) => link.label.trim().toLowerCase() === 'continued by');

	for (const src of pdfSources) {
		for (const sel of src.selections) {
			if (!sel.guid) continue;
			selectionToSource.set(sel.guid, src);
			selectionToParsed.set(sel.guid, sel);
		}
	}

	const rows = pdfSources.map((src) => {
		const filePath = resolver.sources.get(src.guid) ?? '';
		const stats = collectPairedPdfSelectionStats(src);
		const sourceLinks = continuedByLinks.filter((link) =>
			selectionToSource.get(link.originGuid) === src || selectionToSource.get(link.targetGuid) === src
		);
		const endpointGuids = new Set<string>();
		for (const link of sourceLinks) {
			if (selectionToSource.get(link.originGuid) === src) endpointGuids.add(link.originGuid);
			if (selectionToSource.get(link.targetGuid) === src) endpointGuids.add(link.targetGuid);
		}
		const mappedMarkerIds = [...endpointGuids]
			.flatMap((guid) => getResolvedSelections(resolver, guid));
		const mappedMarkers = mappedMarkerIds
			.map((id) => markerById.get(id))
			.filter((marker): marker is PdfMarker => !!marker);
		const pendingMarkers = mappedMarkers.filter(isImportedPdfMarkerPending);
		const shortTextMarkers = mappedMarkers.filter((m) => (m.text?.length ?? 0) < 64);
		const pendingShortTextMarkers = shortTextMarkers.filter(isImportedPdfMarkerPending);

		return {
			source: src.name,
			filePath,
			pdfSelections: stats.pdfSelections,
			plainTextSelections: stats.plainTextSelections,
			pairedSelections: stats.pairedSelections,
			continuedByLinks: sourceLinks.length,
			continuedBySelectionEndpoints: endpointGuids.size,
			continuedByMappedMarkers: mappedMarkers.length,
			continuedByPendingMarkers: pendingMarkers.length,
			continuedByShortTextMarkersLt64: shortTextMarkers.length,
			continuedByPendingShortTextMarkersLt64: pendingShortTextMarkers.length,
			continuedByMarkersWithBBox: mappedMarkers.filter((m) => !!m.importedPdfSelectionBBox).length,
			continuedByPendingMarkersWithBBox: pendingMarkers.filter((m) => !!m.importedPdfSelectionBBox).length,
			continuedByUnmappedEndpoints: endpointGuids.size - mappedMarkers.length,
		};
	}).filter((row) => row.continuedByLinks > 0 || row.continuedByPendingMarkers > 0 || row.continuedByUnmappedEndpoints > 0);

	const samples = continuedByLinks.flatMap((link) => {
		const originSource = selectionToSource.get(link.originGuid);
		const targetSource = selectionToSource.get(link.targetGuid);
		const source = originSource ?? targetSource;
		if (!source || source.type !== 'pdf') return [];

		const originMarkerId = getResolvedSelections(resolver, link.originGuid)[0];
		const targetMarkerId = getResolvedSelections(resolver, link.targetGuid)[0];
		const originMarker = originMarkerId ? markerById.get(originMarkerId) : undefined;
		const targetMarker = targetMarkerId ? markerById.get(targetMarkerId) : undefined;
		const originSelection = selectionToParsed.get(link.originGuid);
		const targetSelection = selectionToParsed.get(link.targetGuid);

		if (!originMarker && !targetMarker) return [];
		if (originMarker && targetMarker && !isImportedPdfMarkerPending(originMarker) && !isImportedPdfMarkerPending(targetMarker)) return [];

		return [{
			source: source.name,
			filePath: resolver.sources.get(source.guid) ?? '',
			linkId: link.guid,
			originGuid: link.originGuid,
			targetGuid: link.targetGuid,
			originMarkerId,
			targetMarkerId,
			originPending: originMarker ? isImportedPdfMarkerPending(originMarker) : undefined,
			targetPending: targetMarker ? isImportedPdfMarkerPending(targetMarker) : undefined,
			originTextLength: originMarker?.text?.length ?? originSelection?.name?.length,
			targetTextLength: targetMarker?.text?.length ?? targetSelection?.name?.length,
			originTextPreview: previewDiagnosticText(originMarker?.text ?? originSelection?.name ?? ''),
			targetTextPreview: previewDiagnosticText(targetMarker?.text ?? targetSelection?.name ?? ''),
			originHasBBox: originMarker ? !!originMarker.importedPdfSelectionBBox : hasPdfSelectionBBox(originSelection ?? ({} as ParsedSelection)),
			targetHasBBox: targetMarker ? !!targetMarker.importedPdfSelectionBBox : hasPdfSelectionBBox(targetSelection ?? ({} as ParsedSelection)),
		}];
	}).slice(0, 12);

	return { rows, samples };
}

function reportQdpxPdfContinuedByDiagnostics(
	sources: ParsedSource[],
	links: ParsedLink[],
	resolver: GuidResolver,
	markers: PdfMarker[],
): void {
	const diagnostics = collectQdpxPdfContinuedByDiagnostics(sources, links, resolver, markers);
	if (diagnostics.rows.length === 0) return;

	console.groupCollapsed(`[qualia-coding] QDPX PDF continued-by diagnostics (${diagnostics.rows.length} PDF sources)`);
	console.table(diagnostics.rows);
	if (diagnostics.samples.length > 0) {
		console.table(diagnostics.samples);
	}
	console.groupEnd();
}

function isImportedPdfMarkerPending(marker: PdfMarker): boolean {
	return marker.beginIndex === 0 && marker.beginOffset === 0 && marker.endIndex === 0 && marker.endOffset === 0;
}

function previewDiagnosticText(text: string): string {
	return text.replace(/\s+/g, ' ').trim().slice(0, 140);
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
  sourceHashRegistry?: import('../core/icr/sourceHashRegistry').SourceHashRegistry,
): Promise<string | null> {
  const baseName = src.name.replace(/\.\w+$/, '');
  const ext = src.path?.match(/\.(\w+)$/)?.[1] ?? '';
  const destPath = ext ? `${importDir}/${baseName}.${ext}` : `${importDir}/${baseName}`;

  if (src.type === 'text') {
    // TextSource → .md. Write the plainText as-is so QDPX offsets map 1:1 to the vault file.
    // Use adapter.write (direct FS) so files persist even if Obsidian closes before vault flush.
    const txtPath = resolveInternalPath(src.plainTextPath);
    const txtData = txtPath ? zipFiles[txtPath] : undefined;
    if (!txtData) return null;

    const text = strFromU8(txtData);
    const mdPath = destPath.replace(/\.\w+$/, '.md');

    // Dedup via hash: se algum source no vault já tem mesmo hash, reusa em vez de criar duplicata
    if (sourceHashRegistry) {
      const { computeSourceHash } = await import('../core/icr/computeSourceHash');
      const incomingHash = await computeSourceHash(txtData.buffer as ArrayBuffer);
      const matches = sourceHashRegistry.findByHash(incomingHash);
      if (matches.length > 0) return matches[0]!;
    }

    await vault.adapter.write(mdPath, text);
    if (sourceHashRegistry) {
      // Register hash do new source pra futuras dedups
      await sourceHashRegistry.getOrCompute(mdPath).catch(() => { /* swallow — non-critical */ });
    }
    return mdPath;
  }

  // Binary sources (PDF, image, audio, video, tabular CSV/parquet).
  const binPath = resolveInternalPath(src.path);
  const binData = binPath ? zipFiles[binPath] : undefined;
  if (!binData) return null;

  // Dedup via hash
  if (sourceHashRegistry) {
    const { computeSourceHash } = await import('../core/icr/computeSourceHash');
    const incomingHash = await computeSourceHash(binData.buffer as ArrayBuffer);
    const matches = sourceHashRegistry.findByHash(incomingHash);
    if (matches.length > 0) return matches[0]!;
  }

  await vault.adapter.writeBinary(destPath, binData.buffer as ArrayBuffer);
  if (sourceHashRegistry) {
    await sourceHashRegistry.getOrCompute(destPath).catch(() => { /* swallow — non-critical */ });
  }
  return destPath;
}

export function resolveInternalPath(path: string | undefined): string | undefined {
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

interface ResolvedCoderApplications {
  creatingUserGuid?: string;
  coderId?: CoderId;
  codes: CodeApplication[];
}

function resolveCoderApplications(
  sel: ParsedSelection,
  resolver: GuidResolver,
  notes: Map<string, ParsedNote>,
  userGuidToCoderId: Map<string, CoderId>,
  result: ImportResult,
): ResolvedCoderApplications[] {
  return groupCodingsByUser(sel.codings).flatMap((group) => {
    const coderId = group.creatingUserGuid
      ? userGuidToCoderId.get(group.creatingUserGuid)
      : undefined;
    if (!coderId) {
      result.warnings.push(
        `Selection ${sel.guid}: Coding owner ${group.creatingUserGuid ?? 'missing'} is unresolved and will remain read-only`,
      );
    }

    const byCodeId = new Map<string, CodeApplication>();
    for (const coding of group.codings) {
      const codeId = resolver.codes.get(coding.codeGuid);
      if (!codeId) continue;
      const current = byCodeId.get(codeId);
      if (current) {
        current.qdpx!.sourceCodingGuids = [...new Set([
          ...current.qdpx!.sourceCodingGuids,
          ...coding.sourceCodingGuids,
        ])];
        continue;
      }

      const application: CodeApplication = {
        codeId,
        qdpx: {
          source: 'refi-qda-coding',
          sourceCodingGuids: [...coding.sourceCodingGuids],
          creatingUserGuid: coding.creatingUserGuid,
          creationDateTime: coding.createdAt,
        },
      };
      for (const noteGuid of coding.noteGuids) {
        const note = notes.get(noteGuid);
        if (note?.magnitude) {
          application.magnitude = note.magnitude;
          break;
        }
      }
      byCodeId.set(codeId, application);
    }

    const codes = [...byCodeId.values()];
    return codes.length > 0 ? [{
      creatingUserGuid: group.creatingUserGuid,
      coderId,
      codes,
    }] : [];
  });
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
  userGuidToCoderId: Map<string, CoderId>,
  app: App,
  dataManager: DataManager,
  result: ImportResult,
  zipFiles: Record<string, Uint8Array>,
): Promise<number> {
  let count = 0;

  // Keep QDPX Representation text separate from PDF.js text. Ordinary imports
  // use the former; logical multipage imports compare both textual universes.
  let qdpxRepresentationText: string | null = null;
  let qdpxRepresentationPageStartOffsets: number[] | null = null;
  let pdfJsData: PdfExportData | null = null;
  let pdfDims: Record<number, { width: number; height: number }> | null = null;

  if (src.type === 'pdf') {
    const reprPath = resolveInternalPath(src.plainTextPath);
    const reprData = reprPath ? zipFiles[reprPath] : undefined;
    if (reprData) {
      qdpxRepresentationText = strFromU8(reprData);
      qdpxRepresentationPageStartOffsets = computePageStartOffsets(qdpxRepresentationText);
    }
    const hasPdfSelections = src.selections.some(s => s.type === 'PDFSelection');
    if (hasPdfSelections) {
      try {
        pdfJsData = await loadPdfExportData(app, filePath);
        pdfDims = pdfJsData.pageDims;
      } catch (err) {
        result.warnings.push(`PDF ${filePath}: failed to load PDF.js text/dimensions; multipage ranges remain pending and shapes use US Letter defaults (${(err as Error).message})`);
      }
    }
  }

  // Correlate PDFSelection + PlainTextSelection by GUID (ATLAS.ti pattern)
  let selectionsToProcess = src.selections;
  if (src.type === 'pdf') {
    const multipageGroups = detectQdpxPdfMultipageGroups(src.selections);
    const consumedSelections = new Set<ParsedSelection>();
    for (const group of multipageGroups) {
      group.fragments.forEach((fragment) => consumedSelections.add(fragment));
      consumedSelections.add(group.plainTextSelection);
      const resolution = resolveQdpxMultipageRange({
        group,
        qdpxPlainText: qdpxRepresentationText,
        pdfPlainText: pdfJsData?.plainText ?? null,
        pdfPageStartOffsets: pdfJsData?.pageStartOffsets ?? null,
        pdfPageTextItems: pdfJsData?.pageTextItems ?? null,
      });
      count += createPdfMultipageMarkers({
        group,
        resolution,
        filePath,
        resolver,
        notes,
        userGuidToCoderId,
        dataManager,
        result,
        pdfDims,
      });
    }

    const byGuid = new Map<string, { pdf?: ParsedSelection; text?: ParsedSelection }>();

    for (const sel of src.selections) {
      if (consumedSelections.has(sel)) continue;
      if (!sel.guid) continue;
      const entry = byGuid.get(sel.guid) ?? { pdf: undefined, text: undefined };
      if (sel.type === 'PDFSelection') entry.pdf = sel;
      else if (sel.type === 'PlainTextSelection') entry.text = sel;
      byGuid.set(sel.guid, entry);
    }

    selectionsToProcess = [];
    for (const [, pair] of byGuid.entries()) {
      if (pair.pdf && pair.text) {
        const codings = mergePairedCodings(pair.pdf.codings, pair.text.codings);
        selectionsToProcess.push({
          ...pair.pdf,
          startPosition: pair.text.startPosition,
          endPosition: pair.text.endPosition,
          name: (!pair.pdf.name || pair.pdf.name.length < (pair.text.name?.length ?? 0)) && pair.text.name
            ? pair.text.name
            : pair.pdf.name,
          codings,
          codeGuids: codings.map((coding) => coding.codeGuid),
          noteGuids: [...new Set([...(pair.pdf.noteGuids ?? []), ...(pair.text.noteGuids ?? [])])],
        });
      } else if (pair.pdf) {
        selectionsToProcess.push(pair.pdf);
      } else if (pair.text) {
        // Fallback: process as plain text selection if no PDFSelection exists
        selectionsToProcess.push(pair.text);
      }
    }
  }

  for (const sel of selectionsToProcess) {
    try {
      const memo = resolveMemo(sel, notes);
      const ts = resolveTimestamp(sel.createdAt);

      if (src.type === 'pdf' && !sel.qdpxMultipageFragment) {
        const applicationsByCoder = resolveCoderApplications(sel, resolver, notes, userGuidToCoderId, result);
        for (const applications of applicationsByCoder) {
          const markerId = importedMarkerId(sel.guid, applications.coderId);
          const created = createPdfMarker(
            sel,
            filePath,
            applications.codes,
            memo,
            ts,
            dataManager,
            result,
            qdpxRepresentationText,
            qdpxRepresentationPageStartOffsets,
            pdfDims,
            applications.coderId,
            markerId,
          );
          count += created;
          if (created > 0 && sel.guid) addResolvedSelection(resolver, sel.guid, markerId);
        }
        if (memo && applicationsByCoder.length > 0) result.memosImported++;
        continue;
      }

      const codes = resolveCodeApplications(sel, resolver, notes);
      if (codes.length === 0) continue;
      let created = 0;

      switch (src.type) {
        // 'text' is handled in a separate batch after sources are extracted
        // (see createTextMarkers below — needs file content for offset→lineCh).
        case 'pdf':
          created = createPdfMarker(sel, filePath, codes, memo, ts, dataManager, result, qdpxRepresentationText, qdpxRepresentationPageStartOffsets, pdfDims);
          break;
        case 'picture':
          created = await createImageMarker(sel, filePath, codes, memo, ts, app, dataManager, result);
          break;
        case 'audio':
          created = createMediaMarker(sel, filePath, codes, memo, ts, dataManager, 'audio', result);
          break;
        case 'video':
          created = createMediaMarker(sel, filePath, codes, memo, ts, dataManager, 'video', result);
          break;
        case 'tabular':
          created = createTabularMarker(sel, filePath, codes, memo, ts, dataManager, result);
          break;
      }

      count += created;

      // Map selection GUID for link resolution
      if (created > 0 && sel.guid) addResolvedSelection(resolver, sel.guid, `import_${sel.guid}`);

      if (memo) result.memosImported++;
    } catch (err) {
      result.warnings.push(`Selection ${sel.guid} in ${src.name}: ${(err as Error).message}`);
    }
  }
  return count;
}

function importedMarkerId(selectionGuid: string, coderId: CoderId | undefined): string {
  const owner = (coderId ?? 'unattributed').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `import_${selectionGuid}_${owner}`;
}

interface CreatePdfMultipageMarkersArgs {
  group: QdpxPdfMultipageGroup;
  resolution: QdpxMultipageResolution;
  filePath: string;
  resolver: GuidResolver;
  notes: Map<string, ParsedNote>;
  userGuidToCoderId: Map<string, CoderId>;
  dataManager: DataManager;
  result: ImportResult;
  pdfDims: Record<number, { width: number; height: number }> | null;
}

function importedSegmentBBox(
  fragment: ParsedSelection,
  pdfDims: Record<number, { width: number; height: number }> | null,
) {
  if (fragment.page === undefined
    || fragment.firstX === undefined
    || fragment.firstY === undefined
    || fragment.secondX === undefined
    || fragment.secondY === undefined) return undefined;
  const viewerPage = fragment.page + 1;
  const pageDim = pdfDims?.[fragment.page];
  const coords = atlasPdfTextRectToNormalized(
    fragment.firstX,
    fragment.firstY,
    fragment.secondX,
    fragment.secondY,
    pageDim?.width ?? 612,
    pageDim?.height ?? 792,
  );
  return {
    source: 'qdpx-pdf-selection' as const,
    page: viewerPage,
    x: coords.x,
    y: coords.y,
    w: coords.w,
    h: coords.h,
  };
}

/** Persist one independent logical multipage marker for each Coding owner. */
export function createPdfMultipageMarkers(args: CreatePdfMultipageMarkersArgs): number {
  const anchor = args.group.fragments.find((fragment) => fragment.guid === args.group.anchorGuid)
    ?? args.group.fragments[0]!;
  const representations = [
    anchor,
    args.group.plainTextSelection,
    ...args.group.fragments.filter((fragment) => fragment !== anchor),
  ];
  const codings = mergeQdpxRepresentationCodings(representations);
  const noteGuids = [...new Set(representations.flatMap((selection) => selection.noteGuids))];
  const semanticSelection: ParsedSelection = {
    ...anchor,
    guid: args.group.groupId,
    codings,
    codeGuids: codings.map((coding) => coding.codeGuid),
    noteGuids,
  };
  const applicationsByCoder = resolveCoderApplications(
    semanticSelection,
    args.resolver,
    args.notes,
    args.userGuidToCoderId,
    args.result,
  );
  if (applicationsByCoder.length === 0) return 0;

  const memo = resolveMemo(semanticSelection, args.notes);
  const timestamp = resolveTimestamp(anchor.createdAt);
  const fragmentsByGuid = new Map(args.group.fragments.map((fragment) => [fragment.guid, fragment]));
  const baseSegments = args.resolution.segments.map((segment) => {
    const fragment = segment.importedSelectionGuid
      ? fragmentsByGuid.get(segment.importedSelectionGuid)
      : undefined;
    return {
      ...segment,
      importedPdfSelectionBBox: fragment ? importedSegmentBBox(fragment, args.pdfDims) : undefined,
    };
  });
  const pdfData = args.dataManager.section('pdf');

  for (const applications of applicationsByCoder) {
    const segments = baseSegments.map((segment) => ({
      ...segment,
      importedPdfSelectionBBox: segment.importedPdfSelectionBBox
        ? { ...segment.importedPdfSelectionBBox }
        : undefined,
    }));
    const first = segments[0]!;
    const markerId = importedMarkerId(args.group.groupId, applications.coderId);
    const marker: PdfMarker = {
      markerType: 'pdf',
      id: markerId,
      fileId: args.filePath,
      page: first.page,
      beginIndex: first.beginIndex,
      beginOffset: first.beginOffset,
      endIndex: first.endIndex,
      endOffset: first.endOffset,
      text: args.resolution.text,
      segments,
      codes: applications.codes,
      memo: memo ? { content: memo } : undefined,
      codedBy: applications.coderId,
      importedPdfSelectionBBox: first.importedPdfSelectionBBox,
      importedQdpxSelection: {
        source: 'refi-qda-selection',
        selectionGuid: args.group.anchorGuid,
        selectionGuids: [...args.group.selectionGuids],
        ...(anchor.creatingUserGuid ? { creatingUserGuid: anchor.creatingUserGuid } : {}),
        ...(anchor.name ? { name: anchor.name } : {}),
        ...(anchor.createdAt ? { creationDateTime: anchor.createdAt } : {}),
        ...(applications.coderId ? {} : { unattributedOwner: true as const }),
      },
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    syncPdfMarkerFirstSegmentProjection(marker);
    pdfData.markers.push(marker);
    for (const selectionGuid of args.group.selectionGuids) {
      addResolvedSelection(args.resolver, selectionGuid, markerId);
    }
  }

  args.dataManager.setSection('pdf', pdfData);
  if (memo) args.result.memosImported++;
  if (args.resolution.strategy === 'pending') {
    args.result.warnings.push(
      `Multipage PDF selection ${args.group.groupId}: ${args.resolution.reason ?? 'range remains pending'}`,
    );
  }
  return applicationsByCoder.length;
}

export function createPdfMarker(
	sel: ParsedSelection,
	filePath: string,
	codes: CodeApplication[],
	memo: string | undefined,
	ts: number,
	dataManager: DataManager,
	result: ImportResult,
	pdfPlainText: string | null,
	pdfPageStartOffsets: number[] | null,
	pdfDims: Record<number, { width: number; height: number }> | null,
	codedBy?: CoderId,
	markerId = importedMarkerId(sel.guid, codedBy),
): number {
	const pdfData = dataManager.section('pdf');

	// Prefer a text marker when offsets or a quoted name are available. Imported
	// markers keep placeholder DOM indices; the PDF view resolves them on open.
	if ((sel.startPosition !== undefined && sel.endPosition !== undefined) || sel.name) {
		if (!pdfPlainText) {
			result.warnings.push(`PDF text selection ${sel.guid}: no Representation plain text in QDPX — skip text version`);
		} else {
			const resolution = resolveImportedPdfText(sel, pdfPlainText);
			if (resolution.text === null) {
				result.warnings.push(`PDF text selection ${sel.guid}: could not reconstruct text from Representation`);
			} else {
				const page = resolveImportedPdfPage(sel, pdfPageStartOffsets);
				if (page === null) {
					result.warnings.push(`PDF text selection ${sel.guid}: could not resolve page number`);
				} else {
					const marker: PdfMarker = {
						markerType: 'pdf',
						id: markerId,
						fileId: filePath,
						page,
						beginIndex: 0,
						beginOffset: 0,
						endIndex: 0,
						endOffset: 0,
						text: resolution.text,
						codes,
						memo: memo ? { content: memo } : undefined,
						codedBy,
						...(sel.qdpxMultipageFragment ? {} : {
							importedQdpxSelection: {
								source: 'refi-qda-selection' as const,
								selectionGuid: sel.guid,
								...(sel.creatingUserGuid ? { creatingUserGuid: sel.creatingUserGuid } : {}),
								...(sel.name ? { name: sel.name } : {}),
								...(sel.createdAt ? { creationDateTime: sel.createdAt } : {}),
								...(codedBy ? {} : { unattributedOwner: true as const }),
							},
						}),
						createdAt: ts,
						updatedAt: ts,
					};
					if (sel.firstX !== undefined && sel.firstY !== undefined
						&& sel.secondX !== undefined && sel.secondY !== undefined) {
						const pageDim = pdfDims?.[page - 1];
						const pageWidth = pageDim?.width ?? 612;
						const pageHeight = pageDim?.height ?? 792;
						const coords = atlasPdfTextRectToNormalized(sel.firstX, sel.firstY, sel.secondX, sel.secondY, pageWidth, pageHeight);
						marker.importedPdfSelectionBBox = {
							source: 'qdpx-pdf-selection',
							page,
							x: coords.x,
							y: coords.y,
							w: coords.w,
							h: coords.h,
						};
					}
					const textContext = buildImportedPdfTextContext(sel, pdfPlainText, resolution);
					if (textContext) marker.importedPdfTextContext = textContext;
					if (sel.qdpxMultipageFragment) marker.importedQdpxMultipageFragment = sel.qdpxMultipageFragment;
					pdfData.markers.push(marker);
					dataManager.setSection('pdf', pdfData);
					return 1;
				}
			}
		}
	}

	// Prioridade 2: shape fallback only for shape-like selections.
	// Atlas.ti text quotations arrive as PDFSelection with a `name`, not as real shapes.
	if (sel.firstX !== undefined && sel.firstY !== undefined &&
		sel.secondX !== undefined && sel.secondY !== undefined && sel.page !== undefined &&
		!sel.name) {
		const page = sel.page + 1;

		const pageDim = pdfDims?.[page - 1];
		const pageWidth = pageDim?.width ?? 612;
		const pageHeight = pageDim?.height ?? 792;

		const coords = pdfRectToNormalized(sel.firstX, sel.firstY, sel.secondX, sel.secondY, pageWidth, pageHeight);

		const marker: PdfShapeMarker = {
			markerType: 'pdf',
			id: markerId,
			fileId: filePath,
			codes,
			shape: 'rect',
			coords,
			page,
		memo: memo ? { content: memo } : undefined,
		codedBy,
			createdAt: ts,
			updatedAt: ts,
		};
		pdfData.shapes.push(marker);
		dataManager.setSection('pdf', pdfData);
		return 1;
	}

	return 0;
}

function extractTextFromPlainText(
	plainText: string,
	startPosition: number,
	endPosition: number,
): string | null {
	return sliceQdpxCodepoints(plainText, startPosition, endPosition);
}

function buildImportedPdfTextContext(
	sel: ParsedSelection,
	plainText: string,
	resolution: ImportedPdfTextResolution,
): ImportedPdfTextContext | undefined {
	if (sel.startPosition === undefined || sel.endPosition === undefined) return undefined;
	if (sel.startPosition < 0 || sel.endPosition > qdpxCodepointLength(plainText) || sel.startPosition >= sel.endPosition) return undefined;

	const radius = 160;
	const beforeStart = Math.max(0, sel.startPosition - radius);
	const afterEnd = Math.min(qdpxCodepointLength(plainText), sel.endPosition + radius);
	return {
		source: 'qdpx-plain-text-selection',
		startPosition: sel.startPosition,
		endPosition: sel.endPosition,
		before: sliceQdpxCodepoints(plainText, beforeStart, sel.startPosition) ?? '',
		exact: sliceQdpxCodepoints(plainText, sel.startPosition, sel.endPosition) ?? '',
		after: sliceQdpxCodepoints(plainText, sel.endPosition, afterEnd) ?? '',
		resolutionStrategy: resolution.strategy,
	};
}

function normalizeSelectionName(name: string | undefined): string | null {
	if (!name) return null;
	const trimmed = name
		.replace(/\u2026|\.\.\.$/g, '')
		.replace(/\uFFFD/g, '')
		.replace(/\s+/g, ' ')
		.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function candidateNeedles(name: string): string[] {
	const needles = [name];
	if (name.length > 120) needles.push(name.slice(0, 120).trim());
	if (name.length > 80) needles.push(name.slice(0, 80).trim());
	if (name.length > 48) needles.push(name.slice(0, 48).trim());
	if (name.length > 32) needles.push(name.slice(0, 32).trim());
	return [...new Set(needles.filter(Boolean))];
}

function findNeedleNearHint(haystack: string, needle: string, hint: number | undefined): number {
	if (hint === undefined) return -1;
	const radius = 500;
	const hintCodeUnit = qdpxCodepointToCodeUnit(haystack, hint);
	if (hintCodeUnit === null) return -1;
	const from = Math.max(0, hintCodeUnit - radius);
	const to = Math.min(haystack.length, hintCodeUnit + radius + needle.length);
	const window = haystack.slice(from, to);
	const local = window.indexOf(needle);
	return local >= 0 ? from + local : -1;
}

function buildCanonicalMap(src: string): { canonical: string; map: number[] } {
	const canonicalChars: string[] = [];
	const map: number[] = [];
	let lastWasSpace = false;

	for (let i = 0; i < src.length; i++) {
		const ch = src[i]!;
		if (ch === '\uFFFD') continue;
		if (/\s/.test(ch)) {
			if (lastWasSpace) continue;
			canonicalChars.push(' ');
			map.push(i);
			lastWasSpace = true;
			continue;
		}
		canonicalChars.push(ch.toLowerCase());
		map.push(i);
		lastWasSpace = false;
	}

	map.push(src.length);
	return { canonical: canonicalChars.join(''), map };
}

function findCanonicalNeedle(haystack: string, needle: string): { start: number; end: number } | null {
	const hay = buildCanonicalMap(haystack);
	const ndl = buildCanonicalMap(needle);
	if (!ndl.canonical) return null;
	const idx = hay.canonical.indexOf(ndl.canonical);
	if (idx < 0) return null;
	const start = hay.map[idx];
	const end = hay.map[Math.min(idx + ndl.canonical.length, hay.map.length - 1)];
	if (start === undefined || end === undefined) return null;
	return { start, end };
}

function hasUsableOffsetSlice(sel: ParsedSelection, rawSlice: string | null, normalizedName: string | null): boolean {
	if (!rawSlice) return false;
	if (!normalizedName) return true;
	const normalizedSlice = rawSlice.replace(/\uFFFD/g, '').replace(/\s+/g, ' ').trim();
	if (!normalizedSlice) return false;
	return normalizedSlice.includes(normalizedName.slice(0, Math.min(normalizedName.length, 24)));
}

export function resolveImportedPdfText(sel: ParsedSelection, plainText: string): ImportedPdfTextResolution {
	const rawSlice = sel.startPosition !== undefined && sel.endPosition !== undefined
		? extractTextFromPlainText(plainText, sel.startPosition, sel.endPosition)
		: null;
	const normalizedName = normalizeSelectionName(sel.name);
	if (!normalizedName) return { text: rawSlice, strategy: rawSlice === null ? 'unresolved' : 'offset' };

	if (hasUsableOffsetSlice(sel, rawSlice, normalizedName)) {
		return { text: rawSlice, strategy: 'offset' };
	}

	const expectedLen = sel.startPosition !== undefined && sel.endPosition !== undefined
		? sel.endPosition - sel.startPosition
		: undefined;

	for (const needle of candidateNeedles(normalizedName)) {
		let idx = findNeedleNearHint(plainText, needle, sel.startPosition);
		if (idx < 0) idx = plainText.indexOf(needle);
		if (idx < 0) {
			const canonical = findCanonicalNeedle(plainText, needle);
			if (canonical) {
				const canonicalEnd = expectedLen === undefined ? null : advanceQdpxCodepoints(plainText, canonical.start, expectedLen);
				if (canonicalEnd !== null) {
					return { text: plainText.slice(canonical.start, canonicalEnd), strategy: 'name+length' };
				}
				return { text: plainText.slice(canonical.start, canonical.end), strategy: 'name+prefix' };
			}
			continue;
		}

		const expectedEnd = expectedLen === undefined ? null : advanceQdpxCodepoints(plainText, idx, expectedLen);
		if (expectedEnd !== null) {
			return { text: plainText.slice(idx, expectedEnd), strategy: 'name+length' };
		}
		return { text: plainText.slice(idx, Math.min(plainText.length, idx + needle.length)), strategy: 'name+prefix' };
	}

	return { text: null, strategy: 'unresolved' };
}

export function resolveImportedPdfPage(
	sel: ParsedSelection,
	pageStartOffsets: number[] | null,
): number | null {
	// REFI-QDA PDFSelection pages are zero-based; the PDF viewer is one-based.
	if (sel.page !== undefined) return sel.page + 1;
	if (sel.startPosition === undefined || !pageStartOffsets) return null;

	let pageIdx = 0;
	for (let i = 0; i < pageStartOffsets.length; i++) {
		if (pageStartOffsets[i]! <= sel.startPosition) pageIdx = i;
		else break;
	}
	return pageIdx + 1;
}

/** Count offsets where each page (delimited by \f) begins. */
function computePageStartOffsets(plainText: string): number[] {
  const offsets = [0];
  for (let i = 0; i < plainText.length; i++) {
    if (plainText[i] === '\f') offsets.push(i + 1);
  }
  return offsets;
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

  // Get image dimensions (tries createImageBitmap, falls back to <img> decode for SVG)
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
    markerType: 'image',
    id: `import_${sel.guid}`,
    fileId: filePath,
    codes,
    shape: 'rect',
    coords,
    memo: memo ? { content: memo } : undefined,
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
    markerType: engine,
    id: `import_${sel.guid}`,
    fileId: filePath,
    codes,
    from: msToSeconds(sel.begin),
    to: msToSeconds(sel.end),
    memo: memo ? { content: memo } : undefined,
    createdAt: ts,
    updatedAt: ts,
  };
  (fileEntry as any).markers.push(marker);
  dataManager.setSection(engine, data);
  return 1;
}

// ─── Tabular (CSV/parquet) marker creation ───

/**
 * Build a SegmentMarker (when from/to present) or RowMarker (no from/to) from
 * a `<qualia:CellSelection>`. Round-trip companion to `buildTabularSourceXml`
 * in `qdpxExporter.ts`.
 */
function createTabularMarker(
  sel: ParsedSelection,
  filePath: string,
  codes: CodeApplication[],
  memo: string | undefined,
  ts: number,
  dataManager: DataManager,
  result: ImportResult,
): number {
  if (sel.sourceRowId === undefined || sel.column === undefined) {
    result.warnings.push(`Tabular selection ${sel.guid} in ${filePath}: missing qualia:sourceRowId or qualia:column`);
    return 0;
  }

  const csvData = dataManager.section('csv');
  const id = `import_${sel.guid}`;
  const isSegment = sel.cellFrom !== undefined && sel.cellTo !== undefined;

  if (isSegment) {
    const marker: SegmentMarker = {
      markerType: 'csv',
      id,
      fileId: filePath,
      sourceRowId: sel.sourceRowId,
      column: sel.column,
      from: sel.cellFrom!,
      to: sel.cellTo!,
      codes,
      memo: memo ? { content: memo } : undefined,
      createdAt: ts,
      updatedAt: ts,
    };
    csvData.segmentMarkers.push(marker);
  } else {
    const marker: RowMarker = {
      markerType: 'csv',
      id,
      fileId: filePath,
      sourceRowId: sel.sourceRowId,
      column: sel.column,
      codes,
      memo: memo ? { content: memo } : undefined,
      createdAt: ts,
      updatedAt: ts,
    };
    csvData.rowMarkers.push(marker);
  }

  dataManager.setSection('csv', csvData);
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
        memo: memo ? { content: memo } : undefined,
        createdAt: ts,
        updatedAt: ts,
      };
      mdData.markers[filePath]!.push(marker);
			addResolvedSelection(resolver, sel.guid, marker.id);
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
    const targetCodeId = resolver.codes.get(link.targetGuid);
    const targetMarkerIds = targetCodeId
      ? [targetCodeId]
      : getResolvedSelections(resolver, link.targetGuid);
    if (targetMarkerIds.length === 0) continue;

    // Try code-level origin first
    const originCodeId = resolver.codes.get(link.originGuid);
    if (originCodeId) {
      const originDef = registry.getById(originCodeId);
      if (originDef) for (const targetId of targetMarkerIds) {
        const relation = createImportedRelation(link, targetId);
        const existing = originDef.relations ?? [];
        const dup = existing.some((r) => relationMatches(r, relation));
        if (!dup) {
          registry.update(originCodeId, { relations: [...existing, relation] });
          applied++;
        }
      }
      continue;
    }

    // Otherwise, segment-level (marker → code/marker relation). When both
    // endpoints are selections, prefer the matching owner but preserve every
    // target if the counterpart has no marker for that coder.
    const originMarkerIds = getResolvedSelections(resolver, link.originGuid);
    for (const originMarkerId of originMarkerIds) {
      const targets = targetCodeId
        ? targetMarkerIds
        : (() => {
          const owner = findMarkerOwner(originMarkerId, dataManager);
          const sameOwner = owner
            ? targetMarkerIds.filter((id) => findMarkerOwner(id, dataManager) === owner)
            : [];
          return sameOwner.length > 0 ? sameOwner : targetMarkerIds;
        })();
      for (const targetId of targets) {
        if (applyMarkerRelation(originMarkerId, createImportedRelation(link, targetId), dataManager)) applied++;
      }
    }
  }

  return applied;
}

function createImportedRelation(link: ParsedLink, target: string): CodeRelation {
  return {
    label: link.label,
    target,
    directed: link.directed,
    ...(link.memo ? { memo: { content: link.memo } } : {}),
  };
}

function relationMatches(a: CodeRelation, b: CodeRelation): boolean {
  return a.label === b.label && a.target === b.target && a.directed === b.directed;
}

function findMarkerOwner(markerId: string, dataManager: DataManager): CoderId | undefined {
  const markdown = dataManager.section('markdown');
  for (const markers of Object.values(markdown.markers)) {
    const marker = markers.find((m) => m.id === markerId);
    if (marker) return marker.codedBy;
  }

  const pdf = dataManager.section('pdf');
  const pdfMarker = [...pdf.markers, ...pdf.shapes].find((marker) => marker.id === markerId);
  if (pdfMarker) return pdfMarker.codedBy;

  const image = dataManager.section('image').markers.find((marker) => marker.id === markerId);
  if (image) return image.codedBy;

  const csv = dataManager.section('csv');
  const csvMarker = [...csv.segmentMarkers, ...csv.rowMarkers].find((marker) => marker.id === markerId);
  if (csvMarker) return csvMarker.codedBy;

  for (const engine of ['audio', 'video'] as const) {
    for (const fileEntry of dataManager.section(engine).files) {
      const marker = fileEntry.markers.find((candidate) => candidate.id === markerId);
      if (marker) return marker.codedBy;
    }
  }
  return undefined;
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
			if (existing.some((candidate) => relationMatches(candidate, relation))) return false;
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
			const existing = ca.relations ?? [];
			if (existing.some((candidate) => relationMatches(candidate, relation))) return false;
      ca.relations = [...existing, relation];
      dataManager.setSection('pdf', pdfData);
      return true;
    }
  }

  // Check image
  const imgData = dataManager.section('image');
  const imgMarker = imgData.markers.find(m => m.id === markerId);
  if (imgMarker && imgMarker.codes.length > 0) {
		const existing = imgMarker.codes[0]!.relations ?? [];
		if (existing.some((candidate) => relationMatches(candidate, relation))) return false;
    imgMarker.codes[0]!.relations = [...existing, relation];
    dataManager.setSection('image', imgData);
    return true;
  }

  // Check audio/video
  for (const engine of ['audio', 'video'] as const) {
    const data = dataManager.section(engine);
    for (const fileEntry of data.files) {
      const marker = (fileEntry as any).markers.find((m: any) => m.id === markerId);
      if (marker && marker.codes.length > 0) {
				const existing = marker.codes[0].relations ?? [];
				if (existing.some((candidate: CodeRelation) => relationMatches(candidate, relation))) return false;
        marker.codes[0].relations = [...existing, relation];
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

// ─── Sets / Code Groups (Tier 1.5) ───

export interface ParsedGroup {
  name: string;
  color: string;
  paletteIndex: number;
  description?: string;
  memo?: string;
  hadExplicitColor: boolean;
}

export interface ParseSetsResult {
  groups: ParsedGroup[];
  memberships: Array<{ groupName: string; memberCodeGuids: string[] }>;
  warnings: string[];
}

/**
 * Parse <Set> elements from a CodeBook XML string.
 * Pure function — testable in isolation.
 *
 * Sets sem qualia:color recebem cor auto-atribuída do GROUP_PALETTE em round-robin.
 * <MemberSource> é ignorado com warning (fora de escopo de Code Groups).
 */
export function parseSetsFromXml(codebookXml: string): ParseSetsResult {
  const groups: ParseSetsResult['groups'] = [];
  const memberships: ParseSetsResult['memberships'] = [];
  const warnings: string[] = [];

  // Regex simples — codebook é pequeno; XML parser completo é overkill
  const setsRegex = /<Set\s+([^>]+?)(\/>|>([\s\S]*?)<\/Set>)/g;
  let paletteIdxCounter = 0;

  let match: RegExpExecArray | null;
  while ((match = setsRegex.exec(codebookXml)) !== null) {
    const attrs = match[1]!;
    const inner = match[3] ?? '';

    const nameMatch = attrs.match(/name="([^"]*)"/);
    if (!nameMatch) {
      warnings.push('Set without name attribute, skipping');
      continue;
    }
    const name = nameMatch[1]!;
    const colorMatch = attrs.match(/qualia:color="([^"]*)"/);

    let color: string;
    let paletteIndex: number;
    let hadExplicitColor: boolean;
    if (colorMatch) {
      color = colorMatch[1]!;
      const idx = GROUP_PALETTE.findIndex(c => c.toLowerCase() === color.toLowerCase());
      paletteIndex = idx >= 0 ? idx : -1;
      hadExplicitColor = true;
    } else {
      color = GROUP_PALETTE[paletteIdxCounter % GROUP_PALETTE.length]!;
      paletteIndex = paletteIdxCounter % GROUP_PALETTE.length;
      paletteIdxCounter++;
      hadExplicitColor = false;
    }

    const descMatch = inner.match(/<Description>([\s\S]*?)<\/Description>/);
    const description = descMatch ? decodeXmlEntities(descMatch[1]!) : undefined;

    const memoMatch = inner.match(/<MemoText>([\s\S]*?)<\/MemoText>/);
    const memo = memoMatch ? decodeXmlEntities(memoMatch[1]!) : undefined;

    const memberCodeGuids: string[] = [];
    const memberCodeRegex = /<MemberCode\s+targetGUID="([^"]*)"\s*\/>/g;
    let mm: RegExpExecArray | null;
    while ((mm = memberCodeRegex.exec(inner)) !== null) {
      memberCodeGuids.push(mm[1]!);
    }

    if (/<MemberSource\b/.test(inner)) {
      warnings.push(`Set "${name}": contém <MemberSource> (source-level) — ignorado (fora de escopo de Code Groups)`);
    }

    groups.push({ name, color, description, memo, paletteIndex, hadExplicitColor });
    memberships.push({ groupName: name, memberCodeGuids });
  }

  return { groups, memberships, warnings };
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

// ─── Smart Codes (Tier 3) ───

import type { PredicateNode, SmartCodeDefinition, LeafNode } from '../core/types';
import { isOpNode, isLeafNode } from '../core/smartCodes/types';

export interface ParseSmartCodesResult {
  smartCodes: SmartCodeDefinition[];
  warnings: string[];
}

/** Parse `<qualia:SmartCodes>` block via regex (mesma estratégia do parseSetsFromXml).
 *  Pass 1: aloca todos placeholders + popula resolver.smartCodes.
 *  Pass 2: deserializa predicates + remap refs (incl. smartCode nesting).
 */
export function parseSmartCodes(xml: string, resolver: GuidResolver): ParseSmartCodesResult {
  const warnings: string[] = [];
  const blockMatch = xml.match(/<qualia:SmartCodes[^>]*>([\s\S]*?)<\/qualia:SmartCodes>/);
  if (!blockMatch) return { smartCodes: [], warnings };
  const inner = blockMatch[1]!;
  const scTagRe = /<qualia:SmartCode\s+([^>]+)>([\s\S]*?)<\/qualia:SmartCode>/g;

  // Pass 1: extract attrs + alloc IDs
  interface Allocated {
    oldGuid: string; newId: string; name: string; color: string; predicateRaw: string; memo?: string;
  }
  const allocated: Allocated[] = [];
  for (const m of inner.matchAll(scTagRe)) {
    const attrsStr = m[1]!;
    const body = m[2]!;
    const guidMatch = attrsStr.match(/guid="([^"]+)"/);
    const nameAttr = attrsStr.match(/name="([^"]*)"/);
    const colorMatch = attrsStr.match(/color="([^"]+)"/);
    if (!guidMatch || !nameAttr || !colorMatch) {
      warnings.push('Smart code tag missing required attribute (guid, name, ou color)');
      continue;
    }
    const oldGuid = guidMatch[1]!;
    const name = decodeXmlEntities(nameAttr[1]!);
    const color = colorMatch[1]!;
    const newId = `sc_${generateId()}`;
    resolver.smartCodes.set(oldGuid, newId);
    const predicateRaw = (body.match(/<qualia:Predicate><!\[CDATA\[([\s\S]*?)\]\]><\/qualia:Predicate>/)?.[1] ?? '').trim();
    const memoMatch = body.match(/<qualia:Memo>([\s\S]*?)<\/qualia:Memo>/);
    const memo = memoMatch ? decodeXmlEntities(memoMatch[1]!) : undefined;
    allocated.push({ oldGuid, newId, name, color, predicateRaw, memo });
  }

  // Pass 2: deserialize + remap
  const out: SmartCodeDefinition[] = [];
  for (const a of allocated) {
    let predicate: PredicateNode;
    try { predicate = JSON.parse(a.predicateRaw) as PredicateNode; }
    catch (err) {
      warnings.push(`Failed to parse predicate for smart code "${a.name}"`);
      predicate = { op: 'AND', children: [] };
    }
    const remappedPredicate = remapPredicateRefs(predicate, resolver, warnings, a.name);
    out.push({
      id: a.newId, name: a.name, color: a.color, paletteIndex: -1, createdAt: Date.now(),
      predicate: remappedPredicate,
      ...(a.memo ? { memo: { content: a.memo } } : {}),
    });
  }
  return { smartCodes: out, warnings };
}

function remapPredicateRefs(node: PredicateNode, resolver: GuidResolver, warnings: string[], scName: string): PredicateNode {
  if (isOpNode(node)) {
    if (node.op === 'NOT') return { op: 'NOT', child: remapPredicateRefs(node.child, resolver, warnings, scName) };
    return { op: node.op, children: node.children.map(c => remapPredicateRefs(c, resolver, warnings, scName)) };
  }
  if (!isLeafNode(node)) return node;
  switch (node.kind) {
    case 'hasCode':
    case 'magnitudeGte':
    case 'magnitudeLte': {
      const newId = resolver.codes.get(node.codeId);
      if (!newId) {
        warnings.push(`Smart code "${scName}" references deleted code ${node.codeId}`);
        return node;
      }
      return { ...node, codeId: newId } as LeafNode;
    }
    case 'relationExists': {
      let next: any = { ...node };
      const newCodeId = resolver.codes.get(node.codeId);
      if (newCodeId) next.codeId = newCodeId;
      else warnings.push(`Smart code "${scName}" references deleted code ${node.codeId}`);
      if (node.targetCodeId) {
        const newTarget = resolver.codes.get(node.targetCodeId);
        if (newTarget) next.targetCodeId = newTarget;
      }
      return next as LeafNode;
    }
    case 'smartCode': {
      const newId = resolver.smartCodes.get(node.smartCodeId);
      if (!newId) {
        warnings.push(`Smart code "${scName}" references deleted smart code ${node.smartCodeId}`);
        return node;
      }
      return { ...node, smartCodeId: newId };
    }
    default:
      return node;
  }
}

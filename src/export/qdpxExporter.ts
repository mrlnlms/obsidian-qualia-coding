import { escapeXml, xmlAttr, xmlDeclaration } from './xmlBuilder';
import { predicateToJson } from '../core/smartCodes/predicateSerializer';
import type { SmartCodeDefinition } from '../core/types';
import { buildCodebookXml } from './qdcExporter';
import { buildQdcFile } from './qdcExporter';
import { getMemoContent } from '../core/memoHelpers';
import { zipSync, strToU8 } from 'fflate';
import type { App, Vault, TFile } from 'obsidian';
import type { CodeDefinitionRegistry } from '../core/codeDefinitionRegistry';
import type { CodeApplication, CodeDefinition, BaseMarker as CoreBaseMarker } from '../core/types';
import type { Marker } from '../markdown/models/codeMarkerModel';
import type { MediaMarker } from '../media/mediaTypes';
import type { ImageMarker } from '../image/imageCodingTypes';
import type { PdfMarker, PdfShapeMarker } from '../pdf/pdfCodingTypes';
import type { SegmentMarker, RowMarker } from '../csv/csvCodingTypes';
import { lineChToOffset, mediaToMs, imageToPixels, pdfShapeToRect } from './coordConverters';
import { loadPdfExportData } from '../pdf/pdfExportData';
import { getPdfMarkerSegments, isPdfMarkerSegmentPending } from '../pdf/pdfMarkerSegments';
import type { DataManager } from '../core/dataManager';
import type { CaseVariablesRegistry } from '../core/caseVariables/caseVariablesRegistry';
import { getImageDimensions } from '../core/imageDimensions';
import { renderVariablesForFile, renderCasesXml } from './caseVariablesXml';
import { buildUsersXml, createQdpxAuthoringContext, type QdpxAuthoringContext } from './qdpxAuthoring';
import type { CoderRegistry } from '../core/icr/coderRegistry';
import { buildPdfExportMap, projectPdfMarker, QdpxPdfProjectionError } from './qdpxPdfProjection';
import { buildQdpxPdfSelectionUnits } from './qdpxPdfGrouping';
import { serializeQdpxPdfSelectionUnit, type QdpxLinkDefinition } from './qdpxPdfSerializer';
import { assertQdpxExportAudit, createQdpxExportAudit, type QdpxExportAudit } from './qdpxExportAudit';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(s: string): boolean {
  return UUID_RE.test(s);
}

export function uuidV4(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function ensureGuid(id: string, guidMap: Map<string, string>): string {
  if (isValidUuid(id)) return id;
  const cached = guidMap.get(id);
  if (cached) return cached;
  const guid = uuidV4();
  guidMap.set(id, guid);
  return guid;
}

/** Build <Coding><CodeRef/></Coding> elements for all codes on a selection. */
export function buildCodingXml(
  codes: CodeApplication[],
  guidMap: Map<string, string>,
  createdAt?: number,
  notes?: string[],
  creatingUserGuid?: string,
): string {
  return codes.map(ca => {
    const codingGuid = uuidV4();
    const codeGuid = ensureGuid(ca.codeId, guidMap);
    const importedDate = ca.qdpx?.creationDateTime;
    const dateStr = importedDate && !Number.isNaN(Date.parse(importedDate))
      ? new Date(importedDate).toISOString()
      : createdAt
        ? new Date(createdAt).toISOString()
        : new Date().toISOString();
    let noteRef = '';
    if (ca.magnitude && notes) {
      const noteGuid = `mag_${codingGuid}`;
      notes.push(buildNoteXml(noteGuid, 'Magnitude', `[Magnitude: ${ca.magnitude}]`));
      noteRef = `\n${buildNoteRefXml(noteGuid)}`;
    }
    const authorAttr = creatingUserGuid ? ` ${xmlAttr('creatingUser', creatingUserGuid)}` : '';
    return `<Coding ${xmlAttr('guid', codingGuid)} ${xmlAttr('creationDateTime', dateStr)}${authorAttr}>\n<CodeRef ${xmlAttr('targetGUID', codeGuid)}/>${noteRef}\n</Coding>`;
  }).join('\n');
}

export function buildNoteXml(guid: string, name: string, text: string): string {
  return `<Note ${xmlAttr('guid', guid)} ${xmlAttr('name', name)} ${xmlAttr('creationDateTime', new Date().toISOString())}>\n<PlainTextContent>${escapeXml(text)}</PlainTextContent>\n</Note>`;
}

export function buildNoteRefXml(targetGuid: string): string {
  return `<NoteRef ${xmlAttr('targetGUID', targetGuid)}/>`;
}

function fileName(path: string): string {
  return path.split('/').pop() || path;
}

export function buildTextSourceXml(
  fileId: string,
  markers: Marker[],
  fileContent: string,
  guidMap: Map<string, string>,
  notes: string[],
  srcGuid?: string,
  txtGuid?: string,
  includeSources?: boolean,
  authoring?: QdpxAuthoringContext,
): string {
  const resolvedSrcGuid = srcGuid || uuidV4();
  const resolvedTxtGuid = txtGuid || uuidV4();
  const pathAttr = includeSources
    ? xmlAttr('plainTextPath', `internal://${resolvedTxtGuid}.txt`)
    : xmlAttr('plainTextPath', `relative://${fileId.replace(/\.md$/, '.txt')}`);

  const selections = markers
    .filter(m => m.codes.length > 0)
    .map(m => {
      const start = lineChToOffset(fileContent, m.range.from.line, m.range.from.ch);
      const end = lineChToOffset(fileContent, m.range.to.line, m.range.to.ch);
      if (start === -1 || end === -1) return '';

      const selGuid = ensureGuid(m.id, guidMap);
      const codingsXml = buildCodingXml(m.codes, guidMap, m.createdAt, notes, authoring?.authorGuidFor(m));
      let noteRef = '';
      if (m.memo) {
        const noteGuid = `note_${selGuid}`;
        notes.push(buildNoteXml(noteGuid, `Memo: ${fileName(fileId)}`, getMemoContent(m.memo)));
        noteRef = `\n${buildNoteRefXml(noteGuid)}`;
      }

      return `<PlainTextSelection ${xmlAttr('guid', selGuid)} ${xmlAttr('startPosition', start)} ${xmlAttr('endPosition', end)} ${xmlAttr('creationDateTime', new Date(m.createdAt).toISOString())}>\n${codingsXml}${noteRef}\n</PlainTextSelection>`;
    })
    .filter(Boolean)
    .join('\n');

  if (!selections) return '';
  return `<TextSource ${xmlAttr('guid', resolvedSrcGuid)} ${xmlAttr('name', fileName(fileId))} ${pathAttr}>\n${selections}\n</TextSource>`;
}

// ── Media (Audio/Video) ──

function buildMediaSourceXml(
  tag: 'AudioSource' | 'VideoSource',
  selTag: 'AudioSelection' | 'VideoSelection',
  filePath: string,
  markers: MediaMarker[],
  guidMap: Map<string, string>,
  notes: string[],
  includeSources?: boolean,
  authoring?: QdpxAuthoringContext,
): string {
  const srcGuid = uuidV4();
  guidMap.set(`source:${filePath}`, srcGuid);
  const ext = filePath.split('.').pop() || '';
  const pathAttr = includeSources
    ? xmlAttr('path', `internal://${srcGuid}.${ext}`)
    : xmlAttr('path', `relative://${filePath}`);

  const selections = markers
    .filter(m => m.codes.length > 0)
    .map(m => {
      const selGuid = ensureGuid(m.id, guidMap);
      const codingsXml = buildCodingXml(m.codes, guidMap, m.createdAt, notes, authoring?.authorGuidFor(m));
      let noteRef = '';
      if (m.memo) {
        const noteGuid = `note_${selGuid}`;
        notes.push(buildNoteXml(noteGuid, `Memo: ${fileName(filePath)}`, getMemoContent(m.memo)));
        noteRef = `\n${buildNoteRefXml(noteGuid)}`;
      }
      return `<${selTag} ${xmlAttr('guid', selGuid)} ${xmlAttr('begin', mediaToMs(m.from))} ${xmlAttr('end', mediaToMs(m.to))} ${xmlAttr('creationDateTime', new Date(m.createdAt).toISOString())}>\n${codingsXml}${noteRef}\n</${selTag}>`;
    })
    .filter(Boolean)
    .join('\n');

  if (!selections) return '';
  return `<${tag} ${xmlAttr('guid', srcGuid)} ${xmlAttr('name', fileName(filePath))} ${pathAttr}>\n${selections}\n</${tag}>`;
}

export function buildAudioSourceXml(
  filePath: string, markers: MediaMarker[], guidMap: Map<string, string>, notes: string[], includeSources?: boolean,
  authoring?: QdpxAuthoringContext,
): string {
  return buildMediaSourceXml('AudioSource', 'AudioSelection', filePath, markers, guidMap, notes, includeSources, authoring);
}

export function buildVideoSourceXml(
  filePath: string, markers: MediaMarker[], guidMap: Map<string, string>, notes: string[], includeSources?: boolean,
  authoring?: QdpxAuthoringContext,
): string {
  return buildMediaSourceXml('VideoSource', 'VideoSelection', filePath, markers, guidMap, notes, includeSources, authoring);
}

// ── Tabular (CSV / Parquet) ──
//
// REFI-QDA spec has no native tabular source type. We emit a custom-namespace
// `<qualia:TabularSource>` with `<qualia:CellSelection>` children. Other QDA
// tools (Atlas.ti / NVivo / MAXQDA) ignore the custom namespace; Qualia's own
// importer can read it for round-trip. The source file (CSV/parquet) is copied
// into the zip exactly like audio/video so the reimporter can re-bind markers.

export function buildTabularSourceXml(
  filePath: string,
  segmentMarkers: SegmentMarker[],
  rowMarkers: RowMarker[],
  guidMap: Map<string, string>,
  notes: string[],
  includeSources?: boolean,
  authoring?: QdpxAuthoringContext,
): string {
  if (segmentMarkers.length === 0 && rowMarkers.length === 0) return '';
  const srcGuid = uuidV4();
  guidMap.set(`source:${filePath}`, srcGuid);
  const ext = filePath.split('.').pop() || '';
  const pathAttr = includeSources
    ? xmlAttr('path', `internal://${srcGuid}.${ext}`)
    : xmlAttr('path', `relative://${filePath}`);

  const renderCell = (
    m: SegmentMarker | RowMarker,
    isSegment: boolean,
  ): string => {
    if (m.codes.length === 0) return '';
    const selGuid = ensureGuid(m.id, guidMap);
    const codingsXml = buildCodingXml(m.codes, guidMap, m.createdAt, notes, authoring?.authorGuidFor(m));
    let noteRef = '';
    if (m.memo) {
      const noteGuid = `note_${selGuid}`;
      notes.push(buildNoteXml(noteGuid, `Memo: ${fileName(filePath)}`, getMemoContent(m.memo)));
      noteRef = `\n${buildNoteRefXml(noteGuid)}`;
    }
    const rangeAttrs = isSegment
      ? ` ${xmlAttr('qualia:from', (m as SegmentMarker).from)} ${xmlAttr('qualia:to', (m as SegmentMarker).to)}`
      : '';
    return `<qualia:CellSelection ${xmlAttr('guid', selGuid)} ${xmlAttr('qualia:sourceRowId', m.sourceRowId)} ${xmlAttr('qualia:column', m.column)}${rangeAttrs} ${xmlAttr('creationDateTime', new Date(m.createdAt).toISOString())}>\n${codingsXml}${noteRef}\n</qualia:CellSelection>`;
  };

  const segXml = segmentMarkers.map(m => renderCell(m, true)).filter(Boolean);
  const rowXml = rowMarkers.map(m => renderCell(m, false)).filter(Boolean);
  const selections = [...segXml, ...rowXml].join('\n');
  if (!selections) return '';

  return `<qualia:TabularSource ${xmlAttr('guid', srcGuid)} ${xmlAttr('name', fileName(filePath))} ${pathAttr}>\n${selections}\n</qualia:TabularSource>`;
}

// ── Image ──

export function buildImageSourceXml(
  filePath: string,
  markers: ImageMarker[],
  imgWidth: number,
  imgHeight: number,
  guidMap: Map<string, string>,
  notes: string[],
  includeSources?: boolean,
  authoring?: QdpxAuthoringContext,
): string {
  const srcGuid = uuidV4();
  guidMap.set(`source:${filePath}`, srcGuid);
  const ext = filePath.split('.').pop() || '';
  const pathAttr = includeSources
    ? xmlAttr('path', `internal://${srcGuid}.${ext}`)
    : xmlAttr('path', `relative://${filePath}`);

  const selections = markers
    .filter(m => m.codes.length > 0)
    .map(m => {
      const px = imageToPixels(m.coords, imgWidth, imgHeight);
      if (!px) return '';
      const selGuid = ensureGuid(m.id, guidMap);
      const codingsXml = buildCodingXml(m.codes, guidMap, m.createdAt, notes, authoring?.authorGuidFor(m));
      let noteRef = '';
      if (m.memo) {
        const noteGuid = `note_${selGuid}`;
        notes.push(buildNoteXml(noteGuid, `Memo: ${fileName(filePath)}`, getMemoContent(m.memo)));
        noteRef = `\n${buildNoteRefXml(noteGuid)}`;
      }
      return `<PictureSelection ${xmlAttr('guid', selGuid)} ${xmlAttr('firstX', px.firstX)} ${xmlAttr('firstY', px.firstY)} ${xmlAttr('secondX', px.secondX)} ${xmlAttr('secondY', px.secondY)} ${xmlAttr('creationDateTime', new Date(m.createdAt).toISOString())}>\n${codingsXml}${noteRef}\n</PictureSelection>`;
    })
    .filter(Boolean)
    .join('\n');

  if (!selections) return '';
  return `<PictureSource ${xmlAttr('guid', srcGuid)} ${xmlAttr('name', fileName(filePath))} ${pathAttr}>\n${selections}\n</PictureSource>`;
}

// ── PDF ──

export function buildPdfSourceXml(
  filePath: string,
  textMarkers: PdfMarker[],
  shapeMarkers: PdfShapeMarker[],
  pageDimensions: Record<number, { width: number; height: number }> | null,
  textOffsets: Map<string, { start: number; end: number }>,
  guidMap: Map<string, string>,
  notes: string[],
  includeSources?: boolean,
  plainText?: string,
  authoring?: QdpxAuthoringContext,
): string {
  const srcGuid = uuidV4();
  guidMap.set(`source:${filePath}`, srcGuid);
  const ext = filePath.split('.').pop() || '';
  const pathAttr = includeSources
    ? xmlAttr('path', `internal://${srcGuid}.${ext}`)
    : xmlAttr('path', `relative://${filePath}`);

  const reprGuid = uuidV4();
  const reprPath = includeSources
    ? `internal://${reprGuid}.txt`
    : `relative://${filePath.replace(/\.pdf$/i, '.txt')}`;
  const representationEl = textMarkers.length > 0
    ? `<Representation ${xmlAttr('guid', reprGuid)} ${xmlAttr('plainTextPath', reprPath)}/>`
    : '';

  const textSelections = textMarkers
    .filter(m => m.codes.length > 0)
    .map(m => {
      const offsets = textOffsets.get(m.id);
      if (!offsets) return '';
      const selGuid = ensureGuid(m.id, guidMap);
      const codingsXml = buildCodingXml(m.codes, guidMap, m.createdAt, notes, authoring?.authorGuidFor(m));
      let noteRef = '';
      if (m.memo) {
        const noteGuid = `note_${selGuid}`;
        notes.push(buildNoteXml(noteGuid, `Memo: ${fileName(filePath)}`, getMemoContent(m.memo)));
        noteRef = `\n${buildNoteRefXml(noteGuid)}`;
      }
      return `<PlainTextSelection ${xmlAttr('guid', selGuid)} ${xmlAttr('startPosition', offsets.start)} ${xmlAttr('endPosition', offsets.end)} ${xmlAttr('creationDateTime', new Date(m.createdAt).toISOString())}>\n${codingsXml}${noteRef}\n</PlainTextSelection>`;
    })
    .filter(Boolean);

  const shapeSelections = shapeMarkers
    .filter(m => m.codes.length > 0)
    .map(m => {
      const dim = pageDimensions?.[m.page];
      if (!dim) return '';
      const rect = pdfShapeToRect(m.coords, dim.width, dim.height);
      if (!rect) return '';
      const selGuid = ensureGuid(m.id, guidMap);
      const codingsXml = buildCodingXml(m.codes, guidMap, m.createdAt, notes, authoring?.authorGuidFor(m));
      let noteRef = '';
      if (m.memo) {
        const noteGuid = `note_${selGuid}`;
        notes.push(buildNoteXml(noteGuid, `Memo: ${fileName(filePath)}`, getMemoContent(m.memo)));
        noteRef = `\n${buildNoteRefXml(noteGuid)}`;
      }
      return `<PDFSelection ${xmlAttr('guid', selGuid)} ${xmlAttr('page', m.page)} ${xmlAttr('firstX', Math.round(rect.firstX))} ${xmlAttr('firstY', Math.round(rect.firstY))} ${xmlAttr('secondX', Math.round(rect.secondX))} ${xmlAttr('secondY', Math.round(rect.secondY))} ${xmlAttr('creationDateTime', new Date(m.createdAt).toISOString())}>\n${codingsXml}${noteRef}\n</PDFSelection>`;
    })
    .filter(Boolean);

  const allSelections = [...textSelections, ...shapeSelections].join('\n');
  if (!allSelections) return '';

  void plainText; // plainText is carried separately via the sourceFiles map in the caller

  const inner = [representationEl, allSelections].filter(Boolean).join('\n');
  return `<PDFSource ${xmlAttr('guid', srcGuid)} ${xmlAttr('name', fileName(filePath))} ${pathAttr}>\n${inner}\n</PDFSource>`;
}

/** Variant of buildPdfSourceXml that exposes the Representation GUID so the
 *  caller can attach the consolidated PlainText as `sources/{guid}.txt`. */
export function buildPdfSourceXmlWithRepr(
  filePath: string,
  textMarkers: PdfMarker[],
  shapeMarkers: PdfShapeMarker[],
  pageDimensions: Record<number, { width: number; height: number }> | null,
  textOffsets: Map<string, { start: number; end: number }>,
  guidMap: Map<string, string>,
  notes: string[],
  includeSources?: boolean,
  authoring?: QdpxAuthoringContext,
): { xml: string; reprGuid: string } {
  const reprGuid = uuidV4();
  const xml = buildPdfSourceXmlInternal(filePath, textMarkers, shapeMarkers, pageDimensions, textOffsets, guidMap, notes, includeSources, reprGuid, authoring);
  return { xml, reprGuid };
}

function buildPdfSourceXmlInternal(
  filePath: string,
  textMarkers: PdfMarker[],
  shapeMarkers: PdfShapeMarker[],
  pageDimensions: Record<number, { width: number; height: number }> | null,
  textOffsets: Map<string, { start: number; end: number }>,
  guidMap: Map<string, string>,
  notes: string[],
  includeSources: boolean | undefined,
  reprGuidOverride: string,
  authoring?: QdpxAuthoringContext,
): string {
  const srcGuid = uuidV4();
  guidMap.set(`source:${filePath}`, srcGuid);
  const ext = filePath.split('.').pop() || '';
  const pathAttr = includeSources
    ? xmlAttr('path', `internal://${srcGuid}.${ext}`)
    : xmlAttr('path', `relative://${filePath}`);

  const reprPath = includeSources
    ? `internal://${reprGuidOverride}.txt`
    : `relative://${filePath.replace(/\.pdf$/i, '.txt')}`;
  const representationEl = textMarkers.length > 0
    ? `<Representation ${xmlAttr('guid', reprGuidOverride)} ${xmlAttr('plainTextPath', reprPath)}/>`
    : '';

  const textSelections = textMarkers
    .filter(m => m.codes.length > 0)
    .map(m => {
      const offsets = textOffsets.get(m.id);
      if (!offsets) return '';
      const selGuid = ensureGuid(m.id, guidMap);
      const codingsXml = buildCodingXml(m.codes, guidMap, m.createdAt, notes, authoring?.authorGuidFor(m));
      let noteRef = '';
      if (m.memo) {
        const noteGuid = `note_${selGuid}`;
        notes.push(buildNoteXml(noteGuid, `Memo: ${fileName(filePath)}`, getMemoContent(m.memo)));
        noteRef = `\n${buildNoteRefXml(noteGuid)}`;
      }
      return `<PlainTextSelection ${xmlAttr('guid', selGuid)} ${xmlAttr('startPosition', offsets.start)} ${xmlAttr('endPosition', offsets.end)} ${xmlAttr('creationDateTime', new Date(m.createdAt).toISOString())}>\n${codingsXml}${noteRef}\n</PlainTextSelection>`;
    })
    .filter(Boolean);

  const shapeSelections = shapeMarkers
    .filter(m => m.codes.length > 0)
    .map(m => {
      const dim = pageDimensions?.[m.page];
      if (!dim) return '';
      const rect = pdfShapeToRect(m.coords, dim.width, dim.height);
      if (!rect) return '';
      const selGuid = ensureGuid(m.id, guidMap);
      const codingsXml = buildCodingXml(m.codes, guidMap, m.createdAt, notes, authoring?.authorGuidFor(m));
      let noteRef = '';
      if (m.memo) {
        const noteGuid = `note_${selGuid}`;
        notes.push(buildNoteXml(noteGuid, `Memo: ${fileName(filePath)}`, getMemoContent(m.memo)));
        noteRef = `\n${buildNoteRefXml(noteGuid)}`;
      }
      return `<PDFSelection ${xmlAttr('guid', selGuid)} ${xmlAttr('page', m.page)} ${xmlAttr('firstX', Math.round(rect.firstX))} ${xmlAttr('firstY', Math.round(rect.firstY))} ${xmlAttr('secondX', Math.round(rect.secondX))} ${xmlAttr('secondY', Math.round(rect.secondY))} ${xmlAttr('creationDateTime', new Date(m.createdAt).toISOString())}>\n${codingsXml}${noteRef}\n</PDFSelection>`;
    })
    .filter(Boolean);

  const allSelections = [...textSelections, ...shapeSelections].join('\n');
  if (!allSelections) return '';

  const inner = [representationEl, allSelections].filter(Boolean).join('\n');
  return `<PDFSource ${xmlAttr('guid', srcGuid)} ${xmlAttr('name', fileName(filePath))} ${pathAttr}>\n${inner}\n</PDFSource>`;
}

// ── Project assembly ──

const PROJECT_NS = 'urn:QDA-XML:project:1.0';

/** Build <Links> XML section from code-level and segment-level relations. */
export function buildLinksXml(
  definitions: CodeDefinition[],
  markers: Array<{ id: string; codes: CodeApplication[] }>,
  guidMap: Map<string, string>,
  selectionGuidByMarkerId?: ReadonlyMap<string, string>,
  additionalLinks: QdpxLinkDefinition[] = [],
): string {
  const links: string[] = [];
  const seen = new Set<string>();

  const addLink = (
    name: string,
    direction: 'OneWay' | 'Associative',
    originGuid: string,
    targetGuid: string,
    memo: string | undefined,
    guid = uuidV4(),
  ): void => {
    const key = JSON.stringify([name, direction, originGuid, targetGuid, memo ?? '']);
    if (seen.has(key)) return;
    seen.add(key);
    const linkAttrs = `${xmlAttr('guid', guid)} ${xmlAttr('name', name)} ${xmlAttr('direction', direction)} ${xmlAttr('originGUID', originGuid)} ${xmlAttr('targetGUID', targetGuid)}`;
    const memoEl = memo ? `<MemoText>${escapeXml(memo)}</MemoText>` : '';
    links.push(memoEl ? `<Link ${linkAttrs}>${memoEl}</Link>` : `<Link ${linkAttrs}/>`);
  };

  // Code-level relations: Code → Code
  for (const def of definitions) {
    if (!def.relations) continue;
    for (const rel of def.relations) {
      const originGuid = ensureGuid(def.id, guidMap);
      const targetGuid = ensureGuid(rel.target, guidMap);
      const direction = rel.directed ? 'OneWay' : 'Associative';
      addLink(rel.label, direction, originGuid, targetGuid, rel.memo ? getMemoContent(rel.memo) : undefined);
    }
  }

  // Segment-level relations: Selection → Code
  for (const marker of markers) {
    for (const ca of marker.codes) {
      if (!ca.relations) continue;
      for (const rel of ca.relations) {
        const originGuid = selectionGuidByMarkerId?.get(marker.id) ?? ensureGuid(marker.id, guidMap);
        const targetGuid = ensureGuid(rel.target, guidMap);
        const direction = rel.directed ? 'OneWay' : 'Associative';
        addLink(rel.label, direction, originGuid, targetGuid, rel.memo ? getMemoContent(rel.memo) : undefined);
      }
    }
  }

  for (const link of additionalLinks) {
    addLink(link.name, link.direction, link.originGuid, link.targetGuid, link.memo, link.guid);
  }

  return links.join('\n');
}

/** Assemble the complete project.qde XML. */
/**
 * Smart Codes (Tier 3) — bloco custom em namespace `qualia:`. Outras tools ignoram silenciosamente.
 * Round-trip Qualia↔Qualia preserva predicate AST + memo bit-idêntico.
 */
export function buildSmartCodesXml(smartCodes: SmartCodeDefinition[]): string {
  if (smartCodes.length === 0) return '';
  const lines: string[] = ['<qualia:SmartCodes>'];
  for (const sc of smartCodes) {
    lines.push(`  <qualia:SmartCode ${xmlAttr('guid', sc.id)} ${xmlAttr('name', sc.name)} ${xmlAttr('color', sc.color)}>`);
    lines.push(`    <qualia:Predicate><![CDATA[${predicateToJson(sc.predicate)}]]></qualia:Predicate>`);
    const memoContent = sc.memo?.content ?? '';
    if (memoContent.trim().length > 0) {
      lines.push(`    <qualia:Memo>${escapeXml(memoContent)}</qualia:Memo>`);
    }
    lines.push(`  </qualia:SmartCode>`);
  }
  lines.push('</qualia:SmartCodes>');
  return lines.join('\n');
}

export function buildProjectXml(
  registry: CodeDefinitionRegistry,
  sourcesXml: string,
  notesXml: string,
  linksXml: string,
  casesXml: string,
  vaultName: string,
  pluginVersion: string,
  guidMap?: Map<string, string>,
  smartCodes?: SmartCodeDefinition[],
  usersXml = '',
): string {
  const resolvedGuidMap = guidMap ?? new Map<string, string>();
  const magnitudeNoteGuidByCodeId = new Map<string, string>();
  const magnitudeNotes = registry.getAll().flatMap((code) => {
    if (!code.magnitude) return [];
    const noteGuid = ensureGuid(`code-magnitude:${code.id}`, resolvedGuidMap);
    magnitudeNoteGuidByCodeId.set(code.id, noteGuid);
    return [buildNoteXml(
      noteGuid,
      'Qualia Magnitude Definition',
      `[Qualia Magnitude Definition: ${JSON.stringify(code.magnitude)}]`,
    )];
  });
  const codebook = guidMap
    ? buildCodebookXml(registry, {
      ensureCodeGuid: (id) => ensureGuid(id, resolvedGuidMap),
      magnitudeNoteGuid: (id) => magnitudeNoteGuidByCodeId.get(id),
    })
    : buildCodebookXml(registry, {
      magnitudeNoteGuid: (id) => magnitudeNoteGuidByCodeId.get(id),
    });
  const sourcesSection = sourcesXml ? `<Sources>\n${sourcesXml}\n</Sources>` : '';
  const combinedNotesXml = [notesXml, ...magnitudeNotes].filter(Boolean).join('\n');
  const notesSection = combinedNotesXml ? `<Notes>\n${combinedNotesXml}\n</Notes>` : '';
  const linksSection = linksXml ? `<Links>\n${linksXml}\n</Links>` : '';
  const casesSection = casesXml ? `<Cases>\n${casesXml}\n</Cases>` : '';
  const smartCodesSection = smartCodes ? buildSmartCodesXml(smartCodes) : '';

  const sections = [usersXml, codebook, sourcesSection, notesSection, linksSection, casesSection, smartCodesSection].filter(Boolean).join('\n');

  // Declare the qualia: namespace at Project root whenever any section uses it
  // (today: `<qualia:TabularSource>` for CSV/parquet, `<qualia:Set>` for code
  // groups inside the codebook). Other QDA tools ignore unknown namespaces.
  const usesQualiaNs = sections.includes('qualia:');
  const qualiaNsAttr = usesQualiaNs ? ' xmlns:qualia="urn:qualia-coding:extensions:1.0"' : '';

  return `${xmlDeclaration()}\n<Project ${xmlAttr('name', vaultName)} ${xmlAttr('origin', `Qualia Coding ${pluginVersion}`)} ${xmlAttr('creationDateTime', new Date().toISOString())} ${xmlAttr('xmlns', PROJECT_NS)}${qualiaNsAttr}>\n${sections}\n</Project>`;
}

/** Create a QDPX ZIP archive containing project.qde and optional source files. */
export function createQdpxZip(
  projectXml: string,
  sourceFiles: Map<string, Uint8Array>,
): Uint8Array {
  // new Uint8Array(buf) ensures the buffer is in the current realm,
  // which is required for fflate's `instanceof Uint8Array` check to pass.
  const toU8 = (buf: Uint8Array) => new Uint8Array(buf);
  const files: Record<string, Uint8Array> = {
    'project.qde': toU8(strToU8(projectXml)),
  };
  for (const [path, data] of sourceFiles) {
    files[path] = toU8(data);
  }
  return zipSync(files);
}

// ── Export orchestration ──

/**
 * Inject <Variable> elements into a source XML string before its closing tag.
 * Matches the last `</SomethingSource>` pattern (TextSource, PDFSource, etc.).
 */
function injectVariablesIntoSource(sourceXml: string, variablesXml: string): string {
  if (!variablesXml || !sourceXml) return sourceXml;
  // Permit optional `prefix:` so custom-namespace sources (e.g. `qualia:TabularSource`)
  // also receive Variables injection.
  const match = sourceXml.match(/<\/(?:\w+:)?(\w+Source)>\s*$/);
  if (!match) return sourceXml;
  const closingTag = match[0];
  return sourceXml.slice(0, -closingTag.length) + variablesXml + '\n' + closingTag;
}

export interface ExportOptions {
  format: 'qdc' | 'qdpx';
  includeSources: boolean;
  fileName: string;
  vaultName: string;
  pluginVersion: string;
}

export interface ExportResult {
  data: Uint8Array | string;
  fileName: string;
  warnings: string[];
  audit?: QdpxExportAudit;
}

export async function exportProject(
  app: App,
  dataManager: DataManager,
  registry: CodeDefinitionRegistry,
  coderRegistry: CoderRegistry,
  options: ExportOptions,
  caseVariablesRegistry: CaseVariablesRegistry,
): Promise<ExportResult> {
  if (options.format === 'qdc') {
    return { data: buildQdcFile(registry), fileName: options.fileName, warnings: [] };
  }

  const guidMap = new Map<string, string>();
  const notes: string[] = [];
  const sourceFiles = new Map<string, Uint8Array>();
  const allSourcesXml: string[] = [];
  const warnings: string[] = [];
  const authoring = createQdpxAuthoringContext(coderRegistry, warnings, uuidV4);
  const sourceGuidByFileId = new Map<string, string>();
  const selectionGuidByMarkerId = new Map<string, string>();
  const additionalLinks: QdpxLinkDefinition[] = [];
  const exportedPdfMarkerIds = new Set<string>();
  const audit = createQdpxExportAudit();
  const physicalCodingGuids = new Set<string>();

  // --- Markdown ---
  const mdData = dataManager.section('markdown');
  for (const [fileId, markers] of Object.entries(mdData.markers)) {
    if (markers.length === 0) continue;
    const file = app.vault.getAbstractFileByPath(fileId);
    if (!file || !('extension' in file)) {
      warnings.push(`Source not found: ${fileId}`);
      continue;
    }
    const content = await app.vault.cachedRead(file as TFile);
    const srcGuid = uuidV4();
    const txtGuid = uuidV4();
    const xml = buildTextSourceXml(fileId, markers, content, guidMap, notes, srcGuid, txtGuid, options.includeSources, authoring);
    if (xml) {
      const variablesXml = renderVariablesForFile(fileId, caseVariablesRegistry);
      allSourcesXml.push(injectVariablesIntoSource(xml, variablesXml));
      sourceGuidByFileId.set(fileId, srcGuid);
      if (options.includeSources) {
        sourceFiles.set(`sources/${txtGuid}.txt`, strToU8(content));
      }
    }
  }

  // --- PDF ---
  const pdfData = dataManager.section('pdf');
  const pdfByFile = groupByFileId(pdfData.markers, pdfData.shapes);
  for (const [fileId, { textMarkers, shapeMarkers }] of pdfByFile) {
    if (textMarkers.length === 0 && shapeMarkers.length === 0) continue;

    const codedMarkerCount = textMarkers.filter((marker) => marker.codes.length > 0).length
      + shapeMarkers.filter((marker) => marker.codes.length > 0).length;
    const sourceFile = app.vault.getAbstractFileByPath(fileId);
    if (!sourceFile || !('extension' in sourceFile)) {
      audit.omittedOrphanMarkers += codedMarkerCount;
      continue;
    }
    audit.activePdfSources++;

    let exportData;
    try {
      exportData = await loadPdfExportData(app, fileId);
    } catch (err) {
      audit.issues.push({
        kind: 'source-load', sourceId: fileId,
        message: `PDF ${fileId}: failed to load for export (${(err as Error).message})`,
      });
      continue;
    }

    const { plainText, pageDims } = exportData;
    const resolvedTextMarkers = textMarkers.filter((marker) =>
      marker.codes.length > 0
      && getPdfMarkerSegments(marker).every((segment) => !isPdfMarkerSegmentPending(segment)),
    );
    audit.resolvedPdfMarkers += resolvedTextMarkers.length;
    const exportMap = buildPdfExportMap(exportData);
    const projectedMarkers = [];
    for (const marker of resolvedTextMarkers) {
      try {
        projectedMarkers.push(projectPdfMarker(marker, exportMap));
      } catch (error) {
        audit.issues.push({
          kind: 'projection', sourceId: fileId,
          markerId: error instanceof QdpxPdfProjectionError ? error.markerId : marker.id,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    if (projectedMarkers.length !== resolvedTextMarkers.length) continue;

    let grouping;
    try {
      grouping = await buildQdpxPdfSelectionUnits(fileId, projectedMarkers, {
        projectKey: `${options.vaultName}:${fileId}`,
        authorGuidFor: (marker) => authoring.authorGuidFor(marker),
        selectionAuthorGuidFor: (marker) => authoring.selectionAuthorGuidFor?.(marker),
      });
    } catch (error) {
      audit.issues.push({
        kind: 'identity', sourceId: fileId,
        message: `PDF ${fileId}: failed to group selections (${(error as Error).message})`,
      });
      continue;
    }
    for (const [markerId, selectionGuid] of grouping.selectionGuidByMarkerId) {
      selectionGuidByMarkerId.set(markerId, selectionGuid);
      exportedPdfMarkerIds.add(markerId);
    }

    const serializedUnits = [];
    try {
      for (const unit of grouping.units) {
        const serialized = await serializeQdpxPdfSelectionUnit(unit, {
          projectKey: `${options.vaultName}:${fileId}`,
          sourceName: fileName(fileId),
          codeGuidFor: (codeId) => ensureGuid(codeId, guidMap),
        });
        const codingXml = `${serialized.plainTextSelectionXml}\n${serialized.pdfSelectionsXml}`;
        for (const match of codingXml.matchAll(/<Coding guid="([^"]+)"/g)) {
          const guid = match[1]!;
          if (physicalCodingGuids.has(guid)) {
            throw new Error(`duplicate physical Coding GUID ${guid}`);
          }
          physicalCodingGuids.add(guid);
        }
        serializedUnits.push(serialized);
        notes.push(...serialized.notesXml);
        additionalLinks.push(...serialized.continuedByLinks);
      }
    } catch (error) {
      audit.issues.push({
        kind: 'serialization', sourceId: fileId,
        message: `PDF ${fileId}: failed to serialize selections (${(error as Error).message})`,
      });
      continue;
    }
    audit.exportedLogicalSelections += grouping.units.length;
    audit.exportedPdfFragments += grouping.units.reduce((total, unit) => total + unit.fragments.length, 0);

    const srcGuid = uuidV4();
    const reprGuid = uuidV4();
    guidMap.set(`source:${fileId}`, srcGuid);
    const ext = fileId.split('.').pop() || '';
    const pathAttr = options.includeSources
      ? xmlAttr('path', `internal://${srcGuid}.${ext}`)
      : xmlAttr('path', `relative://${fileId}`);
    const reprPath = options.includeSources
      ? `internal://${reprGuid}.txt`
      : `relative://${fileId.replace(/\.pdf$/i, '.txt')}`;
    const representationXml = serializedUnits.length > 0
      ? `<Representation ${xmlAttr('guid', reprGuid)} ${xmlAttr('plainTextPath', reprPath)}>\n${serializedUnits.map((item) => item.plainTextSelectionXml).join('\n')}\n</Representation>`
      : '';
    const visualTextSelections = serializedUnits.map((item) => item.pdfSelectionsXml);
    const shapeSelections = shapeMarkers
      .filter((marker) => marker.codes.length > 0)
      .map((marker) => {
        const dim = pageDims[marker.page];
        if (!dim) {
          audit.issues.push({ kind: 'geometry', sourceId: fileId, markerId: marker.id, message: `PDF shape ${marker.id}: page ${marker.page} dimensions are unavailable` });
          return '';
        }
        const rect = pdfShapeToRect(marker.coords, dim.width, dim.height);
        if (!rect) return '';
        exportedPdfMarkerIds.add(marker.id);
        const selectionGuid = ensureGuid(marker.id, guidMap);
        selectionGuidByMarkerId.set(marker.id, selectionGuid);
        const codingsXml = buildCodingXml(marker.codes, guidMap, marker.createdAt, notes, authoring.authorGuidFor(marker));
        let noteRef = '';
        if (marker.memo) {
          const noteGuid = ensureGuid(`note:${selectionGuid}`, guidMap);
          notes.push(buildNoteXml(noteGuid, `Memo: ${fileName(fileId)}`, getMemoContent(marker.memo)));
          noteRef = `\n${buildNoteRefXml(noteGuid)}`;
        }
        return `<PDFSelection ${xmlAttr('guid', selectionGuid)} ${xmlAttr('page', marker.page)} ${xmlAttr('firstX', Math.round(rect.firstX))} ${xmlAttr('firstY', Math.round(rect.firstY))} ${xmlAttr('secondX', Math.round(rect.secondX))} ${xmlAttr('secondY', Math.round(rect.secondY))} ${xmlAttr('creationDateTime', new Date(marker.createdAt).toISOString())}>\n${codingsXml}${noteRef}\n</PDFSelection>`;
      })
      .filter(Boolean);
    const inner = [...visualTextSelections, ...shapeSelections, representationXml].filter(Boolean).join('\n');
    const xml = inner
      ? `<PDFSource ${xmlAttr('guid', srcGuid)} ${xmlAttr('name', fileName(fileId))} ${pathAttr}>\n${inner}\n</PDFSource>`
      : '';
    if (xml) {
      const variablesXml = renderVariablesForFile(fileId, caseVariablesRegistry);
      allSourcesXml.push(injectVariablesIntoSource(xml, variablesXml));
      sourceGuidByFileId.set(fileId, srcGuid);
      if (options.includeSources && serializedUnits.length > 0) {
        sourceFiles.set(`sources/${reprGuid}.txt`, strToU8(plainText));
      }
    }
    if (options.includeSources) {
      await addSourceFile(app.vault, fileId, sourceFiles, guidMap);
    }
  }

  assertQdpxExportAudit(audit);

  // --- Image ---
  const imgData = dataManager.section('image');
  const imgByFile = groupMarkersByFileId(imgData.markers);
  for (const [fileId, markers] of imgByFile) {
    const dims = await getImageDimensions(app.vault, fileId);
    if (!dims) {
      warnings.push(`Cannot read dimensions: ${fileId}`);
      continue;
    }
    const xml = buildImageSourceXml(fileId, markers, dims.width, dims.height, guidMap, notes, options.includeSources, authoring);
    if (xml) {
      const variablesXml = renderVariablesForFile(fileId, caseVariablesRegistry);
      allSourcesXml.push(injectVariablesIntoSource(xml, variablesXml));
      const srcGuid = guidMap.get(`source:${fileId}`);
      if (srcGuid) sourceGuidByFileId.set(fileId, srcGuid);
    }
    if (options.includeSources) {
      await addSourceFile(app.vault, fileId, sourceFiles, guidMap);
    }
  }

  // --- Audio ---
  const audioData = dataManager.section('audio');
  for (const audioFile of audioData.files) {
    if (audioFile.markers.length === 0) continue;
    const xml = buildAudioSourceXml(audioFile.path, audioFile.markers, guidMap, notes, options.includeSources, authoring);
    if (xml) {
      const variablesXml = renderVariablesForFile(audioFile.path, caseVariablesRegistry);
      allSourcesXml.push(injectVariablesIntoSource(xml, variablesXml));
      const srcGuid = guidMap.get(`source:${audioFile.path}`);
      if (srcGuid) sourceGuidByFileId.set(audioFile.path, srcGuid);
    }
    if (options.includeSources) {
      await addSourceFile(app.vault, audioFile.path, sourceFiles, guidMap);
    }
  }

  // --- Video ---
  const videoData = dataManager.section('video');
  for (const videoFile of videoData.files) {
    if (videoFile.markers.length === 0) continue;
    const xml = buildVideoSourceXml(videoFile.path, videoFile.markers, guidMap, notes, options.includeSources, authoring);
    if (xml) {
      const variablesXml = renderVariablesForFile(videoFile.path, caseVariablesRegistry);
      allSourcesXml.push(injectVariablesIntoSource(xml, variablesXml));
      const srcGuid = guidMap.get(`source:${videoFile.path}`);
      if (srcGuid) sourceGuidByFileId.set(videoFile.path, srcGuid);
    }
    if (options.includeSources) {
      await addSourceFile(app.vault, videoFile.path, sourceFiles, guidMap);
    }
  }

  // --- Tabular (CSV / Parquet) ---
  const csvData = dataManager.section('csv');
  const csvSegByFile = groupMarkersByFileId(csvData.segmentMarkers);
  const csvRowByFile = groupMarkersByFileId(csvData.rowMarkers);
  const csvFileIds = new Set([...csvSegByFile.keys(), ...csvRowByFile.keys()]);
  for (const fileId of csvFileIds) {
    const segs = csvSegByFile.get(fileId) ?? [];
    const rows = csvRowByFile.get(fileId) ?? [];
    const xml = buildTabularSourceXml(fileId, segs, rows, guidMap, notes, options.includeSources, authoring);
    if (xml) {
      const variablesXml = renderVariablesForFile(fileId, caseVariablesRegistry);
      allSourcesXml.push(injectVariablesIntoSource(xml, variablesXml));
      const srcGuid = guidMap.get(`source:${fileId}`);
      if (srcGuid) sourceGuidByFileId.set(fileId, srcGuid);
    }
    if (options.includeSources) {
      await addSourceFile(app.vault, fileId, sourceFiles, guidMap);
    }
  }

  // Collect all markers for link generation
  const allMarkersForLinks: Array<{ id: string; codes: CodeApplication[] }> = [];
  for (const markers of Object.values(mdData.markers)) allMarkersForLinks.push(...markers);
  for (const { textMarkers, shapeMarkers } of pdfByFile.values()) {
    allMarkersForLinks.push(
      ...textMarkers.filter((marker) => exportedPdfMarkerIds.has(marker.id)),
      ...shapeMarkers.filter((marker) => exportedPdfMarkerIds.has(marker.id)),
    );
  }
  for (const [, markers] of imgByFile) allMarkersForLinks.push(...markers);
  for (const af of audioData.files) allMarkersForLinks.push(...af.markers);
  for (const vf of videoData.files) allMarkersForLinks.push(...vf.markers);
  allMarkersForLinks.push(...csvData.segmentMarkers, ...csvData.rowMarkers);

  const sourcesXml = allSourcesXml.join('\n');
  const notesXml = notes.join('\n');
  const allDefs = registry.getAll();
  const linksXml = buildLinksXml(allDefs, allMarkersForLinks, guidMap, selectionGuidByMarkerId, additionalLinks);
  const casesXml = renderCasesXml(caseVariablesRegistry, sourceGuidByFileId);
  // Smart Codes (Tier 3) — só aparece se houver pelo menos 1 smart code
  const smartCodesSection = dataManager.section('smartCodes');
  const smartCodesList: SmartCodeDefinition[] = smartCodesSection?.definitions
    ? Object.values(smartCodesSection.definitions) as SmartCodeDefinition[]
    : [];
  const usersXml = buildUsersXml(authoring.getUsers());
  const projectXml = buildProjectXml(registry, sourcesXml, notesXml, linksXml, casesXml, options.vaultName, options.pluginVersion, guidMap, smartCodesList, usersXml);
  const zipData = createQdpxZip(projectXml, sourceFiles);

  return { data: zipData, fileName: options.fileName, warnings, audit };
}

// ── Helpers ──

function groupByFileId(textMarkers: PdfMarker[], shapeMarkers: PdfShapeMarker[]) {
  const map = new Map<string, { textMarkers: PdfMarker[]; shapeMarkers: PdfShapeMarker[] }>();
  for (const m of textMarkers) {
    if (!map.has(m.fileId)) map.set(m.fileId, { textMarkers: [], shapeMarkers: [] });
    map.get(m.fileId)!.textMarkers.push(m);
  }
  for (const m of shapeMarkers) {
    if (!map.has(m.fileId)) map.set(m.fileId, { textMarkers: [], shapeMarkers: [] });
    map.get(m.fileId)!.shapeMarkers.push(m);
  }
  return map;
}

function groupMarkersByFileId<T extends { fileId: string }>(markers: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const m of markers) {
    if (!map.has(m.fileId)) map.set(m.fileId, []);
    map.get(m.fileId)!.push(m);
  }
  return map;
}

async function addSourceFile(
  vault: Vault, filePath: string,
  sourceFiles: Map<string, Uint8Array>,
  guidMap: Map<string, string>,
): Promise<void> {
  const file = vault.getAbstractFileByPath(filePath);
  if (!file || !('extension' in file)) return;
  const data = await vault.readBinary(file as TFile);
  const ext = filePath.split('.').pop() || '';
  const guid = guidMap.get(`source:${filePath}`) || uuidV4();
  sourceFiles.set(`sources/${guid}.${ext}`, new Uint8Array(data));
}

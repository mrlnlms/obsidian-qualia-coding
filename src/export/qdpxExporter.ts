import { escapeXml, xmlAttr, xmlDeclaration } from './xmlBuilder';
import { buildCodebookXml } from './qdcExporter';
import { zipSync, strToU8 } from 'fflate';
import type { CodeDefinitionRegistry } from '../core/codeDefinitionRegistry';
import type { CodeApplication } from '../core/types';
import type { Marker } from '../markdown/models/codeMarkerModel';
import type { MediaMarker } from '../media/mediaTypes';
import type { ImageMarker } from '../image/imageCodingTypes';
import type { PdfMarker, PdfShapeMarker } from '../pdf/pdfCodingTypes';
import { lineChToOffset, mediaToMs, imageToPixels, pdfShapeToRect } from './coordConverters';

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
export function buildCodingXml(codes: CodeApplication[], guidMap: Map<string, string>, createdAt?: number): string {
  const dateStr = createdAt ? new Date(createdAt).toISOString() : new Date().toISOString();
  return codes.map(ca => {
    const codingGuid = uuidV4();
    const codeGuid = ensureGuid(ca.codeId, guidMap);
    return `<Coding ${xmlAttr('guid', codingGuid)} ${xmlAttr('creationDateTime', dateStr)}>\n<CodeRef ${xmlAttr('targetGUID', codeGuid)}/>\n</Coding>`;
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
      const codingsXml = buildCodingXml(m.codes, guidMap, m.createdAt);
      let noteRef = '';
      if (m.memo) {
        const noteGuid = `note_${selGuid}`;
        notes.push(buildNoteXml(noteGuid, `Memo: ${fileName(fileId)}`, m.memo));
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
      const codingsXml = buildCodingXml(m.codes, guidMap, m.createdAt);
      let noteRef = '';
      if (m.memo) {
        const noteGuid = `note_${selGuid}`;
        notes.push(buildNoteXml(noteGuid, `Memo: ${fileName(filePath)}`, m.memo));
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
): string {
  return buildMediaSourceXml('AudioSource', 'AudioSelection', filePath, markers, guidMap, notes, includeSources);
}

export function buildVideoSourceXml(
  filePath: string, markers: MediaMarker[], guidMap: Map<string, string>, notes: string[], includeSources?: boolean,
): string {
  return buildMediaSourceXml('VideoSource', 'VideoSelection', filePath, markers, guidMap, notes, includeSources);
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
      const codingsXml = buildCodingXml(m.codes, guidMap, m.createdAt);
      let noteRef = '';
      if (m.memo) {
        const noteGuid = `note_${selGuid}`;
        notes.push(buildNoteXml(noteGuid, `Memo: ${fileName(filePath)}`, m.memo));
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
      const codingsXml = buildCodingXml(m.codes, guidMap, m.createdAt);
      let noteRef = '';
      if (m.memo) {
        const noteGuid = `note_${selGuid}`;
        notes.push(buildNoteXml(noteGuid, `Memo: ${fileName(filePath)}`, m.memo));
        noteRef = `\n${buildNoteRefXml(noteGuid)}`;
      }
      return `<PlainTextSelection ${xmlAttr('guid', selGuid)} ${xmlAttr('startPosition', offsets.start)} ${xmlAttr('endPosition', offsets.end)} ${xmlAttr('creationDateTime', new Date(m.createdAt).toISOString())}>\n${codingsXml}${noteRef}\n</PlainTextSelection>`;
    })
    .filter(Boolean);

  const shapeSelections = shapeMarkers
    .filter(m => m.codes.length > 0)
    .map(m => {
      if (!pageDimensions || !pageDimensions[m.page]) return '';
      const dim = pageDimensions[m.page];
      const rect = pdfShapeToRect(m.coords, dim.width, dim.height);
      if (!rect) return '';
      const selGuid = ensureGuid(m.id, guidMap);
      const codingsXml = buildCodingXml(m.codes, guidMap, m.createdAt);
      let noteRef = '';
      if (m.memo) {
        const noteGuid = `note_${selGuid}`;
        notes.push(buildNoteXml(noteGuid, `Memo: ${fileName(filePath)}`, m.memo));
        noteRef = `\n${buildNoteRefXml(noteGuid)}`;
      }
      return `<PDFSelection ${xmlAttr('guid', selGuid)} ${xmlAttr('page', m.page)} ${xmlAttr('firstX', rect.firstX)} ${xmlAttr('firstY', rect.firstY)} ${xmlAttr('secondX', rect.secondX)} ${xmlAttr('secondY', rect.secondY)} ${xmlAttr('creationDateTime', new Date(m.createdAt).toISOString())}>\n${codingsXml}${noteRef}\n</PDFSelection>`;
    })
    .filter(Boolean);

  const allSelections = [...textSelections, ...shapeSelections].join('\n');
  if (!allSelections) return '';

  const inner = [representationEl, allSelections].filter(Boolean).join('\n');
  return `<PDFSource ${xmlAttr('guid', srcGuid)} ${xmlAttr('name', fileName(filePath))} ${pathAttr}>\n${inner}\n</PDFSource>`;
}

// ── Project assembly ──

const PROJECT_NS = 'urn:QDA-XML:project:1.0';

/** Assemble the complete project.qde XML. */
export function buildProjectXml(
  registry: CodeDefinitionRegistry,
  sourcesXml: string,
  notesXml: string,
  vaultName: string,
  pluginVersion: string,
): string {
  const codebook = buildCodebookXml(registry);
  const sourcesSection = sourcesXml ? `<Sources>\n${sourcesXml}\n</Sources>` : '';
  const notesSection = notesXml ? `<Notes>\n${notesXml}\n</Notes>` : '';

  const sections = [codebook, sourcesSection, notesSection].filter(Boolean).join('\n');

  return `${xmlDeclaration()}\n<Project ${xmlAttr('name', vaultName)} ${xmlAttr('origin', `Qualia Coding ${pluginVersion}`)} ${xmlAttr('creationDateTime', new Date().toISOString())} ${xmlAttr('xmlns', PROJECT_NS)}>\n${sections}\n</Project>`;
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

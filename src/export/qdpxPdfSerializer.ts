import { getMemoContent } from '../core/memoHelpers';
import { escapeXml, xmlAttr } from './xmlBuilder';
import type { QdpxPdfCodingUnit, QdpxPdfSelectionUnit } from './qdpxPdfGrouping';
import { deterministicQdpxGuid } from './qdpxStableGuid';

const NL = String.fromCharCode(10);

export interface QdpxLinkDefinition {
	guid: string;
	name: string;
	direction: 'OneWay' | 'Associative';
	originGuid: string;
	targetGuid: string;
	memo?: string;
}

export interface QdpxPdfSerializationContext {
	projectKey: string;
	sourceName: string;
	codeGuidFor(codeId: string): string;
}

export interface SerializedQdpxPdfSelections {
	plainTextSelectionXml: string;
	pdfSelectionsXml: string;
	notesXml: string[];
	continuedByLinks: QdpxLinkDefinition[];
}

function authorAttribute(guid: string | undefined): string {
	return guid ? ` ${xmlAttr('creatingUser', guid)}` : '';
}

async function serializeCoding(
	coding: QdpxPdfCodingUnit,
	physicalGuid: string,
	role: string,
	context: QdpxPdfSerializationContext,
	notes: string[],
): Promise<string> {
	let noteRef = '';
	if (coding.application.magnitude) {
		const noteGuid = await deterministicQdpxGuid(`${context.projectKey}:note:magnitude:${physicalGuid}:${role}`);
		notes.push(`<Note ${xmlAttr('guid', noteGuid)} ${xmlAttr('name', 'Magnitude')} ${xmlAttr('creationDateTime', coding.creationDateTime)}>${NL}<PlainTextContent>${escapeXml(`[Magnitude: ${coding.application.magnitude}]`)}</PlainTextContent>${NL}</Note>`);
		noteRef = `${NL}<NoteRef ${xmlAttr('targetGUID', noteGuid)}/>`;
	}
	return `<Coding ${xmlAttr('guid', physicalGuid)} ${xmlAttr('creationDateTime', coding.creationDateTime)}${authorAttribute(coding.creatingUserGuid)}>${NL}<CodeRef ${xmlAttr('targetGUID', context.codeGuidFor(coding.application.codeId))}/>${noteRef}${NL}</Coding>`;
}

async function serializeCodingSet(
	unit: QdpxPdfSelectionUnit,
	role: 'text' | number,
	context: QdpxPdfSerializationContext,
	notes: string[],
): Promise<string> {
	const nodes: string[] = [];
	for (const coding of unit.codings) {
		const guid = role === 'text' ? coding.plainTextCodingGuid : coding.pdfCodingGuids[role]!;
		nodes.push(await serializeCoding(coding, guid, String(role), context, notes));
	}
	return nodes.join(NL);
}

export async function serializeQdpxPdfSelectionUnit(
	unit: QdpxPdfSelectionUnit,
	context: QdpxPdfSerializationContext,
): Promise<SerializedQdpxPdfSelections> {
	const notesXml: string[] = [];
	let selectionNoteRef = '';
	if (unit.memo) {
		const noteGuid = await deterministicQdpxGuid(`${context.projectKey}:note:selection:${unit.selectionGuid}`);
		notesXml.push(`<Note ${xmlAttr('guid', noteGuid)} ${xmlAttr('name', `Memo: ${context.sourceName}`)} ${xmlAttr('creationDateTime', unit.creationDateTime)}>${NL}<PlainTextContent>${escapeXml(getMemoContent(unit.memo))}</PlainTextContent>${NL}</Note>`);
		selectionNoteRef = `${NL}<NoteRef ${xmlAttr('targetGUID', noteGuid)}/>`;
	}

	const selectionAuthor = authorAttribute(unit.creatingUserGuid);
	const textCodings = await serializeCodingSet(unit, 'text', context, notesXml);
	const plainTextSelectionXml = `<PlainTextSelection ${xmlAttr('guid', unit.selectionGuid)} ${xmlAttr('name', unit.name)} ${xmlAttr('startPosition', unit.startPosition)} ${xmlAttr('endPosition', unit.endPosition)} ${xmlAttr('creationDateTime', unit.creationDateTime)}${selectionAuthor}>${NL}${textCodings}${selectionNoteRef}${NL}</PlainTextSelection>`;

	const pdfSelections: string[] = [];
	for (let index = 0; index < unit.fragments.length; index++) {
		const fragment = unit.fragments[index]!;
		const codings = await serializeCodingSet(unit, index, context, notesXml);
		pdfSelections.push(`<PDFSelection ${xmlAttr('guid', fragment.selectionGuid)} ${xmlAttr('name', unit.name)} ${xmlAttr('page', fragment.page - 1)} ${xmlAttr('firstX', Math.round(fragment.bbox.firstX))} ${xmlAttr('firstY', Math.round(fragment.bbox.firstY))} ${xmlAttr('secondX', Math.round(fragment.bbox.secondX))} ${xmlAttr('secondY', Math.round(fragment.bbox.secondY))} ${xmlAttr('creationDateTime', unit.creationDateTime)}${selectionAuthor}>${NL}${codings}${selectionNoteRef}${NL}</PDFSelection>`);
	}

	return {
		plainTextSelectionXml,
		pdfSelectionsXml: pdfSelections.join(NL),
		notesXml,
		// Atlas encodes multipage continuity structurally; its "continued by"
		// Links are ordinary analytical relations and must not be synthesized.
		continuedByLinks: [],
	};
}

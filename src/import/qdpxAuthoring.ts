import { getAllElements, getAttr, getChildElements } from './xmlParser';

export interface ParsedQdpxUser {
	guid: string;
	name: string;
}

export interface ParsedQdpxCoding {
	guid?: string;
	codeGuid: string;
	creatingUserGuid?: string;
	createdAt?: string;
	noteGuids: string[];
	sourceCodingGuids: string[];
}

export interface ParsedQdpxCoderGroup {
	creatingUserGuid?: string;
	codings: ParsedQdpxCoding[];
}

export function parseQdpxUsers(doc: Document): ParsedQdpxUser[] {
	const users = new Map<string, ParsedQdpxUser>();
	for (const el of getAllElements(doc.documentElement, 'User')) {
		const guid = getAttr(el, 'guid');
		if (!guid) continue;
		users.set(guid, { guid, name: getAttr(el, 'name') ?? `QDPX user ${guid}` });
	}
	return [...users.values()];
}

export function parseQdpxCodings(selectionEl: Element): ParsedQdpxCoding[] {
	return getChildElements(selectionEl, 'Coding').flatMap((coding) => {
		const codeRef = getChildElements(coding, 'CodeRef')[0];
		const codeGuid = codeRef ? getAttr(codeRef, 'targetGUID') : undefined;
		if (!codeGuid) return [];
		const guid = getAttr(coding, 'guid');
		return [{
			guid,
			codeGuid,
			creatingUserGuid: getAttr(coding, 'creatingUser'),
			createdAt: getAttr(coding, 'creationDateTime'),
			noteGuids: getChildElements(coding, 'NoteRef')
				.map((note) => getAttr(note, 'targetGUID'))
				.filter((id): id is string => !!id),
			sourceCodingGuids: guid ? [guid] : [],
		}];
	});
}

function semanticCodingKey(coding: ParsedQdpxCoding): string {
	return `${coding.creatingUserGuid ?? ''}\u0000${coding.codeGuid}`;
}

function earliestCreationDate(current: string | undefined, candidate: string | undefined): string | undefined {
	if (!current) return candidate;
	if (!candidate) return current;
	const currentTime = new Date(current).getTime();
	const candidateTime = new Date(candidate).getTime();
	if (Number.isNaN(currentTime)) return Number.isNaN(candidateTime) ? current : candidate;
	if (Number.isNaN(candidateTime)) return current;
	return candidateTime < currentTime ? candidate : current;
}

export function mergeQdpxRepresentationCodings(
	selections: ReadonlyArray<{ codings: ParsedQdpxCoding[] }>,
): ParsedQdpxCoding[] {
	const merged = new Map<string, ParsedQdpxCoding>();
	for (const selection of selections) {
		for (const coding of selection.codings) {
			const key = semanticCodingKey(coding);
			const current = merged.get(key);
			if (!current) {
				merged.set(key, {
					...coding,
					noteGuids: [...coding.noteGuids],
					sourceCodingGuids: [...coding.sourceCodingGuids],
				});
				continue;
			}
			current.sourceCodingGuids = [...new Set([...current.sourceCodingGuids, ...coding.sourceCodingGuids])];
			current.noteGuids = [...new Set([...current.noteGuids, ...coding.noteGuids])];
			current.createdAt = earliestCreationDate(current.createdAt, coding.createdAt);
			current.guid ??= coding.guid;
		}
	}
	return [...merged.values()];
}

export function mergePairedCodings(
	pdfCodings: ParsedQdpxCoding[],
	textCodings: ParsedQdpxCoding[],
): ParsedQdpxCoding[] {
	return mergeQdpxRepresentationCodings([
		{ codings: pdfCodings },
		{ codings: textCodings },
	]);
}

export function groupCodingsByUser(codings: ParsedQdpxCoding[]): ParsedQdpxCoderGroup[] {
	const groups = new Map<string, ParsedQdpxCoderGroup>();
	for (const coding of codings) {
		const key = coding.creatingUserGuid ?? '__unattributed__';
		const group = groups.get(key) ?? { creatingUserGuid: coding.creatingUserGuid, codings: [] };
		group.codings.push(coding);
		groups.set(key, group);
	}
	return [...groups.values()];
}

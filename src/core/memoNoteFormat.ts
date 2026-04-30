import type { EntityRef } from './memoTypes';
import { entityRefToString, entityRefFromString } from './memoTypes';

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n*/;

export function serializeMemoNote(ref: EntityRef, displayName: string, content: string): string {
	const refStr = entityRefToString(ref);
	const safeName = needsQuotes(displayName) ? `'${displayName.replace(/'/g, "''")}'` : displayName;
	return `---\nqualiaMemoOf: ${refStr}\nqualiaCodeName: ${safeName}\n---\n\n${content}`;
}

export function parseMemoNote(text: string): { ref: EntityRef; content: string } | null {
	const match = FRONTMATTER_RE.exec(text);
	if (!match) return null;
	const fm = match[1] ?? '';
	const refLine = fm.split('\n').find(l => l.startsWith('qualiaMemoOf:'));
	if (!refLine) return null;
	const refStr = refLine.slice('qualiaMemoOf:'.length).trim();
	const ref = entityRefFromString(refStr);
	if (!ref) return null;
	const content = text.slice(match[0].length);
	return { ref, content };
}

function needsQuotes(s: string): boolean {
	return /["':#\[\]{}|>!%@&*]/.test(s) || s !== s.trim();
}

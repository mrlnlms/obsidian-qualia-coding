import type { CodeApplication, CodeRelation } from './types';

export function hasCode(codes: CodeApplication[], codeId: string): boolean {
	return codes.some(c => c.codeId === codeId);
}

export function getCodeIds(codes: CodeApplication[]): string[] {
	return codes.map(c => c.codeId);
}

export function findCodeApplication(codes: CodeApplication[], codeId: string): CodeApplication | undefined {
	return codes.find(c => c.codeId === codeId);
}

export function addCodeApplication(codes: CodeApplication[], codeId: string): CodeApplication[] {
	if (hasCode(codes, codeId)) return codes;
	return [...codes, { codeId }];
}

export function removeCodeApplication(codes: CodeApplication[], codeId: string): CodeApplication[] {
	return codes.filter(c => c.codeId !== codeId);
}

export function getMagnitude(codes: CodeApplication[], codeId: string): string | undefined {
	return codes.find(c => c.codeId === codeId)?.magnitude;
}

export function setMagnitude(codes: CodeApplication[], codeId: string, value: string | undefined): CodeApplication[] {
	const idx = codes.findIndex(c => c.codeId === codeId);
	if (idx < 0) return codes;
	const updated = codes.map((c, i) => i === idx ? { ...c, magnitude: value } : c);
	return updated;
}

export function getRelations(codes: CodeApplication[], codeId: string): CodeRelation[] {
	return codes.find(c => c.codeId === codeId)?.relations ?? [];
}

export function addRelation(codes: CodeApplication[], codeId: string, relation: CodeRelation): CodeApplication[] {
	const idx = codes.findIndex(c => c.codeId === codeId);
	if (idx < 0) return codes;
	const ca = codes[idx];
	const existing = ca.relations ?? [];
	const dup = existing.some(r => r.label === relation.label && r.target === relation.target && r.directed === relation.directed);
	if (dup) return codes;
	return codes.map((c, i) => i === idx ? { ...c, relations: [...existing, relation] } : c);
}

export function removeRelation(codes: CodeApplication[], codeId: string, label: string, target: string): CodeApplication[] {
	const idx = codes.findIndex(c => c.codeId === codeId);
	if (idx < 0) return codes;
	const ca = codes[idx];
	const existing = ca.relations ?? [];
	const filtered = existing.filter(r => !(r.label === label && r.target === target));
	if (filtered.length === existing.length) return codes;
	return codes.map((c, i) => i === idx ? { ...c, relations: filtered } : c);
}

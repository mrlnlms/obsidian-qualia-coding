import type { CodeApplication } from './types';

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

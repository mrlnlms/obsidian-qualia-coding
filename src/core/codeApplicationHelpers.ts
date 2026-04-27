import type { CodeApplication, CodeRelation } from './types';
import type { CodeDefinitionRegistry } from './codeDefinitionRegistry';

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
	const ca = codes[idx]!;
	const existing = ca.relations ?? [];
	const dup = existing.some(r => r.label === relation.label && r.target === relation.target && r.directed === relation.directed);
	if (dup) return codes;
	return codes.map((c, i) => i === idx ? { ...c, relations: [...existing, relation] } : c);
}

/**
 * Update the memo of an application-level relation in-place by tuple match (codeId, label, target).
 * Returns true if a matching relation was found, false otherwise. If duplicate tuples exist, only
 * the first is updated (same limit as the code-level setRelationMemo).
 *
 * NOTE: this helper mutates `codes[i].relations[j].memo` in place — diverges from the immutable
 * pattern of `addRelation`/`removeRelation` because callers already hold the marker reference and
 * persist via `dataManager.markDirty()`. Callers in Memo View use this through `onSaveAppRelationMemo`.
 */
export function setApplicationRelationMemo(
	codes: CodeApplication[],
	codeId: string,
	label: string,
	target: string,
	memo: string,
): boolean {
	for (const ca of codes) {
		if (ca.codeId !== codeId) continue;
		for (const r of ca.relations ?? []) {
			if (r.label === label && r.target === target) {
				r.memo = memo;
				return true;
			}
		}
	}
	return false;
}

export function removeRelation(codes: CodeApplication[], codeId: string, label: string, target: string): CodeApplication[] {
	const idx = codes.findIndex(c => c.codeId === codeId);
	if (idx < 0) return codes;
	const ca = codes[idx]!;
	const existing = ca.relations ?? [];
	const filtered = existing.filter(r => !(r.label === label && r.target === target));
	if (filtered.length === existing.length) return codes;
	return codes.map((c, i) => i === idx ? { ...c, relations: filtered } : c);
}

export interface NormalizeResult {
	normalized: CodeApplication[];
	changed: boolean;
}

/**
 * Canonicalize codeIds on a set of applications against a registry.
 *
 * Each application must end up with `codeId` equal to a live `CodeDefinition.id`.
 * Legacy data from pre-Phase-C vaults carries the name in that field; newer data
 * carries the real id. This helper resolves both, and drops orphans whose code
 * has since been deleted from the registry.
 *
 * If no application needs rewriting and none is dropped, the returned `normalized`
 * is the same array reference as the input.
 */
export function normalizeCodeApplications(
	apps: CodeApplication[],
	registry: CodeDefinitionRegistry,
): NormalizeResult {
	if (apps.length === 0) return { normalized: apps, changed: false };

	let changed = false;
	const out: CodeApplication[] = [];

	for (const app of apps) {
		if (registry.getById(app.codeId)) {
			out.push(app);
			continue;
		}
		const def = registry.getByName(app.codeId);
		if (def) {
			out.push({ ...app, codeId: def.id });
			changed = true;
			continue;
		}
		changed = true;
	}

	return { normalized: changed ? out : apps, changed };
}

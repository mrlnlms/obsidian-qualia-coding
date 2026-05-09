/**
 * computeCodebookHash — SHA-256 determinístico do codebook.
 *
 * Canonical serialization: sort por id, JSON com chaves estáveis.
 * NÃO inclui campos voláteis (createdAt/updatedAt) — pra estabilidade entre vaults
 * que sincronizaram o mesmo codebook em momentos diferentes.
 *
 * Usado em payload.codebookVersion (Slice 3) pra detectar codebook divergence
 * entre coder remoto (export) e lead local (import).
 */

import type { CodeDefinition, GroupDefinition, SmartCodeDefinition } from '../../types';
import { computeSourceHash } from '../computeSourceHash';

interface CodebookSnapshot {
	codes: CodeDefinition[];
	groups: GroupDefinition[];
	smartCodes: SmartCodeDefinition[];
}

export async function computeCodebookHash(snapshot: CodebookSnapshot): Promise<string> {
	const canonical = {
		codes: snapshot.codes
			.map(c => ({ id: c.id, name: c.name, color: c.color, parentId: c.parentId, groups: c.groups }))
			.sort((a, b) => a.id.localeCompare(b.id)),
		groups: snapshot.groups
			.map(g => ({ id: g.id, name: g.name, color: g.color }))
			.sort((a, b) => a.id.localeCompare(b.id)),
		smartCodes: snapshot.smartCodes
			.map(sc => ({ id: sc.id, name: sc.name, predicate: sc.predicate }))
			.sort((a, b) => a.id.localeCompare(b.id)),
	};
	const json = JSON.stringify(canonical);
	const buffer = new TextEncoder().encode(json).buffer;
	return computeSourceHash(buffer);
}

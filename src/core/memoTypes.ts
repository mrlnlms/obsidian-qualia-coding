import type { EngineType } from '../analytics/data/dataTypes';

export interface MaterializedRef {
	path: string;
	mtime: number;
}

export interface MemoRecord {
	content: string;
	materialized?: MaterializedRef;
}

export type EntityRef =
	| { type: 'code'; id: string }
	| { type: 'group'; id: string }
	| { type: 'marker'; engineType: EngineType; id: string }
	| { type: 'relation-code'; codeId: string; label: string; target: string }
	| { type: 'relation-app'; engineType: EngineType; markerId: string; codeId: string; label: string; target: string }
	| { type: 'smartCode'; id: string };

export function entityRefToString(ref: EntityRef): string {
	switch (ref.type) {
		case 'code': return `code:${ref.id}`;
		case 'group': return `group:${ref.id}`;
		case 'marker': return `marker:${ref.engineType}:${ref.id}`;
		case 'relation-code': return `relation-code:${ref.codeId}:${ref.label}:${ref.target}`;
		case 'relation-app': return `relation-app:${ref.engineType}:${ref.markerId}:${ref.codeId}:${ref.label}:${ref.target}`;
		case 'smartCode': return `smartCode:${ref.id}`;
	}
}

export function entityRefFromString(s: string): EntityRef | null {
	const parts = s.split(':');
	if (parts.length < 2) return null;
	const [type, ...rest] = parts;
	switch (type) {
		case 'code':
			return rest.length === 1 ? { type: 'code', id: rest[0]! } : null;
		case 'group':
			return rest.length === 1 ? { type: 'group', id: rest[0]! } : null;
		case 'marker':
			return rest.length === 2 ? { type: 'marker', engineType: rest[0] as EngineType, id: rest[1]! } : null;
		case 'relation-code':
			return rest.length === 3 ? { type: 'relation-code', codeId: rest[0]!, label: rest[1]!, target: rest[2]! } : null;
		case 'relation-app':
			return rest.length === 5 ? {
				type: 'relation-app', engineType: rest[0] as EngineType,
				markerId: rest[1]!, codeId: rest[2]!, label: rest[3]!, target: rest[4]!,
			} : null;
		case 'smartCode':
			return rest.length === 1 ? { type: 'smartCode', id: rest[0]! } : null;
		default: return null;
	}
}

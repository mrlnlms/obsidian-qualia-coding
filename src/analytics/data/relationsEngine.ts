import type { CodeDefinition, BaseMarker } from '../../core/types';
import { buildRelationEdges, type RelationEdge } from '../../core/relationHelpers';

export type RelationsLevel = 'code' | 'both';

export interface RelationNode {
	id: string;
	name: string;
	color: string;
	weight: number;
}

export function extractRelationEdges(
	definitions: CodeDefinition[],
	markers: BaseMarker[],
	level: RelationsLevel,
): RelationEdge[] {
	return buildRelationEdges(definitions, markers, level === 'code' ? 'code' : 'both');
}

export function extractRelationNodes(
	definitions: CodeDefinition[],
	edges: RelationEdge[],
	frequencyMap: Map<string, number>,
): RelationNode[] {
	const nodeIds = new Set<string>();
	for (const e of edges) {
		nodeIds.add(e.source);
		nodeIds.add(e.target);
	}
	const defMap = new Map(definitions.map(d => [d.id, d]));
	const nodes: RelationNode[] = [];
	for (const id of nodeIds) {
		const def = defMap.get(id);
		if (!def) continue;
		nodes.push({ id: def.id, name: def.name, color: def.color, weight: frequencyMap.get(id) ?? 0 });
	}
	return nodes;
}

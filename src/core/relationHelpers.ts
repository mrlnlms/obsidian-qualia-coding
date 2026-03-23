import type { CodeDefinition, CodeRelation, BaseMarker } from './types';

export interface RelationEdge {
	source: string;
	target: string;
	label: string;
	directed: boolean;
	level: 'code' | 'segment' | 'merged';
	weight: number;
}

export function collectAllLabels(definitions: CodeDefinition[], markers: BaseMarker[]): string[] {
	const labels = new Set<string>();
	for (const def of definitions) {
		if (def.relations) {
			for (const r of def.relations) labels.add(r.label);
		}
	}
	for (const marker of markers) {
		for (const ca of marker.codes) {
			if (ca.relations) {
				for (const r of ca.relations) labels.add(r.label);
			}
		}
	}
	return [...labels].sort();
}

type EdgeLevel = 'code' | 'both';

export function buildRelationEdges(
	definitions: CodeDefinition[],
	markers: BaseMarker[],
	mode: EdgeLevel,
): RelationEdge[] {
	const codeEdges = new Map<string, RelationEdge>();
	for (const def of definitions) {
		if (!def.relations) continue;
		for (const r of def.relations) {
			const key = edgeKey(def.id, r.target, r.label, r.directed);
			if (!codeEdges.has(key)) {
				codeEdges.set(key, {
					source: def.id, target: r.target, label: r.label,
					directed: r.directed, level: 'code', weight: 1,
				});
			}
		}
	}

	if (mode === 'code') return [...codeEdges.values()];

	const segCounts = new Map<string, { edge: RelationEdge; markerIds: Set<string> }>();
	for (const marker of markers) {
		for (const ca of marker.codes) {
			if (!ca.relations) continue;
			for (const r of ca.relations) {
				const key = edgeKey(ca.codeId, r.target, r.label, r.directed);
				let entry = segCounts.get(key);
				if (!entry) {
					entry = {
						edge: {
							source: ca.codeId, target: r.target, label: r.label,
							directed: r.directed, level: 'segment', weight: 0,
						},
						markerIds: new Set(),
					};
					segCounts.set(key, entry);
				}
				entry.markerIds.add(marker.id);
			}
		}
	}

	const result: RelationEdge[] = [];
	const processedKeys = new Set<string>();

	for (const [key, codeEdge] of codeEdges) {
		const segEntry = segCounts.get(key);
		if (segEntry) {
			result.push({ ...codeEdge, level: 'merged', weight: segEntry.markerIds.size });
			processedKeys.add(key);
		} else {
			result.push(codeEdge);
		}
	}

	for (const [key, entry] of segCounts) {
		if (processedKeys.has(key)) continue;
		entry.edge.weight = entry.markerIds.size;
		result.push(entry.edge);
	}

	return result;
}

function edgeKey(source: string, target: string, label: string, directed: boolean): string {
	if (directed) return `${source}→${target}:${label}`;
	const [a, b] = source < target ? [source, target] : [target, source];
	return `${a}↔${b}:${label}`;
}

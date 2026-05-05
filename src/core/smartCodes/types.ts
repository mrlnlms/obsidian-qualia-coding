export type {
	SmartCodeDefinition,
	PredicateNode,
	LeafNode,
	OpNode,
	EngineType,
	MarkerRef,
	MarkerMutationEvent,
	AnyMarker,
	QualiaData,
} from '../types';

import type { PredicateNode, OpNode, LeafNode } from '../types';

export function isOpNode(node: PredicateNode): node is OpNode {
	return 'op' in node;
}

export function isLeafNode(node: PredicateNode): node is LeafNode {
	return 'kind' in node;
}

export interface BrokenLeafInfo {
	kind: 'broken';
	reason: 'code-deleted' | 'folder-deleted' | 'group-deleted' | 'casevar-deleted' | 'smartcode-deleted' | 'magnitude-not-continuous';
	originalLeafKind: string;
	originalRef: string;
}

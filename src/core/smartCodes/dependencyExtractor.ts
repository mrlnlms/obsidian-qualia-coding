import type { PredicateNode } from './types';
import { isOpNode } from './types';

export interface Dependencies {
	codeIds: Set<string>;
	caseVarKeys: Set<string>;
	folderIds: Set<string>;
	groupIds: Set<string>;
	smartCodeIds: Set<string>;
	needsRelations: boolean;
	needsEngineType: boolean;
}

export function extractDependencies(predicate: PredicateNode): Dependencies {
	const deps: Dependencies = {
		codeIds: new Set(),
		caseVarKeys: new Set(),
		folderIds: new Set(),
		groupIds: new Set(),
		smartCodeIds: new Set(),
		needsRelations: false,
		needsEngineType: false,
	};
	walk(predicate, deps);
	return deps;
}

function walk(node: PredicateNode, deps: Dependencies): void {
	if (isOpNode(node)) {
		if (node.op === 'NOT') walk(node.child, deps);
		else for (const c of node.children) walk(c, deps);
		return;
	}
	switch (node.kind) {
		case 'hasCode':         deps.codeIds.add(node.codeId); break;
		case 'magnitudeGte':    deps.codeIds.add(node.codeId); break;
		case 'magnitudeLte':    deps.codeIds.add(node.codeId); break;
		case 'caseVarEquals':   deps.caseVarKeys.add(node.variable); break;
		case 'caseVarRange':    deps.caseVarKeys.add(node.variable); break;
		case 'inFolder':        deps.folderIds.add(node.folderId); break;
		case 'inGroup':         deps.groupIds.add(node.groupId); break;
		case 'smartCode':       deps.smartCodeIds.add(node.smartCodeId); break;
		case 'engineType':      deps.needsEngineType = true; break;
		case 'relationExists':
			deps.codeIds.add(node.codeId);
			if (node.targetCodeId) deps.codeIds.add(node.targetCodeId);
			deps.needsRelations = true;
			break;
	}
}

import type { PredicateNode, SmartCodeDefinition, CodeDefinition, FolderDefinition, GroupDefinition } from '../types';
import { isOpNode } from './types';

export interface ValidationIssue {
	code: 'empty' | 'cycle' | 'name-collision' | 'broken-ref' | 'magnitude-not-continuous';
	message: string;
	leaf?: { kind: string; ref?: string };
}

export interface ValidationResult {
	errors: ValidationIssue[];
	warnings: ValidationIssue[];
	valid: boolean;
}

export interface RegistrySnapshot {
	definitions: Record<string, CodeDefinition>;
	smartCodes: Record<string, SmartCodeDefinition>;
	folders: Record<string, FolderDefinition>;
	groups: Record<string, GroupDefinition>;
}

export function validateForSave(
	definition: { id: string; name: string },
	predicate: PredicateNode,
	registry: RegistrySnapshot,
	caseVarsKeys?: Set<string>,
): ValidationResult {
	const errors: ValidationIssue[] = [];
	const warnings: ValidationIssue[] = [];

	// 1. Empty (recursive — qualquer AND/OR no AST com 0 children é error)
	if (hasEmptyGroup(predicate)) {
		errors.push({ code: 'empty', message: 'Predicate must have at least one condition (no empty AND/OR groups)' });
	}

	// 2. Name collision (case-insensitive, exclude self)
	const nameLower = definition.name.trim().toLowerCase();
	if (nameLower.length > 0) {
		for (const [id, sc] of Object.entries(registry.smartCodes)) {
			if (id === definition.id) continue;
			if (sc.name.trim().toLowerCase() === nameLower) {
				errors.push({ code: 'name-collision', message: `Smart code with name "${sc.name}" already exists` });
				break;
			}
		}
	}

	// 3+4+5. Walk predicate: broken refs, magnitude type, cycles
	walk(predicate, definition.id, new Set([definition.id]), registry, caseVarsKeys, errors, warnings);

	return { errors, warnings, valid: errors.length === 0 };
}

function hasEmptyGroup(node: PredicateNode): boolean {
	if (isOpNode(node)) {
		if (node.op === 'NOT') return hasEmptyGroup(node.child);
		if (node.children.length === 0) return true;
		return node.children.some(hasEmptyGroup);
	}
	return false;
}

function walk(
	node: PredicateNode,
	selfId: string,
	visiting: Set<string>,
	registry: RegistrySnapshot,
	caseVarsKeys: Set<string> | undefined,
	errors: ValidationIssue[],
	warnings: ValidationIssue[],
): void {
	if (isOpNode(node)) {
		if (node.op === 'NOT') walk(node.child, selfId, visiting, registry, caseVarsKeys, errors, warnings);
		else for (const c of node.children) walk(c, selfId, visiting, registry, caseVarsKeys, errors, warnings);
		return;
	}
	switch (node.kind) {
		case 'hasCode':
		case 'magnitudeGte':
		case 'magnitudeLte':
		case 'relationExists': {
			if (!registry.definitions[node.codeId]) {
				warnings.push({ code: 'broken-ref', message: `Code ${node.codeId} was deleted`, leaf: { kind: node.kind, ref: node.codeId }});
			} else if (node.kind === 'magnitudeGte' || node.kind === 'magnitudeLte') {
				const code = registry.definitions[node.codeId];
				const magType = code.magnitude?.type;
				if (magType && magType !== 'continuous') {
					errors.push({ code: 'magnitude-not-continuous', message: `Code "${code.name}" has magnitude type "${magType}", magnitudeGte/Lte requires "continuous"`, leaf: { kind: node.kind, ref: node.codeId }});
				}
			}
			if (node.kind === 'relationExists' && node.targetCodeId && !registry.definitions[node.targetCodeId]) {
				warnings.push({ code: 'broken-ref', message: `Target code ${node.targetCodeId} was deleted`, leaf: { kind: node.kind, ref: node.targetCodeId }});
			}
			break;
		}
		case 'caseVarEquals':
		case 'caseVarRange':
			if (caseVarsKeys && !caseVarsKeys.has(node.variable)) {
				warnings.push({ code: 'broken-ref', message: `Case variable "${node.variable}" not found`, leaf: { kind: node.kind, ref: node.variable }});
			}
			break;
		case 'inFolder':
			if (!registry.folders[node.folderId]) warnings.push({ code: 'broken-ref', message: `Folder ${node.folderId} was deleted`, leaf: { kind: node.kind, ref: node.folderId }});
			break;
		case 'inGroup':
			if (!registry.groups[node.groupId]) warnings.push({ code: 'broken-ref', message: `Group ${node.groupId} was deleted`, leaf: { kind: node.kind, ref: node.groupId }});
			break;
		case 'smartCode': {
			// Cycle check ANTES do registry lookup — sc sendo validado pode não estar no registry ainda
			if (visiting.has(node.smartCodeId)) {
				errors.push({ code: 'cycle', message: `Circular reference: ${[...visiting, node.smartCodeId].join(' → ')}`, leaf: { kind: node.kind, ref: node.smartCodeId }});
				break;
			}
			const target = registry.smartCodes[node.smartCodeId];
			if (!target) {
				warnings.push({ code: 'broken-ref', message: `Smart code ${node.smartCodeId} was deleted`, leaf: { kind: node.kind, ref: node.smartCodeId }});
			} else {
				const newVisiting = new Set(visiting).add(node.smartCodeId);
				walk(target.predicate, selfId, newVisiting, registry, caseVarsKeys, errors, warnings);
			}
			break;
		}
		case 'engineType':
			break;
	}
}

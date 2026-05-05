import type { PredicateNode, OpNode, LeafNode, MarkerRef, AnyMarker, SmartCodeDefinition } from './types';
import { isOpNode } from './types';
import type { CodeApplication } from '../types';
import { hasCode, getMagnitude } from '../codeApplicationHelpers';

type CaseVarValue = string | number | boolean | undefined;

export interface EvaluatorContext {
	caseVars: { get: (fileId: string, variable: string) => CaseVarValue };
	codesInFolder: (folderId: string) => string[];
	codesInGroup: (groupId: string) => string[];
	smartCodes: Record<string, SmartCodeDefinition>;
	evaluating: Set<string>;
}

/** Evaluate predicate against a single marker. Pure, recursive, com short-circuit. */
export function evaluate(node: PredicateNode, ref: MarkerRef, marker: AnyMarker, ctx: EvaluatorContext): boolean {
	if (isOpNode(node)) return evaluateOp(node, ref, marker, ctx);
	return evaluateLeaf(node, ref, marker, ctx);
}

function evaluateOp(node: OpNode, ref: MarkerRef, marker: AnyMarker, ctx: EvaluatorContext): boolean {
	switch (node.op) {
		case 'AND': return node.children.every(c => evaluate(c, ref, marker, ctx));
		case 'OR':  return node.children.some(c => evaluate(c, ref, marker, ctx));
		case 'NOT': return !evaluate(node.child, ref, marker, ctx);
	}
}

function evaluateLeaf(node: LeafNode, ref: MarkerRef, marker: AnyMarker, ctx: EvaluatorContext): boolean {
	const codes = marker.codes;
	switch (node.kind) {
		case 'hasCode':         return hasCode(codes, node.codeId);
		case 'caseVarEquals':   return ctx.caseVars.get(ref.fileId, node.variable) === node.value;
		case 'caseVarRange':    return inRange(ctx.caseVars.get(ref.fileId, node.variable), node);
		case 'magnitudeGte':    return magnitudeAsNumber(codes, node.codeId, 0) >= node.n;
		case 'magnitudeLte':    return magnitudeAsNumber(codes, node.codeId, Infinity) <= node.n;
		case 'inFolder':        return ctx.codesInFolder(node.folderId).some(cId => hasCode(codes, cId));
		case 'inGroup':         return ctx.codesInGroup(node.groupId).some(cId => hasCode(codes, cId));
		case 'engineType':      return ref.engine === node.engine;
		case 'relationExists':  return checkRelation(codes, node);
		case 'smartCode':       return evaluateNested(node.smartCodeId, ref, marker, ctx);
	}
}

function magnitudeAsNumber(codes: CodeApplication[], codeId: string, fallback: number): number {
	const raw = getMagnitude(codes, codeId);
	if (raw === undefined || raw === null || raw === '') return fallback;
	const n = Number(raw);
	return Number.isFinite(n) ? n : fallback;
}

function evaluateNested(smartCodeId: string, ref: MarkerRef, marker: AnyMarker, ctx: EvaluatorContext): boolean {
	if (ctx.evaluating.has(smartCodeId)) return false;  // cycle guard
	const target = ctx.smartCodes[smartCodeId];
	if (!target) return false;  // broken ref → no-match
	const newCtx: EvaluatorContext = { ...ctx, evaluating: new Set(ctx.evaluating).add(smartCodeId) };
	return evaluate(target.predicate, ref, marker, newCtx);
}

function inRange(val: CaseVarValue, node: LeafNode & { kind: 'caseVarRange' }): boolean {
	if (val === undefined || val === null) return false;
	if (node.min !== undefined && Number(val) < node.min) return false;
	if (node.max !== undefined && Number(val) > node.max) return false;
	if (node.minDate && String(val) < node.minDate) return false;
	if (node.maxDate && String(val) > node.maxDate) return false;
	return true;
}

function checkRelation(codes: CodeApplication[], node: LeafNode & { kind: 'relationExists' }): boolean {
	for (const app of codes) {
		if (app.codeId !== node.codeId) continue;
		for (const rel of app.relations ?? []) {
			if (node.label && rel.label !== node.label) continue;
			if (node.targetCodeId && rel.target !== node.targetCodeId) continue;
			return true;
		}
	}
	return false;
}

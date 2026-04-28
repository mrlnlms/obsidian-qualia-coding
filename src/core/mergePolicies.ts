import type { CodeDefinition } from './types';

export type NameChoice =
	| { kind: 'target' }
	| { kind: 'source'; codeId: string }
	| { kind: 'custom'; value: string };

export type ColorChoice =
	| { kind: 'target' }
	| { kind: 'source'; codeId: string };

export type TextPolicy =
	| { kind: 'keep-target' }
	| { kind: 'concatenate' }
	| { kind: 'keep-only'; codeId: string }
	| { kind: 'discard' };

export function resolveName(choice: NameChoice, target: CodeDefinition, sources: CodeDefinition[]): string {
	if (choice.kind === 'target') return target.name;
	if (choice.kind === 'custom') return choice.value.trim();
	const src = sources.find(s => s.id === choice.codeId);
	return src ? src.name : target.name;
}

export function resolveColor(choice: ColorChoice, target: CodeDefinition, sources: CodeDefinition[]): string {
	if (choice.kind === 'target') return target.color;
	const src = sources.find(s => s.id === choice.codeId);
	return src ? src.color : target.color;
}

export function applyTextPolicy(
	policy: TextPolicy,
	target: CodeDefinition,
	sources: CodeDefinition[],
	field: 'description' | 'memo',
): string | undefined {
	if (policy.kind === 'discard') return undefined;

	if (policy.kind === 'keep-target') {
		const val = target[field]?.trim();
		return val ? val : undefined;
	}

	if (policy.kind === 'keep-only') {
		const entity = policy.codeId === target.id
			? target
			: sources.find(s => s.id === policy.codeId);
		const val = entity?.[field]?.trim();
		return val ? val : undefined;
	}

	const parts: string[] = [];
	const targetText = target[field]?.trim();
	if (targetText) parts.push(targetText);
	for (const src of sources) {
		const text = src[field]?.trim();
		if (text) parts.push(`--- From ${src.name} ---\n${text}`);
	}
	return parts.length > 0 ? parts.join('\n\n') : undefined;
}

/**
 * Por código chip — agrupa markers da contribuição por codeId, ordena por count desc.
 * Batch actions: Accept all (clear skip pra esse code) / Skip all (perCodeSkip + skip
 * code def se novo) / Revisar 1-a-1 → (muda chip pra side-by-side filtrado por codeId).
 */

import type { PendingContribution } from './contributionViewTypes';

export interface ByCodeContext {
	localCountByCode: Record<string, number>;
	overlapCountByCode: Record<string, number>;
}

export interface ByCodeCallbacks {
	onAcceptAllCode: (codeId: string) => void;
	onSkipAllCode: (codeId: string) => void;
	onRevise: (codeId: string) => void;
}

export interface CodeGroup {
	codeId: string;
	codeName: string;
	incomingCount: number;
}

export function groupMarkersByCode(contrib: PendingContribution): CodeGroup[] {
	const counts = new Map<string, number>();
	const tally = (codeId: string): void => {
		counts.set(codeId, (counts.get(codeId) ?? 0) + 1);
	};

	for (const markers of Object.values(contrib.payload.markers.markdown)) {
		for (const m of markers) {
			for (const c of (m as any).codes ?? []) tally(c.codeId);
		}
	}
	for (const m of contrib.payload.markers.pdf) {
		for (const c of (m as any).codes ?? []) tally(c.codeId);
	}
	for (const m of contrib.payload.markers.csvSegment) {
		for (const c of (m as any).codes ?? []) tally(c.codeId);
	}

	const groups: CodeGroup[] = [];
	for (const [codeId, count] of counts) {
		const codeDef = contrib.payload.codes.find(c => c.id === codeId);
		groups.push({
			codeId,
			codeName: codeDef?.name ?? codeId,
			incomingCount: count,
		});
	}

	return groups.sort((a, b) => b.incomingCount - a.incomingCount);
}

export function renderByCodeChip(
	container: HTMLElement,
	contrib: PendingContribution,
	ctx: ByCodeContext,
	cb: ByCodeCallbacks,
): void {
	container.empty();

	const groups = groupMarkersByCode(contrib);

	if (groups.length === 0) {
		const empty = container.createDiv({ cls: 'qc-icr-empty' });
		empty.setText('contribuição sem markers');
		return;
	}

	const coderName = contrib.payload.coder.name;

	for (const g of groups) {
		const block = container.createDiv({ cls: 'qc-icr-code-block' });
		const localCount = ctx.localCountByCode[g.codeId] ?? 0;
		const overlap = ctx.overlapCountByCode[g.codeId] ?? 0;
		const isNew = localCount === 0;

		const header = block.createDiv({ cls: 'qc-icr-code-block-header' });
		const headerParts = [
			g.codeName,
			`${coderName} aplicou ${g.incomingCount}x`,
			`você ${localCount}x`,
			`overlap ${overlap}`,
		];
		if (isNew) headerParts.push('novo');
		header.setText(headerParts.join(' · '));

		const body = block.createDiv({ cls: 'qc-icr-code-block-body' });
		const desc = body.createDiv();
		const onlyTheirs = g.incomingCount - overlap;
		desc.setText(
			isNew
				? `Código ${g.codeName} é novo (você nunca marcou). ${g.incomingCount} markers de ${coderName}.`
				: `${g.incomingCount} markers de ${coderName} (${overlap} que você também marcou, ${onlyTheirs} só dele).`,
		);

		const actions = body.createDiv({ cls: 'qc-icr-code-block-actions' });
		const accept = actions.createEl('button', { cls: 'qc-icr-button', text: `Accept all ${g.incomingCount}` });
		accept.onclick = () => cb.onAcceptAllCode(g.codeId);
		const skip = actions.createEl('button', { cls: 'qc-icr-button secondary', text: 'Skip all' });
		skip.onclick = () => cb.onSkipAllCode(g.codeId);
		const revise = actions.createEl('button', { cls: 'qc-icr-button secondary', text: 'Revisar 1-a-1 →' });
		revise.onclick = () => cb.onRevise(g.codeId);
	}
}

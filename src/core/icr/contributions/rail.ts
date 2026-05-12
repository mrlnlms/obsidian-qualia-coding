/**
 * Rail lateral da ICR Import view: lista de contribuições pendentes + drop zone.
 *
 * Render é puro DOM (sem Obsidian deps de runtime) pra testabilidade. Drop event
 * handler vive em unifiedIcrImportView.ts (precisa de plugin context pra parse + add).
 */

import type { PendingContribution } from './contributionViewTypes';

export function renderRailContent(
	container: HTMLElement,
	pending: PendingContribution[],
	activeId: string | null,
	onSelect: (id: string) => void,
): void {
	container.empty();

	const label = container.createDiv({ cls: 'qc-icr-rail-label' });
	label.setText(`Pending (${pending.length})`);

	// A4: detecta coderIds duplicados na rail (2+ contribuições do mesmo coder).
	const coderCounts = new Map<string, number>();
	for (const c of pending) {
		const id = c.payload.coder.id;
		coderCounts.set(id, (coderCounts.get(id) ?? 0) + 1);
	}

	for (const c of pending) {
		const item = container.createDiv({ cls: 'qc-icr-rail-item' });
		if (c.id === activeId) item.addClass('is-active');

		const isDuplicateCoder = (coderCounts.get(c.payload.coder.id) ?? 0) > 1;
		if (isDuplicateCoder) item.addClass('is-duplicate-coder');

		const name = item.createDiv({ cls: 'qc-icr-rail-item-name' });
		name.setText(c.payload.coder.name);

		if (isDuplicateCoder) {
			const dupBadge = name.createSpan({ cls: 'qc-icr-rail-dup-badge' });
			dupBadge.setText('duplicate');
			dupBadge.title = `${coderCounts.get(c.payload.coder.id)} contribuições do mesmo coder — apply sequencial ignora markers já aplicados (dedup por id)`;
		}

		const meta = item.createDiv({ cls: 'qc-icr-rail-item-meta' });
		meta.setText(`${c.mergePreview.added.markers} markers`);

		if (c.mergePreview.conflicts.length > 0) {
			const badge = meta.createSpan({ cls: 'qc-icr-rail-badge' });
			badge.setText(` · ${c.mergePreview.conflicts.length} conflicts`);
		}

		item.onclick = () => onSelect(c.id);
	}

	const drop = container.createDiv({ cls: 'qc-icr-rail-drop' });
	if (pending.length === 0) {
		drop.addClass('is-empty');
		drop.setText('drop arquivo .json ou Cmd P → "ICR: Open import"');
	} else {
		drop.setText('drop mais arquivos');
	}
}

/**
 * importToolbar — renderiza chips + sub-pergunta + meta header.
 * Pattern reusado de unifiedCompareCodersView.ts:67-114 (qc-cc-mode-chip).
 */

import type { PendingContribution, ChipId } from './contributionViewTypes';

const CHIPS: Array<{ id: ChipId; label: string; question: string }> = [
	{ id: 'overview', label: '▦ Visão geral', question: 'o batch como um todo bate? (resolve divergências, depois apply)' },
	{ id: 'side-by-side', label: '▤ Lado a lado', question: 'esse marker bate com o que eu codificaria? (accept/skip por marker)' },
	{ id: 'by-code', label: '▥ Por código', question: 'qual código tá divergindo mais? (revisão temática)' },
];

export function renderToolbarContent(
	container: HTMLElement,
	contrib: PendingContribution,
	activeChip: ChipId,
	onChipChange: (chip: ChipId) => void,
): void {
	container.empty();

	const row = container.createDiv({ cls: 'qc-icr-toolbar-row' });
	for (const c of CHIPS) {
		const chip = row.createSpan({
			cls: `qc-cc-mode-chip ${c.id === activeChip ? 'is-active' : ''}`,
			text: c.label,
		});
		chip.onclick = () => onChipChange(c.id);
	}

	const meta = container.createSpan({ cls: 'qc-icr-toolbar-meta' });
	const totalMarkers = countTotalMarkers(contrib.payload);
	const dateStr = new Date(contrib.payload.exportedAt).toLocaleString();
	meta.setText(`${contrib.payload.coder.name} · ${totalMarkers} markers · exportado ${dateStr}`);

	const question = container.createDiv({ cls: 'qc-icr-toolbar-question' });
	const active = CHIPS.find(c => c.id === activeChip);
	question.setText(active?.question ?? '');
}

function countTotalMarkers(payload: PendingContribution['payload']): number {
	let total = 0;
	for (const ms of Object.values(payload.markers.markdown)) total += ms.length;
	total += payload.markers.pdf.length;
	total += payload.markers.csvSegment.length;
	return total;
}

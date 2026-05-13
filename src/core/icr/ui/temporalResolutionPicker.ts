/**
 * Temporal resolution picker — chip group `[1s][100ms][10ms]` visível no toolbar
 * quando audio/video estão no escopo. Controla o tick size do unit space temporal
 * usado pelos coeficientes (Cohen κ caminho A, Fleiss, α, α-binary, cu-α).
 *
 * Default 1s (alinhado ATLAS.ti 25). 100ms expõe turn-taking; 10ms expõe prosody.
 */

import type { EngineId } from '../reporter';

const RESOLUTIONS: { key: number; label: string; tooltip: string }[] = [
	{ key: 1,    label: '1s',    tooltip: 'Resolução 1s — alinhado com ATLAS.ti 25. Sub-segundo invisível.' },
	{ key: 0.1,  label: '100ms', tooltip: 'Resolução 100ms — útil pra turn-taking em conversation analysis.' },
	{ key: 0.01, label: '10ms',  tooltip: 'Resolução 10ms — útil pra prosody / micro-events. Unit space ×100.' },
];

export function isTemporalInScope(enginesInScope: EngineId[]): boolean {
	return enginesInScope.some(e => e === 'audio' || e === 'video');
}

export function renderTemporalResolutionPicker(
	container: HTMLElement,
	currentResolution: number,
	onSelect: (resolution: number) => void,
): void {
	container.empty();
	container.addClass('qc-cc-temporal-picker');
	const label = container.createSpan({ cls: 'qc-cc-temporal-label', text: 'resolução temporal:' });
	label.title = 'Tick size do unit space pra audio/video. Granularidades menores expõem disagreement sub-segundo ao custo de unit space maior.';
	for (const { key, label: chipLabel, tooltip } of RESOLUTIONS) {
		const active = currentResolution === key;
		const chip = container.createSpan({
			cls: `qc-cc-temporal-chip ${active ? 'is-active' : ''}`.trim(),
			text: chipLabel,
		});
		chip.dataset.resolution = String(key);
		chip.title = tooltip;
		if (!active) chip.onclick = () => onSelect(key);
	}
}

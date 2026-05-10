/**
 * Coefficient picker — 5 chips no toolbar (Cohen / Fleiss / α / α-binary / cu-α).
 *
 * Mesmo pattern dos mode chips em `unifiedCompareCodersView.renderToolbar`.
 * Chip disabled quando `isCoefficientApplicable` retorna false (Fleiss com 2
 * coders, α-binary/cu-α em csvRow puro).
 */

import type { CompareCodersViewState, CoefficientKey } from './compareCodersTypes';
import { isCoefficientApplicable } from './coefficientResolver';
import type { EngineId } from '../reporter';

const COEFFICIENTS: { key: CoefficientKey; label: string }[] = [
	{ key: 'cohen',        label: 'Cohen κ' },
	{ key: 'fleiss',       label: 'Fleiss κ' },
	{ key: 'alpha',        label: 'α' },
	{ key: 'alpha-binary', label: 'α-binary' },
	{ key: 'cu-alpha',     label: 'cu-α' },
];

export interface CoefficientPickerDeps {
	enginesInScope: EngineId[];
}

export function renderCoefficientPicker(
	container: HTMLElement,
	state: CompareCodersViewState,
	deps: CoefficientPickerDeps,
	onSelect: (coefficient: CoefficientKey) => void,
): void {
	container.empty();
	container.addClass('qc-cc-coefficient-picker');
	const coderCount = state.scope.coderIds.length;
	for (const { key, label } of COEFFICIENTS) {
		const applicable = isCoefficientApplicable(key, coderCount, deps.enginesInScope);
		const active = state.primaryCoefficient === key && applicable;
		const chip = container.createSpan({
			cls: `qc-cc-coef-chip ${active ? 'is-active' : ''} ${!applicable ? 'is-disabled' : ''}`.trim(),
			text: label,
		});
		chip.dataset.coefficient = key;
		if (!applicable) {
			chip.title = key === 'fleiss'
				? 'Fleiss κ requer 3+ coders'
				: 'α-binary / cu-α requerem engine com boundary (não aplicável a csvRow puro)';
		} else {
			chip.onclick = () => onSelect(key);
		}
	}
}

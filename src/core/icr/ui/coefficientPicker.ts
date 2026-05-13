/**
 * Coefficient picker — 5 chips no toolbar (Cohen / Fleiss / α / α-binary / cu-α)
 * + chip Distance [Nominal][Jaccard][MASI] (δ pluggable) + badge densidade multi-label.
 *
 * Chip Distance fica cinza condicionalmente:
 * - Coef = Cohen κ (caminho A binary-per-label) ou α-binary: δ não tem efeito (no-op).
 * - Densidade multi-label = 0: Jaccard/MASI dão valor idêntico ao nominal.
 *
 * δ memorizado (quando disabled): `state.distance` continua preservado e a per-engine
 * table consome esse valor pros coeficientes que respeitam δ (α / cu-α / Fleiss em
 * multi-label) — mesmo enquanto o primary é Cohen/α-binary. Chip que casa com
 * `state.distance` ganha `is-memorized` (border tracejado, opacity intermediária)
 * pra sinalizar "valor preservado pra retorno". Hint `δ: {label} (inativa)` aparece
 * inline depois dos chips quando disabled.
 *
 * Badge densidade `N/Total markers multi-label (X%)` sempre presente — comunica
 * magnitude do efeito potencial da escolha de δ.
 */

import type { CompareCodersViewState, CoefficientKey } from './compareCodersTypes';
import { isCoefficientApplicable } from './coefficientResolver';
import type { EngineId } from '../reporter';
import type { DistanceName } from '../distances';

const COEFFICIENTS: { key: CoefficientKey; label: string }[] = [
	{ key: 'cohen',        label: 'Cohen κ' },
	{ key: 'fleiss',       label: 'Fleiss κ' },
	{ key: 'alpha',        label: 'α' },
	{ key: 'alpha-binary', label: 'α-binary' },
	{ key: 'cu-alpha',     label: 'cu-α' },
];

const DISTANCES: { key: DistanceName; label: string }[] = [
	{ key: 'nominal', label: 'Nominal' },
	{ key: 'jaccard', label: 'Jaccard' },
	{ key: 'masi',    label: 'MASI' },
];

export interface CoefficientPickerDeps {
	enginesInScope: EngineId[];
	multiLabel: { multi: number; total: number; pct: number };
}

export function renderCoefficientPicker(
	container: HTMLElement,
	state: CompareCodersViewState,
	deps: CoefficientPickerDeps,
	onSelectCoefficient: (coefficient: CoefficientKey) => void,
	onSelectDistance: (distance: DistanceName) => void,
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
			chip.onclick = () => onSelectCoefficient(key);
		}
	}

	// Separator + Distance group
	container.createSpan({ cls: 'qc-cc-coef-sep', text: '·' });
	const distanceLabel = container.createSpan({ cls: 'qc-cc-distance-label', text: 'δ:' });
	distanceLabel.title = 'Família de distância usada por α / cu-α / Fleiss em escopo multi-label';

	const distanceDisabled = isDistanceDisabled(state, deps);
	const distanceTooltip = distanceTooltipText(state, deps);
	const activeDistance = state.distance ?? 'jaccard';
	// Memorized só faz sentido quando disabled é por coef insensível (Cohen/α-binary):
	// δ continua aplicada via per-engine table em α/cu-α/Fleiss. Quando disabled é por
	// multi-label = 0, todas δ degeneram pro nominal — não há memória útil pra preservar.
	const memorizedByCoef = distanceDisabled && (state.primaryCoefficient === 'cohen' || state.primaryCoefficient === 'alpha-binary');
	for (const { key, label } of DISTANCES) {
		const active = activeDistance === key && !distanceDisabled;
		const memorized = memorizedByCoef && activeDistance === key;
		const chip = container.createSpan({
			cls: `qc-cc-distance-chip ${active ? 'is-active' : ''} ${distanceDisabled ? 'is-disabled' : ''} ${memorized ? 'is-memorized' : ''}`.trim(),
			text: label,
		});
		chip.dataset.distance = key;
		chip.title = memorized
			? `${state.primaryCoefficient === 'cohen' ? 'Cohen κ caminho A' : 'α-binary'} não usa δ — métrica não se aplica. δ preservada pra retorno a α/cu-α/Fleiss em multi-label.`
			: distanceTooltip;
		if (!distanceDisabled) {
			chip.onclick = () => onSelectDistance(key);
		}
	}
	if (memorizedByCoef) {
		const memorizedLabel = DISTANCES.find(d => d.key === activeDistance)?.label ?? 'Jaccard';
		const memorizedHint = container.createSpan({
			cls: 'qc-cc-distance-memorized-hint',
			text: `δ: ${memorizedLabel} (inativa)`,
		});
		memorizedHint.title = 'δ preservada em state — per-engine table aplica a α/cu-α/Fleiss em multi-label desta modalidade, mesmo enquanto primary é Cohen/α-binary.';
	}

	// Badge densidade
	const badge = container.createSpan({ cls: 'qc-cc-multilabel-badge' });
	const { multi, total, pct } = deps.multiLabel;
	badge.setText(total > 0
		? `${multi}/${total} markers multi-label (${pct.toFixed(0)}%)`
		: '0 markers no escopo');
	badge.title = multi > 0
		? `${multi} markers no escopo têm 2+ codes aplicados. δ_jaccard e δ_MASI diferenciam acordo parcial — δ_nominal infla agreement reduzindo a first-code.`
		: 'Nenhum marker no escopo tem 2+ codes aplicados. Jaccard e MASI produzem resultado idêntico ao nominal pra escopo single-label puro.';
}

function isDistanceDisabled(state: CompareCodersViewState, deps: CoefficientPickerDeps): boolean {
	const coef = state.primaryCoefficient;
	// Cohen κ caminho A + α-binary: δ não tem efeito (Cohen é binary-per-label; α-binary é presença/ausência binária).
	const coefAcceptsDistance = coef === 'alpha' || coef === 'cu-alpha' || coef === 'fleiss';
	if (!coefAcceptsDistance) return true;
	// Sem multi-label no escopo: Jaccard/MASI degeneram ao nominal.
	if (deps.multiLabel.multi === 0) return true;
	return false;
}

function distanceTooltipText(state: CompareCodersViewState, deps: CoefficientPickerDeps): string {
	const coef = state.primaryCoefficient;
	if (coef === 'cohen') {
		return 'δ não se aplica ao Cohen κ caminho A (binary-per-label). Use α / cu-α / Fleiss pra escolher δ.';
	}
	if (coef === 'alpha-binary') {
		return 'δ não se aplica a α-binary (mede só presença/ausência binária, sem códigos).';
	}
	if (deps.multiLabel.multi === 0) {
		return 'Todos markers no escopo são single-label. Jaccard e MASI produzem resultado idêntico ao Nominal.';
	}
	return 'Nominal: reduz multi-label a first-code alfabético (baseline canônico). Jaccard: penaliza overlap parcial proporcional à interseção. MASI: adiciona fator de monotonicidade (subset vs lateral).';
}

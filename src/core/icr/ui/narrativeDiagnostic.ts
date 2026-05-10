/**
 * narrativeDiagnostic — interpretação textual de padrões reconhecíveis nos coeficientes.
 *
 * Puro, recebe `{ cohen, alphaBinary, cuAlpha }` (todos opcionais) e devolve mensagens
 * que ajudam pesquisador a entender O QUE a divergência indica em termos práticos
 * de reconciliação. Spec §6.
 *
 * 3 padrões (V1):
 * 1. cohen baixo + alpha-binary alto → "concordam que tem código mas escolheram diferente"
 * 2. cohen baixo + alpha-binary baixo → "boundary disagreement substancial"
 * 3. cu-α << cohen (gap ≥ 0.4) → "concordam onde mas não em qual código"
 *
 * Caixa dismissable na UI; setting opt-out (icr.showNarrativeDiagnosis) controla visibilidade global.
 */

export interface DiagnosticInput {
	cohen?: number;
	alphaBinary?: number;
	cuAlpha?: number;
}

const COHEN_LOW = 0.4;
const ALPHA_BINARY_HIGH = 0.7;
const ALPHA_BINARY_LOW = 0.4;
const CU_ALPHA_GAP = 0.4;

export function analyzeDiagnostic(input: DiagnosticInput): string[] {
	const msgs: string[] = [];
	const { cohen, alphaBinary, cuAlpha } = input;

	if (cohen !== undefined && alphaBinary !== undefined) {
		if (cohen < COHEN_LOW && alphaBinary > ALPHA_BINARY_HIGH) {
			msgs.push('Coders discordam de qual código aplicar, mas concordam que o trecho tem código. Reconciliação por escolha de código mais útil que ajuste de bounds.');
		} else if (cohen < COHEN_LOW && alphaBinary < ALPHA_BINARY_LOW) {
			msgs.push('Boundary disagreement substancial — coders divergem em onde marcar. Reconciliação por ajuste de bounds antes de discutir código.');
		}
	}

	if (cohen !== undefined && cuAlpha !== undefined && cuAlpha < cohen - CU_ALPHA_GAP) {
		msgs.push('cu-α << κ: concordância em boundary mas código diferente — code-within-boundary é um sub-fenômeno relevante aqui.');
	}

	return msgs;
}

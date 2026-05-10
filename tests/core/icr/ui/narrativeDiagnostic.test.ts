import { describe, it, expect } from 'vitest';
import { analyzeDiagnostic } from '../../../../src/core/icr/ui/narrativeDiagnostic';

describe('analyzeDiagnostic', () => {
	it('detecta cohen baixo + alpha-binary alto (boundary OK, código diverge)', () => {
		const msgs = analyzeDiagnostic({ cohen: 0.3, alphaBinary: 0.8, cuAlpha: 0.5 });
		expect(msgs.some(m => m.toLowerCase().includes('discordam de qual código'))).toBe(true);
	});

	it('detecta cohen baixo + alpha-binary baixo (boundary disagreement)', () => {
		const msgs = analyzeDiagnostic({ cohen: 0.3, alphaBinary: 0.3, cuAlpha: 0.3 });
		expect(msgs.some(m => m.toLowerCase().includes('boundary'))).toBe(true);
	});

	it('detecta cu-alpha << κ (concordância em boundary mas código diferente)', () => {
		const msgs = analyzeDiagnostic({ cohen: 0.7, alphaBinary: 0.7, cuAlpha: 0.2 });
		expect(msgs.some(m => m.toLowerCase().includes('code-within-boundary'))).toBe(true);
	});

	it('limítrofe — cohen=0.5 + binary=0.7 → não dispara nenhum padrão', () => {
		const msgs = analyzeDiagnostic({ cohen: 0.5, alphaBinary: 0.7, cuAlpha: 0.5 });
		expect(msgs).toHaveLength(0);
	});

	it('alta concordância — cohen=0.9 → não dispara nenhum padrão', () => {
		const msgs = analyzeDiagnostic({ cohen: 0.9, alphaBinary: 0.9, cuAlpha: 0.85 });
		expect(msgs).toHaveLength(0);
	});

	it('inputs undefined não disparam padrões', () => {
		const msgs = analyzeDiagnostic({});
		expect(msgs).toHaveLength(0);
	});

	it('apenas cohen disponível não dispara padrões que dependem de outros', () => {
		const msgs = analyzeDiagnostic({ cohen: 0.3 });
		expect(msgs).toHaveLength(0);
	});

	it('cu-α só dispara quando muito menor que cohen (gap >= 0.4)', () => {
		// gap < 0.4 → não dispara
		const close = analyzeDiagnostic({ cohen: 0.5, cuAlpha: 0.2 });
		expect(close.some(m => m.toLowerCase().includes('code-within-boundary'))).toBe(false);
		// gap >= 0.4 → dispara
		const far = analyzeDiagnostic({ cohen: 0.7, cuAlpha: 0.2 });
		expect(far.some(m => m.toLowerCase().includes('code-within-boundary'))).toBe(true);
	});
});

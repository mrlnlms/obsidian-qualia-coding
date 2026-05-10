/**
 * ICR coder types — display estável `human:<name>` ou `llm:<model>`.
 *
 * Coder vive no registry (display + detalhes opcionais).
 * CoderRun é audit-only (config completa por execução, schema-ready pra LLM frente).
 */

export type CoderId = string;

export const DEFAULT_CODER_ID: CoderId = 'human:default';

/** Tipos de coder: humano, LLM, ou consensus (criado via reconciliação Slice E3a). */
export type CoderKind = 'human' | 'llm' | 'consensus';

export interface Coder {
	id: CoderId;
	name: string;
	type: CoderKind;
	model?: string;
	version?: string;
	temperature?: number;
	seed?: number;
	createdAt: number;
}

export interface CoderRun {
	id: string;
	coderId: CoderId;
	timestamp: number;
	promptHash?: string;
	config?: Record<string, unknown>;
}

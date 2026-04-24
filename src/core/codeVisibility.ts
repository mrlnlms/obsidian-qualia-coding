/**
 * Code visibility — pure helpers.
 *
 * Composes global CodeDefinition.hidden with per-doc visibilityOverrides
 * into a single "is this code visible in this file?" check.
 *
 * Semântica B (self-cleaning): overrides só existem quando divergem do global.
 */

export type VisibilityOverrides = Record<string, Record<string, boolean>>;

/** Efetiva: override > global. */
export function isCodeVisibleInFile(
	codeId: string,
	fileId: string,
	globalHidden: boolean,
	overrides: VisibilityOverrides,
): boolean {
	const override = overrides[fileId]?.[codeId];
	if (override !== undefined) return override;
	return !globalHidden;
}

/**
 * Deve gravar esse override em data.json?
 *
 * @param desiredVisible o valor que o user quer (true = visible, false = hidden)
 * @param globalHidden o estado global atual do código
 * @returns true se o override diverge do global (vale gravar); false se coincide (descarta)
 */
export function shouldStoreOverride(desiredVisible: boolean, globalHidden: boolean): boolean {
	const globalVisible = !globalHidden;
	return desiredVisible !== globalVisible;
}

/**
 * Após mudar `code.hidden` globalmente, varre todos os overrides e remove os que
 * passaram a coincidir com o novo estado global (ficaram redundantes).
 *
 * Retorna um novo objeto (imutável — não muta input).
 */
export function cleanOverridesAfterGlobalChange(
	overrides: VisibilityOverrides,
	codeId: string,
	newGlobalHidden: boolean,
): VisibilityOverrides {
	const newGlobalVisible = !newGlobalHidden;
	const result: VisibilityOverrides = {};

	for (const [fileId, perFile] of Object.entries(overrides)) {
		const entry = perFile[codeId];
		if (entry === undefined || entry !== newGlobalVisible) {
			// Mantém: não é do código afetado OU ainda diverge
			result[fileId] = { ...perFile };
			continue;
		}
		// Remove a entry específica (coincide com global agora)
		const filtered = { ...perFile };
		delete filtered[codeId];
		// Se sobrou entrada, mantém o fileId; senão, descarta a chave
		if (Object.keys(filtered).length > 0) {
			result[fileId] = filtered;
		}
	}

	return result;
}

/**
 * codeGroupsAddPicker — Helper puro para popular o "Add to group" FuzzySuggestModal.
 *
 * Filtra os groups dos quais o código ainda NÃO é membro.
 */

import type { CodeDefinitionRegistry } from './codeDefinitionRegistry';
import type { GroupDefinition } from './types';

export function getAddToGroupCandidates(
	codeId: string,
	registry: CodeDefinitionRegistry,
): GroupDefinition[] {
	const memberOf = new Set(registry.getGroupsForCode(codeId).map(g => g.id));
	return registry.getAllGroups().filter(g => !memberOf.has(g.id));
}

/**
 * Encapsula acesso à API interna `metadataTypeManager` do Obsidian.
 *
 * Essa API nao esta no obsidian.d.ts publico, mas e usada por Dataview/Bases
 * e outros plugins comunitarios. Mantemos tudo opcional pra fallback seguro.
 */

import type { App } from 'obsidian';
import type { PropertyType } from './caseVariablesTypes';

const VALID_TYPES: readonly PropertyType[] = [
  'text', 'multitext', 'number', 'checkbox', 'date', 'datetime',
];

/** Retorna tipo registrado no Obsidian types.json, ou undefined se nao houver. */
export function getObsidianPropertyType(app: App, name: string): PropertyType | undefined {
  try {
    const info = app.metadataTypeManager?.getTypeInfo?.(name);
    if (!info) return undefined;
    const t = info.type as PropertyType;
    return VALID_TYPES.includes(t) ? t : undefined;
  } catch {
    return undefined;
  }
}

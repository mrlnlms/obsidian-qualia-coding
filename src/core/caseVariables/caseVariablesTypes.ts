// src/core/caseVariables/caseVariablesTypes.ts

/** Tipos de property suportados — espelha o sistema do Obsidian. */
export type PropertyType =
  | 'text'
  | 'multitext'
  | 'number'
  | 'checkbox'
  | 'date'
  | 'datetime';

/** Valor de uma variable — depende do tipo. */
export type VariableValue = string | number | boolean | string[] | null;

/** Per-file variables: fileId → { variableName → value } */
export type CaseVariablesData = Record<string, Record<string, VariableValue>>;

/**
 * Shape serializado em data.json.caseVariables.
 *
 * Usa dois sub-campos explícitos em vez de index signature + optional keys
 * (index signature forçaria `types` a ter shape de VariableValue map).
 */
export interface CaseVariablesSection {
  /** Per-file variables */
  values: CaseVariablesData;

  /** Plugin's own type registry for properties not in Obsidian's types.json */
  types: Record<string, PropertyType>;
}

/** Properties internas do Obsidian que NAO sao case variables. */
export const OBSIDIAN_RESERVED: readonly string[] = [
  'aliases',
  'tags',
  'cssclasses',
  'position',
] as const;

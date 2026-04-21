// src/core/caseVariables/typeIcons.ts
import type { PropertyType } from './caseVariablesTypes';

/** Mapping de PropertyType para nome de icone Lucide usado pelo Obsidian. */
export const TYPE_ICONS: Record<PropertyType, string> = {
  text: 'type',
  multitext: 'list',
  number: 'hash',
  checkbox: 'check-square',
  date: 'calendar',
  datetime: 'calendar-clock',
};

/** Icone padrao pra property de tipo desconhecido. */
export const UNKNOWN_TYPE_ICON = 'help-circle';

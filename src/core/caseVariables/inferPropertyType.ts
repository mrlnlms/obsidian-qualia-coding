import type { PropertyType } from './caseVariablesTypes';

export function inferPropertyType(value: string): PropertyType {
  if (/^-?\d+$/.test(value)) return 'number';
  if (/^-?\d+\.\d+$/.test(value)) return 'number';
  if (/^(true|false)$/i.test(value)) return 'checkbox';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return 'datetime';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'date';
  return 'text';
}

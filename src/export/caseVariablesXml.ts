import type { PropertyType, VariableValue } from '../core/caseVariables/caseVariablesTypes';
import { escapeXml } from './xmlBuilder';

export function variableTypeToQdpx(type: PropertyType): string {
  switch (type) {
    case 'number': return 'Float';
    case 'checkbox': return 'Boolean';
    case 'date': return 'Date';
    case 'datetime': return 'DateTime';
    case 'text':
    case 'multitext':
    default: return 'Text';
  }
}

export function renderVariableXml(name: string, value: VariableValue, type: PropertyType): string {
  const qdpxType = variableTypeToQdpx(type);
  let inner = '';
  if (Array.isArray(value)) {
    inner = value.map(v => `<VariableValue>${escapeXml(String(v))}</VariableValue>`).join('');
  } else if (value != null) {
    inner = `<VariableValue>${escapeXml(String(value))}</VariableValue>`;
  }
  return `<Variable name="${escapeXml(name)}" typeOfVariable="${qdpxType}">${inner}</Variable>`;
}

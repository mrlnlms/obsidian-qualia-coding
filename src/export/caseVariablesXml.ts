import type { PropertyType, VariableValue } from '../core/caseVariables/caseVariablesTypes';
import type { CaseVariablesRegistry } from '../core/caseVariables/caseVariablesRegistry';
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

/** Render all variables for a file as concatenated <Variable> elements (or empty string). */
export function renderVariablesForFile(
  fileId: string,
  registry: CaseVariablesRegistry,
): string {
  const variables = registry.getVariables(fileId);
  const parts: string[] = [];
  for (const [name, value] of Object.entries(variables)) {
    if (value == null) continue;
    const type = registry.getType(name);
    parts.push(renderVariableXml(name, value, type));
  }
  return parts.join('\n');
}

/** Render <Cases> block grouping files by their caseId variable. */
export function renderCasesXml(
  registry: CaseVariablesRegistry,
  sourceGuidByFileId: Map<string, string>,
): string {
  const caseIds = new Set<string>();
  for (const fileId of sourceGuidByFileId.keys()) {
    const cid = registry.getVariables(fileId).caseId;
    if (typeof cid === 'string') caseIds.add(cid);
  }

  if (caseIds.size === 0) return '';

  const cases = [...caseIds].map(caseId => {
    const files = registry.getFilesByCase(caseId);
    const sourceRefs = files
      .map(f => sourceGuidByFileId.get(f))
      .filter((guid): guid is string => Boolean(guid))
      .map(guid => `<SourceRef targetGUID="${guid}"/>`)
      .join('');
    return `<Case name="${escapeXml(caseId)}">${sourceRefs}</Case>`;
  }).join('\n');

  return cases;
}

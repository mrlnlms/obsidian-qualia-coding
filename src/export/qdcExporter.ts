import type { CodeDefinitionRegistry } from '../core/codeDefinitionRegistry';
import type { CodeDefinition } from '../core/types';
import { escapeXml, xmlAttr, xmlDeclaration } from './xmlBuilder';

const CODEBOOK_NS = 'urn:QDA-XML:codebook:1.0';

/**
 * Build the <CodeBook><Codes>...</Codes></CodeBook> XML fragment.
 * When namespace is provided, it's added on the CodeBook element (standalone QDC).
 * When omitted, CodeBook has no namespace (inherits from Project in QDPX).
 */
export function buildCodebookXml(registry: CodeDefinitionRegistry, namespace?: string): string {
  const rootCodes = registry.getRootCodes();
  const codesXml = rootCodes.length === 0
    ? '<Codes/>'
    : `<Codes>\n${rootCodes.map(c => buildCodeElement(c, registry)).join('\n')}\n</Codes>`;

  const nsAttr = namespace ? ` ${xmlAttr('xmlns', namespace)}` : '';
  return `<CodeBook${nsAttr}>\n${codesXml}\n</CodeBook>`;
}

/** Build a single <Code> element, recursively including children. */
function buildCodeElement(code: CodeDefinition, registry: CodeDefinitionRegistry): string {
  const attrs = [
    xmlAttr('guid', code.id),
    xmlAttr('name', code.name),
    'isCodable="true"',
    code.color ? xmlAttr('color', code.color) : '',
  ].filter(Boolean).join(' ');

  const descEl = code.description
    ? `\n<Description>${escapeXml(code.description)}</Description>`
    : '';

  const children = registry.getChildren(code.id);
  const childrenXml = children.map(c => buildCodeElement(c, registry)).join('\n');

  if (!descEl && children.length === 0) {
    return `<Code ${attrs}/>`;
  }

  const inner = [descEl, childrenXml].filter(Boolean).join('\n');
  return `<Code ${attrs}>${inner}\n</Code>`;
}

/** Generate a complete .qdc file (standalone codebook). */
export function buildQdcFile(registry: CodeDefinitionRegistry): string {
  return `${xmlDeclaration()}\n${buildCodebookXml(registry, CODEBOOK_NS)}`;
}

import type { CodeDefinitionRegistry } from '../core/codeDefinitionRegistry';
import type { CodeDefinition, GroupDefinition } from '../core/types';
import { escapeXml, xmlAttr, xmlDeclaration } from './xmlBuilder';

const CODEBOOK_NS = 'urn:QDA-XML:codebook:1.0';

export interface BuildCodebookOptions {
  namespace?: string;
  ensureCodeGuid?: (codeId: string) => string;
}

/**
 * Build the <CodeBook><Codes>...</Codes></CodeBook> XML fragment.
 * When namespace is provided, it's added on the CodeBook element (standalone QDC).
 * When omitted, CodeBook has no namespace (inherits from Project in QDPX).
 * Pass ensureCodeGuid when embedding inside QDPX to keep Code guids in sync with CodeRef targetGUIDs.
 */
export function buildCodebookXml(
  registry: CodeDefinitionRegistry,
  options?: BuildCodebookOptions,
): string {
  const rootCodes = registry.getRootCodes();
  const codesXml = rootCodes.length === 0
    ? '<Codes/>'
    : `<Codes>\n${rootCodes.map(c => buildCodeElement(c, registry, options?.ensureCodeGuid)).join('\n')}\n</Codes>`;

  const groups = registry.getAllGroups();
  const setsXml = groups.length === 0
    ? ''
    : `\n<Sets>\n${groups.map(g => buildSetElement(g, registry, options?.ensureCodeGuid)).join('\n')}\n</Sets>`;

  const nsAttr = options?.namespace ? ` ${xmlAttr('xmlns', options.namespace)}` : '';
  // xmlns:qualia declarado quando há groups (custom namespace pra color)
  const qualiaNs = groups.length > 0 ? ' xmlns:qualia="urn:qualia-coding:extensions:1.0"' : '';
  return `<CodeBook${nsAttr}${qualiaNs}>\n${codesXml}${setsXml}\n</CodeBook>`;
}

function buildSetElement(
  group: GroupDefinition,
  registry: CodeDefinitionRegistry,
  ensureCodeGuid?: (codeId: string) => string,
): string {
  const guid = ensureCodeGuid ? ensureCodeGuid(group.id) : group.id;

  const attrs = [
    xmlAttr('guid', guid),
    xmlAttr('name', group.name),
    xmlAttr('qualia:color', group.color),
  ].join(' ');

  const descEl = group.description
    ? `\n<Description>${escapeXml(group.description)}</Description>`
    : '';

  const members = registry.getCodesInGroup(group.id);
  const membersXml = members
    .map(c => {
      const memberGuid = ensureCodeGuid ? ensureCodeGuid(c.id) : c.id;
      return `<MemberCode targetGUID="${memberGuid}"/>`;
    })
    .join('\n');

  if (!descEl && members.length === 0) {
    return `<Set ${attrs}/>`;
  }

  const inner = [descEl, membersXml].filter(Boolean).join('\n');
  return `<Set ${attrs}>${inner}\n</Set>`;
}

/** Build a single <Code> element, recursively including children. */
function buildCodeElement(
  code: CodeDefinition,
  registry: CodeDefinitionRegistry,
  ensureCodeGuid?: (codeId: string) => string,
): string {
  const guid = ensureCodeGuid ? ensureCodeGuid(code.id) : code.id;
  const attrs = [
    xmlAttr('guid', guid),
    xmlAttr('name', code.name),
    'isCodable="true"',
    code.color ? xmlAttr('color', code.color) : '',
  ].filter(Boolean).join(' ');

  const descEl = code.description
    ? `\n<Description>${escapeXml(code.description)}</Description>`
    : '';

  const children = registry.getChildren(code.id);
  const childrenXml = children.map(c => buildCodeElement(c, registry, ensureCodeGuid)).join('\n');

  if (!descEl && children.length === 0) {
    return `<Code ${attrs}/>`;
  }

  const inner = [descEl, childrenXml].filter(Boolean).join('\n');
  return `<Code ${attrs}>${inner}\n</Code>`;
}

/** Generate a complete .qdc file (standalone codebook). */
export function buildQdcFile(registry: CodeDefinitionRegistry): string {
  return `${xmlDeclaration()}\n${buildCodebookXml(registry, { namespace: CODEBOOK_NS })}`;
}

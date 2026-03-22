/** Escape XML special characters in text content and attribute values. */
export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Format a single XML attribute. Returns '' if value is undefined. */
export function xmlAttr(key: string, value: string | number | boolean | undefined): string {
  if (value === undefined) return '';
  return `${key}="${escapeXml(String(value))}"`;
}

/**
 * Build an XML element string.
 * - No children → self-closing: `<Tag attrs/>`
 * - `isXml: true` → nested XML: `<Tag attrs>\n{children}\n</Tag>`
 * - `isXml: false` (default) → escaped text content: `<Tag attrs>{escaped}</Tag>`
 */
export function xmlEl(
  tag: string,
  attrs: Record<string, string | number | boolean | undefined>,
  children?: string,
  isXml = false,
): string {
  const attrStr = Object.entries(attrs)
    .map(([k, v]) => xmlAttr(k, v))
    .filter(Boolean)
    .join(' ');
  const open = attrStr ? `${tag} ${attrStr}` : tag;

  if (children === undefined || children === '') {
    return `<${open}/>`;
  }
  if (isXml) {
    return `<${open}>\n${children}\n</${tag}>`;
  }
  return `<${open}>${escapeXml(children)}</${tag}>`;
}

/** Standard XML declaration. */
export function xmlDeclaration(): string {
  return '<?xml version="1.0" encoding="utf-8"?>';
}

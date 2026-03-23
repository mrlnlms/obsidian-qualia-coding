/** Parse XML string into a Document. Throws on parse errors. */
export function parseXml(xml: string): Document {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');
  const error = doc.querySelector('parsererror');
  if (error) {
    throw new Error(`XML parse error: ${error.textContent}`);
  }
  return doc;
}

/** Get direct child elements, optionally filtered by tag name. */
export function getChildElements(parent: Element, tagName?: string): Element[] {
  const result: Element[] = [];
  for (let i = 0; i < parent.children.length; i++) {
    const child = parent.children[i]!;
    if (!tagName || child.tagName === tagName) {
      result.push(child);
    }
  }
  return result;
}

/** Get attribute value or undefined if absent. */
export function getAttr(el: Element, name: string): string | undefined {
  return el.hasAttribute(name) ? el.getAttribute(name)! : undefined;
}

/** Get numeric attribute value or undefined. */
export function getNumAttr(el: Element, name: string): number | undefined {
  const v = getAttr(el, name);
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isNaN(n) ? undefined : n;
}

/** Get text content of the first child element with given tag name. */
export function getTextContent(parent: Element, childTag: string): string | undefined {
  const child = getChildElements(parent, childTag)[0];
  return child?.textContent ?? undefined;
}

/** Get all descendant elements with a given tag name (any depth). */
export function getAllElements(parent: Element, tagName: string): Element[] {
  return Array.from(parent.getElementsByTagName(tagName));
}

/**
 * Inverse coordinate converters for REFI-QDA import.
 * These are the inverse of the export converters in src/export/coordConverters.ts.
 */

/**
 * Convert Unicode codepoint offset to CM6 line:ch (0-based).
 * Inverse of export's lineChToOffset.
 * Returns null if offset is out of range.
 */
export function offsetToLineCh(content: string, cpOffset: number): { line: number; ch: number } | null {
  let cp = 0;
  let line = 0;
  let lineStartCu = 0; // UTF-16 code unit offset of current line start
  let cu = 0;

  while (cp < cpOffset && cu < content.length) {
    const code = content.charCodeAt(cu);
    if (code === 0x0A) { // newline
      line++;
      cu++;
      lineStartCu = cu;
      cp++;
      continue;
    }
    if (code >= 0xD800 && code <= 0xDBFF) {
      cu += 2; // surrogate pair = 1 codepoint
    } else {
      cu += 1;
    }
    cp++;
  }

  if (cp < cpOffset) return null; // offset past end
  return { line, ch: cu - lineStartCu };
}

/**
 * Convert REFI-QDA PDF rect (bottom-left origin, in points) to normalized 0-1.
 * Inverse of export's pdfShapeToRect.
 */
export function pdfRectToNormalized(
  firstX: number, firstY: number,
  secondX: number, secondY: number,
  pageWidth: number, pageHeight: number,
): { type: 'rect'; x: number; y: number; w: number; h: number } {
  const x = firstX / pageWidth;
  const y = 1 - firstY / pageHeight;
  const w = (secondX - firstX) / pageWidth;
  const h = (firstY - secondY) / pageHeight;
  return { type: 'rect', x, y, w, h };
}

/**
 * Convert pixel bounding box to normalized 0-1 image coords.
 * Inverse of export's imageToPixels.
 */
export function pixelsToNormalized(
  firstX: number, firstY: number,
  secondX: number, secondY: number,
  imgWidth: number, imgHeight: number,
): { type: 'rect'; x: number; y: number; w: number; h: number } {
  return {
    type: 'rect',
    x: firstX / imgWidth,
    y: firstY / imgHeight,
    w: (secondX - firstX) / imgWidth,
    h: (secondY - firstY) / imgHeight,
  };
}

/** Convert milliseconds (integer) to seconds (float). Inverse of export's mediaToMs. */
export function msToSeconds(ms: number): number {
  return ms / 1000;
}

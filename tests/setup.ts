/**
 * Vitest setup file — runs before all test suites.
 *
 * Provides a minimal HTMLCanvasElement.getContext() mock for jsdom,
 * which does not implement Canvas. This silences the
 * "Not implemented: HTMLCanvasElement's getContext()" warnings
 * without affecting test behavior — real canvas rendering is
 * validated by the e2e test suite (wdio + Obsidian).
 */

HTMLCanvasElement.prototype.getContext = function (contextId: string) {
  if (contextId === '2d') {
    return {
      fillRect: () => {},
      clearRect: () => {},
      getImageData: () => ({ data: new Uint8ClampedArray(0) }),
      putImageData: () => {},
      createImageData: () => ({ data: new Uint8ClampedArray(0) }),
      setTransform: () => {},
      drawImage: () => {},
      save: () => {},
      fillText: () => {},
      restore: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      closePath: () => {},
      stroke: () => {},
      translate: () => {},
      scale: () => {},
      rotate: () => {},
      arc: () => {},
      fill: () => {},
      measureText: () => ({ width: 0, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0 }),
      transform: () => {},
      rect: () => {},
      clip: () => {},
      canvas: this,
    } as unknown as CanvasRenderingContext2D;
  }
  return null;
} as any;

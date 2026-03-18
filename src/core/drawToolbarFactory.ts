import { setIcon, setTooltip } from 'obsidian';
import type { DrawMode, DrawToolButtonSpec } from './shapeTypes';

export interface DrawToolbarConfig {
  /** Which modes to include (filters the button catalog) */
  modes: DrawMode[];
  /** CSS class for the container */
  containerClass: string;
  /** Called when user selects a mode */
  onModeChange: (mode: DrawMode) => void;
  /** Called when user clicks delete */
  onDelete?: () => void;
  /** Whether to add keyboard shortcut listeners. Default: true */
  enableKeyboard?: boolean;
  /** Parent element to scope keyboard events (default: window) */
  keyboardScope?: EventTarget;
}

export interface DrawToolbarHandle {
  /** The toolbar container element */
  el: HTMLElement;
  /** Update which button is active */
  setActiveMode(mode: DrawMode): void;
  /** Remove toolbar and cleanup listeners */
  destroy(): void;
}

/**
 * Create a draw toolbar from the shared button catalog.
 * Used by both Image and PDF engines for consistent UX.
 */
export function createDrawToolbar(
  parent: HTMLElement,
  buttons: DrawToolButtonSpec[],
  config: DrawToolbarConfig,
): DrawToolbarHandle {
  const el = document.createElement('div');
  el.className = config.containerClass;

  const btnEls = new Map<DrawMode, HTMLElement>();

  // Mode buttons
  for (const spec of buttons) {
    if (!config.modes.includes(spec.mode)) continue;

    const btn = document.createElement('div');
    btn.className = 'clickable-icon';
    setIcon(btn, spec.icon);
    setTooltip(btn, `${spec.tooltip} (${spec.shortcut})`);

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      config.onModeChange(spec.mode);
      setActiveMode(spec.mode);
    });

    el.appendChild(btn);
    btnEls.set(spec.mode, btn);
  }

  // Delete button
  if (config.onDelete) {
    const deleteBtn = document.createElement('div');
    deleteBtn.className = 'clickable-icon';
    setIcon(deleteBtn, 'trash-2');
    setTooltip(deleteBtn, 'Delete selected (Del)');
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      config.onDelete!();
    });
    el.appendChild(deleteBtn);
  }

  parent.appendChild(el);

  // Active state
  function setActiveMode(mode: DrawMode): void {
    for (const [m, btn] of btnEls) {
      btn.classList.toggle('is-active', m === mode);
    }
  }

  setActiveMode('select');

  // Keyboard shortcuts
  let keyHandler: ((e: KeyboardEvent) => void) | null = null;
  if (config.enableKeyboard !== false) {
    const shortcutMap = new Map<string, DrawMode>();
    for (const spec of buttons) {
      if (config.modes.includes(spec.mode)) {
        shortcutMap.set(spec.shortcut.toLowerCase(), spec.mode);
      }
    }

    keyHandler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const mode = shortcutMap.get(e.key.toLowerCase());
      if (mode) {
        config.onModeChange(mode);
        setActiveMode(mode);
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && config.onDelete) {
        config.onDelete();
      }
    };

    const scope = config.keyboardScope ?? window;
    scope.addEventListener('keydown', keyHandler as EventListener);
  }

  return {
    el,
    setActiveMode,
    destroy() {
      if (keyHandler) {
        const scope = config.keyboardScope ?? window;
        scope.removeEventListener('keydown', keyHandler as EventListener);
      }
      el.remove();
    },
  };
}

import { PropertiesEditor, type PropertiesEditorConfig } from './propertiesEditor';

export function openPropertiesPopover(
  triggerEl: HTMLElement,
  config: PropertiesEditorConfig,
): () => void {
  const popover = document.body.appendChild(document.createElement('div'));
  popover.className = 'case-variables-popover';

  const header = popover.appendChild(document.createElement('div'));
  header.className = 'case-variables-popover-header';

  const title = header.appendChild(document.createElement('span'));
  title.className = 'case-variables-popover-title';
  title.textContent = 'Properties';

  const closeBtn = header.appendChild(document.createElement('span'));
  closeBtn.className = 'case-variables-popover-close';
  closeBtn.textContent = '×';

  const body = popover.appendChild(document.createElement('div'));
  body.className = 'case-variables-popover-body';

  const editor = new PropertiesEditor(body, config);

  const rect = triggerEl.getBoundingClientRect();
  popover.style.position = 'fixed';
  popover.style.top = `${rect.bottom + 4}px`;
  popover.style.right = `${window.innerWidth - rect.right}px`;

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    editor.destroy();
    popover.remove();
    document.removeEventListener('click', onOutsideClick, true);
    config.onClose?.();
  };

  const onOutsideClick = (e: MouseEvent) => {
    if (!popover.contains(e.target as Node) && e.target !== triggerEl) close();
  };

  closeBtn.addEventListener('click', close);
  // Delay outside-click listener by 1 tick to avoid closing immediately on the opening click.
  setTimeout(() => document.addEventListener('click', onOutsideClick, true), 0);

  return close;
}

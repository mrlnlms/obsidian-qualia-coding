import { setIcon } from 'obsidian';
import type { CodeDefinition } from './types';
import type { CodeDefinitionRegistry } from './codeDefinitionRegistry';

export interface CodeVisibilityPopoverConfig {
	fileId: string;
	codesInFile: CodeDefinition[];
	registry: CodeDefinitionRegistry;
	onClose?: () => void;
}

/**
 * Renderiza o body do popover num container. Extraído pra testabilidade —
 * abrir o popover real (via anchoring em DOM) é responsabilidade do caller.
 */
export function renderCodeVisibilityPopoverBody(
	container: HTMLElement,
	config: CodeVisibilityPopoverConfig,
): void {
	const { fileId, codesInFile, registry } = config;
	container.empty();
	container.addClass('qc-visibility-popover-body');

	const header = container.createDiv({ cls: 'qc-visibility-header' });
	header.createSpan({ text: 'Códigos neste documento' });

	if (codesInFile.length === 0) {
		container.createDiv({ cls: 'qc-visibility-empty', text: 'Nenhum código aplicado neste doc.' });
		return;
	}

	const list = container.createDiv({ cls: 'qc-visibility-list' });
	for (const code of codesInFile) {
		renderRow(list, code, fileId, registry, () => {
			// Re-render após toggle (simples — reconstrói a lista)
			renderCodeVisibilityPopoverBody(container, config);
		});
	}

	if (registry.hasAnyOverrideForFile(fileId)) {
		const reset = container.createEl('a', {
			cls: 'qc-visibility-reset',
			text: 'Resetar',
			href: '#',
		});
		reset.addEventListener('click', (e) => {
			e.preventDefault();
			registry.clearDocOverrides(fileId);
			renderCodeVisibilityPopoverBody(container, config);
		});
	}
}

function renderRow(
	parent: HTMLElement,
	code: CodeDefinition,
	fileId: string,
	registry: CodeDefinitionRegistry,
	onToggle: () => void,
): void {
	const visible = registry.isCodeVisibleInFile(code.id, fileId);
	const row = parent.createDiv({ cls: `qc-visibility-row ${visible ? 'qc-visibility-visible' : 'qc-visibility-hidden'}` });

	const swatch = row.createSpan({ cls: 'qc-visibility-swatch' });
	swatch.style.backgroundColor = code.color;

	row.createSpan({ cls: 'qc-visibility-name', text: code.name });

	const eye = row.createSpan({ cls: 'qc-eye' });
	setIcon(eye, visible ? 'eye' : 'eye-off');
	eye.addEventListener('click', () => {
		registry.setDocOverride(fileId, code.id, !visible);
		onToggle();
	});
}

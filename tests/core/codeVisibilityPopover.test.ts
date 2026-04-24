import { describe, it, expect, beforeEach } from 'vitest';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';
import { renderCodeVisibilityPopoverBody } from '../../src/core/codeVisibilityPopover';

describe('codeVisibilityPopover', () => {
	let container: HTMLElement;
	let registry: CodeDefinitionRegistry;

	beforeEach(() => {
		container = document.createElement('div');
		registry = new CodeDefinitionRegistry();
	});

	it('renders one row per code in file', () => {
		const c1 = registry.create('c1');
		const c2 = registry.create('c2');
		renderCodeVisibilityPopoverBody(container, {
			fileId: 'doc.md',
			codesInFile: [c1, c2],
			registry,
		});
		const rows = container.querySelectorAll('.qc-visibility-row');
		expect(rows.length).toBe(2);
	});

	it('shows effective state — override wins over global', () => {
		const c1 = registry.create('c1');
		registry.setGlobalHidden(c1.id, true);   // global hidden
		registry.setDocOverride('doc.md', c1.id, true);  // override visible

		renderCodeVisibilityPopoverBody(container, {
			fileId: 'doc.md', codesInFile: [c1], registry,
		});
		const row = container.querySelector('.qc-visibility-row');
		expect(row!.classList.contains('qc-visibility-visible')).toBe(true);
	});

	it('clicking eye toggles override for this file only', () => {
		const c1 = registry.create('c1');
		renderCodeVisibilityPopoverBody(container, {
			fileId: 'doc.md', codesInFile: [c1], registry,
		});
		const eye = container.querySelector('.qc-visibility-row .qc-eye') as HTMLElement;
		eye.click();

		// Before: global visible, no override. After click: hidden in doc.md only.
		expect(registry.isCodeVisibleInFile(c1.id, 'doc.md')).toBe(false);
		expect(registry.isCodeVisibleInFile(c1.id, 'other.md')).toBe(true);
	});

	it('Resetar link only appears when fileId has overrides', () => {
		const c1 = registry.create('c1');
		renderCodeVisibilityPopoverBody(container, {
			fileId: 'doc.md', codesInFile: [c1], registry,
		});
		expect(container.querySelector('.qc-visibility-reset')).toBeNull();

		registry.setDocOverride('doc.md', c1.id, false);
		// Re-render:
		container.empty();
		renderCodeVisibilityPopoverBody(container, {
			fileId: 'doc.md', codesInFile: [c1], registry,
		});
		expect(container.querySelector('.qc-visibility-reset')).toBeTruthy();
	});

	it('clicking Resetar clears overrides for the file', () => {
		const c1 = registry.create('c1');
		registry.setDocOverride('doc.md', c1.id, false);
		renderCodeVisibilityPopoverBody(container, {
			fileId: 'doc.md', codesInFile: [c1], registry,
		});
		const reset = container.querySelector('.qc-visibility-reset') as HTMLElement;
		reset.click();

		expect(registry.hasAnyOverrideForFile('doc.md')).toBe(false);
	});

	it('renders empty state when codesInFile is empty', () => {
		renderCodeVisibilityPopoverBody(container, {
			fileId: 'doc.md', codesInFile: [], registry,
		});
		expect(container.querySelector('.qc-visibility-empty')).toBeTruthy();
	});
});

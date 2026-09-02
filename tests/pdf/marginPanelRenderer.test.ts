import { describe, expect, it, vi } from 'vitest';
import type { MarginRailLayout } from '../../src/core/marginPanelLayout';
import {
	applyHoverToMarginPanel,
	clearPdfMarginPanel,
	renderPdfMarginPanel,
} from '../../src/pdf/marginPanelRenderer';

function rail(overrides: Partial<MarginRailLayout> = {}): MarginRailLayout {
	return {
		key: JSON.stringify(['m1', 'c1']),
		markerId: 'm1',
		codeId: 'c1',
		codeName: 'Team self-organization',
		color: '#008866',
		ownerAbbreviation: 'JD',
		ownerName: 'Jessica Diaz',
		editable: false,
		top: 100,
		bottom: 500,
		center: 300,
		lane: 0,
		...overrides,
	};
}

describe('renderPdfMarginPanel', () => {
	it('renders one line, two ticks, one dot and one label per rail', () => {
		const container = document.createElement('div');
		renderPdfMarginPanel(container, [rail()], {
			onLabelClick: vi.fn(),
			onHover: vi.fn(),
		});
		expect(container.querySelectorAll('.codemarker-pdf-margin-line')).toHaveLength(1);
		expect(container.querySelectorAll('.codemarker-pdf-margin-tick')).toHaveLength(2);
		expect(container.querySelectorAll('.codemarker-pdf-margin-dot')).toHaveLength(1);
		expect(container.querySelectorAll('.codemarker-pdf-margin-label')).toHaveLength(1);
		const line = container.querySelector('.codemarker-pdf-margin-line') as HTMLElement;
		expect(line.style.top).toBe('100px');
		expect(line.style.height).toBe('400px');
		expect((container.querySelector('.codemarker-pdf-margin-dot') as HTMLElement).style.top).toBe('300px');
		expect((container.querySelector('.codemarker-pdf-margin-label') as HTMLElement).style.top).toBe('300px');
	});

	it('renders author text and tooltip', () => {
		const container = document.createElement('div');
		renderPdfMarginPanel(container, [rail()], {
			onLabelClick: vi.fn(),
			onHover: vi.fn(),
		});
		const label = container.querySelector('.codemarker-pdf-margin-label') as HTMLElement;
		expect(label.textContent).toBe('JD · Team self-organization');
		expect(label.title).toBe('Jessica Diaz · Team self-organization');
	});

	it('delegates click once and applies hover by logical marker ID', () => {
		const container = document.createElement('div');
		const onLabelClick = vi.fn();
		renderPdfMarginPanel(container, [rail()], { onLabelClick, onHover: vi.fn() });
		(container.querySelector('.codemarker-pdf-margin-label') as HTMLElement)
			.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(onLabelClick).toHaveBeenCalledOnce();
		expect(onLabelClick).toHaveBeenCalledWith('m1', 'Team self-organization');
		applyHoverToMarginPanel(container, 'm1');
		expect(container.querySelectorAll('.codemarker-pdf-margin-hovered')).toHaveLength(5);
	});

	it('replaces stale geometry and clears the global panel', () => {
		const container = document.createElement('div');
		const callbacks = { onLabelClick: vi.fn(), onHover: vi.fn() };
		renderPdfMarginPanel(container, [rail()], callbacks);
		renderPdfMarginPanel(container, [rail({ top: 200, bottom: 800, center: 500 })], callbacks);
		expect(container.querySelectorAll('.codemarker-pdf-margin-panel')).toHaveLength(1);
		expect((container.querySelector('.codemarker-pdf-margin-line') as HTMLElement).style.height).toBe('600px');
		clearPdfMarginPanel(container);
		expect(container.querySelector('.codemarker-pdf-margin-panel')).toBeNull();
	});
});

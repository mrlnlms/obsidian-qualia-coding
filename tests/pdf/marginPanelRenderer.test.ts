import { describe, expect, it, vi } from 'vitest';
import type { MarginRailLayout } from '../../src/core/marginPanelLayout';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';
import type { PdfShapeMarker } from '../../src/pdf/pdfCodingTypes';
import type { PDFPageView } from '../../src/pdf/pdfTypings';
import { NON_EDITABLE_MARKER_COLOR } from '../../src/pdf/markerAppearance';
import {
	applyHoverToMarginPanel,
	clearPdfMarginPanel,
	collectMarginPanelPageSnapshot,
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
		expect(line.dataset.codeId).toBe('c1');
		expect(line.style.top).toBe('100px');
		expect(line.style.height).toBe('400px');
		expect((container.querySelector('.codemarker-pdf-margin-dot') as HTMLElement).style.top).toBe('300px');
		expect((container.querySelector('.codemarker-pdf-margin-label') as HTMLElement).style.top).toBe('300px');
	});

	it('collects shape codes with stable identity, owner and color precedence', () => {
		const registry = new CodeDefinitionRegistry();
		const firstCode = registry.create('First', '#112233');
		const secondCode = registry.create('Second', '#445566');
		const pageView = { id: 7, textLayer: null } as unknown as PDFPageView;
		const shape: PdfShapeMarker = {
			markerType: 'pdf',
			id: 'shape-1',
			fileId: 'document.pdf',
			page: 7,
			shape: 'rect',
			coords: { type: 'rect', x: 10, y: 20, w: 30, h: 40 },
			codes: [{ codeId: firstCode.id }, { codeId: secondCode.id }],
			colorOverride: '#abcdef',
			createdAt: 1,
			updatedAt: 1,
		};

		const snapshot = collectMarginPanelPageSnapshot(
			pageView,
			[],
			registry,
			[shape],
			() => ({ abbreviation: 'JD', fullName: 'Jessica Diaz' }),
			() => true,
		);

		expect(snapshot).toMatchObject({ pageNumber: 7 });
		expect(snapshot.entries).toHaveLength(2);
		expect(snapshot.entries.map((entry) => ({
			markerId: entry.markerId,
			codeId: entry.codeId,
			codeName: entry.codeName,
			color: entry.color,
			topPct: entry.topPct,
			bottomPct: entry.bottomPct,
			owner: entry.ownerAbbreviation,
		}))).toEqual([
			{
				markerId: 'shape-1', codeId: firstCode.id, codeName: 'First',
				color: '#abcdef', topPct: 20, bottomPct: 60, owner: 'JD',
			},
			{
				markerId: 'shape-1', codeId: secondCode.id, codeName: 'Second',
				color: '#abcdef', topPct: 20, bottomPct: 60, owner: 'JD',
			},
		]);

		const readOnly = collectMarginPanelPageSnapshot(
			pageView,
			[],
			registry,
			[shape],
			undefined,
			() => false,
		);
		expect(readOnly.entries.map((entry) => entry.color))
			.toEqual([NON_EDITABLE_MARKER_COLOR, NON_EDITABLE_MARKER_COLOR]);
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

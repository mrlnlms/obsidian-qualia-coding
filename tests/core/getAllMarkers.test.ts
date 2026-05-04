import { describe, it, expect } from 'vitest';
import { getAllMarkers } from '../../src/core/getAllMarkers';
import { createDefaultData } from '../../src/core/types';

describe('getAllMarkers', () => {
	it('returns empty when no markers in any engine', () => {
		const data = createDefaultData();
		expect(getAllMarkers(data)).toEqual([]);
	});

	it('coleta markers de todos engines com refs corretas', () => {
		const data = createDefaultData();
		// markdown
		(data.markdown.markers as any)['note.md'] = [{ id: 'mk1', fileId: 'note.md', codes: [], range: {} }];
		// pdf text + shape
		(data.pdf.markers as any).push({ id: 'pdf1', fileId: 'doc.pdf', codes: [] });
		(data.pdf.shapes as any).push({ id: 'shape1', fileId: 'doc.pdf', codes: [] });
		// image
		(data.image.markers as any).push({ id: 'img1', fileId: 'pic.png', codes: [] });
		// csv: segment + row
		(data.csv.segmentMarkers as any).push({ id: 'seg1', fileId: 'data.csv', codes: [] });
		(data.csv.rowMarkers as any).push({ id: 'row1', fileId: 'data.csv', codes: [] });
		// audio/video: nested em files
		(data.audio.files as any).push({ path: 'rec.mp3', markers: [{ id: 'au1', fileId: 'rec.mp3', codes: [] }] });
		(data.video.files as any).push({ path: 'clip.mp4', markers: [{ id: 'vd1', fileId: 'clip.mp4', codes: [] }] });

		const result = getAllMarkers(data);
		expect(result).toHaveLength(8);
		expect(result.map(r => `${r.engine}:${r.markerId}`).sort()).toEqual([
			'audio:au1',
			'csv:row1',
			'csv:seg1',
			'image:img1',
			'markdown:mk1',
			'pdf:pdf1',
			'pdf:shape1',
			'video:vd1',
		]);
	});

	it('audio/video usam file.path como fileId', () => {
		const data = createDefaultData();
		(data.audio.files as any).push({ path: 'long/path/to/rec.mp3', markers: [{ id: 'au1', fileId: 'long/path/to/rec.mp3', codes: [] }] });
		const result = getAllMarkers(data);
		expect(result[0]).toMatchObject({ engine: 'audio', fileId: 'long/path/to/rec.mp3', markerId: 'au1' });
	});
});

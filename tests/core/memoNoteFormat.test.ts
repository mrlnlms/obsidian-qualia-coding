import { describe, it, expect } from 'vitest';
import { parseMemoNote, serializeMemoNote } from '../../src/core/memoNoteFormat';

describe('serializeMemoNote', () => {
	it('produces frontmatter + content', () => {
		const out = serializeMemoNote({ type: 'code', id: 'c1' }, 'Wellbeing', 'My analysis...');
		expect(out).toBe(
`---
qualiaMemoOf: code:c1
qualiaCodeName: Wellbeing
---

My analysis...`);
	});

	it('quotes codeName when contains special chars', () => {
		const out = serializeMemoNote({ type: 'code', id: 'c1' }, 'My "quoted" code', '');
		expect(out).toContain(`qualiaCodeName: 'My "quoted" code'`);
	});

	it('handles empty content', () => {
		const out = serializeMemoNote({ type: 'code', id: 'c1' }, 'Wellbeing', '');
		expect(out).toBe(`---
qualiaMemoOf: code:c1
qualiaCodeName: Wellbeing
---

`);
	});

	it('preserves multi-line content as-is', () => {
		const body = 'line 1\n\nline 2\n- bullet';
		const out = serializeMemoNote({ type: 'code', id: 'c1' }, 'X', body);
		expect(out.endsWith(body)).toBe(true);
	});
});

describe('parseMemoNote', () => {
	it('extracts ref and content', () => {
		const text = `---
qualiaMemoOf: code:c1
qualiaCodeName: Wellbeing
---

Body content here.`;
		const result = parseMemoNote(text);
		expect(result).toEqual({
			ref: { type: 'code', id: 'c1' },
			content: 'Body content here.',
		});
	});

	it('returns null when frontmatter missing qualiaMemoOf', () => {
		const text = `---
title: Foo
---
Body`;
		expect(parseMemoNote(text)).toBeNull();
	});

	it('returns null when no frontmatter', () => {
		expect(parseMemoNote('Just body')).toBeNull();
	});

	it('returns null when ref string is malformed', () => {
		const text = `---
qualiaMemoOf: not-a-valid-ref
---
Body`;
		expect(parseMemoNote(text)).toBeNull();
	});

	it('preserves multi-line content with frontmatter-like content inside body', () => {
		const text = `---
qualiaMemoOf: code:c1
qualiaCodeName: X
---

Line 1
---
Line 2 (not frontmatter)`;
		const result = parseMemoNote(text);
		expect(result?.content).toBe('Line 1\n---\nLine 2 (not frontmatter)');
	});

	it('round-trip: serialize then parse returns original', () => {
		const ref = { type: 'code' as const, id: 'abc123' };
		const body = 'Some analysis\n\nWith multiple paragraphs';
		const serialized = serializeMemoNote(ref, 'Code Name', body);
		const parsed = parseMemoNote(serialized);
		expect(parsed?.ref).toEqual(ref);
		expect(parsed?.content).toBe(body);
	});
});

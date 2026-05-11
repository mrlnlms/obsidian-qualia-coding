#!/usr/bin/env node
/**
 * Seed ICR corpus — popula data.json do plugin no vault `obsidian-plugins-workbench`
 * com 3 coders fictícios + 5 codes + markers em ICR-test/* com divergências controladas.
 *
 * Roda: `node scripts/seed-icr-corpus.mjs`
 * Pré-requisito: data.json reset (createDefaultData) + pasta ICR-test/ no vault root.
 */

import fs from 'node:fs';
import path from 'node:path';

const VAULT = '/Users/mosx/Desktop/obsidian-plugins-workbench';
const DATA_JSON = path.join(VAULT, '.obsidian/plugins/obsidian-qualia-coding/data.json');

const data = JSON.parse(fs.readFileSync(DATA_JSON, 'utf-8'));

const now = Date.now();
const id = (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 11)}`;

// ─── Coders (aditivo — preserva coders existentes; só adiciona Default/Carla/Joana se faltar) ──
data.coders = data.coders ?? { coders: [] };
const ensureCoder = (id_, name) => {
	if (data.coders.coders.some(c => c.id === id_)) return;
	data.coders.coders.push({ id: id_, name, type: 'human', createdAt: now });
};
ensureCoder('human:default', 'Default');
ensureCoder('human:carla', 'Carla');
ensureCoder('human:joana', 'Joana');

// ─── Codes (5 categorical) ───────────────────────────────
const codeIds = {};
const codeNames = ['Frustração', 'Confiança', 'Crítica institucional', 'Estratégia', 'Limitação técnica'];
const palette = ['#6200EE', '#03DAC6', '#CF6679', '#FF9800', '#4CAF50'];

codeNames.forEach((name, i) => {
	const cid = id('c');
	codeIds[name] = cid;
	data.registry.definitions[cid] = {
		id: cid, name, color: palette[i], paletteIndex: i,
		createdAt: now, updatedAt: now,
		childrenOrder: [],
	};
	data.registry.rootOrder.push(cid);
});
data.registry.nextPaletteIndex = 5;

// ─── Markdown markers (Entrevistas) ───────────────────────
const mdMarkers = data.markdown.markers;
const addMd = (file, range, codedBy, codeName) => {
	if (!mdMarkers[file]) mdMarkers[file] = [];
	mdMarkers[file].push({
		markerType: 'markdown', id: id('m'), fileId: file,
		range, color: palette[0],
		codes: [{ codeId: codeIds[codeName] }],
		codedBy,
		createdAt: now, updatedAt: now,
	});
};

// Entrevista 1 — 3 segments com divergências controladas
const f1 = 'ICR-test/ICR-entrevista-1.md';
// (line 6 é "R: Olha, no começo a gente tentou..." da resposta P1)
addMd(f1, { from: { line: 6, ch: 0 }, to: { line: 6, ch: 80 } }, 'human:carla', 'Frustração');
addMd(f1, { from: { line: 6, ch: 0 }, to: { line: 6, ch: 80 } }, 'human:joana', 'Frustração');
// boundary disagreement
addMd(f1, { from: { line: 10, ch: 0 }, to: { line: 10, ch: 100 } }, 'human:carla', 'Crítica institucional');
addMd(f1, { from: { line: 10, ch: 20 }, to: { line: 10, ch: 90 } }, 'human:joana', 'Crítica institucional');
// code disagreement
addMd(f1, { from: { line: 14, ch: 0 }, to: { line: 14, ch: 80 } }, 'human:carla', 'Estratégia');
addMd(f1, { from: { line: 14, ch: 0 }, to: { line: 14, ch: 80 } }, 'human:joana', 'Limitação técnica');

// Entrevista 2 — análogo
const f2 = 'ICR-test/ICR-entrevista-2.md';
addMd(f2, { from: { line: 6, ch: 0 }, to: { line: 6, ch: 60 } }, 'human:carla', 'Confiança');
addMd(f2, { from: { line: 6, ch: 0 }, to: { line: 6, ch: 60 } }, 'human:joana', 'Confiança');
addMd(f2, { from: { line: 10, ch: 0 }, to: { line: 10, ch: 80 } }, 'human:carla', 'Crítica institucional');
addMd(f2, { from: { line: 10, ch: 10 }, to: { line: 10, ch: 70 } }, 'human:joana', 'Crítica institucional');
addMd(f2, { from: { line: 14, ch: 0 }, to: { line: 14, ch: 70 } }, 'human:carla', 'Estratégia');
addMd(f2, { from: { line: 14, ch: 0 }, to: { line: 14, ch: 70 } }, 'human:joana', 'Frustração');

// ─── PDF markers ─────────────────────────────────────────
const pdfFile = 'ICR-test/ICR-entrevista-1.pdf';
data.pdf.markers.push(
	{
		markerType: 'pdf', id: id('m'), fileId: pdfFile,
		page: 1, beginIndex: 100, beginOffset: 0, endIndex: 200, endOffset: 0,
		text: '[seed text segment 1]',
		codes: [{ codeId: codeIds['Frustração'] }],
		codedBy: 'human:carla',
		createdAt: now, updatedAt: now,
	},
	{
		markerType: 'pdf', id: id('m'), fileId: pdfFile,
		page: 1, beginIndex: 100, beginOffset: 0, endIndex: 200, endOffset: 0,
		text: '[seed text segment 1]',
		codes: [{ codeId: codeIds['Frustração'] }],
		codedBy: 'human:joana',
		createdAt: now, updatedAt: now,
	},
	{
		markerType: 'pdf', id: id('m'), fileId: pdfFile,
		page: 1, beginIndex: 300, beginOffset: 0, endIndex: 400, endOffset: 0,
		text: '[seed text segment 2 — boundary diff]',
		codes: [{ codeId: codeIds['Estratégia'] }],
		codedBy: 'human:carla',
		createdAt: now, updatedAt: now,
	},
	{
		markerType: 'pdf', id: id('m'), fileId: pdfFile,
		page: 1, beginIndex: 320, beginOffset: 0, endIndex: 380, endOffset: 0,
		text: '[seed text segment 2 — boundary diff]',
		codes: [{ codeId: codeIds['Estratégia'] }],
		codedBy: 'human:joana',
		createdAt: now, updatedAt: now,
	},
);

// ─── CSV cod segment markers ──────────────────────────────
data.csv.segmentMarkers.push(
	{
		markerType: 'csv', id: id('m'),
		fileId: 'ICR-test/ICR-survey.csv',
		sourceRowId: 0, column: 'response', from: 0, to: 50,
		codes: [{ codeId: codeIds['Confiança'] }],
		codedBy: 'human:carla',
		createdAt: now, updatedAt: now,
	},
	{
		markerType: 'csv', id: id('m'),
		fileId: 'ICR-test/ICR-survey.csv',
		sourceRowId: 0, column: 'response', from: 0, to: 50,
		codes: [{ codeId: codeIds['Confiança'] }],
		codedBy: 'human:joana',
		createdAt: now, updatedAt: now,
	},
	{
		markerType: 'csv', id: id('m'),
		fileId: 'ICR-test/ICR-survey.csv',
		sourceRowId: 1, column: 'response', from: 0, to: 80,
		codes: [{ codeId: codeIds['Limitação técnica'] }],
		codedBy: 'human:carla',
		createdAt: now, updatedAt: now,
	},
	{
		markerType: 'csv', id: id('m'),
		fileId: 'ICR-test/ICR-survey.csv',
		sourceRowId: 1, column: 'response', from: 10, to: 70,
		codes: [{ codeId: codeIds['Frustração'] }],
		codedBy: 'human:joana',
		createdAt: now, updatedAt: now,
	},
);

// ─── Audio markers (Slice E5a smoke) ──────────────────────
// Files reais no vault — paths relativos. Markers contestados: Carla vs Joana sobrepondo.
const AUDIO_FILE = 'obsidian-qualia-coding/Conquerors and The World.mp3';
data.audio = data.audio ?? { files: [], settings: data.audio?.settings ?? {} };
const audioFile = data.audio.files.find(f => f.path === AUDIO_FILE) ?? (() => {
	const f = { path: AUDIO_FILE, markers: [] };
	data.audio.files.push(f);
	return f;
})();
audioFile.markers.push(
	{
		markerType: 'audio', id: id('m'), fileId: AUDIO_FILE,
		from: 5000, to: 12000,
		codes: [{ codeId: codeIds['Frustração'] }],
		codedBy: 'human:carla',
		createdAt: now, updatedAt: now,
	},
	{
		markerType: 'audio', id: id('m'), fileId: AUDIO_FILE,
		from: 8000, to: 15000,
		codes: [{ codeId: codeIds['Crítica institucional'] }],
		codedBy: 'human:joana',
		createdAt: now, updatedAt: now,
	},
);

// ─── Video markers (Slice E5a smoke) ──────────────────────
const VIDEO_FILE = 'obsidian-qualia-coding/leticia.mp4';
data.video = data.video ?? { files: [], settings: data.video?.settings ?? {} };
const videoFile = data.video.files.find(f => f.path === VIDEO_FILE) ?? (() => {
	const f = { path: VIDEO_FILE, markers: [] };
	data.video.files.push(f);
	return f;
})();
videoFile.markers.push(
	{
		markerType: 'video', id: id('m'), fileId: VIDEO_FILE,
		from: 0, to: 5000,
		codes: [{ codeId: codeIds['Confiança'] }],
		codedBy: 'human:carla',
		createdAt: now, updatedAt: now,
	},
	{
		markerType: 'video', id: id('m'), fileId: VIDEO_FILE,
		from: 3000, to: 8000,
		codes: [{ codeId: codeIds['Estratégia'] }],
		codedBy: 'human:joana',
		createdAt: now, updatedAt: now,
	},
);

fs.writeFileSync(DATA_JSON, JSON.stringify(data, null, 2));

console.log('ICR seed corpus populated.');
console.log(`- ${data.coders.coders.length} coders`);
console.log(`- ${Object.keys(data.registry.definitions).length} codes`);
console.log(`- ${Object.values(mdMarkers).flat().length} markdown markers`);
console.log(`- ${data.pdf.markers.length} PDF markers`);
console.log(`- ${data.csv.segmentMarkers.length} CSV segment markers`);
console.log(`- ${audioFile.markers.length} audio markers (${AUDIO_FILE})`);
console.log(`- ${videoFile.markers.length} video markers (${VIDEO_FILE})`);

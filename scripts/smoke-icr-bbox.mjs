#!/usr/bin/env node
/**
 * Smoke setup pra Slice 6 ICR bbox adapter.
 *
 * Injeta no data.json: 2 coders (carla, joana) + 15 PdfShapeMarkers em <fileId>:page:1
 * com 3 padrões: 5 idênticas (matched, mesmos códigos), 5 só do carla (unmatched_a)
 * com 1 código `pos` aplicado.
 *
 * Uso:
 *   node scripts/smoke-icr-bbox.mjs <fileId>
 *   ex: node scripts/smoke-icr-bbox.mjs test.pdf
 *
 * Depois: reload Obsidian + rodar snippet do console em ICR-bbox-smoke-test.md.
 *
 * Idempotente: se já existem markers `sm-smoke-*`, sai sem mexer.
 */

import * as fs from 'fs';
import * as path from 'path';

const DATA_PATH = path.resolve(process.cwd(), 'data.json');
const fileId = process.argv[2];

if (!fileId) {
	console.error('Uso: node scripts/smoke-icr-bbox.mjs <fileId-do-PDF>');
	console.error('Ex:  node scripts/smoke-icr-bbox.mjs test.pdf');
	process.exit(1);
}

if (!fs.existsSync(DATA_PATH)) {
	console.error(`data.json não encontrado em ${DATA_PATH}`);
	process.exit(1);
}

const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));

// Idempotência
const existingShapes = data.engines?.pdf?.shapes ?? [];
const alreadySeeded = existingShapes.some(s => String(s.id ?? '').startsWith('sm-smoke-'));
if (alreadySeeded) {
	console.log('Smoke markers já existem (sm-smoke-*). Sem mudanças.');
	process.exit(0);
}

// Garante seções
data.icr ??= {};
data.icr.coders ??= [];
data.engines ??= {};
data.engines.pdf ??= { markers: [], shapes: [] };
data.engines.pdf.shapes ??= [];
data.codes ??= [];

// Adiciona coders se ausentes
const ensureCoder = (id, name) => {
	if (!data.icr.coders.find(c => c.id === id)) {
		data.icr.coders.push({ id, name, kind: 'human', createdAt: Date.now() });
	}
};
ensureCoder('coder:carla', 'Carla');
ensureCoder('coder:joana', 'Joana');

// Adiciona código `pos` se ausente
if (!data.codes.find(c => c.id === 'pos')) {
	data.codes.push({
		id: 'pos',
		name: 'pos',
		color: '#4caf50',
		paletteIndex: 0,
		createdAt: Date.now(),
		updatedAt: Date.now(),
	});
}

// Helper pra criar shape marker
const mkShape = (id, codedBy, x, y) => ({
	markerType: 'pdf',
	id,
	fileId,
	page: 1,
	shape: 'rect',
	coords: { type: 'rect', x, y, w: 0.10, h: 0.10 },
	codes: [{ codeId: 'pos' }],
	codedBy,
	createdAt: Date.now(),
	updatedAt: Date.now(),
});

// Cenário smoke: 5 idênticas (carla+joana) + 5 só do carla
// Total = 15 markers; eventos esperados = 5 matched + 5 unmatched_a = 10 events
for (let i = 0; i < 5; i++) {
	const x = 0.10 + i * 0.15;
	data.engines.pdf.shapes.push(mkShape(`sm-smoke-a-${i}`, 'coder:carla', x, 0.20));
	data.engines.pdf.shapes.push(mkShape(`sm-smoke-b-${i}`, 'coder:joana', x, 0.20));
	data.engines.pdf.shapes.push(mkShape(`sm-smoke-aonly-${i}`, 'coder:carla', x, 0.50));
}

fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));

console.log('✅ Smoke seeded:');
console.log(`   - 2 coders: coder:carla, coder:joana`);
console.log(`   - 1 code: pos (verde)`);
console.log(`   - 15 PdfShapeMarkers em ${fileId} page 1:`);
console.log(`     · 5 idênticas (carla + joana, y=0.20) → 5 matched events`);
console.log(`     · 5 só do carla (y=0.50) → 5 unmatched_a events`);
console.log('');
console.log('Próximos passos:');
console.log('   1. Reload Obsidian (Cmd/Ctrl+R)');
console.log('   2. Cmd+Opt+I → Console → cole o snippet de ICR-bbox-smoke-test.md');
console.log('   3. Reporte os números observados na nota');

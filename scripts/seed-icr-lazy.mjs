#!/usr/bin/env node
/**
 * Seed ICR lazy — popula data.json com markers em CSV grande + Parquet pra exercitar
 * o caminho LAZY (RowProvider via DuckDB) do `CsvSegmentSourceSize` em runtime real.
 *
 * Cobertura:
 *   - CSV >100MB → lazy mode CSV (hydrator-corpus.csv gerado se faltar)
 *   - Parquet existente → lazy mode parquet (safe-mode-test/Distribution_history_MERGED*.parquet)
 *
 * Markers distribuídos entre 2 coders (A e B) em ambos arquivos pra exercitar Compare Coders.
 *
 * Backup automático de data.json em data.json.bak.<timestamp> antes de escrever.
 *
 * Usage: node scripts/seed-icr-lazy.mjs
 *
 * Pré-requisito: Obsidian FECHADO (senão plugin sobrescreve data.json com snapshot).
 */

import { writeFileSync, createWriteStream, copyFileSync, readFileSync, statSync, existsSync } from 'node:fs';

const VAULT = '/Users/mosx/Desktop/obsidian-plugins-workbench';
const CSV_PATH = `${VAULT}/hydrator-corpus.csv`;
const PARQUET_PATH = 'safe-mode-test/Distribution_history_MERGED_2024-12-09_2025-11-27.parquet';
const DATA_PATH = `${VAULT}/.obsidian/plugins/obsidian-qualia-coding/data.json`;

const TARGET_BYTES = 120 * 1024 * 1024; // 120MB → entra lazy
const N_MARKERS_PER_FILE = 20;          // 10 por coder em cada arquivo

// ─── 1. Garante CSV grande (idempotente) ────────────────────────────────────

if (!existsSync(CSV_PATH) || statSync(CSV_PATH).size < TARGET_BYTES) {
	console.log(`[seed-lazy] Generating ${TARGET_BYTES / 1024 / 1024}MB CSV at ${CSV_PATH}…`);
	const COMMENTS = [
		'Sinto que o trabalho remoto trouxe mais autonomia mas também isolamento. Tenho dificuldade em separar o tempo de descanso do trabalho.',
		'A flexibilidade de horário foi o que mais mudou meu cotidiano. Posso resolver coisas pessoais sem precisar pedir permissão.',
		'O contato com a equipe ficou mais frio. Reuniões substituíram conversas espontâneas que aconteciam no café.',
		'Minha produtividade melhorou em alguns aspectos mas piorou em outros. Foco profundo é mais fácil em casa.',
		'Como mãe, o home office foi salvação e tortura. Salvação por estar perto delas, tortura por nunca conseguir desligar.',
	];
	const NAMES = ['Carla', 'João', 'Maria', 'Pedro', 'Ana', 'Bruno', 'Júlia', 'Lucas', 'Beatriz', 'Rafael'];
	const stream = createWriteStream(CSV_PATH);
	const header = 'id,participant,interview_date,comment\n';
	stream.write(header);
	let bytesWritten = header.length;
	let rowCount = 0;
	while (bytesWritten < TARGET_BYTES) {
		const day = (rowCount % 28) + 1;
		const comment = `[r:${rowCount}] ${COMMENTS[rowCount % COMMENTS.length]}`.replace(/"/g, '""');
		const row = [rowCount, NAMES[rowCount % NAMES.length], `2026-01-${day.toString().padStart(2, '0')}`, `"${comment}"`].join(',') + '\n';
		stream.write(row);
		bytesWritten += Buffer.byteLength(row, 'utf8');
		rowCount++;
	}
	await new Promise((resolve, reject) => stream.end(err => err ? reject(err) : resolve()));
	console.log(`[seed-lazy] ✓ CSV: ${(statSync(CSV_PATH).size / 1024 / 1024).toFixed(1)}MB`);
} else {
	console.log(`[seed-lazy] CSV já existe: ${(statSync(CSV_PATH).size / 1024 / 1024).toFixed(1)}MB`);
}

// ─── 2. Confirma parquet existe ─────────────────────────────────────────────

const parquetAbs = `${VAULT}/${PARQUET_PATH}`;
if (!existsSync(parquetAbs)) {
	console.error(`[seed-lazy] Parquet não encontrado: ${parquetAbs}`);
	process.exit(1);
}
console.log(`[seed-lazy] ✓ Parquet: ${(statSync(parquetAbs).size / 1024 / 1024).toFixed(1)}MB`);

// ─── 3. Backup data.json ────────────────────────────────────────────────────

if (!existsSync(DATA_PATH)) {
	console.error(`[seed-lazy] data.json não existe — abrir Obsidian uma vez pra inicializar.`);
	process.exit(1);
}
const backupPath = `${DATA_PATH}.bak.${Date.now()}`;
copyFileSync(DATA_PATH, backupPath);
console.log(`[seed-lazy] ✓ Backup: ${backupPath}`);

const data = JSON.parse(readFileSync(DATA_PATH, 'utf8'));
const now = Date.now();

// ─── 4. Adiciona coders (idempotente) ───────────────────────────────────────

data.coders ||= { coders: [] };
const ensureCoder = (id, name) => {
	if (!data.coders.coders.some(c => c.id === id)) {
		data.coders.coders.push({ id, name, type: 'human', createdAt: now });
	}
};
ensureCoder('human:lazy_a', 'Lazy A');
ensureCoder('human:lazy_b', 'Lazy B');

// ─── 5. Adiciona codes (idempotente) ────────────────────────────────────────

const CODES = [
	{ id: 'c_lazy_x', name: 'lazy-tema-X', color: '#FF6B6B' },
	{ id: 'c_lazy_y', name: 'lazy-tema-Y', color: '#4ECDC4' },
];

data.registry ||= { definitions: {}, rootOrder: [] };
data.registry.definitions ||= {};
data.registry.rootOrder ||= [];
let nextPaletteIdx = data.registry.nextPaletteIndex ?? 0;

for (const c of CODES) {
	if (data.registry.definitions[c.id]) continue;
	data.registry.definitions[c.id] = {
		id: c.id,
		name: c.name,
		color: c.color,
		paletteIndex: nextPaletteIdx % 10,
		createdAt: now,
		hidden: false,
	};
	nextPaletteIdx++;
	if (!data.registry.rootOrder.includes(c.id)) data.registry.rootOrder.push(c.id);
}
data.registry.nextPaletteIndex = nextPaletteIdx;

// ─── 6. Adiciona markers no CSV (10 por coder, mesmo cells pra Cohen κ) ────

data.csv ||= { segmentMarkers: [], rowMarkers: [], settings: {} };
data.csv.segmentMarkers ||= [];

// Limpa markers anteriores deste seed
data.csv.segmentMarkers = data.csv.segmentMarkers.filter(m => !m.id.startsWith('m_lazy_'));

const CSV_FILE = 'hydrator-corpus.csv';
const PARQUET_FILE = PARQUET_PATH; // relative path do vault root

// CSV markers — sourceRowId 0..9, col='comment', from=0, to=30
for (let i = 0; i < N_MARKERS_PER_FILE; i++) {
	const sourceRowId = i % 10;             // 0..9 (cada row tem 2 markers — A + B)
	const coderId = i < 10 ? 'human:lazy_a' : 'human:lazy_b';
	const codeId = CODES[i % 2].id;
	data.csv.segmentMarkers.push({
		id: `m_lazy_csv_${i.toString().padStart(2, '0')}`,
		markerType: 'csv',
		fileId: CSV_FILE,
		sourceRowId,
		column: 'comment',
		from: 0,
		to: 30,
		codes: [{ codeId }],
		codedBy: coderId,
		createdAt: now - i * 1000,
		updatedAt: now - i * 1000,
	});
}

// Parquet markers — sourceRowId 0..9, col='Distribution Id', from=0, to=20
for (let i = 0; i < N_MARKERS_PER_FILE; i++) {
	const sourceRowId = i % 10;
	const coderId = i < 10 ? 'human:lazy_a' : 'human:lazy_b';
	const codeId = CODES[i % 2].id;
	data.csv.segmentMarkers.push({
		id: `m_lazy_pq_${i.toString().padStart(2, '0')}`,
		markerType: 'csv',
		fileId: PARQUET_FILE,
		sourceRowId,
		column: 'Distribution Id',
		from: 0,
		to: 20,
		codes: [{ codeId }],
		codedBy: coderId,
		createdAt: now - i * 1000,
		updatedAt: now - i * 1000,
	});
}

writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));

console.log('');
console.log(`[seed-lazy] ✓ +2 coders (Lazy A, Lazy B)`);
console.log(`[seed-lazy] ✓ +${CODES.length} codes`);
console.log(`[seed-lazy] ✓ +${N_MARKERS_PER_FILE} csv-seg markers em ${CSV_FILE}`);
console.log(`[seed-lazy] ✓ +${N_MARKERS_PER_FILE} csv-seg markers em ${PARQUET_FILE}`);
console.log('');
console.log('Próximos passos pra smoke do caminho lazy:');
console.log('  1. Reload Obsidian (Cmd+R ou desabilitar/reativar plugin)');
console.log(`  2. Abre ${CSV_FILE} (lazy mode CSV — vai abrir DuckDB)`);
console.log(`  3. Abre ${PARQUET_FILE} (lazy mode parquet)`);
console.log('  4. Cmd+P → "Compare Coders" → enter');
console.log('  5. Devtools console filtrado por "qc-srcSize"');
console.log('  6. Esperado: logs "CSV lazy HIT" (em vez de "CSV eager HIT") pra ambos arquivos');
console.log('');
console.log('Rollback:');
console.log(`  cp ${backupPath} ${DATA_PATH}`);
console.log(`  (CSV grande fica no vault — apaga com: rm ${CSV_PATH})`);

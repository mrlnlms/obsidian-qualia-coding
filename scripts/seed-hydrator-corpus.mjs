#!/usr/bin/env node
/**
 * Seed pra testar smoke do MarkerPreviewHydrator (Chunk 2 do plan).
 *
 * Gera um CSV sintético >100MB (entra em modo lazy) na raiz do vault de teste
 * e popula `data.json` com codes + markers apontando pra esse CSV. Após reload
 * do Obsidian, o Code Explorer deve disparar hidratação dos previews em
 * background.
 *
 * Usage:
 *   node scripts/seed-hydrator-corpus.mjs           (default 120MB, 50 markers)
 *   node scripts/seed-hydrator-corpus.mjs --small   (40MB pra testar eager mode)
 *
 * Vault: /Users/mosx/Desktop/obsidian-plugins-workbench (workbench root)
 * Backup automático de data.json em data.json.bak.<timestamp>.
 */

import { writeFileSync, createWriteStream, copyFileSync, readFileSync, statSync, existsSync } from 'node:fs';

const VAULT = '/Users/mosx/Desktop/obsidian-plugins-workbench';
const CSV_PATH = `${VAULT}/hydrator-corpus.csv`;
const DATA_PATH = `${VAULT}/.obsidian/plugins/obsidian-qualia-coding/data.json`;

const SMALL = process.argv.includes('--small');
const TARGET_MB = SMALL ? 40 : 120;
const TARGET_BYTES = TARGET_MB * 1024 * 1024;
const N_MARKERS = 50;

// ── Sample data ──

const NAMES = ['Carla', 'João', 'Maria', 'Pedro', 'Ana', 'Bruno', 'Júlia', 'Lucas', 'Beatriz', 'Rafael',
	'Camila', 'Felipe', 'Larissa', 'Diego', 'Gabriela', 'Thiago', 'Letícia', 'Gustavo', 'Patrícia', 'Vitor'];

const COMMENTS = [
	'Sinto que o trabalho remoto trouxe mais autonomia mas também isolamento. Tenho dificuldade em separar o tempo de descanso do trabalho efetivo.',
	'A flexibilidade de horário foi o que mais mudou meu cotidiano. Posso resolver coisas pessoais sem precisar pedir permissão ou justificar ausências.',
	'O contato com a equipe ficou mais frio. Reuniões substituíram conversas espontâneas que aconteciam no café. Sinto falta dessas trocas casuais.',
	'Minha produtividade melhorou em alguns aspectos mas piorou em outros. Foco profundo é mais fácil em casa, mas brainstorming colaborativo sofreu.',
	'Como mãe de duas crianças, o home office foi salvação e tortura. Salvação por estar perto delas, tortura por nunca conseguir desligar 100%.',
	'O modelo híbrido seria ideal pra mim. Dois ou três dias presenciais por semana já dariam conta da parte social, e o resto remoto pro foco.',
	'Notei que minha saúde mental piorou no primeiro ano de remoto, mas melhorei depois que estabeleci ritual de saída do escritório virtual.',
	'A empresa não nos preparou pra essa transição. Faltou treinamento em ferramentas, gestão à distância e cuidado com o bem-estar dos colaboradores.',
	'Minha autonomia aumentou drasticamente. Hoje sinto que controlo meu trabalho de uma forma que antes era impensável no escritório tradicional.',
	'Tenho colegas que adoram o remoto e outros que detestam. Acho que isso depende muito do tipo de trabalho que cada um faz e da fase de vida.',
];

const CODES = [
	{ id: 'c_hyd_aut',  name: 'tema-autonomia',     color: '#FF6B6B' },
	{ id: 'c_hyd_iso',  name: 'tema-isolamento',    color: '#4ECDC4' },
	{ id: 'c_hyd_flex', name: 'tema-flexibilidade', color: '#45B7D1' },
	{ id: 'c_hyd_sa',   name: 'tema-saude-mental',  color: '#FFA07A' },
	{ id: 'c_hyd_eq',   name: 'tema-equipe',        color: '#98D8C8' },
];

// ── 1. Gera CSV ──

console.log(`[seed] Generating ${TARGET_MB}MB CSV at ${CSV_PATH}…`);
const stream = createWriteStream(CSV_PATH);
const header = 'id,participant,interview_date,comment\n';
stream.write(header);
let bytesWritten = header.length;
let rowCount = 0;

while (bytesWritten < TARGET_BYTES) {
	const day = (rowCount % 28) + 1;
	const row = [
		rowCount,
		NAMES[rowCount % NAMES.length],
		`2026-01-${day.toString().padStart(2, '0')}`,
		`"${COMMENTS[rowCount % COMMENTS.length].replace(/"/g, '""')}"`,
	].join(',') + '\n';
	stream.write(row);
	bytesWritten += Buffer.byteLength(row, 'utf8');
	rowCount++;
}

await new Promise((resolve, reject) => stream.end(err => err ? reject(err) : resolve()));
const actualSize = statSync(CSV_PATH).size;
console.log(`[seed] ✓ CSV: ${(actualSize / 1024 / 1024).toFixed(1)}MB · ${rowCount} rows`);

// ── 2. Backup + carrega data.json ──

if (!existsSync(DATA_PATH)) {
	console.log('[seed] data.json não existe — abrir o plugin uma vez antes pra inicializar.');
	process.exit(1);
}

const backupPath = `${DATA_PATH}.bak.${Date.now()}`;
copyFileSync(DATA_PATH, backupPath);
console.log(`[seed] ✓ Backup: ${backupPath}`);

const data = JSON.parse(readFileSync(DATA_PATH, 'utf8'));

// ── 3. Adiciona codes (preserva existentes) ──

data.registry ||= { definitions: {}, rootOrder: [] };
data.registry.definitions ||= {};
data.registry.rootOrder ||= [];

const now = Date.now();
const palette = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8'];
let nextPaletteIdx = data.registry.nextPaletteIndex ?? 0;

for (const c of CODES) {
	if (data.registry.definitions[c.id]) continue;  // idempotente
	data.registry.definitions[c.id] = {
		id: c.id,
		name: c.name,
		color: c.color,
		paletteIndex: nextPaletteIdx % palette.length,
		createdAt: now,
		hidden: false,
	};
	nextPaletteIdx++;
	if (!data.registry.rootOrder.includes(c.id)) {
		data.registry.rootOrder.push(c.id);
	}
}
data.registry.nextPaletteIndex = nextPaletteIdx;

// ── 4. Adiciona markers no CSV ──

data.csv ||= { segmentMarkers: [], rowMarkers: [], settings: {} };
data.csv.segmentMarkers ||= [];

// Limpa markers anteriores deste seed (idempotente)
data.csv.segmentMarkers = data.csv.segmentMarkers.filter(m => !m.id.startsWith('m_hyd_'));

for (let i = 0; i < N_MARKERS; i++) {
	const sourceRowId = Math.floor((i / N_MARKERS) * rowCount);
	const codeId = CODES[i % CODES.length].id;
	data.csv.segmentMarkers.push({
		id: `m_hyd_${i.toString().padStart(3, '0')}`,
		markerType: 'csv',
		fileId: 'hydrator-corpus.csv',
		sourceRowId,
		column: 'comment',
		from: 0,
		to: 30,
		codes: [{ codeId }],
		createdAt: now - i * 1000,
		updatedAt: now - i * 1000,
	});
}

writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
console.log(`[seed] ✓ data.json: +${CODES.length} codes · +${N_MARKERS} markers em '${'hydrator-corpus.csv'}'`);

// ── 5. Instruções ──

console.log('');
console.log('Próximos passos:');
console.log('  1. Reload Obsidian (Cmd+R ou desabilitar/reativar plugin)');
console.log('  2. (Opcional, pra cold puro) DevTools → Application → Storage → "Origin Private File System" → Clear');
console.log('  3. Reload de novo');
console.log('  4. Abrir Code Explorer (sidebar do plugin)');
console.log(`  5. Validar: ${SMALL ? '(small=40MB, eager mode)' : '(120MB, lazy mode)'}`);
if (!SMALL) {
	console.log('     - Markers aparecem com placeholder "Row N · comment"');
	console.log('     - Indicador "Hidratando previews… X/Y" no toolbar');
	console.log('     - Em ~5-30s, placeholder vira texto inline');
} else {
	console.log('     - Markers aparecem com texto direto (cache eager)');
	console.log('     - Indicador NÃO aparece (smoke negativo OK)');
}
console.log('');
console.log('Pra desfazer:');
console.log(`  rm ${CSV_PATH}`);
console.log(`  cp ${backupPath} ${DATA_PATH}`);

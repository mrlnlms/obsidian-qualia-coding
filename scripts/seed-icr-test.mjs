#!/usr/bin/env node
/**
 * Seed ICR test — corpus sintético cravado em 4 engines (markdown, csv, audio, video)
 * pra smoke completo de Compare Coders sem coding manual.
 *
 * Strategy: HARD RESET dos dados de coding (coders, codes, markers de todos engines)
 * + criação de arquivos sintéticos próprios em `_icr-test/` (transcript.md, survey.csv,
 * audio-sample.mp3 cópia, video-sample.mp4 cópia). Settings (audio/video viewState,
 * theme, comparisons salvas, case variables) ficam preservados.
 *
 * Reversibilidade:
 *   - Backup FULL do data.json em `obsidian-qualia-coding/data_synthetic_bak/`
 *     ANTES de qualquer write (nome includes timestamp ISO)
 *   - `--clean` substitui coders/codes/markers por listas vazias (estado default-like)
 *   - Rollback ao estado anterior: copiar backup mais recente sobre o data.json
 *
 * Convenção de naming:
 *   - Coders/codes/markers seed usam prefixo `_seed_icr_test_*` (cleanup-safe se algum dia
 *     o reset não for total)
 *   - Mas reset é completo: coders/codes/markers de TODOS engines são substituídos.
 *
 * Cobertura ICR (smoke completo):
 *   - 13 cenários distribuídos em 4 engines = 29 markers totais
 *   - 5 coeficientes: Cohen κ, Fleiss κ, α, α-binary, cu-α
 *   - 3 distâncias: nominal, Jaccard, MASI
 *   - Cenários cravados numericamente — α/κ esperado é calculável (ground truth pra LLM
 *     coder benchmark futuro). Ver seed-icr-test.README.md pra detalhes por cenário.
 *
 * Uso:
 *   npm run seed:icr-test          # popula corpus (idempotente)
 *   npm run seed:icr-test:clean    # zera coding (mantém arquivos físicos e settings)
 *   node scripts/seed-icr-test.mjs --dry-run    # preview sem persistir
 *
 * ⚠️ FECHE OBSIDIAN antes de rodar — plugin ativo sobrescreve data.json com snapshot
 * em memória. Reabra após o script terminar.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

// ─── Paths ───────────────────────────────────────────────────────────────────
const VAULT = '/Users/mosx/Desktop/obsidian-plugins-workbench';
const PLUGIN_DIR = path.join(VAULT, '.obsidian/plugins/obsidian-qualia-coding');
const DATA_JSON = path.join(PLUGIN_DIR, 'data.json');
const BACKUP_DIR = path.join(VAULT, 'obsidian-qualia-coding/data_synthetic_bak');
const TEST_DIR = path.join(VAULT, '_icr-test');

const SOURCE_AUDIO = path.join(VAULT, 'notes-for-anything/smoke/song-renamed.mp3');
const SOURCE_VIDEO = path.join(VAULT, 'notes-for-anything/smoke/clip.mp4');

const TRANSCRIPT_PATH = '_icr-test/transcript.md';
const SURVEY_PATH = '_icr-test/survey.csv';
const AUDIO_PATH = '_icr-test/audio-sample.mp3';
const VIDEO_PATH = '_icr-test/video-sample.mp4';

// ─── Naming convention ───────────────────────────────────────────────────────
const SEED_PREFIX = '_seed_icr_test_';
const CODER_A = `${SEED_PREFIX}coder_a`;
const CODER_B = `${SEED_PREFIX}coder_b`;
const CODER_C = `${SEED_PREFIX}coder_c`;
const CODE_A = `${SEED_PREFIX}code_tema_a`;
const CODE_B = `${SEED_PREFIX}code_tema_b`;
const CODE_C = `${SEED_PREFIX}code_tema_c`;
const CODE_D = `${SEED_PREFIX}code_tema_d`;

// ─── CLI ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const clean = args.includes('--clean');
const dryRun = args.includes('--dry-run');
const help = args.includes('--help') || args.includes('-h');

if (help) {
	console.log(`Usage: node scripts/seed-icr-test.mjs [options]

Options:
  --clean      Zerar coding (coders/codes/markers → vazios). Mantém settings.
  --dry-run    Mostrar sem persistir
  --help, -h   Mostrar este help

Modes:
  default      Hard reset + popula corpus completo (29 markers em 4 engines)
  --clean      Hard reset apenas (deixa data.json com coding zerado)
`);
	process.exit(0);
}

// ─── Conteúdo sintético ──────────────────────────────────────────────────────

const TRANSCRIPT_CONTENT = `# Entrevista de pesquisa (seed ICR test)

P: Como você descreveria sua experiência inicial nesse processo?

R: Olha, no começo foi muito difícil pra ser sincero. A gente tentou várias abordagens diferentes mas nada parecia funcionar bem no início. Foi bastante frustrante.

P: O que mais te marcou em todo esse percurso até agora?

R: A frustração de ver projetos pararem por falta de recursos técnicos ou de pessoal qualificado. Mas também o sentimento de orgulho quando algo enfim dava certo.

P: Como você lidaria de forma diferente hoje numa situação similar?

R: Hoje eu sei que precisava de mais paciência e estratégia. Antes era impulso puro — agora penso bastante antes de tomar qualquer decisão.

P: Tem algo mais que queira compartilhar sobre essa jornada?

R: A principal lição foi sobre não desistir mesmo nas dificuldades grandes. Aprender com cada erro é o que faz a gente crescer profissionalmente.

P: Obrigado pela conversa.

R: Disponha sempre que precisar.
`;

// Linhas (0-indexed) do transcript pros markers:
//   line 4: "R: Olha, no começo..." (R1 — M1)
//   line 8: "R: A frustração de ver projetos..." (R2 — M2 boundary)
//   line 12: "R: Hoje eu sei que precisava..." (R3 — M3 Fleiss N=3 code diff)
//   line 16: "R: A principal lição foi sobre não desistir..." (R4 — M4 multi-label)

const SURVEY_CONTENT = `id,respondent,comment,categoria
1,Ana,"A experiência foi desafiadora mas tive aprendizados importantes ao longo do tempo.",positiva
2,Bruno,"Faltou organização e clareza desde o começo do processo.",negativa
3,Carla,"Achei tudo muito confuso mesmo com as instruções dadas pela equipe.",negativa
4,Diego,"Recomendo o processo pra qualquer pessoa interessada. Aprendi muito.",positiva
5,Eva,"Mais ou menos. Algumas partes boas mas teve momentos frustrantes também.",neutra
`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function backupDataJson() {
	if (dryRun) return 'skipped (dry-run)';
	fs.mkdirSync(BACKUP_DIR, { recursive: true });
	const ts = new Date().toISOString().replace(/[:.]/g, '-');
	const dest = path.join(BACKUP_DIR, `data.json.pre-seed-icr-test.${ts}.bak`);
	fs.copyFileSync(DATA_JSON, dest);
	return dest;
}

function getFileDurationSec(file) {
	try {
		const out = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${file}"`, { encoding: 'utf-8' });
		return parseFloat(out.trim());
	} catch {
		return null;
	}
}

function ensureTestDirAndFiles() {
	if (clean) return; // clean preserva files (não destrói corpus)

	if (dryRun) {
		console.log(`[dry-run] would ensure ${TEST_DIR}/ exists`);
		console.log(`[dry-run] would write ${TRANSCRIPT_PATH} (${TRANSCRIPT_CONTENT.length} bytes)`);
		console.log(`[dry-run] would write ${SURVEY_PATH} (${SURVEY_CONTENT.length} bytes)`);
		console.log(`[dry-run] would copy mp3/mp4 if missing`);
		return;
	}

	fs.mkdirSync(TEST_DIR, { recursive: true });

	// transcript.md e survey.csv: sempre sobrescreve (são owned pelo seed)
	fs.writeFileSync(path.join(VAULT, TRANSCRIPT_PATH), TRANSCRIPT_CONTENT);
	console.log(`Wrote: ${TRANSCRIPT_PATH}`);
	fs.writeFileSync(path.join(VAULT, SURVEY_PATH), SURVEY_CONTENT);
	console.log(`Wrote: ${SURVEY_PATH}`);

	// audio/video: copia só se faltar (são grandes — não regerar à toa)
	const audioTarget = path.join(VAULT, AUDIO_PATH);
	const videoTarget = path.join(VAULT, VIDEO_PATH);
	if (!fs.existsSync(audioTarget)) {
		if (!fs.existsSync(SOURCE_AUDIO)) throw new Error(`Audio source missing: ${SOURCE_AUDIO}`);
		fs.copyFileSync(SOURCE_AUDIO, audioTarget);
		console.log(`Copied: ${AUDIO_PATH}`);
	}
	if (!fs.existsSync(videoTarget)) {
		if (!fs.existsSync(SOURCE_VIDEO)) throw new Error(`Video source missing: ${SOURCE_VIDEO}`);
		fs.copyFileSync(SOURCE_VIDEO, videoTarget);
		console.log(`Copied: ${VIDEO_PATH}`);
	}
}

function loadData() {
	const raw = fs.readFileSync(DATA_JSON, 'utf-8');
	const data = JSON.parse(raw);
	if (typeof data !== 'object' || data === null) throw new Error('data.json is not an object');
	return data;
}

function saveData(data) {
	if (dryRun) {
		console.log('[dry-run] would write data.json');
		return;
	}
	fs.writeFileSync(DATA_JSON, JSON.stringify(data, null, 2));
}

// ─── Hard reset (zera coding, preserva settings) ─────────────────────────────

function hardReset(data) {
	// Coders → zerado
	data.coders = { coders: [] };
	data.activeCoderId = null;

	// Registry → zerado (definitions, rootOrder)
	data.registry = data.registry ?? {};
	data.registry.definitions = {};
	data.registry.rootOrder = [];
	data.registry.nextPaletteIndex = 0;
	data.registry.folders = data.registry.folders ?? { definitions: {}, order: [] };
	data.registry.groups = data.registry.groups ?? { definitions: {}, order: [], nextPaletteIndex: 0 };

	// Smart codes → zerado
	data.smartCodes = data.smartCodes ?? { definitions: {}, order: [], nextPaletteIndex: 0 };
	data.smartCodes.definitions = {};
	data.smartCodes.order = [];

	// Comparisons → zerado (saved comparisons)
	data.comparisons = data.comparisons ?? { definitions: {}, order: [] };
	data.comparisons.definitions = {};
	data.comparisons.order = [];

	// Markers de todos engines → zerado
	data.markdown = data.markdown ?? { markers: {}, settings: {} };
	data.markdown.markers = {};

	data.pdf = data.pdf ?? { markers: [], settings: {} };
	data.pdf.markers = [];

	data.csv = data.csv ?? { segmentMarkers: [], rowMarkers: [], settings: {} };
	data.csv.segmentMarkers = [];
	data.csv.rowMarkers = [];

	data.audio = data.audio ?? { files: [], settings: {} };
	data.audio.files = [];

	data.video = data.video ?? { files: [], settings: {} };
	data.video.files = [];

	data.image = data.image ?? { files: [], settings: {} };
	data.image.files = [];

	// Source hashes → zerado (corpora antiga não vai mais existir referenciada)
	data.sourceHashes = {};

	// Last compare coders used → reset (escopo não bate mais)
	delete data.lastCompareCodersUsed;

	// Audit log → reset (limpa ruído de operações antigas)
	data.auditLog = { entries: [] };

	// Visibility overrides → reset
	data.visibilityOverrides = {};
}

// ─── Seed (popula corpus) ────────────────────────────────────────────────────

function performSeed(data) {
	hardReset(data);
	const now = Date.now();

	// ─── Coders (3) ────────────────────────────────────────
	data.coders.coders.push(
		{ id: CODER_A, name: 'Coder A (seed)', type: 'human', createdAt: now },
		{ id: CODER_B, name: 'Coder B (seed)', type: 'human', createdAt: now },
		{ id: CODER_C, name: 'Coder C (seed)', type: 'human', createdAt: now },
	);
	data.activeCoderId = CODER_A;

	// ─── Codes (4) ─────────────────────────────────────────
	const codes = [
		[CODE_A, 'Tema A', '#5B9BD5', 0],
		[CODE_B, 'Tema B', '#ED7D31', 1],
		[CODE_C, 'Tema C', '#70AD47', 2],
		[CODE_D, 'Tema D', '#7030A0', 3],
	];
	for (const [id, name, color, paletteIndex] of codes) {
		data.registry.definitions[id] = {
			id, name, color, paletteIndex,
			createdAt: now, updatedAt: now,
			childrenOrder: [],
		};
		data.registry.rootOrder.push(id);
	}
	data.registry.nextPaletteIndex = 4;

	// ─── Markdown markers (9 markers, 4 cenários) ─────────
	const mdMarkers = [];
	const mkMd = (key, line, fromCh, toCh, coder, codeIds) => ({
		markerType: 'markdown',
		id: `${SEED_PREFIX}md_${key}`,
		fileId: TRANSCRIPT_PATH,
		range: { from: { line, ch: fromCh }, to: { line, ch: toCh } },
		color: '#5B9BD5',
		codes: codeIds.map(codeId => ({ codeId })),
		codedBy: coder,
		createdAt: now, updatedAt: now,
	});

	mdMarkers.push(
		// M1 — Full agreement na resposta R1 (linha 4) — chars 3-50
		mkMd('m1_a', 4, 3, 50, CODER_A, [CODE_A]),
		mkMd('m1_b', 4, 3, 50, CODER_B, [CODE_A]),

		// M2 — Boundary diff na R2 (linha 8): A pega faixa maior, B menor
		mkMd('m2_a', 8, 3, 100, CODER_A, [CODE_A]),
		mkMd('m2_b', 8, 20, 90, CODER_B, [CODE_A]),

		// M3 — Multi-label N=3 com lateral overlap (Fleiss + Jaccard/MASI strong)
		//   A={B,C}, B={C,D}, C={B,D} — pares com 1 elemento em comum, lateral (sem subset)
		//   δ_jaccard pares: 2/3 cada (|∩|=1, |∪|=3)
		//   δ_MASI pares: 8/9 cada (J=1/3, M=1/3 lateral)
		//   Diferença δ² ≈ 0.35 por par × 3 pares × 77 chars = MUITO disagreement weighted
		mkMd('m3_a', 12, 3, 80, CODER_A, [CODE_B, CODE_C]),
		mkMd('m3_b', 12, 3, 80, CODER_B, [CODE_C, CODE_D]),
		mkMd('m3_c', 12, 3, 80, CODER_C, [CODE_B, CODE_D]),

		// M4 — Multi-label lateral na R4 (linha 16): A={tema-A,tema-B}, B={tema-A,tema-C}
		//   Lateral overlap em vez de subset → δ_jaccard²=4/9, δ_MASI²=64/81 (diff ~0.35)
		mkMd('m4_a', 16, 3, 60, CODER_A, [CODE_A, CODE_B]),
		mkMd('m4_b', 16, 3, 60, CODER_B, [CODE_A, CODE_C]),
	);
	data.markdown.markers[TRANSCRIPT_PATH] = mdMarkers;

	// ─── CSV markers (4 markers, 2 cenários) ──────────────
	// CSV1 — segment marker em row 0 col `comment` chars 0-50 (full agreement)
	data.csv.segmentMarkers.push(
		{
			markerType: 'csv',
			id: `${SEED_PREFIX}csvseg_csv1_a`,
			fileId: SURVEY_PATH,
			sourceRowId: 0, column: 'comment',
			from: 0, to: 50,
			codes: [{ codeId: CODE_A }],
			codedBy: CODER_A,
			createdAt: now, updatedAt: now,
		},
		{
			markerType: 'csv',
			id: `${SEED_PREFIX}csvseg_csv1_b`,
			fileId: SURVEY_PATH,
			sourceRowId: 0, column: 'comment',
			from: 0, to: 50,
			codes: [{ codeId: CODE_A }],
			codedBy: CODER_B,
			createdAt: now, updatedAt: now,
		},
	);

	// CSV2 — row marker em row 1 col `categoria` (code disagreement)
	data.csv.rowMarkers.push(
		{
			markerType: 'csv',
			id: `${SEED_PREFIX}csvrow_csv2_a`,
			fileId: SURVEY_PATH,
			sourceRowId: 1, column: 'categoria',
			codes: [{ codeId: CODE_A }],
			codedBy: CODER_A,
			createdAt: now, updatedAt: now,
		},
		{
			markerType: 'csv',
			id: `${SEED_PREFIX}csvrow_csv2_b`,
			fileId: SURVEY_PATH,
			sourceRowId: 1, column: 'categoria',
			codes: [{ codeId: CODE_B }],
			codedBy: CODER_B,
			createdAt: now, updatedAt: now,
		},
	);

	// ─── Audio markers (12 markers, 6 cenários) ───────────
	const audioFile = { path: AUDIO_PATH, markers: [] };
	data.audio.files.push(audioFile);

	const mkAudio = (key, from, to, coder, codeIds) => ({
		markerType: 'audio',
		id: `${SEED_PREFIX}audio_${key}`,
		fileId: AUDIO_PATH,
		from, to,
		codes: codeIds.map(codeId => ({ codeId })),
		codedBy: coder,
		createdAt: now, updatedAt: now,
	});

	audioFile.markers.push(
		// C1 — Full agreement (α=1 em qualquer resolução)
		mkAudio('c1_a', 10.0, 20.0, CODER_A, [CODE_A]),
		mkAudio('c1_b', 10.0, 20.0, CODER_B, [CODE_A]),

		// C2 — Partial overlap
		mkAudio('c2_a', 30.0, 40.0, CODER_A, [CODE_A]),
		mkAudio('c2_b', 35.0, 45.0, CODER_B, [CODE_A]),

		// C3 — Sub-segundo disagreement (1s: false agreement; 100ms+: real)
		mkAudio('c3_a', 60.0, 60.5, CODER_A, [CODE_A]),
		mkAudio('c3_b', 60.6, 61.0, CODER_B, [CODE_A]),

		// C4 — Sub-100ms disagreement (10ms: real)
		mkAudio('c4_a', 120.05, 120.15, CODER_A, [CODE_A]),
		mkAudio('c4_b', 120.07, 120.13, CODER_B, [CODE_A]),

		// C5 — Code disagreement A vs D (ativa tema-D no codebook)
		mkAudio('c5_a', 180.0, 200.0, CODER_A, [CODE_A]),
		mkAudio('c5_b', 180.0, 200.0, CODER_B, [CODE_D]),

		// C6 — Sparse coding (5s em 359s — testa MediaSourceSize / gap #1b)
		mkAudio('c6_a', 300.0, 305.0, CODER_A, [CODE_A]),
		mkAudio('c6_b', 300.0, 305.0, CODER_B, [CODE_A]),
	);

	// ─── Video markers (4 markers, 2 cenários) ────────────
	const videoFile = { path: VIDEO_PATH, markers: [] };
	data.video.files.push(videoFile);

	const mkVideo = (key, from, to, coder, codeIds) => ({
		markerType: 'video',
		id: `${SEED_PREFIX}video_${key}`,
		fileId: VIDEO_PATH,
		from, to,
		codes: codeIds.map(codeId => ({ codeId })),
		codedBy: coder,
		createdAt: now, updatedAt: now,
	});

	videoFile.markers.push(
		// V1 — Full agreement (tema A, azul)
		mkVideo('v1_a', 1.0, 2.5, CODER_A, [CODE_A]),
		mkVideo('v1_b', 1.0, 2.5, CODER_B, [CODE_A]),

		// V2 — Partial overlap (tema B, laranja) — 1s common em 2s spans
		mkVideo('v2_a', 3.0, 5.0, CODER_A, [CODE_B]),
		mkVideo('v2_b', 4.0, 6.0, CODER_B, [CODE_B]),

		// V3 — Sub-segundo disagreement (tema A) — 300ms gap em ticks
		mkVideo('v3_a', 6.5, 6.8, CODER_A, [CODE_A]),
		mkVideo('v3_b', 6.9, 7.2, CODER_B, [CODE_A]),

		// V4 — Fleiss N=3 code disagreement (tema C/D/C) — verde/roxo/verde
		mkVideo('v4_a', 7.5, 9.0, CODER_A, [CODE_C]),
		mkVideo('v4_b', 7.5, 9.0, CODER_B, [CODE_D]),
		mkVideo('v4_c', 7.5, 9.0, CODER_C, [CODE_C]),

		// V5 — Multi-label lateral (Jaccard temporal): A={A,C}, B={B,C}
		//   Lateral em vez de subset → δ_jaccard²=4/9, δ_MASI²=64/81 (diff ~0.35)
		mkVideo('v5_a', 9.5, 10.5, CODER_A, [CODE_A, CODE_C]),
		mkVideo('v5_b', 9.5, 10.5, CODER_B, [CODE_B, CODE_C]),

		// V6 — Presence/absence (sparse semântica): só A marca, B silencioso
		//   α-binary captura: A "presente" tema-A em [11.0, 11.5), B "ausente"
		//   Outros coders não marcam essa região → disagreement isolado no fim
		mkVideo('v6_a', 11.0, 11.5, CODER_A, [CODE_A]),
	);
}

// ─── Main ────────────────────────────────────────────────────────────────────
console.log(`Mode: ${clean ? 'CLEAN (hard-reset only)' : 'SEED (hard-reset + populate)'}${dryRun ? ' [DRY-RUN]' : ''}`);
console.log('');

if (!fs.existsSync(DATA_JSON)) {
	console.error(`Error: data.json not found at ${DATA_JSON}`);
	process.exit(1);
}

const backupPath = backupDataJson();
console.log(`Backup: ${backupPath}`);

ensureTestDirAndFiles();

if (!clean && !dryRun) {
	const audioDur = getFileDurationSec(path.join(VAULT, AUDIO_PATH));
	const videoDur = getFileDurationSec(path.join(VAULT, VIDEO_PATH));
	if (audioDur) console.log(`Audio duration: ${audioDur.toFixed(2)}s (${AUDIO_PATH})`);
	if (videoDur) console.log(`Video duration: ${videoDur.toFixed(2)}s (${VIDEO_PATH})`);
}

const data = loadData();

if (clean) {
	hardReset(data);
} else {
	performSeed(data);
}

saveData(data);

console.log('');
console.log('Summary:');
console.log(`  coders: ${data.coders.coders.length}`);
console.log(`  codes: ${Object.keys(data.registry.definitions).length}`);
const mdCount = Object.values(data.markdown.markers ?? {}).flat().length;
const csvSegCount = data.csv?.segmentMarkers?.length ?? 0;
const csvRowCount = data.csv?.rowMarkers?.length ?? 0;
const audioCount = (data.audio?.files ?? []).reduce((s, f) => s + (f.markers?.length ?? 0), 0);
const videoCount = (data.video?.files ?? []).reduce((s, f) => s + (f.markers?.length ?? 0), 0);
console.log(`  markdown markers: ${mdCount}`);
console.log(`  csv segment markers: ${csvSegCount}`);
console.log(`  csv row markers: ${csvRowCount}`);
console.log(`  audio markers: ${audioCount}`);
console.log(`  video markers: ${videoCount}`);
console.log(`  total markers: ${mdCount + csvSegCount + csvRowCount + audioCount + videoCount}`);

if (!clean && !dryRun) {
	console.log('');
	console.log('Next steps:');
	console.log('  1. Reload Obsidian (Cmd+R) OR restart plugin');
	console.log('  2. Open _icr-test/transcript.md → 9 markdown markers (4 cenários)');
	console.log('  3. Open _icr-test/survey.csv → 4 CSV markers (2 cenários)');
	console.log('  4. Open _icr-test/audio-sample.mp3 → 12 audio markers (6 cenários)');
	console.log('  5. Open _icr-test/video-sample.mp4 → 12 video markers (6 cenários)');
	console.log('  6. Open Compare Coders (palette: "Open Compare Coders view")');
	console.log('  7. Default scope: 3 coders + 4 codes + 4 engines');
	console.log('  8. Toggle "resolução temporal" chip [1s][100ms][10ms] — α deve DIMINUIR');
	console.log('');
	console.log('See scripts/seed-icr-test.README.md for per-scenario expected values.');
}

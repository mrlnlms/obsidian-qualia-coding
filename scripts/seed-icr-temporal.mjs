#!/usr/bin/env node
/**
 * Seed ICR temporal — gera massa sintética de audio/video pra validar:
 *
 *   - Gap #2: resolução temporal parametrizável (1s / 100ms / 10ms) — Compare Coders
 *     toolbar chip muda α/κ visivelmente nos cenários C3 e C4.
 *   - Gap #1b: SourceSizeProvider (MediaSourceSize) — cenário C6 com coding esparso
 *     deve mostrar P_o menor quando provider conhece a duração real (359s vs max
 *     range.to dos markers ~305s).
 *
 * Convenção de naming pra cleanup safe:
 *   - Coders/codes/markers seed usam prefixo `_seed_icr_temporal_*`
 *   - `--clean` remove APENAS entries com esse prefixo — não toca dados do user
 *
 * Reversibilidade:
 *   - Backup automático em `obsidian-qualia-coding/data_synthetic_bak/`
 *   - `--clean` faz reversal completo
 *   - Idempotente: rodar 2x mantém estado final consistente
 *
 * Visão de futuro (motivação user 2026-05-13):
 *   Cenários cravados com NÚMEROS conhecidos (não aleatórios) servem como ground
 *   truth pra benchmark de LLM coder. Cada cenário tem α/κ esperado calculável.
 *   Mesma convenção `_seed_<thematic>_*` deve ser adotada em outros seeds futuros.
 *
 * Uso:
 *   node scripts/seed-icr-temporal.mjs              # seed (idempotente)
 *   node scripts/seed-icr-temporal.mjs --clean      # remove só entries seed
 *   node scripts/seed-icr-temporal.mjs --dry-run    # mostra sem persistir
 *
 * Pré-requisito: NPM script `seed:icr-temporal` em package.json.
 *
 * ⚠️ FECHE OBSIDIAN antes de rodar — plugin ativo pode sobrescrever data.json
 * com snapshot em memória. Reabra após o script terminar.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

// ─── Paths cravados ──────────────────────────────────────────────────────────
const VAULT = '/Users/mosx/Desktop/obsidian-plugins-workbench';
const PLUGIN_DIR = path.join(VAULT, '.obsidian/plugins/obsidian-qualia-coding');
const DATA_JSON = path.join(PLUGIN_DIR, 'data.json');
const BACKUP_DIR = path.join(VAULT, 'obsidian-qualia-coding/data_synthetic_bak');
const TEST_DIR = path.join(VAULT, '_icr-test');

// Sources reais no vault (já existem)
const SOURCE_AUDIO = path.join(VAULT, 'notes-for-anything/smoke/song-renamed.mp3');
const SOURCE_VIDEO = path.join(VAULT, 'notes-for-anything/smoke/clip.mp4');

// Paths-vault (relative ao root do vault — é como Obsidian referencia files)
const AUDIO_PATH = '_icr-test/audio-sample.mp3';
const VIDEO_PATH = '_icr-test/video-sample.mp4';

// ─── Convenção de naming ─────────────────────────────────────────────────────
const SEED_PREFIX = '_seed_icr_temporal_';
const CODER_A = `${SEED_PREFIX}coder_a`;
const CODER_B = `${SEED_PREFIX}coder_b`;
const CODE_TEMA_A = `${SEED_PREFIX}code_tema_a`;
const CODE_TEMA_B = `${SEED_PREFIX}code_tema_b`;

const isSeed = (id) => typeof id === 'string' && id.startsWith(SEED_PREFIX);

// ─── CLI args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const clean = args.includes('--clean');
const dryRun = args.includes('--dry-run');
const help = args.includes('--help') || args.includes('-h');

if (help) {
	console.log(`Usage: node scripts/seed-icr-temporal.mjs [options]

Options:
  --clean      Remove all seed entries (idempotent reversal)
  --dry-run    Show what would happen without persisting
  --help, -h   Show this help

Behavior:
  Default mode seeds 2 coders + 2 codes + 18 temporal markers across audio/video.
  Idempotent: re-running re-seeds from clean state.
  Backup: data.json saved to ${BACKUP_DIR}/ before any write.
`);
	process.exit(0);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function backupDataJson() {
	if (dryRun) return 'skipped (dry-run)';
	fs.mkdirSync(BACKUP_DIR, { recursive: true });
	const ts = new Date().toISOString().replace(/[:.]/g, '-');
	const dest = path.join(BACKUP_DIR, `data.json.pre-seed-icr-temporal.${ts}.bak`);
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

function copyMediaFiles() {
	if (clean) return; // clean mode doesn't touch files (would lose user-created markers if any)

	const audioTarget = path.join(VAULT, AUDIO_PATH);
	const videoTarget = path.join(VAULT, VIDEO_PATH);

	if (dryRun) {
		// Dry-run: só relata o que faria, sem tocar filesystem
		if (!fs.existsSync(audioTarget)) console.log(`[dry-run] would copy ${SOURCE_AUDIO} → ${audioTarget}`);
		else console.log(`[dry-run] ${audioTarget} já existe — skip copy`);
		if (!fs.existsSync(videoTarget)) console.log(`[dry-run] would copy ${SOURCE_VIDEO} → ${videoTarget}`);
		else console.log(`[dry-run] ${videoTarget} já existe — skip copy`);
		return;
	}

	fs.mkdirSync(TEST_DIR, { recursive: true });

	if (!fs.existsSync(audioTarget)) {
		if (!fs.existsSync(SOURCE_AUDIO)) {
			throw new Error(`Audio source missing: ${SOURCE_AUDIO}\nExpected workbench layout — adapt SOURCE_AUDIO if files moved.`);
		}
		fs.copyFileSync(SOURCE_AUDIO, audioTarget);
		console.log(`Copied: ${AUDIO_PATH}`);
	}

	if (!fs.existsSync(videoTarget)) {
		if (!fs.existsSync(SOURCE_VIDEO)) {
			throw new Error(`Video source missing: ${SOURCE_VIDEO}\nExpected workbench layout — adapt SOURCE_VIDEO if files moved.`);
		}
		fs.copyFileSync(SOURCE_VIDEO, videoTarget);
		console.log(`Copied: ${VIDEO_PATH}`);
	}
}

function loadData() {
	const raw = fs.readFileSync(DATA_JSON, 'utf-8');
	const data = JSON.parse(raw);
	if (typeof data !== 'object' || data === null) {
		throw new Error('data.json is not an object');
	}
	return data;
}

function saveData(data) {
	if (dryRun) {
		console.log('[dry-run] would write data.json');
		return;
	}
	fs.writeFileSync(DATA_JSON, JSON.stringify(data, null, 2));
}

// ─── Operations ──────────────────────────────────────────────────────────────

function performClean(data) {
	let coderCount = 0, codeCount = 0, audioCount = 0, videoCount = 0;

	// Coders
	if (data.coders?.coders) {
		const before = data.coders.coders.length;
		data.coders.coders = data.coders.coders.filter(c => !isSeed(c.id));
		coderCount = before - data.coders.coders.length;
	}

	// Codes (registry.definitions + rootOrder)
	if (data.registry?.definitions) {
		const ids = Object.keys(data.registry.definitions).filter(isSeed);
		for (const id of ids) delete data.registry.definitions[id];
		codeCount = ids.length;
	}
	if (data.registry?.rootOrder) {
		data.registry.rootOrder = data.registry.rootOrder.filter(id => !isSeed(id));
	}

	// Audio markers (filter seed markers from each file; remove empty seed files)
	if (data.audio?.files) {
		const out = [];
		for (const file of data.audio.files) {
			const before = file.markers?.length ?? 0;
			file.markers = (file.markers ?? []).filter(m => !isSeed(m.id));
			audioCount += before - file.markers.length;
			// Remove o file entry só se for o seed audio E ficou vazio
			if (file.path === AUDIO_PATH && file.markers.length === 0) continue;
			out.push(file);
		}
		data.audio.files = out;
	}

	// Video markers
	if (data.video?.files) {
		const out = [];
		for (const file of data.video.files) {
			const before = file.markers?.length ?? 0;
			file.markers = (file.markers ?? []).filter(m => !isSeed(m.id));
			videoCount += before - file.markers.length;
			if (file.path === VIDEO_PATH && file.markers.length === 0) continue;
			out.push(file);
		}
		data.video.files = out;
	}

	console.log(`Removed: ${coderCount} coders, ${codeCount} codes, ${audioCount} audio markers, ${videoCount} video markers`);
}

function performSeed(data) {
	// Limpa entries seed anteriores ANTES — idempotência via clean+seed em sequência
	performClean(data);

	const now = Date.now();

	// ─── Coders ────────────────────────────────────────────
	data.coders = data.coders ?? { coders: [] };
	data.coders.coders.push(
		{ id: CODER_A, name: 'Seed Coder A (ICR temporal)', type: 'human', createdAt: now },
		{ id: CODER_B, name: 'Seed Coder B (ICR temporal)', type: 'human', createdAt: now },
	);

	// ─── Codes ─────────────────────────────────────────────
	data.registry = data.registry ?? { definitions: {}, rootOrder: [] };
	data.registry.definitions = data.registry.definitions ?? {};
	data.registry.rootOrder = data.registry.rootOrder ?? [];
	data.registry.definitions[CODE_TEMA_A] = {
		id: CODE_TEMA_A, name: 'Seed Tema A', color: '#5B9BD5', paletteIndex: 0,
		createdAt: now, updatedAt: now, childrenOrder: [],
	};
	data.registry.definitions[CODE_TEMA_B] = {
		id: CODE_TEMA_B, name: 'Seed Tema B', color: '#ED7D31', paletteIndex: 1,
		createdAt: now, updatedAt: now, childrenOrder: [],
	};
	data.registry.rootOrder.push(CODE_TEMA_A, CODE_TEMA_B);

	// ─── Audio markers ─────────────────────────────────────
	data.audio = data.audio ?? { files: [], settings: {} };
	data.audio.files = data.audio.files ?? [];
	let audioFile = data.audio.files.find(f => f.path === AUDIO_PATH);
	if (!audioFile) {
		audioFile = { path: AUDIO_PATH, markers: [] };
		data.audio.files.push(audioFile);
	}

	const mkAudio = (key, from, to, coder, codeId) => ({
		markerType: 'audio',
		id: `${SEED_PREFIX}audio_${key}`,
		fileId: AUDIO_PATH,
		from, to,
		codes: [{ codeId }],
		codedBy: coder,
		createdAt: now, updatedAt: now,
	});

	audioFile.markers.push(
		// C1 — Full agreement perfect (α=1 em qualquer resolução)
		mkAudio('c1_a', 10.0, 20.0, CODER_A, CODE_TEMA_A),
		mkAudio('c1_b', 10.0, 20.0, CODER_B, CODE_TEMA_A),

		// C2 — Partial overlap (5s common em 10s spans — visível em todas resoluções)
		mkAudio('c2_a', 30.0, 40.0, CODER_A, CODE_TEMA_A),
		mkAudio('c2_b', 35.0, 45.0, CODER_B, CODE_TEMA_A),

		// C3 — Sub-segundo disagreement
		//   1s: ambos viram tick [60, 61) → agreement falso
		//   100ms: A=[600,605), B=[606,610) → disagreement real
		mkAudio('c3_a', 60.0, 60.5, CODER_A, CODE_TEMA_A),
		mkAudio('c3_b', 60.6, 61.0, CODER_B, CODE_TEMA_A),

		// C4 — Sub-100ms disagreement (extremidades)
		//   100ms: A=floor(1200.5)=1200, ceil(1201.5)=1202; B=floor(1200.7)=1200, ceil(1201.3)=1202 → [1200,1202) ambos
		//   10ms: A=[12005,12015), B=[12007,12013) → disagreement nas pontas (4 ticks de mismatch)
		mkAudio('c4_a', 120.05, 120.15, CODER_A, CODE_TEMA_A),
		mkAudio('c4_b', 120.07, 120.13, CODER_B, CODE_TEMA_A),

		// C5 — Code disagreement (overlap espacial perfeito, códigos diferentes)
		mkAudio('c5_a', 180.0, 200.0, CODER_A, CODE_TEMA_A),
		mkAudio('c5_b', 180.0, 200.0, CODER_B, CODE_TEMA_B),

		// C6 — Sparse coding (testa Gap #1b — sem MediaSourceSize, totalUnits=305 inflado;
		//   com provider real, totalUnits=359 do file → P_o reflete background real)
		mkAudio('c6_a', 300.0, 305.0, CODER_A, CODE_TEMA_A),
		mkAudio('c6_b', 300.0, 305.0, CODER_B, CODE_TEMA_A),
	);

	// ─── Video markers ─────────────────────────────────────
	data.video = data.video ?? { files: [], settings: {} };
	data.video.files = data.video.files ?? [];
	let videoFile = data.video.files.find(f => f.path === VIDEO_PATH);
	if (!videoFile) {
		videoFile = { path: VIDEO_PATH, markers: [] };
		data.video.files.push(videoFile);
	}

	const mkVideo = (key, from, to, coder, codeId) => ({
		markerType: 'video',
		id: `${SEED_PREFIX}video_${key}`,
		fileId: VIDEO_PATH,
		from, to,
		codes: [{ codeId }],
		codedBy: coder,
		createdAt: now, updatedAt: now,
	});

	videoFile.markers.push(
		// V1 — Full agreement
		mkVideo('v1_a', 1.0, 3.0, CODER_A, CODE_TEMA_A),
		mkVideo('v1_b', 1.0, 3.0, CODER_B, CODE_TEMA_A),
		// V2 — Partial overlap (5.5-7 common em 3s spans)
		mkVideo('v2_a', 4.0, 7.0, CODER_A, CODE_TEMA_A),
		mkVideo('v2_b', 5.5, 8.5, CODER_B, CODE_TEMA_A),
		// V3 — Sub-segundo (1s: ambos [9,10), 100ms: A=[90,95), B=[96,100))
		mkVideo('v3_a', 9.0, 9.5, CODER_A, CODE_TEMA_A),
		mkVideo('v3_b', 9.6, 10.0, CODER_B, CODE_TEMA_A),
	);
}

// ─── Main ────────────────────────────────────────────────────────────────────
console.log(`Mode: ${clean ? 'CLEAN' : 'SEED'}${dryRun ? ' (DRY-RUN)' : ''}`);
console.log('');

if (!fs.existsSync(DATA_JSON)) {
	console.error(`Error: data.json not found at ${DATA_JSON}`);
	process.exit(1);
}

const backupPath = backupDataJson();
console.log(`Backup: ${backupPath}`);

copyMediaFiles();

// Verifica duração real dos arquivos (não falha se ffprobe ausente — só informativo)
if (!clean) {
	const audioTarget = path.join(VAULT, AUDIO_PATH);
	const videoTarget = path.join(VAULT, VIDEO_PATH);
	const audioDur = getFileDurationSec(audioTarget);
	const videoDur = getFileDurationSec(videoTarget);
	if (audioDur) console.log(`Audio duration: ${audioDur.toFixed(2)}s`);
	if (videoDur) console.log(`Video duration: ${videoDur.toFixed(2)}s`);
}

const data = loadData();

if (clean) {
	performClean(data);
} else {
	performSeed(data);
}

saveData(data);

console.log('');
console.log('Summary:');
console.log(`  total coders: ${data.coders?.coders?.length ?? 0} (seed: ${data.coders?.coders?.filter(c => isSeed(c.id)).length ?? 0})`);
console.log(`  total codes: ${Object.keys(data.registry?.definitions ?? {}).length} (seed: ${Object.keys(data.registry?.definitions ?? {}).filter(isSeed).length})`);

const audioFile = data.audio?.files?.find(f => f.path === AUDIO_PATH);
const videoFile = data.video?.files?.find(f => f.path === VIDEO_PATH);
console.log(`  ${AUDIO_PATH}: ${audioFile?.markers?.length ?? 0} markers`);
console.log(`  ${VIDEO_PATH}: ${videoFile?.markers?.length ?? 0} markers`);

if (!clean && !dryRun) {
	console.log('');
	console.log('Next steps:');
	console.log('  1. Reload Obsidian (Cmd+R) OR restart plugin (Settings → Community plugins → reload)');
	console.log('  2. Open Compare Coders view (command palette: "Compare Coders")');
	console.log('  3. Scope: audio + video; coders = "Seed Coder A" + "Seed Coder B"');
	console.log('  4. Toggle "resolução temporal" chip [1s] / [100ms] / [10ms]');
	console.log('  5. Expected α/κ behavior:');
	console.log('     - 1s → 100ms: C3 (audio) e V3 (video) ganham disagreement real');
	console.log('     - 100ms → 10ms: C4 (audio) ganha disagreement (4 ticks de mismatch)');
	console.log('     - C6 (audio sparse): P_o reflete duração real 359s via MediaSourceSize provider');
	console.log('');
	console.log('See _icr-test/README.md for expected α values per cenário.');
}

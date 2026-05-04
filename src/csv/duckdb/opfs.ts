/**
 * OPFS (Origin Private File System) streaming layer for parquet/CSV lazy loading.
 *
 * Why this exists: DuckDB-Wasm in browser context can't read partial bytes from the
 * Obsidian vault adapter (only full-file reads are exposed). Copying the file once
 * to OPFS gives us a `FileSystemFileHandle` that DuckDB consumes via its
 * `BROWSER_FSACCESS` protocol, which DOES support partial reads (`read(buffer, {at})`).
 *
 * Why streaming: Premise C of the spike (2026-05-03) confirmed that copying a 387.5 MB
 * CSV via Node `fs.createReadStream` → `FileSystemWritableFileStream` keeps heap delta
 * at exactly 0 MB during the copy (chunks GC'd as soon as they're written). Using
 * `vault.adapter.readBinary()` would materialize the entire file in RAM first —
 * defeats the lazy-loading premise on cold start.
 *
 * No consumer in this phase — wired up in Fase 4 (RowProvider real implementation).
 */

import * as fs from "fs";
import { createHash } from "crypto";

const ROOT_DIR = "qualia-coding";
const DATA_FILENAME = "data.bin";
const META_FILENAME = "meta.json";
const CHUNK_SIZE = 1024 * 1024; // 1 MB

interface OPFSMeta {
	mtime: number;
	originalPath: string;
}

/**
 * Build a stable, filesystem-safe key for a vault file. Hash collapses arbitrary
 * paths into 16 hex chars — sidesteps the 260-char path limit on Windows and
 * keeps the OPFS layout flat regardless of vault structure.
 */
export function opfsKeyFor(vaultId: string, filePath: string): string {
	return createHash("sha1").update(`${vaultId}::${filePath}`).digest("hex").slice(0, 16);
}

async function getRootDir(): Promise<FileSystemDirectoryHandle> {
	if (!navigator.storage || typeof navigator.storage.getDirectory !== "function") {
		throw new Error("OPFS API (navigator.storage.getDirectory) is not available in this context");
	}
	const opfsRoot = await navigator.storage.getDirectory();
	return opfsRoot.getDirectoryHandle(ROOT_DIR, { create: true });
}

async function getEntryDir(opfsKey: string, create: boolean): Promise<FileSystemDirectoryHandle> {
	const root = await getRootDir();
	return root.getDirectoryHandle(opfsKey, { create });
}

async function readMeta(entryDir: FileSystemDirectoryHandle): Promise<OPFSMeta | null> {
	try {
		const handle = await entryDir.getFileHandle(META_FILENAME);
		const file = await handle.getFile();
		const text = await file.text();
		return JSON.parse(text) as OPFSMeta;
	} catch {
		return null;
	}
}

async function writeMeta(entryDir: FileSystemDirectoryHandle, meta: OPFSMeta): Promise<void> {
	const handle = await entryDir.getFileHandle(META_FILENAME, { create: true });
	const writable = await handle.createWritable();
	try {
		await writable.write(JSON.stringify(meta));
	} finally {
		await writable.close();
	}
}

/**
 * Copy `vault → OPFS` in 1 MB chunks via Node fs streaming. Idempotent — if the
 * OPFS copy carries the same mtime as requested, returns the existing handle
 * without rewriting.
 */
export async function copyVaultFileToOPFS(
	absVaultPath: string,
	opfsKey: string,
	mtime: number,
	onProgress?: (bytesWritten: number, bytesTotal: number) => void,
): Promise<FileSystemFileHandle> {
	const entryDir = await getEntryDir(opfsKey, true);
	const existing = await readMeta(entryDir);
	if (existing && existing.mtime === mtime) {
		return entryDir.getFileHandle(DATA_FILENAME);
	}

	const stat = fs.statSync(absVaultPath);
	const totalBytes = stat.size;

	const dataHandle = await entryDir.getFileHandle(DATA_FILENAME, { create: true });
	const writable = await dataHandle.createWritable();

	let bytesWritten = 0;
	try {
		const stream = fs.createReadStream(absVaultPath, { highWaterMark: CHUNK_SIZE });
		for await (const chunk of stream as AsyncIterable<Buffer>) {
			// Buffer extends Uint8Array — passes through. The TS5 cast skirts a
			// strict-mode disagreement between Uint8Array<ArrayBufferLike> (which
			// could in theory be SharedArrayBuffer-backed) and FileSystemWriteChunkType
			// (which demands Uint8Array<ArrayBuffer>). Runtime is fine.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await writable.write(chunk as any);
			bytesWritten += chunk.length;
			onProgress?.(bytesWritten, totalBytes);
		}
	} finally {
		await writable.close();
	}

	// Write metadata AFTER the data file is closed. Order matters: a crash mid-copy
	// leaves meta missing, which forces re-copy on next access (correct fallback).
	await writeMeta(entryDir, { mtime, originalPath: absVaultPath });

	return dataHandle;
}

/**
 * Get the OPFS file handle for an already-copied entry. Throws if missing.
 */
export async function openOPFSFile(opfsKey: string): Promise<FileSystemFileHandle> {
	const entryDir = await getEntryDir(opfsKey, false);
	return entryDir.getFileHandle(DATA_FILENAME);
}

/**
 * Remove a single OPFS-cached file by key. Idempotent — no-op if missing.
 */
export async function removeOPFSFile(opfsKey: string): Promise<void> {
	const root = await getRootDir();
	try {
		// `recursive: true` removes the entry dir + both files inside it.
		await root.removeEntry(opfsKey, { recursive: true });
	} catch (err) {
		// Throw only on unexpected errors; "not found" is fine.
		if ((err as { name?: string })?.name !== "NotFoundError") throw err;
	}
}

/**
 * Wipe the entire qualia OPFS namespace. Returns count of removed entries.
 * Used on plugin disable (Fase 6) and via a "Clear lazy cache" command.
 */
export async function clearOPFSCache(): Promise<{ removed: number }> {
	if (!navigator.storage || typeof navigator.storage.getDirectory !== "function") {
		return { removed: 0 };
	}
	const opfsRoot = await navigator.storage.getDirectory();
	let root: FileSystemDirectoryHandle;
	try {
		root = await opfsRoot.getDirectoryHandle(ROOT_DIR, { create: false });
	} catch {
		return { removed: 0 };
	}
	let removed = 0;
	// `entries()` exists at runtime on FileSystemDirectoryHandle but the TS lib
	// definitions vary by version — cast to keep the strict build happy.
	const entries = (root as unknown as {
		entries(): AsyncIterable<[string, FileSystemHandle]>;
	}).entries();
	for await (const [name] of entries) {
		await root.removeEntry(name, { recursive: true });
		removed++;
	}
	await opfsRoot.removeEntry(ROOT_DIR);
	return { removed };
}

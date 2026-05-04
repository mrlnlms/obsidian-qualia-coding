// Pure transforms for Fase 0 source-row-id migration.
// CLI wrappers: migrate-fase-0-source-row-id.mjs / revert-fase-0-source-row-id.mjs.
// Discartable: delete with the wrappers when Fase 6 closes.

/**
 * Renames `row` → `sourceRowId` in csv.segmentMarkers and csv.rowMarkers (in place).
 * Idempotent: markers that already have sourceRowId and no row are skipped.
 *
 * @param {object} data — parsed data.json contents (mutated in place)
 * @returns {{ segMigrated: number, rowMigrated: number }}
 */
export function migrateData(data) {
	let segMigrated = 0;
	let rowMigrated = 0;
	const csv = data?.csv;
	if (!csv) return { segMigrated, rowMigrated };

	if (Array.isArray(csv.segmentMarkers)) {
		for (const m of csv.segmentMarkers) {
			if (Object.prototype.hasOwnProperty.call(m, 'row') && !Object.prototype.hasOwnProperty.call(m, 'sourceRowId')) {
				m.sourceRowId = m.row;
				delete m.row;
				segMigrated++;
			}
		}
	}
	if (Array.isArray(csv.rowMarkers)) {
		for (const m of csv.rowMarkers) {
			if (Object.prototype.hasOwnProperty.call(m, 'row') && !Object.prototype.hasOwnProperty.call(m, 'sourceRowId')) {
				m.sourceRowId = m.row;
				delete m.row;
				rowMigrated++;
			}
		}
	}
	return { segMigrated, rowMigrated };
}

/**
 * Reverse transform — renames sourceRowId → row.
 *
 * @param {object} data — parsed data.json contents (mutated in place)
 * @returns {{ segReverted: number, rowReverted: number }}
 */
export function revertData(data) {
	let segReverted = 0;
	let rowReverted = 0;
	const csv = data?.csv;
	if (!csv) return { segReverted, rowReverted };

	if (Array.isArray(csv.segmentMarkers)) {
		for (const m of csv.segmentMarkers) {
			if (Object.prototype.hasOwnProperty.call(m, 'sourceRowId') && !Object.prototype.hasOwnProperty.call(m, 'row')) {
				m.row = m.sourceRowId;
				delete m.sourceRowId;
				segReverted++;
			}
		}
	}
	if (Array.isArray(csv.rowMarkers)) {
		for (const m of csv.rowMarkers) {
			if (Object.prototype.hasOwnProperty.call(m, 'sourceRowId') && !Object.prototype.hasOwnProperty.call(m, 'row')) {
				m.row = m.sourceRowId;
				delete m.sourceRowId;
				rowReverted++;
			}
		}
	}
	return { segReverted, rowReverted };
}

/**
 * @param {object} data
 * @returns {boolean} true if no marker has `row` (all already migrated, or empty)
 */
export function isAlreadyMigrated(data) {
	const csv = data?.csv;
	if (!csv) return true;
	if (Array.isArray(csv.segmentMarkers)) {
		for (const m of csv.segmentMarkers) {
			if (Object.prototype.hasOwnProperty.call(m, 'row')) return false;
		}
	}
	if (Array.isArray(csv.rowMarkers)) {
		for (const m of csv.rowMarkers) {
			if (Object.prototype.hasOwnProperty.call(m, 'row')) return false;
		}
	}
	return true;
}

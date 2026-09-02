/**
 * Margin Panel Layout — pure layout algorithms for column allocation and label positioning.
 *
 * Extracted from marginPanelExtension.ts. No DOM access — only geometry computation.
 */

import type { Marker } from "../models/codeMarkerModel";
import { layoutMarginRails } from '../../core/marginPanelLayout';

// ── Constants ────────────────────────────────────────────────────────────────

export const LINE_WIDTH = 2;
export const DOT_SIZE = 7;
export const TICK_LENGTH = 4;
export const COLUMN_WIDTH = 10;
export const LABEL_HEIGHT = 16;
export const MIN_LABEL_SPACE = 80;
export const MAX_LABEL_SPACE = 200;
export const LABEL_FONT = '500 11px sans-serif';
export const PANEL_LEFT_MARGIN = 20;

// ── Types ────────────────────────────────────────────────────────────────────

export interface ResolvedBracket {
	marker: Marker;
	codeId: string;
	codeName: string;
	color: string;
	top: number;
	bottom: number;
	column: number;
}

export interface LabelInfo {
	markerId: string;
	codeName: string;
	color: string;
	idealY: number;
	actualY: number;
	segmentTop: number;
	segmentBottom: number;
	column: number;
	weight: number;
	maxColAtY: number;
}

// ── Layout algorithms ────────────────────────────────────────────────────────

/**
 * Rule 1: Sort by span descending (largest first).
 * Allocate each bar to the rightmost free column at its range.
 */
export function assignColumns(brackets: ResolvedBracket[]): void {
	const bracketByKey = new Map<string, ResolvedBracket>();
	const inputs = brackets.map((bracket, index) => {
		const key = `${index}:${bracket.marker.id}:${bracket.codeId}`;
		bracketByKey.set(key, bracket);
		return {
			key,
			markerId: bracket.marker.id,
			codeId: bracket.codeId,
			codeName: bracket.codeName,
			color: bracket.color,
			editable: true,
			top: bracket.top,
			bottom: bracket.bottom,
		};
	});

	const layout = layoutMarginRails(inputs);
	brackets.splice(0, brackets.length, ...layout.map((rail) => {
		const bracket = bracketByKey.get(rail.key)!;
		bracket.column = rail.lane;
		return bracket;
	}));
}

/**
 * Rule 2: Labels at bar midpoint, weighted collision avoidance.
 * Heavier bars (larger span) get placed first and keep ideal position.
 * Lighter bars get displaced down minimally.
 */
export function resolveLabels(brackets: ResolvedBracket[]): LabelInfo[] {
	const labels: LabelInfo[] = brackets.map(b => {
		const midY = (b.top + b.bottom) / 2 - LABEL_HEIGHT / 2;
		return {
			markerId: b.marker.id,
			codeName: b.codeName,
			color: b.color,
			idealY: midY,
			actualY: midY,
			segmentTop: b.top,
			segmentBottom: b.bottom,
			column: b.column,
			weight: b.bottom - b.top,
			maxColAtY: b.column,
		};
	});

	// Place leftmost column first (highest column number = outermost)
	labels.sort((a, b) => b.column - a.column);

	const placedYs: number[] = [];

	for (const label of labels) {
		let bestY = label.idealY;

		const collides = (y: number) =>
			placedYs.some(py => Math.abs(y - py) < LABEL_HEIGHT);

		if (collides(bestY)) {
			// Only push down, never up
			for (let step = 1; step <= 50; step++) {
				const yDown = label.idealY + step * LABEL_HEIGHT;
				if (!collides(yDown)) { bestY = yDown; break; }
			}
		}

		label.actualY = bestY;
		placedYs.push(bestY);
	}

	return labels;
}

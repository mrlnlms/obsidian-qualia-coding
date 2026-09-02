export interface MarginRailInput {
	key: string;
	markerId: string;
	codeId: string;
	codeName: string;
	color: string;
	ownerAbbreviation?: string;
	ownerName?: string;
	editable: boolean;
	top: number;
	bottom: number;
}

export interface MarginRailLayout extends MarginRailInput {
	lane: number;
	center: number;
}

export function layoutMarginRails(inputs: readonly MarginRailInput[]): MarginRailLayout[] {
	const rails = inputs.map((input, inputOrder) => ({
		...input,
		lane: 0,
		center: (input.top + input.bottom) / 2,
		inputOrder,
	}));

	rails.sort((a, b) => {
		const spanDiff = (b.bottom - b.top) - (a.bottom - a.top);
		if (spanDiff !== 0) return spanDiff;
		if (a.top !== b.top) return a.top - b.top;
		return a.inputOrder - b.inputOrder;
	});

	const occupied: Array<Array<{ top: number; bottom: number }>> = [];
	for (const rail of rails) {
		let lane = 0;
		while (occupied[lane]?.some(
			(range) => rail.top < range.bottom && rail.bottom > range.top,
		)) {
			lane++;
		}
		rail.lane = lane;
		(occupied[lane] ??= []).push({ top: rail.top, bottom: rail.bottom });
	}

	return rails.map(({ inputOrder: _inputOrder, ...rail }) => rail);
}

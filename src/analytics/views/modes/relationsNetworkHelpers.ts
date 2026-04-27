export function isEdgeAboveThreshold(weight: number, minWeight: number): boolean {
	return weight >= minWeight;
}

export function computeEdgeOpacity(
	edgeWeight: number,
	maxWeight: number,
	endpoints: { sourceIdx: number; targetIdx: number },
	hoveredNodeIdx: number | null,
): number {
	const baseOpacity = 0.25 + 0.6 * (edgeWeight / maxWeight);
	if (hoveredNodeIdx === null) return baseOpacity;
	const isConnected =
		endpoints.sourceIdx === hoveredNodeIdx || endpoints.targetIdx === hoveredNodeIdx;
	return isConnected ? baseOpacity : baseOpacity / 3;
}

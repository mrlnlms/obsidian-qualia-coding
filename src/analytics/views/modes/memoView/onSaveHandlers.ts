import type { AnalyticsViewContext } from "../../analyticsViewContext";
import type { EngineType } from "../../../data/dataTypes";
import { setApplicationRelationMemo } from "../../../../core/codeApplicationHelpers";

export function onSaveCodeMemo(ctx: AnalyticsViewContext, codeId: string, value: string): void {
	ctx.plugin.registry.update(codeId, { memo: value });
}

export function onSaveGroupMemo(ctx: AnalyticsViewContext, groupId: string, value: string): void {
	ctx.plugin.registry.setGroupMemo(groupId, value);
}

export function onSaveCodeRelationMemo(
	ctx: AnalyticsViewContext, codeId: string, label: string, target: string, value: string,
): void {
	ctx.plugin.registry.setRelationMemo(codeId, label, target, value);
}

export function onSaveMarkerMemo(
	ctx: AnalyticsViewContext, engineType: EngineType, markerId: string, value: string,
): void {
	const marker = ctx.plugin.dataManager.findMarker(engineType, markerId);
	if (!marker) return;
	marker.memo = value;
	ctx.plugin.dataManager.markDirty();
}

export function onSaveAppRelationMemo(
	ctx: AnalyticsViewContext, engineType: EngineType, markerId: string,
	codeId: string, label: string, target: string, value: string,
): void {
	const marker = ctx.plugin.dataManager.findMarker(engineType, markerId);
	if (!marker) return;
	setApplicationRelationMemo(marker.codes, codeId, label, target, value);
	ctx.plugin.dataManager.markDirty();
}

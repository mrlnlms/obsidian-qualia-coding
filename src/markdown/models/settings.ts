export interface CodeMarkerSettings {
	defaultColor: string;
	markerOpacity: number;
	showHandlesOnHover: boolean;
	handleSize: number;
	showMenuOnSelection: boolean;
	showMenuOnRightClick: boolean;
	showRibbonButton: boolean;
	autoRevealOnSegmentClick: boolean;
}

export const DEFAULT_SETTINGS: CodeMarkerSettings = {
	defaultColor: '#6200EE',
	markerOpacity: 0.4,
	showHandlesOnHover: true,
	handleSize: 12,
	showMenuOnSelection: true,
	showMenuOnRightClick: true,
	showRibbonButton: true,
	autoRevealOnSegmentClick: true,
};

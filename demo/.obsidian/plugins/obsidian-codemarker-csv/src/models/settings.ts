export interface CodeMarkerSettings {
	defaultColor: string;
	displayInPreviewMode: boolean;
	markerOpacity: number;
	showHandlesOnHover: boolean;
	handleSize: number;
	menuMode: 'obsidian-native' | 'cm6-tooltip' | 'cm6-native-tooltip';
	showMenuOnSelection: boolean;
	showMenuOnRightClick: boolean;
	showRibbonButton: boolean;
}

export const DEFAULT_SETTINGS: CodeMarkerSettings = {
	defaultColor: '#6200EE',
	displayInPreviewMode: true,
	markerOpacity: 0.4,
	showHandlesOnHover: true,
	handleSize: 12,
	menuMode: 'obsidian-native',
	showMenuOnSelection: true,
	showMenuOnRightClick: true,
	showRibbonButton: true,
};

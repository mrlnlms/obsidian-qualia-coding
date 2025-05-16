export interface CodeMarkerSettings {
    defaultColor: string;
    displayInPreviewMode: boolean;
    storeMarkersInFrontmatter: boolean;
    markerOpacity: number; // Nova configuração
  }
  
  export const DEFAULT_SETTINGS: CodeMarkerSettings = {
      defaultColor: '#FFD700',
      displayInPreviewMode: true,
      storeMarkersInFrontmatter: false,
      markerOpacity: 1
  };
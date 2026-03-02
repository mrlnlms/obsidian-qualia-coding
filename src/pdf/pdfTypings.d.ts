/**
 * PDF.js typings subset for Obsidian's embedded PDF viewer.
 * Derived from obsidian-pdf-plus (MIT license).
 */

import { Component, Scope, TFile, ViewStateResult, EditableFileView } from 'obsidian';
import type { PDFDocumentProxy, PDFPageProxy, PageViewport } from 'pdfjs-dist';

declare global {
	interface Window {
		pdfjsLib: {
			Util: {
				normalizeRect(rect: number[]): number[];
			};
			setLayerDimensions?(el: HTMLElement, viewport: PageViewport): void;
			[key: string]: any;
		};
		pdfjsViewer: {
			ObsidianViewer?: new (...args: any[]) => ObsidianViewer;
			createObsidianPDFViewer?: (options: any) => ObsidianViewer;
			scrollIntoView?(el: HTMLElement, options?: any): void;
			[key: string]: any;
		};
	}
}

export type Rect = [number, number, number, number];

export interface PDFView extends EditableFileView {
	viewer: PDFViewerComponent;
	scope: Scope;
}

export interface PDFViewerComponent extends Component {
	scope: Scope;
	child: PDFViewerChild | null;
	next: ((child: PDFViewerChild) => any)[] | null;
	containerEl: HTMLElement;
	then(cb: (child: PDFViewerChild) => void): void;
	loadFile(file: TFile, subpath?: string): Promise<void>;
}

export interface PDFViewerChild {
	unloaded: boolean;
	containerEl: HTMLElement;
	pdfViewer: ObsidianViewer;
	toolbar: any;
	file: TFile | null;
	getPage(page: number): PDFPageView;
	getTextSelectionRangeStr(pageEl: HTMLElement): string | null;
}

export interface ObsidianViewer {
	dom: {
		containerEl: HTMLElement;
		viewerEl: HTMLElement;
		viewerContainerEl: HTMLElement;
		pdfContainerEl: HTMLElement;
	} | null;
	page?: number;
	pagesCount: number;
	eventBus: EventBus;
	pdfViewer: PDFViewer | null;
}

export interface PDFViewer {
	getPageView(index: number): PDFPageView | undefined;
	_pages?: PDFPageView[];
}

export interface PDFPageView {
	/** 1-based page number */
	id: number;
	pageLabel: string | null;
	pdfPage: PDFPageProxy;
	viewport: PageViewport;
	div: HTMLDivElement;
	canvas: HTMLCanvasElement;
	textLayer: TextLayerBuilder | OldTextLayerBuilder | null;
	getPagePoint(x: number, y: number): number[];
}

/** Obsidian v1.8.0+ text layer */
export interface TextLayerBuilder {
	div: HTMLDivElement;
	textLayer: TextLayer | null;
	render(): Promise<any>;
}

/** Obsidian v1.7.7 and earlier text layer */
export interface OldTextLayerBuilder {
	div: HTMLDivElement;
	render(): Promise<any>;
	textDivs: HTMLElement[];
	textContentItems: TextContentItem[];
}

export interface TextLayer {
	textDivs: HTMLElement[];
	textContentItems: TextContentItem[];
}

export interface TextContentItem {
	str: string;
	chars?: {
		c: string;
		u: string;
		r: Rect;
	}[];
	dir: string;
	width: number;
	height: number;
	transform: number[];
	fontName: string;
	hasEOL: boolean;
}

export interface EventBus {
	on(name: string, callback: (data: any) => any): void;
	off(name: string, callback: (data: any) => any): void;
	dispatch(name: string, data: any): void;
}

export interface TextLayerInfo {
	textDivs: HTMLElement[];
	textContentItems: TextContentItem[];
}

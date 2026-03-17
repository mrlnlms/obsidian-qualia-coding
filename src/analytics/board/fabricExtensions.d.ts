/**
 * Fabric.js type extensions for Qualia.
 *
 * Fabric.js v6 ships its own types but tsc with moduleResolution:"node"
 * cannot resolve re-exports through subpaths. This declaration merges
 * missing class exports and FabricObject properties into the 'fabric' module.
 */

declare module 'fabric' {
	// ── Classes that tsc fails to resolve via subpath re-exports ──

	export class Canvas {
		constructor(el: HTMLCanvasElement | string, options?: Record<string, any>);
		add(...objects: FabricObject[]): void;
		remove(...objects: FabricObject[]): void;
		getObjects(): FabricObject[];
		getActiveObject(): FabricObject | null;
		getActiveObjects(): FabricObject[];
		setActiveObject(object: FabricObject): void;
		discardActiveObject(): void;
		requestRenderAll(): void;
		renderAll(): void;
		clear(): Canvas;
		dispose(): void;
		setDimensions(dimensions: { width: number; height: number }): void;
		getWidth(): number;
		getHeight(): number;
		getZoom(): number;
		setZoom(value: number): void;
		zoomToPoint(point: Point, value: number): void;
		absolutePan(point: Point): void;
		relativePan(point: Point): void;
		setViewportTransform(vpt: number[]): void;
		getScenePoint(e: Event): Point;
		getContext(): CanvasRenderingContext2D;
		sendObjectToBack(object: FabricObject): void;
		forEachObject(callback: (object: FabricObject) => void): void;
		viewportTransform: [number, number, number, number, number, number];
		on(event: string, handler: (...args: any[]) => void): void;
		off(event: string, handler?: (...args: any[]) => void): void;
		isDrawingMode: boolean;
		freeDrawingBrush: any;
		selection: boolean;
		backgroundColor: string;
		backgroundImage: FabricImage | null;
		defaultCursor: string;
		hoverCursor: string;
		upperCanvasEl: HTMLCanvasElement;
		toJSON(): any;
		loadFromJSON(json: any, callback?: () => void): void;
	}

	export class Point {
		constructor(x: number, y: number);
		x: number;
		y: number;
	}

	export class FabricObject {
		left: number;
		top: number;
		width: number;
		height: number;
		scaleX: number;
		scaleY: number;
		stroke: string | null;
		strokeWidth: number;
		shadow: Shadow | null;
		selectable: boolean;
		evented: boolean;
		hasControls: boolean;
		hasBorders: boolean;
		lockMovementX: boolean;
		lockMovementY: boolean;
		opacity: number;
		set(key: string | Record<string, any>, value?: any): FabricObject;
		setCoords(): void;
		getBoundingRect(): { left: number; top: number; width: number; height: number };
		getCenterPoint(): Point;
		calcTransformMatrix(): number[];
		on(event: string, handler: (...args: any[]) => void): void;
		off(event: string, handler?: (...args: any[]) => void): void;
		// Board discriminant — specific properties live in boardTypes.ts interfaces
		boardType?: string;
	}

	export class Rect extends FabricObject {
		constructor(options?: Record<string, any>);
		rx: number;
		ry: number;
	}

	export class Ellipse extends FabricObject {
		constructor(options?: Record<string, any>);
		rx: number;
		ry: number;
	}

	export class Line extends FabricObject {
		constructor(points?: number[], options?: Record<string, any>);
		x1: number;
		y1: number;
		x2: number;
		y2: number;
	}

	export class Triangle extends FabricObject {
		constructor(options?: Record<string, any>);
	}

	export class Polygon extends FabricObject {
		constructor(points: Array<{ x: number; y: number }>, options?: Record<string, any>);
		points: Array<{ x: number; y: number }>;
	}

	export class Path extends FabricObject {
		constructor(path?: string | any[][], options?: Record<string, any>);
		path: any[][];
	}

	export class Group extends FabricObject {
		constructor(objects?: FabricObject[], options?: Record<string, any>);
		getObjects(): FabricObject[];
		addWithUpdate(object: FabricObject): void;
		interactive: boolean;
		subTargetCheck: boolean;
		canvas: Canvas | null;
	}

	export class FabricText extends FabricObject {
		constructor(text: string, options?: Record<string, any>);
		text: string;
	}

	export class Textbox extends FabricText {
		constructor(text: string, options?: Record<string, any>);
		enterEditing(): void;
		exitEditing(): void;
	}

	export class FabricImage extends FabricObject {
		constructor(element: HTMLImageElement, options?: Record<string, any>);
		static fromURL(url: string, options?: Record<string, any>): Promise<FabricImage>;
	}

	export class Shadow {
		constructor(options?: Record<string, any>);
		color: string;
		blur: number;
		offsetX: number;
		offsetY: number;
	}

	export class PencilBrush {
		constructor(canvas: Canvas);
		color: string;
		width: number;
	}
}

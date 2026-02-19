export interface PdfMarker {
	id: string;
	file: string;
	page: number;
	beginIndex: number;
	beginOffset: number;
	endIndex: number;
	endOffset: number;
	text: string;
	codes: string[];
	note?: string;
	createdAt: number;
	updatedAt: number;
}

export interface PdfCodingData {
	markers: PdfMarker[];
	registry: any;
}

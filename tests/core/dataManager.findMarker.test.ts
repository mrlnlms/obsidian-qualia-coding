import { describe, it, expect, vi } from "vitest";
import { DataManager } from "../../src/core/dataManager";
import type { QualiaData } from "../../src/core/types";

function makeDM(data: Partial<QualiaData>): DataManager {
	const plugin = {
		loadData: vi.fn().mockResolvedValue(null),
		saveData: vi.fn().mockResolvedValue(undefined),
	} as any;
	const dm = new DataManager(plugin);
	(dm as any).data = {
		registry: { definitions: {}, nextPaletteIndex: 0, folders: {}, folderOrder: [], rootOrder: [], groups: {}, groupOrder: [], nextGroupPaletteIndex: 0 },
		markdown: { markers: {}, settings: {} },
		csv: { segmentMarkers: [], rowMarkers: [] },
		image: { markers: [], settings: {} },
		pdf: { markers: [], shapes: [], settings: {} },
		audio: { files: [], settings: {} },
		video: { files: [], settings: {} },
		caseVariables: { values: {}, types: {} },
		general: {},
		...data,
	};
	return dm;
}

describe("DataManager.findMarker", () => {
	it("finds marker in markdown (Record<fileId, Marker[]>)", () => {
		const dm = makeDM({ markdown: { markers: { "P01.md": [{ id: "m1", memo: "x" } as any] }, settings: {} as any } });
		expect(dm.findMarker("markdown", "m1")?.id).toBe("m1");
	});

	it("finds marker in csv segmentMarkers", () => {
		const dm = makeDM({ csv: { segmentMarkers: [{ id: "s1" } as any], rowMarkers: [] } });
		expect(dm.findMarker("csv", "s1")?.id).toBe("s1");
	});

	it("finds marker in csv rowMarkers", () => {
		const dm = makeDM({ csv: { segmentMarkers: [], rowMarkers: [{ id: "r1" } as any] } });
		expect(dm.findMarker("csv", "r1")?.id).toBe("r1");
	});

	it("finds marker in pdf", () => {
		const dm = makeDM({ pdf: { markers: [{ id: "p1" } as any], shapes: [], settings: {} as any } });
		expect(dm.findMarker("pdf", "p1")?.id).toBe("p1");
	});

	it("finds marker in image", () => {
		const dm = makeDM({ image: { markers: [{ id: "i1" } as any], settings: {} as any } });
		expect(dm.findMarker("image", "i1")?.id).toBe("i1");
	});

	it("finds marker in audio file.markers", () => {
		const dm = makeDM({ audio: { files: [{ fileId: "f1", markers: [{ id: "a1" } as any] } as any], settings: {} as any } });
		expect(dm.findMarker("audio", "a1")?.id).toBe("a1");
	});

	it("returns null when not found", () => {
		const dm = makeDM({});
		expect(dm.findMarker("markdown", "nope")).toBeNull();
	});

	it("returned reference allows in-place mutation that survives in data.json", () => {
		const dm = makeDM({ markdown: { markers: { "P.md": [{ id: "m1", memo: "old" } as any] }, settings: {} as any } });
		const m = dm.findMarker("markdown", "m1") as any;
		m.memo = "new";
		expect((dm as any).data.markdown.markers["P.md"][0].memo).toBe("new");
	});
});

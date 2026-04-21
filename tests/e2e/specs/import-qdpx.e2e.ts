// tests/e2e/specs/import-qdpx.e2e.ts
import { waitForPlugin } from "obsidian-e2e-visual-test-kit";

describe("QDPX Import", () => {
  before(async () => {
    await waitForPlugin("qualia-coding");
  });

  it("sample-import.qdpx exists and is a valid ZIP", async () => {
    const result = await browser.executeAsync(async (done: (r: any) => void) => {
      try {
        const plugin = (window as any).app.plugins.plugins["qualia-coding"];
        const app = plugin.app;

        const file = app.vault.getAbstractFileByPath("sample-import.qdpx");
        if (!file) {
          done({ error: "sample-import.qdpx not found in vault" });
          return;
        }
        const zipData = await app.vault.readBinary(file);
        const bytes = new Uint8Array(zipData);

        // ZIP magic: starts with "PK\x03\x04" (local file header)
        const isZip = bytes[0] === 0x50 && bytes[1] === 0x4B;

        // Central directory filename is stored uncompressed — search for "project.qde" bytes
        const needle = new TextEncoder().encode("project.qde");
        let hasProjectQde = false;
        for (let i = 0; i <= bytes.length - needle.length; i++) {
          let match = true;
          for (let j = 0; j < needle.length; j++) {
            if (bytes[i + j] !== needle[j]) { match = false; break; }
          }
          if (match) { hasProjectQde = true; break; }
        }

        done({ fileFound: true, isZip, fileSize: bytes.length, hasProjectQde });
      } catch (err: any) {
        done({ error: err.message });
      }
    });

    expect(result.error).toBeUndefined();
    expect(result.fileFound).toBe(true);
    expect(result.isZip).toBe(true);
    expect(result.fileSize).toBeGreaterThan(100);
    expect(result.hasProjectQde).toBe(true);
  });
});

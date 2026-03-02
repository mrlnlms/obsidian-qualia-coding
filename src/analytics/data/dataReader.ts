import type { DataManager } from "../../core/dataManager";

/**
 * Reads all engine data from the unified DataManager (in-memory).
 * Injects the shared registry so the consolidator can discover code definitions.
 */
export function readAllData(dm: DataManager) {
  const registry = dm.section("registry");
  const defs = registry.definitions ?? {};

  return {
    markdown: {
      ...dm.section("markdown"),
      codeDefinitions: defs,
    },
    csv: {
      ...dm.section("csv"),
      registry: { definitions: defs },
    },
    image: {
      ...dm.section("image"),
      registry: { definitions: defs },
    },
    pdf: {
      ...dm.section("pdf"),
      registry: { definitions: defs },
    },
    audio: {
      ...dm.section("audio"),
      codeDefinitions: { definitions: defs },
    },
    video: {
      ...dm.section("video"),
      codeDefinitions: { definitions: defs },
    },
  };
}

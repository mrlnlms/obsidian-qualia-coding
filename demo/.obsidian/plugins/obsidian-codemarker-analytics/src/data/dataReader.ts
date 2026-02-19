import type { Vault } from "obsidian";

async function readPluginData(vault: Vault, pluginId: string): Promise<any | null> {
  const path = `${vault.configDir}/plugins/${pluginId}/data.json`;
  try {
    const raw = await vault.adapter.read(path);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function readMarkdownData(vault: Vault): Promise<any | null> {
  return readPluginData(vault, "obsidian-codemarker-v2");
}

export async function readCsvData(vault: Vault): Promise<any | null> {
  return readPluginData(vault, "obsidian-codemarker-csv");
}

export async function readImageData(vault: Vault): Promise<any | null> {
  return readPluginData(vault, "obsidian-codemarker-image");
}

export async function readPdfData(vault: Vault): Promise<any | null> {
  return readPluginData(vault, "obsidian-codemarker-pdf");
}

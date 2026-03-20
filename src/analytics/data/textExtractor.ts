
import type { Vault } from "obsidian";
import type { UnifiedMarker, SourceType } from "./dataTypes";

export interface ExtractedSegment {
  markerId: string;
  source: SourceType;
  fileId: string;
  codes: string[];
  text: string;
  fromLine?: number;
  toLine?: number;
  fromCh?: number;
  toCh?: number;
  meta?: UnifiedMarker["meta"];
}

export class TextExtractor {
  private fileCache = new Map<string, string>();
  private vault: Vault;

  constructor(vault: Vault) {
    this.vault = vault;
  }

  async extractBatch(markers: UnifiedMarker[]): Promise<ExtractedSegment[]> {
    // Group by file to minimize reads
    const byFile = new Map<string, UnifiedMarker[]>();
    for (const m of markers) {
      const list = byFile.get(m.fileId) || [];
      list.push(m);
      byFile.set(m.fileId, list);
    }

    // Read all files once
    for (const file of byFile.keys()) {
      if (!this.fileCache.has(file)) {
        try {
          const content = await this.vault.adapter.read(file);
          this.fileCache.set(file, content);
        } catch {
          this.fileCache.set(file, "");
        }
      }
    }

    // Extract text for each marker
    const results: ExtractedSegment[] = [];
    for (const m of markers) {
      const text = this.extractText(m);
      results.push({
        markerId: m.id,
        source: m.source,
        fileId: m.fileId,
        codes: m.codes,
        text,
        fromLine: m.meta?.fromLine,
        toLine: m.meta?.toLine,
        fromCh: m.meta?.fromCh,
        toCh: m.meta?.toCh,
        meta: m.meta,
      });
    }
    return results;
  }

  private extractText(m: UnifiedMarker): string {
    if (m.source === "audio") {
      const from = m.meta?.audioFrom ?? 0;
      const to = m.meta?.audioTo ?? 0;
      return this.formatAudioTime(from) + " \u2013 " + this.formatAudioTime(to);
    }
    if (m.source === "video") {
      const from = m.meta?.videoFrom ?? 0;
      const to = m.meta?.videoTo ?? 0;
      return this.formatAudioTime(from) + " \u2013 " + this.formatAudioTime(to);
    }
    if (m.source === "image") return "[image region]";
    if (m.source === "pdf") return m.meta?.pdfText ?? "[pdf selection]";
    if (m.source === "csv-row") return this.extractCsvRow(m);
    if (m.source === "csv-segment") return this.extractCsvSegment(m);
    return this.extractMarkdown(m);
  }

  private formatAudioTime(seconds: number): string {
    if (!isFinite(seconds) || seconds < 0) return "0:00.0";
    const rounded = Math.round(seconds * 10) / 10;
    const m = Math.floor(rounded / 60);
    const s = rounded % 60;
    return `${m}:${s.toFixed(1).padStart(4, "0")}`;
  }

  private extractMarkdown(m: UnifiedMarker): string {
    const content = this.fileCache.get(m.fileId) ?? "";
    if (!content) return "";
    const lines = content.split("\n");
    const fromLine = m.meta?.fromLine ?? 0;
    const toLine = m.meta?.toLine ?? fromLine;
    const fromCh = m.meta?.fromCh;
    const toCh = m.meta?.toCh;

    if (fromLine === toLine) {
      const line = lines[fromLine] ?? "";
      if (fromCh != null && toCh != null) {
        return line.slice(fromCh, toCh);
      }
      return line;
    }

    // Multi-line extraction with sub-line precision
    const extracted: string[] = [];
    for (let i = fromLine; i <= toLine && i < lines.length; i++) {
      let line = lines[i]!;
      if (i === fromLine && fromCh != null) {
        line = line.slice(fromCh);
      } else if (i === toLine && toCh != null) {
        line = line.slice(0, toCh);
      }
      extracted.push(line);
    }
    return extracted.join("\n");
  }

  private extractCsvSegment(m: UnifiedMarker): string {
    const content = this.fileCache.get(m.fileId) ?? "";
    if (!content) return "";
    const row = m.meta?.row;
    const column = m.meta?.column;
    if (row == null || !column) return "";

    const rows = parseCsv(content);
    if (rows.length === 0) return "";
    const headers = rows[0]!;
    const colIdx = headers.indexOf(column);
    if (colIdx < 0) return "";
    const dataRow = rows[row + 1]; // +1 for header
    if (!dataRow) return "";
    const cellText = dataRow[colIdx] ?? "";

    const fromCh = m.meta?.fromCh;
    const toCh = m.meta?.toCh;
    if (fromCh != null && toCh != null) {
      return cellText.slice(fromCh, toCh);
    }
    return cellText;
  }

  private extractCsvRow(m: UnifiedMarker): string {
    const content = this.fileCache.get(m.fileId) ?? "";
    if (!content) return "";
    const row = m.meta?.row;
    const column = m.meta?.column;
    if (row == null) return "";

    const rows = parseCsv(content);
    if (rows.length === 0) return "";
    const headers = rows[0]!;

    // If column specified, return that cell; otherwise join all cells
    if (column) {
      const colIdx = headers.indexOf(column);
      if (colIdx < 0) return "";
      const dataRow = rows[row + 1];
      return dataRow?.[colIdx] ?? "";
    }

    const dataRow = rows[row + 1];
    if (!dataRow) return "";
    return dataRow.join(" | ");
  }
}

/**
 * Simple CSV parser with quoted-field support.
 * Returns array of rows, each row is array of field strings.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let i = 0;
  const len = text.length;

  while (i < len) {
    const row: string[] = [];
    // Parse one row
    while (i < len) {
      if (text[i] === '"') {
        // Quoted field
        i++; // skip opening quote
        let field = "";
        while (i < len) {
          if (text[i] === '"') {
            if (i + 1 < len && text[i + 1] === '"') {
              field += '"';
              i += 2;
            } else {
              i++; // skip closing quote
              break;
            }
          } else {
            field += text[i];
            i++;
          }
        }
        row.push(field);
      } else {
        // Unquoted field
        let field = "";
        while (i < len && text[i] !== ',' && text[i] !== '\n' && text[i] !== '\r') {
          field += text[i];
          i++;
        }
        row.push(field);
      }

      if (i < len && text[i] === ',') {
        i++; // skip comma, continue row
      } else {
        break; // end of row
      }
    }

    // Skip line endings
    if (i < len && text[i] === '\r') i++;
    if (i < len && text[i] === '\n') i++;

    rows.push(row);
  }

  return rows;
}

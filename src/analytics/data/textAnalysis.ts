
import type { ConsolidatedData, FilterConfig, TextStatsResult } from "./dataTypes";
import type { ExtractedSegment } from "./textExtractor";
import type { SmartCodeAccess } from "./frequency";
import type { CaseVariablesRegistry } from "../../core/caseVariables/caseVariablesRegistry";
import { getSmartCodeViews, smartCodePassesCodesFilter } from "./smartCodeAnalytics";

const TOKEN_RE = /[\s,.;:!?()[\]{}"'''""…—–\-\/\\|@#$%^&*+=<>~`\d]+/;

/** Map keyed by codeId; values carry display name + color for output rendering. */
export type CodeDisplayMap = Map<string, { name: string; color: string; isSmart?: boolean }>;

export function calculateTextStats(
  dataOrSegments: ConsolidatedData | ExtractedSegment[] | undefined,
  filtersOrCodeDisplay: FilterConfig | CodeDisplayMap | undefined,
  maybeSegments: ExtractedSegment[] = [],
  smartCodes?: SmartCodeAccess,
  caseVarsRegistry?: CaseVariablesRegistry,
): TextStatsResult {
  let segments: ExtractedSegment[] = [];
  let codeDisplay: CodeDisplayMap = new Map();
  let filters: FilterConfig | undefined = undefined;
  let data: ConsolidatedData | undefined = undefined;

  // Detect signature
  if (Array.isArray(dataOrSegments)) {
    // Legacy: (segments, codeDisplay)
    segments = dataOrSegments;
    codeDisplay = (filtersOrCodeDisplay instanceof Map) ? filtersOrCodeDisplay : new Map();
  } else {
    // New: (data, filters, segments, smartCodes, caseVars)
    data = dataOrSegments;
    filters = filtersOrCodeDisplay as FilterConfig;
    segments = maybeSegments || [];
    
    // Setup codeDisplay from data
    if (data?.codes) {
      for (const c of data.codes) {
        codeDisplay.set(c.id, { name: c.name, color: c.color });
      }
    }
    // Add Smart Codes to codeDisplay
    const scViews = (smartCodes && data && filters) ? getSmartCodeViews(data, smartCodes.cache, smartCodes.registry, filters, caseVarsRegistry) : [];
    for (const sc of scViews) {
      if (filters && smartCodePassesCodesFilter(sc.id, filters)) {
        codeDisplay.set(sc.id, { name: sc.name, color: sc.color, isSmart: true });
      }
    }
  }

  // Filter usable segments once
  const usable = segments.filter(s => s.text && s.source !== "image");

  // Compute global stats from unique segments (not per-code)
  const globalWords: string[] = [];
  const globalUniqueSet = new Set<string>();

  for (const seg of usable) {
    const tokens = seg.text.toLowerCase().split(TOKEN_RE).filter((t) => t.length > 0);
    for (const t of tokens) {
      globalWords.push(t);
      globalUniqueSet.add(t);
    }
  }

  // Group by code for per-code stats
  const byCode = new Map<string, ExtractedSegment[]>();
  const scViewsForGrouping = (smartCodes && data && filters) ? getSmartCodeViews(data, smartCodes.cache, smartCodes.registry, filters, caseVarsRegistry) : [];

  for (const seg of usable) {
    // Regular codes
    for (const code of seg.codes) {
      if (filters?.excludeCodes.includes(code)) continue;
      if (filters?.codes && filters.codes.length > 0 && !filters.codes.includes(code)) continue;
      let list = byCode.get(code);
      if (!list) { list = []; byCode.set(code, list); }
      list.push(seg);
    }
    // Smart Codes (only if we have the new signature context)
    for (const sc of scViewsForGrouping) {
      if (filters && smartCodePassesCodesFilter(sc.id, filters) && sc.matches.some(m => m.id === seg.markerId && m.source === seg.source)) {
        let list = byCode.get(sc.id);
        if (!list) { list = []; byCode.set(sc.id, list); }
        if (!list.includes(seg)) list.push(seg);
      }
    }
  }

  const codes: TextStatsResult["codes"] = [];

  for (const [codeId, segs] of byCode) {
    if (segs.length < (filters?.minFrequency ?? 0)) continue;
    
    const allWords: string[] = [];
    const uniqueSet = new Set<string>();
    let totalChars = 0;

    for (const seg of segs) {
      const tokens = seg.text.toLowerCase().split(TOKEN_RE).filter((t) => t.length > 0);
      for (const t of tokens) {
        allWords.push(t);
        uniqueSet.add(t);
      }
      totalChars += seg.text.length;
    }

    const segCount = segs.length;
    const totalWords = allWords.length;
    const uniqueWords = uniqueSet.size;
    const display = codeDisplay.get(codeId);

    codes.push({
      code: display?.name ?? codeId,
      color: display?.color ?? "#6200EE",
      segmentCount: segCount,
      totalWords,
      uniqueWords,
      avgWordsPerSegment: segCount > 0 ? Math.round((totalWords / segCount) * 10) / 10 : 0,
      ttr: totalWords > 0 ? Math.round((uniqueWords / totalWords) * 1000) / 1000 : 0,
      avgCharsPerSegment: segCount > 0 ? Math.round(totalChars / segCount) : 0,
      isSmart: display?.isSmart,
    });
  }

  codes.sort((a, b) => b.totalWords - a.totalWords);

  return {
    codes,
    global: {
      totalSegments: usable.length,
      totalWords: globalWords.length,
      uniqueWords: globalUniqueSet.size,
      ttr: globalWords.length > 0 ? Math.round((globalUniqueSet.size / globalWords.length) * 1000) / 1000 : 0,
    },
  };
}

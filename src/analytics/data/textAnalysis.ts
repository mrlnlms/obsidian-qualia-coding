
import type { TextStatsResult } from "./dataTypes";
import type { ExtractedSegment } from "./textExtractor";

const TOKEN_RE = /[\s,.;:!?()[\]{}"'''""…—–\-\/\\|@#$%^&*+=<>~`\d]+/;

/** Map keyed by codeId; values carry display name + color for output rendering. */
export type CodeDisplayMap = Map<string, { name: string; color: string }>;

export function calculateTextStats(
  segments: ExtractedSegment[],
  codeDisplay: CodeDisplayMap,
): TextStatsResult {
  // Filter usable segments once
  const usable = segments.filter(s => s.text && s.source !== "image");

  // Compute global stats from unique segments (not per-code)
  const globalWords: string[] = [];
  const globalUniqueSet = new Set<string>();
  let globalCharCount = 0;

  for (const seg of usable) {
    const tokens = seg.text.toLowerCase().split(TOKEN_RE).filter((t) => t.length > 0);
    for (const t of tokens) {
      globalWords.push(t);
      globalUniqueSet.add(t);
    }
    globalCharCount += seg.text.length;
  }

  // Group by code for per-code stats
  const byCode = new Map<string, ExtractedSegment[]>();
  for (const seg of usable) {
    for (const code of seg.codes) {
      let list = byCode.get(code);
      if (!list) { list = []; byCode.set(code, list); }
      list.push(seg);
    }
  }

  const codes: TextStatsResult["codes"] = [];

  for (const [codeId, segs] of byCode) {
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

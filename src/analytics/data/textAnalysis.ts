
import type { TextStatsResult } from "./dataTypes";
import type { ExtractedSegment } from "./textExtractor";

const TOKEN_RE = /[\s,.;:!?()[\]{}"'''""…—–\-\/\\|@#$%^&*+=<>~`\d]+/;

export function calculateTextStats(
  segments: ExtractedSegment[],
  codeColors: Map<string, string>,
): TextStatsResult {
  const byCode = new Map<string, ExtractedSegment[]>();
  for (const seg of segments) {
    if (!seg.text || seg.source === "image") continue;
    for (const code of seg.codes) {
      let list = byCode.get(code);
      if (!list) { list = []; byCode.set(code, list); }
      list.push(seg);
    }
  }

  const codes: TextStatsResult["codes"] = [];
  const globalWords: string[] = [];
  const globalUniqueSet = new Set<string>();
  let globalSegCount = 0;
  let globalCharCount = 0;

  for (const [code, segs] of byCode) {
    const allWords: string[] = [];
    const uniqueSet = new Set<string>();
    let totalChars = 0;

    for (const seg of segs) {
      const tokens = seg.text.toLowerCase().split(TOKEN_RE).filter((t) => t.length > 0);
      for (const t of tokens) {
        allWords.push(t);
        uniqueSet.add(t);
        globalWords.push(t);
        globalUniqueSet.add(t);
      }
      totalChars += seg.text.length;
    }

    const segCount = segs.length;
    const totalWords = allWords.length;
    const uniqueWords = uniqueSet.size;

    codes.push({
      code,
      color: codeColors.get(code) ?? "#6200EE",
      segmentCount: segCount,
      totalWords,
      uniqueWords,
      avgWordsPerSegment: segCount > 0 ? Math.round((totalWords / segCount) * 10) / 10 : 0,
      ttr: totalWords > 0 ? Math.round((uniqueWords / totalWords) * 1000) / 1000 : 0,
      avgCharsPerSegment: segCount > 0 ? Math.round(totalChars / segCount) : 0,
    });

    globalSegCount += segCount;
    globalCharCount += totalChars;
  }

  codes.sort((a, b) => b.totalWords - a.totalWords);

  return {
    codes,
    global: {
      totalSegments: globalSegCount,
      totalWords: globalWords.length,
      uniqueWords: globalUniqueSet.size,
      ttr: globalWords.length > 0 ? Math.round((globalUniqueSet.size / globalWords.length) * 1000) / 1000 : 0,
    },
  };
}

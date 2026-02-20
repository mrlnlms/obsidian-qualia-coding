/**
 * Word frequency engine for word cloud visualization.
 * Tokenizes text from extracted segments, filters stop words,
 * and returns word frequencies with associated codes and sources.
 */

import type { ExtractedSegment } from "./textExtractor";
import type { SourceType } from "./dataTypes";

export type StopWordsLang = "pt" | "en" | "both";

export interface WordFrequencyOptions {
  stopWordsLang: StopWordsLang;
  minWordLength: number;
  maxWords: number;
}

export interface WordFrequencyResult {
  word: string;
  count: number;
  codes: string[];
  sources: SourceType[];
}

const DEFAULT_OPTIONS: WordFrequencyOptions = {
  stopWordsLang: "both",
  minWordLength: 3,
  maxWords: 100,
};

// Regex to split text into tokens (words)
const TOKEN_SPLIT = /[\s,.;:!?()[\]{}"'''""…—–\-\/\\|@#$%^&*+=<>~`\d]+/;

// ── Stop word lists ──

const STOP_WORDS_PT = new Set([
  "a", "ao", "aos", "aquela", "aquelas", "aquele", "aqueles", "aquilo",
  "as", "até", "com", "como", "da", "das", "de", "dela", "delas",
  "dele", "deles", "depois", "do", "dos", "e", "ela", "elas", "ele",
  "eles", "em", "entre", "era", "essa", "essas", "esse", "esses",
  "esta", "estas", "este", "estes", "eu", "foi", "for", "foram",
  "fosse", "há", "isso", "isto", "já", "lhe", "lhes", "lo", "mas",
  "me", "mesmo", "meu", "minha", "muito", "na", "nas", "nem", "no",
  "nos", "nós", "nossa", "nossas", "nosso", "nossos", "num", "numa",
  "não", "nessa", "nesse", "nesta", "neste", "nisto", "nisso",
  "o", "os", "ou", "para", "pela", "pelas", "pelo", "pelos", "por",
  "qual", "quando", "que", "quem", "são", "se", "sem", "ser", "seu",
  "seus", "sua", "suas", "só", "também", "te", "tem", "ter", "toda",
  "todas", "todo", "todos", "tu", "tua", "tuas", "teu", "teus",
  "um", "uma", "umas", "uns", "vai", "vão", "você", "vocês",
  "é", "às", "sobre", "ainda", "mais", "menos", "onde", "então",
  "porém", "pois", "porque", "cada", "outro", "outra", "outros",
  "outras", "algum", "alguma", "alguns", "algumas", "nenhum",
  "nenhuma", "pode", "pode", "podem", "podemos", "sendo", "sido",
  "tinha", "tinham", "teve", "estava", "estavam", "está", "estão",
  "seria", "seriam", "fazer", "faz", "feito", "ter", "tendo",
]);

const STOP_WORDS_EN = new Set([
  "a", "an", "and", "are", "as", "at", "be", "been", "being", "but",
  "by", "can", "could", "did", "do", "does", "done", "down", "each",
  "for", "from", "get", "got", "had", "has", "have", "he", "her",
  "here", "hers", "him", "his", "how", "i", "if", "in", "into",
  "is", "it", "its", "just", "let", "may", "me", "might", "more",
  "most", "much", "must", "my", "no", "nor", "not", "now", "of",
  "off", "on", "one", "only", "or", "other", "our", "out", "own",
  "say", "she", "should", "so", "some", "such", "than", "that",
  "the", "their", "them", "then", "there", "these", "they", "this",
  "those", "through", "to", "too", "under", "up", "upon", "us",
  "use", "very", "was", "we", "were", "what", "when", "where",
  "which", "while", "who", "whom", "why", "will", "with", "would",
  "you", "your", "about", "after", "again", "all", "also", "am",
  "any", "because", "before", "between", "both", "come", "during",
  "even", "few", "first", "go", "going", "good", "great", "however",
  "keep", "know", "last", "like", "long", "look", "made", "make",
  "many", "new", "old", "over", "own", "part", "same", "see", "set",
  "shall", "since", "still", "take", "tell", "think", "two", "us",
  "used", "using", "want", "way", "well", "work",
]);

function getStopWords(lang: StopWordsLang): Set<string> {
  switch (lang) {
    case "pt": return STOP_WORDS_PT;
    case "en": return STOP_WORDS_EN;
    case "both": {
      const combined = new Set(STOP_WORDS_PT);
      for (const w of STOP_WORDS_EN) combined.add(w);
      return combined;
    }
  }
}

/**
 * Calculate word frequencies from extracted text segments.
 * Tokenizes, filters stop words, and returns top N words.
 */
export function calculateWordFrequencies(
  segments: ExtractedSegment[],
  options?: Partial<WordFrequencyOptions>,
): WordFrequencyResult[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const stopWords = getStopWords(opts.stopWordsLang);

  // Track word → { count, codes set, sources set }
  const wordMap = new Map<string, { count: number; codes: Set<string>; sources: Set<SourceType> }>();

  for (const seg of segments) {
    if (!seg.text || seg.source === "image") continue;

    const tokens = seg.text.toLowerCase().split(TOKEN_SPLIT);

    for (const token of tokens) {
      const word = token.trim();
      if (word.length < opts.minWordLength) continue;
      if (stopWords.has(word)) continue;

      let entry = wordMap.get(word);
      if (!entry) {
        entry = { count: 0, codes: new Set(), sources: new Set() };
        wordMap.set(word, entry);
      }
      entry.count++;
      for (const code of seg.codes) entry.codes.add(code);
      entry.sources.add(seg.source);
    }
  }

  // Sort by count desc, take top N
  const sorted = Array.from(wordMap.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, opts.maxWords);

  return sorted.map(([word, data]) => ({
    word,
    count: data.count,
    codes: Array.from(data.codes),
    sources: Array.from(data.sources),
  }));
}

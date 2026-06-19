/**
 * Local, deterministic writing analysis — no model, nothing leaves the machine.
 * Pure functions over plain text; surfaced in an on-demand panel (never as
 * always-on highlighting), in keeping with Foolscap's calm, offline ethos.
 */

export interface AnalysisResult {
  words: number
  sentences: number
  paragraphs: number
  characters: number
  avgWordsPerSentence: number
  readingMinutes: number
  gradeLevel: number
  longSentences: number
  passive: number
  adverbs: number
  fillers: number
  crutch: Array<{ word: string; count: number }>
}

const FILLERS = new Set([
  'very', 'really', 'just', 'actually', 'basically', 'literally', 'quite', 'rather',
  'somewhat', 'simply', 'totally', 'definitely', 'probably', 'perhaps', 'maybe',
  'somehow', 'truly', 'extremely', 'incredibly', 'absolutely', 'essentially'
])

// Words ending in -ly that aren't adverbs (avoid false positives).
const NOT_ADVERBS = new Set([
  'family', 'reply', 'apply', 'rely', 'supply', 'imply', 'ally', 'bully', 'fully',
  'italy', 'july', 'only', 'early', 'ugly', 'holy', 'jelly', 'belly', 'rally', 'folly'
])

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'so', 'of', 'to', 'in', 'on', 'at',
  'by', 'for', 'with', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'it', 'its',
  'this', 'that', 'these', 'those', 'he', 'she', 'they', 'them', 'his', 'her', 'their', 'i',
  'you', 'we', 'me', 'my', 'our', 'your', 'him', 'us', 'not', 'no', 'do', 'does', 'did',
  'have', 'has', 'had', 'from', 'up', 'out', 'about', 'into', 'over', 'than', 'too', 'can',
  'will', 'would', 'could', 'should', 'there', 'here', 'what', 'which', 'who', 'when', 'where',
  'how', 'all', 'any', 'some', 'one', 'more', 'most', 'other', 'such', 'only', 'own', 'same'
])

const IRREGULAR_PARTICIPLES =
  'been|done|gone|seen|made|said|told|given|taken|shown|known|found|held|kept|left|built|sent|brought|written|driven|broken|chosen|spoken|stolen|frozen|hidden|beaten|born|worn|torn|drawn|grown|thrown|caught|taught|eaten|fallen|risen|ridden|forgotten|bitten|woken|shaken|mistaken|proven|hit|put|set|cut|read'

function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '')
  if (w.length <= 3) return w.length ? 1 : 0
  const trimmed = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '')
  const m = trimmed.match(/[aeiouy]{1,2}/g)
  return m ? m.length : 1
}

export function analyze(text: string): AnalysisResult {
  const trimmed = text.trim()
  const wordList = trimmed.match(/[A-Za-z0-9][A-Za-z0-9'’-]*/g) ?? []
  const words = wordList.length
  const sentenceParts = trimmed.split(/[.!?]+(?=\s|$)/).map((s) => s.trim()).filter(Boolean)
  const sentences = Math.max(sentenceParts.length, trimmed ? 1 : 0)
  const paragraphs = trimmed ? trimmed.split(/\n+/).map((p) => p.trim()).filter(Boolean).length : 0
  const syllables = wordList.reduce((n, w) => n + countSyllables(w), 0)

  const avgWordsPerSentence = sentences ? words / sentences : 0
  const gradeLevel =
    words && sentences ? 0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59 : 0

  const longSentences = sentenceParts.filter((s) => (s.match(/\S+/g)?.length ?? 0) > 30).length
  const passive =
    text.match(new RegExp(`\\b(?:is|are|was|were|be|been|being)\\b\\s+(?:\\w+ly\\s+)?(?:\\w+ed|${IRREGULAR_PARTICIPLES})\\b`, 'gi'))
      ?.length ?? 0
  const adverbs = wordList.filter(
    (w) => /[a-z]{3,}ly$/i.test(w) && !NOT_ADVERBS.has(w.toLowerCase())
  ).length
  const fillers = wordList.filter((w) => FILLERS.has(w.toLowerCase())).length

  const freq = new Map<string, number>()
  for (const w of wordList) {
    const lw = w.toLowerCase()
    if (lw.length < 4 || STOPWORDS.has(lw) || /^\d+$/.test(lw)) continue
    freq.set(lw, (freq.get(lw) ?? 0) + 1)
  }
  const crutch = [...freq.entries()]
    .filter(([, c]) => c >= 4)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([word, count]) => ({ word, count }))

  return {
    words,
    sentences,
    paragraphs,
    characters: text.length,
    avgWordsPerSentence: Math.round(avgWordsPerSentence * 10) / 10,
    readingMinutes: Math.max(words ? 1 : 0, Math.round(words / 200)),
    gradeLevel: Math.max(0, Math.round(gradeLevel * 10) / 10),
    longSentences,
    passive,
    adverbs,
    fillers,
    crutch
  }
}

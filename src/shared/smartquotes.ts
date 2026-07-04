/**
 * Smart (typographic) quotes — pure helper shared by the editor input handler
 * and the self-test. Given the character immediately before a straight quote,
 * decide whether it opens or closes, and return the curly equivalent.
 */

// A quote opens when it starts the text or follows whitespace or an opening
// bracket / dash / existing opening quote.
const OPENS_BEFORE = /[\s([{<–—“‘]/

export function smartQuoteFor(prevChar: string, quote: '"' | "'"): string {
  const opens = prevChar === '' || OPENS_BEFORE.test(prevChar)
  if (quote === '"') return opens ? '“' : '”' // “ ”
  return opens ? '‘' : '’' // ‘ ’
}

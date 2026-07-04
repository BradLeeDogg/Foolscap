/**
 * Deterministic, offline style/consistency checker — pure functions over text,
 * shared by the editor (decorations + panel) and the self-test. This is NOT a
 * full grammar engine; native Chromium spell-check (en-US / en-GB) handles
 * spelling. This layer adds what dictionaries don't: enforcing the chosen
 * dialect, the Oxford (serial) comma, doubled words, and space-before-punctuation.
 */
import { AME_TO_BRE, BRE_TO_AME } from './dialect'

export type ProofRule = 'dialect' | 'oxford' | 'repeat' | 'spacing'

export interface Issue {
  start: number
  end: number
  rule: ProofRule
  message: string
  replacement: string
}

/** An issue mapped to absolute ProseMirror document positions. */
export interface DocIssue extends Issue {
  from: number
  to: number
}

export interface ProofOptions {
  dialect: 'american' | 'british'
  oxfordComma: boolean
}

const RULE_LABEL: Record<ProofRule, string> = {
  dialect: 'Spelling',
  oxford: 'Punctuation',
  repeat: 'Repetition',
  spacing: 'Spacing'
}
export function ruleLabel(rule: ProofRule): string {
  return RULE_LABEL[rule]
}

function matchCase(sample: string, repl: string): string {
  if (sample.length > 1 && sample === sample.toUpperCase()) return repl.toUpperCase()
  if (sample[0] === sample[0]?.toUpperCase()) return repl[0]!.toUpperCase() + repl.slice(1)
  return repl
}

// Repeated-word flagging skips pairs that are legitimately doubled in English.
const VALID_DOUBLES = new Set(['that', 'had'])

export function proofread(text: string, opts: ProofOptions): Issue[] {
  const issues: Issue[] = []

  // 1) Dialect consistency — flag words spelled in the other variant.
  const map = opts.dialect === 'british' ? AME_TO_BRE : BRE_TO_AME
  const variant = opts.dialect === 'british' ? 'British' : 'American'
  const wordRe = /[A-Za-z][A-Za-z'’-]*/g
  for (let m = wordRe.exec(text); m; m = wordRe.exec(text)) {
    const repl = map[m[0].toLowerCase()]
    if (repl) {
      const cased = matchCase(m[0], repl)
      issues.push({
        start: m.index,
        end: m.index + m[0].length,
        rule: 'dialect',
        message: `${variant} spelling: “${cased}”.`,
        replacement: cased
      })
    }
  }

  // 2) Oxford comma — "A, B and C" with no comma before the conjunction.
  if (opts.oxfordComma) {
    const oxRe = /([^,;:.!?()\n]+),(\s+)([^,;:.!?()\n]+?)(\s+)(and|or)\s+[^,;:.!?()\n]+/gi
    for (let m = oxRe.exec(text); m; m = oxRe.exec(text)) {
      const [, a, ws1, b, ws2] = m
      if (!a!.trim() || /\b(and|or)\b/i.test(b!)) continue // not a real list / nested conj
      // Distinguish a true list ("apples, oranges and pears") from an intro
      // clause + compound predicate ("After lunch, we walked and talked").
      const singleWordB = !/\s/.test(b!.trim())
      const before = text.slice(0, m.index)
      const clauseStart = Math.max(
        before.lastIndexOf('.'), before.lastIndexOf('!'),
        before.lastIndexOf('?'), before.lastIndexOf(';'), before.lastIndexOf('\n')
      )
      const priorListComma = before.slice(clauseStart + 1).includes(',')
      if (!singleWordB && !priorListComma) continue
      const bEnd = m.index + a!.length + 1 + ws1!.length + b!.length
      issues.push({
        start: bEnd,
        end: bEnd + ws2!.length,
        rule: 'oxford',
        message: 'Missing Oxford (serial) comma.',
        replacement: ', '
      })
    }
  }

  // 3) Doubled words — "the the".
  const dupRe = /\b([A-Za-z]+)(\s+)\1\b/gi
  for (let m = dupRe.exec(text); m; m = dupRe.exec(text)) {
    if (VALID_DOUBLES.has(m[1]!.toLowerCase())) continue
    issues.push({
      start: m.index,
      end: m.index + m[0].length,
      rule: 'repeat',
      message: `Repeated word “${m[1]}”.`,
      replacement: m[1]!
    })
  }

  // 4) Space before punctuation.
  const spaceRe = /[ \t]+([,.;:!?])/g
  for (let m = spaceRe.exec(text); m; m = spaceRe.exec(text)) {
    issues.push({
      start: m.index,
      end: m.index + m[0].length,
      rule: 'spacing',
      message: 'Remove the space before punctuation.',
      replacement: m[1]!
    })
  }

  return issues.sort((x, y) => x.start - y.start)
}

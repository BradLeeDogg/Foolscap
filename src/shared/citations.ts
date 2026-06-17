/**
 * Citation/bibliography formatting — pure functions over Source records, shared
 * by the renderer (preview + clipboard) and the self-test. These produce a
 * strong, best-effort approximation of MLA 9, APA 7, and Chicago (notes-
 * bibliography) entries; citation rules have many edge cases, so output is meant
 * to be reviewed, not blindly trusted.
 */
import type { Source } from './types'

export type CitationStyle = 'mla' | 'apa' | 'chicago'

export const CITATION_STYLES: CitationStyle[] = ['mla', 'apa', 'chicago']

export const CITATION_STYLE_LABELS: Record<CitationStyle, string> = {
  mla: 'MLA',
  apa: 'APA',
  chicago: 'Chicago'
}

export const BIBLIOGRAPHY_HEADINGS: Record<CitationStyle, string> = {
  mla: 'Works Cited',
  apa: 'References',
  chicago: 'Bibliography'
}

export interface FormattedCitation {
  text: string
  html: string
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function em(s: string): string {
  return `<em>${esc(s)}</em>`
}
function stripToText(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}
function endPunct(s: string): string {
  return /[.!?]$/.test(s.trim()) ? s.trim() : s.trim() + '.'
}
function noEndPunct(s: string): string {
  return s.trim().replace(/[.,]$/, '')
}

interface Name {
  first: string
  last: string
}
function parseName(s: string): Name {
  const t = s.trim()
  if (t.includes(',')) {
    const [last, first] = t.split(',')
    return { last: (last ?? t).trim(), first: (first ?? '').trim() }
  }
  const parts = t.split(/\s+/)
  if (parts.length === 1) return { last: parts[0] ?? t, first: '' }
  return { last: parts[parts.length - 1]!, first: parts.slice(0, -1).join(' ') }
}
function splitAuthors(raw: string): Name[] {
  return raw
    .split(/\s*(?:;| and |&)\s*/i)
    .map((a) => a.trim())
    .filter(Boolean)
    .map(parseName)
}
function initials(first: string): string {
  return first
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0]!.toUpperCase() + '.')
    .join(' ')
}

/** "Smith, Jane" etc., formatted per style for the start of a bibliography entry. */
function authorList(raw: string, style: CitationStyle): string {
  const names = splitAuthors(raw)
  if (!names.length) return ''
  const inverted = (n: Name): string =>
    style === 'apa'
      ? `${n.last}${n.first ? `, ${initials(n.first)}` : ''}`
      : `${n.last}${n.first ? `, ${n.first}` : ''}`
  const normal = (n: Name): string => (n.first ? `${n.first} ${n.last}` : n.last)

  if (style === 'mla' && names.length >= 3) return `${inverted(names[0]!)}, et al`
  if (names.length === 1) return inverted(names[0]!)

  if (style === 'apa') {
    const all = names.map(inverted)
    return all.slice(0, -1).join(', ') + ', & ' + all[all.length - 1]
  }
  // MLA (2) / Chicago: first inverted, rest normal, joined with "and"
  const rest = names.slice(1).map(normal)
  return [inverted(names[0]!), ...rest].join(', ').replace(/, ([^,]*)$/, ', and $1')
}

const MONTHS_MLA = [
  'Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'June',
  'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'
]
const MONTHS_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]
function accessedMla(ts: number): string {
  const d = new Date(ts)
  return `${d.getDate()} ${MONTHS_MLA[d.getMonth()]} ${d.getFullYear()}`
}
function accessedChicago(ts: number): string {
  const d = new Date(ts)
  return `${MONTHS_FULL[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

function mla(s: Source): string {
  const hasContainer = !!s.container
  const out: string[] = []
  if (s.author) out.push(endPunct(authorList(s.author, 'mla')))
  out.push(hasContainer ? `“${endPunct(esc(s.title))}”` : `${em(s.title)}.`)
  const ce: string[] = []
  if (hasContainer) ce.push(em(s.container))
  if (s.publisher) ce.push(esc(s.publisher))
  if (s.year) ce.push(esc(s.year))
  if (s.locator) ce.push(`pp. ${esc(s.locator)}`)
  if (s.url) ce.push(esc(s.url))
  if (ce.length) out.push(ce.join(', ') + '.')
  if (s.url) out.push(`Accessed ${accessedMla(s.createdAt)}.`)
  return out.join(' ')
}

function apa(s: Source): string {
  const hasContainer = !!s.container
  const out: string[] = []
  if (s.author) out.push(endPunct(authorList(s.author, 'apa')))
  out.push(`(${s.year ? esc(s.year) : 'n.d.'}).`)
  out.push(hasContainer ? `${endPunct(esc(s.title))}` : `${em(noEndPunct(s.title))}.`)
  if (hasContainer) out.push(`${em(s.container)}.`)
  if (s.publisher) out.push(`${endPunct(esc(s.publisher))}`)
  if (s.url) out.push(esc(s.url))
  return out.join(' ')
}

function chicago(s: Source): string {
  const hasContainer = !!s.container
  const out: string[] = []
  if (s.author) out.push(endPunct(authorList(s.author, 'chicago')))
  out.push(hasContainer ? `“${endPunct(esc(s.title))}”` : `${em(noEndPunct(s.title))}.`)
  if (hasContainer) out.push(`${em(s.container)}.`)
  const pubYear = [s.publisher, s.year].filter(Boolean).map(esc).join(', ')
  if (pubYear) out.push(pubYear + '.')
  if (s.url) out.push(`Accessed ${accessedChicago(s.createdAt)}.`)
  if (s.url) out.push(esc(s.url) + '.')
  return out.join(' ')
}

/** Format one source as a bibliography entry in the given style. */
export function formatCitation(source: Source, style: CitationStyle): FormattedCitation {
  const html = (style === 'mla' ? mla : style === 'apa' ? apa : chicago)(source)
  return { html, text: stripToText(html) }
}

function sortKey(s: Source): string {
  const names = splitAuthors(s.author)
  return (names[0]?.last || s.title).toLowerCase()
}

export interface Bibliography {
  heading: string
  entries: FormattedCitation[]
  html: string
  text: string
}

/** Build a full, alphabetically-sorted bibliography in the given style. */
export function buildBibliography(sources: Source[], style: CitationStyle): Bibliography {
  const heading = BIBLIOGRAPHY_HEADINGS[style]
  const sorted = [...sources].sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
  const entries = sorted.map((s) => formatCitation(s, style))
  const html = `<p>${esc(heading)}</p>` + entries.map((e) => `<p>${e.html}</p>`).join('')
  const text = heading + '\n\n' + entries.map((e) => e.text).join('\n')
  return { heading, entries, html, text }
}

/** A parenthetical in-text citation for the given source/style. */
export function inTextCitation(source: Source, style: CitationStyle): string {
  const names = splitAuthors(source.author)
  const name = names[0]?.last || source.title
  const page = source.locator
  if (style === 'mla') return `(${name}${page ? ` ${page}` : ''})`
  if (style === 'apa') return `(${name}, ${source.year || 'n.d.'})`
  return `(${name} ${source.year || 'n.d.'}${page ? `, ${page}` : ''})`
}

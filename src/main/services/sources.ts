import { randomUUID } from 'crypto'
import { promises as fs } from 'fs'
import { extname, join } from 'path'
import { Readability } from '@mozilla/readability'
import { JSDOM } from 'jsdom'
import DOMPurify from 'dompurify'
import type { Source, SourceKind } from '@shared/types'
import type { DB } from './db'
import { writeFileAtomic } from './atomic'

interface SourceRow {
  id: string
  kind: string
  title: string
  url: string | null
  locator: string | null
  file_path: string | null
  notes: string
  author: string
  container: string
  publisher: string
  year: string
  created_at: number
}

function toSource(r: SourceRow): Source {
  return {
    id: r.id,
    kind: r.kind as SourceKind,
    title: r.title,
    url: r.url,
    locator: r.locator,
    filePath: r.file_path,
    notes: r.notes,
    author: r.author ?? '',
    container: r.container ?? '',
    publisher: r.publisher ?? '',
    year: r.year ?? '',
    createdAt: r.created_at
  }
}

function insertSource(db: DB, s: Source): Source {
  db.prepare(
    `INSERT INTO sources (id, kind, title, url, locator, file_path, notes, author, container, publisher, year, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    s.id, s.kind, s.title, s.url, s.locator, s.filePath, s.notes,
    s.author, s.container, s.publisher, s.year, s.createdAt
  )
  return s
}

const EDITABLE_FIELDS = ['title', 'url', 'locator', 'notes', 'author', 'container', 'publisher', 'year'] as const
type EditableField = (typeof EDITABLE_FIELDS)[number]
const COLUMN: Record<EditableField, string> = {
  title: 'title', url: 'url', locator: 'locator', notes: 'notes',
  author: 'author', container: 'container', publisher: 'publisher', year: 'year'
}

/** Update editable fields (incl. bibliographic metadata) of a source. */
export function updateSource(db: DB, id: string, patch: Partial<Record<EditableField, string>>): Source | null {
  const sets: string[] = []
  const vals: unknown[] = []
  for (const f of EDITABLE_FIELDS) {
    if (patch[f] !== undefined) {
      sets.push(`${COLUMN[f]} = ?`)
      vals.push(patch[f])
    }
  }
  if (sets.length) {
    vals.push(id)
    db.prepare(`UPDATE sources SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
  }
  return getSource(db, id)
}

export function listSources(db: DB): Source[] {
  return (db.prepare('SELECT * FROM sources ORDER BY created_at DESC').all() as SourceRow[]).map(
    toSource
  )
}

export function getSource(db: DB, id: string): Source | null {
  const row = db.prepare('SELECT * FROM sources WHERE id = ?').get(id) as SourceRow | undefined
  return row ? toSource(row) : null
}

export interface ReadableResult {
  title: string
  contentHtml: string
  excerpt: string
}

/**
 * Pure extraction: parse raw HTML with Readability and sanitize the result.
 * Separated from fetching so it can be tested without network access.
 */
export function extractReadable(html: string, url: string): ReadableResult {
  const dom = new JSDOM(html, { url })
  const article = new Readability(dom.window.document).parse()
  const purifyWindow = new JSDOM('').window as unknown as Parameters<typeof DOMPurify>[0]
  const contentHtml = DOMPurify(purifyWindow).sanitize(article?.content ?? '', {
    WHOLE_DOCUMENT: false
  })
  return {
    title: article?.title?.trim() || url,
    contentHtml,
    excerpt: article?.excerpt?.trim() ?? ''
  }
}

function snapshotHtml(r: ReadableResult, url: string, capturedAt: number): string {
  const safeTitle = r.title.replace(/[<>&]/g, '')
  return (
    `<!doctype html><html><head><meta charset="utf-8"><title>${safeTitle}</title></head>` +
    `<body><article><h1>${safeTitle}</h1>` +
    `<p style="color:#888"><a href="${url}">${url}</a> · captured ${new Date(
      capturedAt
    ).toISOString()}</p><hr>${r.contentHtml}</article></body></html>`
  )
}

/** Fetch a URL, clean it, store a readable snapshot, and record the source. */
export async function captureUrl(db: DB, root: string, url: string): Promise<Source> {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Foolscap research capture)' } })
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`)
  const html = await res.text()
  const readable = extractReadable(html, url)

  const id = randomUUID()
  const createdAt = Date.now()
  const rel = join('research', `${id}.html`)
  await writeFileAtomic(join(root, rel), snapshotHtml(readable, url, createdAt))

  let container = ''
  try {
    container = new URL(url).hostname.replace(/^www\./, '')
  } catch {
    container = ''
  }
  return insertSource(db, {
    id,
    kind: 'web',
    title: readable.title,
    url,
    locator: null,
    filePath: rel,
    notes: readable.excerpt,
    author: '',
    container,
    publisher: '',
    year: '',
    createdAt
  })
}

/** Copy a file (PDF/image/etc.) into assets/ and record it as a source. */
export async function importFile(
  db: DB,
  root: string,
  srcPath: string,
  kind: SourceKind,
  title: string
): Promise<Source> {
  const id = randomUUID()
  const ext = extname(srcPath)
  const rel = join('assets', `${id}${ext}`)
  await fs.mkdir(join(root, 'assets'), { recursive: true })
  await fs.copyFile(srcPath, join(root, rel))
  return insertSource(db, {
    id,
    kind,
    title: title || srcPath.split(/[\\/]/).pop() || 'Asset',
    url: null,
    locator: null,
    filePath: rel,
    notes: '',
    author: '',
    container: '',
    publisher: '',
    year: '',
    createdAt: Date.now()
  })
}

/** Create a manual source (transcript with timestamp, URL reference, or note). */
export function createSource(
  db: DB,
  input: {
    kind: SourceKind
    title: string
    url?: string | null
    locator?: string | null
    notes?: string
    author?: string
    container?: string
    publisher?: string
    year?: string
  }
): Source {
  return insertSource(db, {
    id: randomUUID(),
    kind: input.kind,
    title: input.title,
    url: input.url ?? null,
    locator: input.locator ?? null,
    filePath: null,
    notes: input.notes ?? '',
    author: input.author ?? '',
    container: input.container ?? '',
    publisher: input.publisher ?? '',
    year: input.year ?? '',
    createdAt: Date.now()
  })
}

export async function removeSource(db: DB, root: string, id: string): Promise<Source[]> {
  const src = getSource(db, id)
  db.prepare('DELETE FROM claim_sources WHERE source_id = ?').run(id)
  db.prepare('DELETE FROM sources WHERE id = ?').run(id)
  if (src?.filePath) await fs.rm(join(root, src.filePath), { force: true })
  return listSources(db)
}

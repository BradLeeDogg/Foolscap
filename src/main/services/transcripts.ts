import { randomUUID } from 'crypto'
import type { Transcript, TranscriptSegment, TranscriptWithSegments } from '@shared/types'
import type { DB } from './db'

interface TranscriptRow {
  id: string
  title: string
  created_at: number
  updated_at: number
}
interface SegmentRow {
  id: string
  transcript_id: string
  position: number
  speaker: string
  timestamp: string
  text: string
}

function toTranscript(r: TranscriptRow): Transcript {
  return { id: r.id, title: r.title, createdAt: r.created_at, updatedAt: r.updated_at }
}
function toSegment(r: SegmentRow): TranscriptSegment {
  return {
    id: r.id,
    transcriptId: r.transcript_id,
    position: r.position,
    speaker: r.speaker,
    timestamp: r.timestamp,
    text: r.text
  }
}

export function listTranscripts(db: DB): Transcript[] {
  return (
    db.prepare('SELECT * FROM transcripts ORDER BY updated_at DESC').all() as TranscriptRow[]
  ).map(toTranscript)
}

export function getTranscript(db: DB, id: string): TranscriptWithSegments | null {
  const row = db.prepare('SELECT * FROM transcripts WHERE id = ?').get(id) as TranscriptRow | undefined
  if (!row) return null
  const segments = (
    db
      .prepare('SELECT * FROM transcript_segments WHERE transcript_id = ? ORDER BY position')
      .all(id) as SegmentRow[]
  ).map(toSegment)
  return { ...toTranscript(row), segments }
}

function touch(db: DB, id: string): void {
  db.prepare('UPDATE transcripts SET updated_at = ? WHERE id = ?').run(Date.now(), id)
}

export function createTranscript(db: DB, title: string): TranscriptWithSegments {
  const id = randomUUID()
  const ts = Date.now()
  db.prepare('INSERT INTO transcripts (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)').run(
    id,
    title.trim() || 'Untitled transcript',
    ts,
    ts
  )
  return getTranscript(db, id)!
}

export function renameTranscript(db: DB, id: string, title: string): void {
  db.prepare('UPDATE transcripts SET title = ?, updated_at = ? WHERE id = ?').run(
    title.trim() || 'Untitled transcript',
    Date.now(),
    id
  )
}

export function removeTranscript(db: DB, id: string): Transcript[] {
  const txn = db.transaction(() => {
    db.prepare('DELETE FROM transcript_segments WHERE transcript_id = ?').run(id)
    db.prepare('DELETE FROM transcripts WHERE id = ?').run(id)
  })
  txn()
  return listTranscripts(db)
}

function nextPosition(db: DB, transcriptId: string): number {
  const row = db
    .prepare('SELECT COALESCE(MAX(position), -1) + 1 AS n FROM transcript_segments WHERE transcript_id = ?')
    .get(transcriptId) as { n: number }
  return row.n
}

export function addSegment(
  db: DB,
  transcriptId: string,
  seg?: { speaker?: string; timestamp?: string; text?: string }
): TranscriptWithSegments {
  db.prepare(
    `INSERT INTO transcript_segments (id, transcript_id, position, speaker, timestamp, text)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    randomUUID(),
    transcriptId,
    nextPosition(db, transcriptId),
    seg?.speaker ?? '',
    seg?.timestamp ?? '',
    seg?.text ?? ''
  )
  touch(db, transcriptId)
  return getTranscript(db, transcriptId)!
}

export function updateSegment(
  db: DB,
  segmentId: string,
  patch: { speaker?: string; timestamp?: string; text?: string }
): void {
  const fields: string[] = []
  const values: unknown[] = []
  if (patch.speaker !== undefined) {
    fields.push('speaker = ?')
    values.push(patch.speaker)
  }
  if (patch.timestamp !== undefined) {
    fields.push('timestamp = ?')
    values.push(patch.timestamp)
  }
  if (patch.text !== undefined) {
    fields.push('text = ?')
    values.push(patch.text)
  }
  if (!fields.length) return
  values.push(segmentId)
  db.prepare(`UPDATE transcript_segments SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  const row = db
    .prepare('SELECT transcript_id FROM transcript_segments WHERE id = ?')
    .get(segmentId) as { transcript_id: string } | undefined
  if (row) touch(db, row.transcript_id)
}

export function removeSegment(db: DB, segmentId: string): void {
  const row = db
    .prepare('SELECT transcript_id FROM transcript_segments WHERE id = ?')
    .get(segmentId) as { transcript_id: string } | undefined
  db.prepare('DELETE FROM transcript_segments WHERE id = ?').run(segmentId)
  if (row) touch(db, row.transcript_id)
}

/**
 * Parse pasted transcript text into segments. Recognizes an optional leading
 * timestamp ([00:12], (1:02:33), or bare 00:12) and an optional "Speaker:" prefix.
 * Lines without either become text-only continuation segments.
 */
export function parseRaw(raw: string): Array<{ speaker: string; timestamp: string; text: string }> {
  const out: Array<{ speaker: string; timestamp: string; text: string }> = []
  for (const line of raw.split(/\r?\n/)) {
    let rest = line.trim()
    if (!rest) continue
    let timestamp = ''
    const tsMatch = rest.match(/^[[(]?(\d{1,2}:\d{2}(?::\d{2})?)[\])]?\s+/)
    if (tsMatch) {
      timestamp = tsMatch[1]!
      rest = rest.slice(tsMatch[0].length)
    }
    let speaker = ''
    const spMatch = rest.match(/^([A-Za-z0-9 ._'-]{1,40}?):\s+(.*)$/)
    if (spMatch && !/^\d+$/.test(spMatch[1]!.trim())) {
      speaker = spMatch[1]!.trim()
      rest = spMatch[2]!
    }
    out.push({ speaker, timestamp, text: rest })
  }
  return out
}

/** Replace a transcript's segments with parsed lines (used by "paste & parse"). */
export function replaceSegments(db: DB, transcriptId: string, raw: string): TranscriptWithSegments {
  const parsed = parseRaw(raw)
  const txn = db.transaction(() => {
    db.prepare('DELETE FROM transcript_segments WHERE transcript_id = ?').run(transcriptId)
    const stmt = db.prepare(
      `INSERT INTO transcript_segments (id, transcript_id, position, speaker, timestamp, text)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    parsed.forEach((p, i) => stmt.run(randomUUID(), transcriptId, i, p.speaker, p.timestamp, p.text))
    touch(db, transcriptId)
  })
  txn()
  return getTranscript(db, transcriptId)!
}

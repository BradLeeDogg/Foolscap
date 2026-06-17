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
 * Parse pasted transcript text into per-turn segments. Understands the common
 * shapes produced by transcription tools:
 *   • inline:        "[00:12] Reporter: How did it start?"  /  "Subject: In March."
 *   • header line:   "William B. Nichols   00:00"   (name then a trailing time,
 *                     separated by a tab or 2+ spaces) followed by the spoken
 *                     text on the next line(s)
 *   • leading time:  "00:12 The text…"
 * A new turn starts at any recognized speaker/timestamp line; subsequent plain
 * lines (until the next turn or a blank line) are grouped into that turn.
 */
export function parseRaw(raw: string): Array<{ speaker: string; timestamp: string; text: string }> {
  const segments: Array<{ speaker: string; timestamp: string; text: string }> = []
  let curr: { speaker: string; timestamp: string; lines: string[] } | null = null

  const flush = (): void => {
    if (!curr) return
    const text = curr.lines.join('\n').trim()
    if (curr.speaker || curr.timestamp || text) {
      segments.push({ speaker: curr.speaker, timestamp: curr.timestamp, text })
    }
    curr = null
  }
  const start = (speaker: string, timestamp: string, first?: string): void => {
    flush()
    curr = { speaker, timestamp, lines: first != null ? [first] : [] }
  }

  const reLeadTsSpeaker = /^[[(]?(\d{1,2}:\d{2}(?::\d{2})?)[\])]?\s+([^:]{1,40}):\s+(.*)$/
  const reHeaderTrailTs = /^(.{1,50}?)(?:\t+| {2,})[[(]?(\d{1,2}:\d{2}(?::\d{2})?)[\])]?$/
  const reSpeakerColon = /^([^:]{1,40}):\s+(.*)$/
  const reLeadTs = /^[[(]?(\d{1,2}:\d{2}(?::\d{2})?)[\])]?\s+(.*)$/
  const numeric = /^\d+$/
  const hasTime = /\d{1,2}:\d{2}/

  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) {
      flush()
      continue
    }
    let m = line.match(reLeadTsSpeaker)
    if (m && !numeric.test(m[2]!.trim())) {
      start(m[2]!.trim(), m[1]!, m[3])
      continue
    }
    m = line.match(reHeaderTrailTs)
    if (m && !/[.!?,;]$/.test(m[1]!.trim()) && !hasTime.test(m[1]!)) {
      start(m[1]!.trim(), m[2]!)
      continue
    }
    m = line.match(reSpeakerColon)
    if (m && !numeric.test(m[1]!.trim()) && !hasTime.test(m[1]!)) {
      start(m[1]!.trim(), '', m[2])
      continue
    }
    m = line.match(reLeadTs)
    if (m) {
      start('', m[1]!, m[2])
      continue
    }
    if (curr) curr.lines.push(line)
    else curr = { speaker: '', timestamp: '', lines: [line] }
  }
  flush()
  return segments
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

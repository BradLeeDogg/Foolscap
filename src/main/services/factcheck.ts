import { randomUUID } from 'crypto'
import type { Claim, ClaimStatus, ClaimWithSources, Source } from '@shared/types'
import type { DB } from './db'

interface ClaimRow {
  id: string
  doc_id: string
  text: string
  status: string
  needs_quote_check: number
  created_at: number
}

function toClaim(r: ClaimRow): Claim {
  return {
    id: r.id,
    docId: r.doc_id,
    text: r.text,
    status: r.status as ClaimStatus,
    needsQuoteCheck: r.needs_quote_check === 1,
    createdAt: r.created_at
  }
}

function sourcesFor(db: DB, claimId: string): Source[] {
  const rows = db
    .prepare(
      `SELECT s.* FROM sources s
       JOIN claim_sources cs ON cs.source_id = s.id
       WHERE cs.claim_id = ? ORDER BY s.created_at`
    )
    .all(claimId) as Array<{
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
  }>
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind as Source['kind'],
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
  }))
}

function withSources(db: DB, claim: Claim): ClaimWithSources {
  return { ...claim, sources: sourcesFor(db, claim.id) }
}

export function listClaims(db: DB, docId: string): ClaimWithSources[] {
  const rows = db
    .prepare('SELECT * FROM claims WHERE doc_id = ? ORDER BY created_at')
    .all(docId) as ClaimRow[]
  return rows.map((r) => withSources(db, toClaim(r)))
}

export function createClaim(db: DB, docId: string, text: string): ClaimWithSources {
  const claim: Claim = {
    id: randomUUID(),
    docId,
    text,
    status: 'needs-sourcing',
    needsQuoteCheck: false,
    createdAt: Date.now()
  }
  db.prepare(
    'INSERT INTO claims (id, doc_id, text, status, needs_quote_check, created_at) VALUES (?, ?, ?, ?, 0, ?)'
  ).run(claim.id, claim.docId, claim.text, claim.status, claim.createdAt)
  return withSources(db, claim)
}

export function updateClaim(
  db: DB,
  id: string,
  patch: { text?: string; status?: ClaimStatus; needsQuoteCheck?: boolean }
): void {
  const cur = db.prepare('SELECT * FROM claims WHERE id = ?').get(id) as ClaimRow | undefined
  if (!cur) return
  db.prepare('UPDATE claims SET text = ?, status = ?, needs_quote_check = ? WHERE id = ?').run(
    patch.text ?? cur.text,
    patch.status ?? cur.status,
    patch.needsQuoteCheck === undefined ? cur.needs_quote_check : patch.needsQuoteCheck ? 1 : 0,
    id
  )
}

export function removeClaim(db: DB, id: string): void {
  db.prepare('DELETE FROM claim_sources WHERE claim_id = ?').run(id)
  db.prepare('DELETE FROM claims WHERE id = ?').run(id)
}

export function linkSource(db: DB, claimId: string, sourceId: string): void {
  db.prepare('INSERT OR IGNORE INTO claim_sources (claim_id, source_id) VALUES (?, ?)').run(
    claimId,
    sourceId
  )
}

export function unlinkSource(db: DB, claimId: string, sourceId: string): void {
  db.prepare('DELETE FROM claim_sources WHERE claim_id = ? AND source_id = ?').run(claimId, sourceId)
}

/**
 * The running list of everything that can't ship yet: any claim not verified,
 * lacking a source, or with a quotation still to be checked against audio.
 */
export function listOutstanding(db: DB): ClaimWithSources[] {
  const rows = db.prepare('SELECT * FROM claims ORDER BY created_at').all() as ClaimRow[]
  return rows
    .map((r) => withSources(db, toClaim(r)))
    .filter((c) => c.status !== 'verified' || c.sources.length === 0 || c.needsQuoteCheck)
}

export interface PacketDocument {
  docId: string
  claims: ClaimWithSources[]
}

/** The full fact-check packet, grouped by document, for export alongside the manuscript. */
export function buildPacket(db: DB): PacketDocument[] {
  const docIds = (
    db.prepare('SELECT DISTINCT doc_id FROM claims').all() as Array<{ doc_id: string }>
  ).map((r) => r.doc_id)
  return docIds.map((docId) => ({ docId, claims: listClaims(db, docId) }))
}

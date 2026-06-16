import { existsSync } from 'fs'
import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { projectService } from './services/project'
import { createItem, listBinder, moveItem, removeItem, setNotes } from './services/binder'
import * as meta from './services/metadata'
import { countWords, emptyDoc, readDocument, writeDocument } from './services/documents'
import { createSnapshot, listSnapshots, restoreSnapshot } from './services/snapshots'
import { createBackup } from './services/backups'
import { searchProject } from './services/search'
import { createCollection, listCollections, removeCollection } from './services/collections'
import { createSource, extractReadable, listSources } from './services/sources'
import { createClaim, linkSource, listClaims, listOutstanding, updateClaim } from './services/factcheck'
import { compileToDocxBuffer } from './services/compile'
import { COMPILE_PRESETS } from '@shared/presets'
import type { DocumentContent } from '@shared/types'

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`)
  console.log(`  ✓ ${msg}`)
}

/**
 * Exercises the storage/services stack against the real native sqlite + fs in
 * the Electron main runtime. Run with WP_SELFTEST=1. Not part of the shipped app.
 */
export async function runSelfTest(): Promise<void> {
  const loc = await fs.mkdtemp(join(tmpdir(), 'wp-selftest-'))
  console.log('Self-test workspace:', loc)

  const res = await projectService.create({
    title: 'Test Novel',
    type: 'novel',
    location: loc,
    structureOverlay: 'three-act'
  })
  assert(res.tree.length > 0, 'template created binder items')
  assert(res.labels.some((l) => l.kind === 'status'), 'statuses seeded')
  assert(res.tree.some((i) => i.title === 'Manuscript' && i.isSpecial), 'special Manuscript folder')
  assert(
    res.tree.some((i) => i.title.startsWith('Outline — Three-Act') || i.title.includes('Three')),
    'structure overlay applied'
  )

  const { db, paths } = projectService.requireCurrent()
  const doc = res.tree.find((i) => i.type === 'document')!
  assert(!!doc, 'project has at least one document')
  assert(existsSync(join(paths.documents, `${doc.id}.json`)), 'document file on disk')

  const content: DocumentContent = {
    version: 1,
    doc: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello world from WProcessor.' }] }]
    }
  }
  await writeDocument(paths.root, doc.id, content)
  const read = await readDocument(paths.root, doc.id)
  assert(read !== null && countWords(read) === 4, 'document round-trips (4 words)')

  const created = createItem(db, { type: 'document', title: 'New Scene', parentId: null })
  assert(
    listBinder(db).some((i) => i.id === created.id),
    'createItem persists'
  )

  const snap = await createSnapshot(db, paths.root, doc.id, 'v1')
  assert(listSnapshots(db, doc.id).length === 1, 'snapshot recorded')
  await writeDocument(paths.root, doc.id, emptyDoc())
  const restored = await restoreSnapshot(db, paths.root, snap.id)
  assert(countWords(restored) === 4, 'snapshot restore brings content back')

  const folder = listBinder(db).find((i) => i.type === 'folder')!
  moveItem(db, { id: created.id, newParentId: folder.id, newIndex: 0 })
  assert(
    listBinder(db).find((i) => i.id === created.id)!.parentId === folder.id,
    'moveItem reparents'
  )

  const info = await createBackup(paths.root, db)
  assert(existsSync(info.path) && info.sizeBytes > 0, 'backup zip written')

  const hits = await searchProject(db, paths.root, { text: 'wprocessor' })
  assert(hits.some((h) => h.itemId === doc.id && h.matches >= 1), 'full-text search finds a match')
  const miss = await searchProject(db, paths.root, { text: 'zzqqxnotpresent' })
  assert(miss.length === 0, 'search returns nothing for absent text')

  const coll = createCollection(db, 'Mentions WProcessor', { text: 'wprocessor' })
  assert(listCollections(db).length === 1, 'collection saved')
  removeCollection(db, coll.id)
  assert(listCollections(db).length === 0, 'collection removed')

  assert(meta.listFields(db).length >= 3, 'default metadata fields seeded (POV/Setting/Characters)')
  const field = meta.createField(db, 'Mood', 'text')
  meta.setValue(db, doc.id, field.id, 'tense')
  assert(meta.getValues(db, doc.id)[field.id] === 'tense', 'metadata value round-trips')
  setNotes(db, doc.id, 'check quote against tape')
  assert(
    listBinder(db).find((i) => i.id === doc.id)!.notes === 'check quote against tape',
    'item notes persist'
  )

  const sample =
    '<!doctype html><html><head><title>Test Article</title></head><body><article>' +
    '<h1>Test Article</h1>' +
    '<p>The mayor said the budget would grow by ten percent next year, according to public records.</p>' +
    '<p>Officials confirmed the figure during a meeting on Tuesday evening at city hall downtown.</p>' +
    '</article><script>alert("xss")</script></body></html>'
  const readable = extractReadable(sample, 'https://example.com/a')
  assert(
    readable.contentHtml.includes('mayor') && !readable.contentHtml.includes('<script'),
    'readability extracts prose and strips scripts'
  )

  const src = createSource(db, { kind: 'note', title: 'Mayor budget note' })
  assert(listSources(db).some((s) => s.id === src.id), 'source created')
  const claim = createClaim(db, doc.id, 'Budget grows 10% next year')
  assert(listClaims(db, doc.id).length === 1, 'claim logged')
  linkSource(db, claim.id, src.id)
  assert(listClaims(db, doc.id)[0]!.sources.length === 1, 'source linked to claim')
  updateClaim(db, claim.id, { status: 'verified' })
  assert(
    listOutstanding(db).every((c) => c.id !== claim.id),
    'verified + sourced claim leaves the outstanding list'
  )

  removeItem(db, created.id)
  assert(
    !listBinder(db).some((i) => i.id === created.id),
    'removeItem deletes'
  )

  const docx = await compileToDocxBuffer(paths.root, {
    entries: [{ heading: 'Chapter One' }, { docId: doc.id }],
    preset: COMPILE_PRESETS.shunn,
    meta: { title: 'Test Novel', author: 'A. Writer', contact: 'a@example.com', keyword: 'TEST', byline: '', dateline: '' },
    includeFactCheck: false
  })
  assert(docx.length > 1000 && docx[0] === 0x50 && docx[1] === 0x4b, 'compiled DOCX is a valid zip (PK)')

  const savedPath = res.meta.path
  await projectService.close()
  const reopened = await projectService.open(savedPath)
  assert(reopened.tree.length > 0, 'project reopens with its tree')
  await projectService.close()

  await fs.rm(loc, { recursive: true, force: true })
  console.log('SELFTEST_OK: storage core verified end-to-end')
}

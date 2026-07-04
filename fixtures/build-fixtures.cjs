/*
 * Fixture generator — builds realistic .writeproject folders for review/testing.
 *
 * Creates five projects under fixtures/out/ (gitignored via *.writeproject/):
 *   1. Endings.writeproject            — 90k-word novel, 60 scenes / 3 acts, metadata, statuses
 *   2. The Long Fall.writeproject      — 6k-word feature, 40 sources, 120 claims, transcripts
 *   3. Council Brief.writeproject      — 400-word news brief, mid-draft
 *   4. Dissertation.writeproject       — 5 chapters, 200 references, figures & tables
 *   5. Proposal.writeproject           — nonfiction proposal, annotated TOC, 2 sample chapters
 *
 * Run with Electron's Node (matches better-sqlite3's prebuilt ABI):
 *   ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron fixtures/build-fixtures.cjs [outDir]
 *
 * The generator replicates the app's storage format exactly (db.ts migrations
 * through user_version=7, meta keys, documents/<uuid>.json). Deterministic
 * (seeded PRNG) so repeated runs produce comparable projects.
 */
const fs = require('fs')
const path = require('path')
const { randomUUID } = require('crypto')
const Database = require('better-sqlite3')

const OUT = path.resolve(process.argv[2] || path.join(__dirname, 'out'))

// --- deterministic text ------------------------------------------------------
let seed = 42
function rand() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff
  return seed / 0x7fffffff
}
const NOUNS = 'harbor,letter,winter,engine,garden,mirror,ticket,anchor,violin,ledger,orchard,lantern,archive,corridor,estuary,滑'.split(',').slice(0, 15)
const VERBS = 'carried,refused,remembered,followed,buried,promised,measured,repeated,witnessed,borrowed,mistook,rehearsed,dismantled,forgave'.split(',')
const ADJS = 'pale,stubborn,quiet,broken,distant,patient,crooked,honest,unfinished,borrowed,narrow,cold'.split(',')
const NAMES = ['Mara', 'Ellis', 'Noor', 'Kavanagh', 'Ruth', 'Delgado', 'Ivo', 'Sylvia']
function sentence() {
  const n = () => NOUNS[Math.floor(rand() * NOUNS.length)]
  const v = () => VERBS[Math.floor(rand() * VERBS.length)]
  const a = () => ADJS[Math.floor(rand() * ADJS.length)]
  const who = NAMES[Math.floor(rand() * NAMES.length)]
  const forms = [
    `${who} ${v()} the ${a()} ${n()} without saying why.`,
    `The ${n()} in the ${n()} was ${a()}, and everyone pretended not to notice.`,
    `By morning the ${n()} had changed hands twice.`,
    `"You ${v()} it," said ${who}, "and that is the whole of it."`,
    `Nothing about the ${a()} ${n()} suggested it would matter later, but it did.`
  ]
  return forms[Math.floor(rand() * forms.length)]
}
function paragraph(sentences) {
  const out = []
  for (let i = 0; i < sentences; i++) out.push(sentence())
  return out.join(' ')
}
/** ~words of prose as TipTap paragraphs (avg sentence ≈ 12 words). */
function proseParagraphs(words) {
  const paras = []
  let count = 0
  while (count < words) {
    const s = 3 + Math.floor(rand() * 5)
    const p = paragraph(s)
    count += p.split(/\s+/).length
    paras.push(p)
  }
  return paras
}

// --- storage format ----------------------------------------------------------
function docJSON(paras) {
  return {
    version: 1,
    doc: { type: 'doc', content: paras.map((t) => ({ type: 'paragraph', content: t ? [{ type: 'text', text: t }] : undefined })) }
  }
}
function wordsOf(paras) {
  return paras.join(' ').trim().split(/\s+/).filter(Boolean).length
}

function createSchema(db) {
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE binder_items (
      id TEXT PRIMARY KEY, parent_id TEXT, position INTEGER NOT NULL, type TEXT NOT NULL,
      title TEXT NOT NULL, synopsis TEXT NOT NULL DEFAULT '', label_id TEXT, status_id TEXT,
      collapsed INTEGER NOT NULL DEFAULT 0, is_special INTEGER NOT NULL DEFAULT 0,
      word_count INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      notes TEXT NOT NULL DEFAULT '', deleted INTEGER);
    CREATE INDEX idx_binder_parent ON binder_items(parent_id, position);
    CREATE TABLE labels (id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL, kind TEXT NOT NULL, position INTEGER NOT NULL);
    CREATE TABLE snapshots (id TEXT PRIMARY KEY, item_id TEXT NOT NULL, name TEXT NOT NULL,
      word_count INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
    CREATE INDEX idx_snapshots_item ON snapshots(item_id, created_at DESC);
    CREATE TABLE collections (id TEXT PRIMARY KEY, name TEXT NOT NULL, criteria_json TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE metadata_fields (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL,
      options_json TEXT NOT NULL DEFAULT '[]', position INTEGER NOT NULL);
    CREATE TABLE metadata_values (item_id TEXT NOT NULL, field_id TEXT NOT NULL, value TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (item_id, field_id));
    CREATE INDEX idx_meta_values_item ON metadata_values(item_id);
    CREATE TABLE sources (id TEXT PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL, url TEXT, locator TEXT,
      file_path TEXT, notes TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL,
      author TEXT NOT NULL DEFAULT '', container TEXT NOT NULL DEFAULT '', publisher TEXT NOT NULL DEFAULT '', year TEXT NOT NULL DEFAULT '');
    CREATE TABLE claims (id TEXT PRIMARY KEY, doc_id TEXT NOT NULL, text TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'needs-sourcing', needs_quote_check INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
    CREATE INDEX idx_claims_doc ON claims(doc_id);
    CREATE TABLE claim_sources (claim_id TEXT NOT NULL, source_id TEXT NOT NULL, PRIMARY KEY (claim_id, source_id));
    CREATE TABLE transcripts (id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE transcript_segments (id TEXT PRIMARY KEY, transcript_id TEXT NOT NULL, position INTEGER NOT NULL,
      speaker TEXT NOT NULL DEFAULT '', timestamp TEXT NOT NULL DEFAULT '', text TEXT NOT NULL DEFAULT '');
    CREATE INDEX idx_segments_transcript ON transcript_segments(transcript_id, position);
  `)
  db.pragma('user_version = 7')
}

const STATUSES = [['To Do', '#9aa0a6'], ['In Progress', '#d8a657'], ['First Draft', '#7daea3'], ['Revised', '#a9b665'], ['Final', '#89b482']]
const LABELS = [['Concept', '#e07a5f'], ['Character', '#81b29a'], ['Setting', '#f2cc8f'], ['Theme', '#9d8189'], ['To Review', '#6d8ea0']]

function makeProject({ folder, title, type, factCheck = false, fields = [] }) {
  const root = path.join(OUT, `${folder}.writeproject`)
  fs.rmSync(root, { recursive: true, force: true })
  for (const d of ['documents', 'assets', 'research', 'snapshots', 'backups']) {
    fs.mkdirSync(path.join(root, d), { recursive: true })
  }
  const db = new Database(path.join(root, 'project.db'))
  createSchema(db)
  const now = Date.now()
  const settings = {
    manuscript: { fontFamily: 'Times New Roman', fontSizePt: 12, lineSpacing: 2, marginInches: 1, pageSize: 'us-letter' },
    factCheckEnabled: factCheck, theme: 'paper', typewriterSound: false, smartQuotes: true,
    english: 'american', oxfordComma: true, autosaveDebounceMs: 800,
    backupIntervalMs: 900000, maxAutomaticBackups: 25,
    projectWordTarget: null, sessionWordTarget: null, deadline: null
  }
  const meta = db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)')
  meta.run('project.id', randomUUID())
  meta.run('project.title', title)
  meta.run('project.type', type)
  meta.run('project.path', root)
  meta.run('project.settings', JSON.stringify(settings))
  meta.run('project.createdAt', String(now - 45 * 86400000))
  meta.run('project.updatedAt', String(now))
  const insLabel = db.prepare('INSERT INTO labels (id,name,color,kind,position) VALUES (?,?,?,?,?)')
  const statusIds = STATUSES.map(([n, c], i) => { const id = randomUUID(); insLabel.run(id, n, c, 'status', i); return id })
  const labelIds = LABELS.map(([n, c], i) => { const id = randomUUID(); insLabel.run(id, n, c, 'label', i); return id })
  const insField = db.prepare('INSERT INTO metadata_fields (id,name,type,options_json,position) VALUES (?,?,?,?,?)')
  const fieldIds = {}
  fields.forEach((name, i) => { const id = randomUUID(); insField.run(id, name, 'text', '[]', i); fieldIds[name] = id })

  const insItem = db.prepare(`INSERT INTO binder_items
    (id,parent_id,position,type,title,synopsis,label_id,status_id,collapsed,is_special,word_count,created_at,updated_at,notes)
    VALUES (?,?,?,?,?,?,?,?,0,?,?,?,?,?)`)
  const positions = new Map()
  function addItem({ parentId = null, type: t, title: tt, synopsis = '', labelId = null, statusId = null, special = false, paras = null, notes = '' }) {
    const id = randomUUID()
    const pos = positions.get(parentId) ?? 0
    positions.set(parentId, pos + 1)
    let wc = 0
    if (t === 'document') {
      const content = docJSON(paras ?? [''])
      fs.writeFileSync(path.join(root, 'documents', `${id}.json`), JSON.stringify(content))
      wc = paras ? wordsOf(paras) : 0
    }
    insItem.run(id, parentId, pos, t, tt, synopsis, labelId, statusId, special ? 1 : 0, wc, now - Math.floor(rand() * 40) * 86400000, now, notes)
    return id
  }
  return { root, db, addItem, statusIds, labelIds, fieldIds, now }
}

// 1 ─ Novel ────────────────────────────────────────────────────────────────────
function buildNovel() {
  const p = makeProject({ folder: 'Endings', title: 'Endings', type: 'novel', fields: ['POV', 'Setting', 'Characters'] })
  const ms = p.addItem({ type: 'folder', title: 'Manuscript', special: true, synopsis: 'The draft itself.' })
  const setVal = p.db.prepare('INSERT INTO metadata_values (item_id, field_id, value) VALUES (?,?,?)')
  const povs = ['Mara', 'Ellis', 'Noor']
  const settings = ['The harbor house', 'Union Street', 'The archive', 'The estuary']
  let sceneNo = 0
  const acts = [['Act I', 18], ['Act II', 24], ['Act III', 18]]
  for (const [actTitle, scenes] of acts) {
    const act = p.addItem({ parentId: ms, type: 'folder', title: actTitle, synopsis: `${actTitle} of three.` })
    for (let i = 0; i < scenes; i++) {
      sceneNo++
      // Scene 12 is deliberately long (~15k words) for typing-latency testing.
      const words = sceneNo === 12 ? 15000 : 1100 + Math.floor(rand() * 800)
      const id = p.addItem({
        parentId: act, type: 'document', title: `Scene ${sceneNo}`,
        synopsis: paragraph(1),
        statusId: p.statusIds[Math.floor(rand() * p.statusIds.length)],
        labelId: rand() < 0.3 ? p.labelIds[Math.floor(rand() * p.labelIds.length)] : null,
        paras: proseParagraphs(words)
      })
      setVal.run(id, p.fieldIds['POV'], povs[Math.floor(rand() * povs.length)])
      setVal.run(id, p.fieldIds['Setting'], settings[Math.floor(rand() * settings.length)])
      setVal.run(id, p.fieldIds['Characters'], NAMES.slice(0, 2 + Math.floor(rand() * 3)).join(', '))
    }
  }
  p.addItem({ type: 'folder', title: 'Characters' })
  p.addItem({ type: 'folder', title: 'Research' })
  p.db.close()
  return p.root
}

// 2 ─ Feature ─────────────────────────────────────────────────────────────────
function buildFeature() {
  const p = makeProject({ folder: 'The Long Fall', title: 'The Long Fall', type: 'journalism-long', factCheck: true, fields: ['POV', 'Setting', 'Characters'] })
  const story = p.addItem({ type: 'folder', title: 'Feature', special: true })
  const docs = []
  for (const [t, w] of [['Lede', 300], ['Nut Graf', 250], ['The Fall', 1400], ['The Investigation', 1600], ['The Hearing', 1300], ['Kicker', 1150]]) {
    docs.push(p.addItem({ parentId: story, type: 'document', title: t, synopsis: paragraph(1), paras: proseParagraphs(w) }))
  }
  const insSource = p.db.prepare(`INSERT INTO sources (id,kind,title,url,locator,file_path,notes,created_at,author,container,publisher,year)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
  const sourceIds = []
  for (let i = 1; i <= 40; i++) {
    const id = randomUUID()
    const web = i <= 10
    if (web) {
      // captured web page: research/<id>.html exists on disk
      fs.writeFileSync(path.join(p.root, 'research', `${id}.html`), `<html><body><h1>Captured page ${i}</h1><p>${paragraph(4)}</p></body></html>`)
    }
    insSource.run(id, web ? 'web' : i <= 25 ? 'note' : 'article', web ? `Agency filing ${i}` : `Interview / record ${i}`,
      web ? `https://example.org/record/${i}` : null, i % 3 === 0 ? `p. ${i}` : null,
      web ? `research/${id}.html` : null, i % 4 === 0 ? paragraph(1) : '', Date.now() - i * 3600000,
      i % 2 === 0 ? `Reporter ${i}` : '', '', '', '2026')
    sourceIds.push(id)
  }
  const insClaim = p.db.prepare('INSERT INTO claims (id,doc_id,text,status,needs_quote_check,created_at) VALUES (?,?,?,?,?,?)')
  const insCS = p.db.prepare('INSERT INTO claim_sources (claim_id, source_id) VALUES (?,?)')
  const states = ['verified', 'needs-sourcing', 'disputed']
  for (let i = 0; i < 120; i++) {
    const id = randomUUID()
    const st = states[i % 7 === 0 ? 2 : i % 3 === 0 ? 1 : 0] // ≈60% verified, ≈29% needs-sourcing, ≈11% disputed
    insClaim.run(id, docs[i % docs.length], `Claim ${i + 1}: ${sentence()}`, st, i % 12 === 0 ? 1 : 0, Date.now() - i * 60000)
    if (st !== 'needs-sourcing') insCS.run(id, sourceIds[i % sourceIds.length])
  }
  const insTr = p.db.prepare('INSERT INTO transcripts (id,title,created_at,updated_at) VALUES (?,?,?,?)')
  const insSeg = p.db.prepare('INSERT INTO transcript_segments (id,transcript_id,position,speaker,timestamp,text) VALUES (?,?,?,?,?,?)')
  for (let t = 0; t < 2; t++) {
    const id = randomUUID()
    insTr.run(id, `Interview ${t + 1} — ${NAMES[t]}`, Date.now(), Date.now())
    for (let s = 0; s < 30; s++) {
      insSeg.run(randomUUID(), id, s, s % 2 ? NAMES[t] : 'Q', `00:${String(s).padStart(2, '0')}:00`, sentence())
    }
  }
  p.db.close()
  return p.root
}

// 3 ─ News brief ──────────────────────────────────────────────────────────────
function buildBrief() {
  const p = makeProject({ folder: 'Council Brief', title: 'Council Brief', type: 'journalism-short', factCheck: true })
  const story = p.addItem({ type: 'folder', title: 'Story', special: true })
  p.addItem({ parentId: story, type: 'document', title: 'Headline', paras: ['Council approves harbor levy'] })
  p.addItem({ parentId: story, type: 'document', title: 'Dek', paras: ['Vote follows two hours of public comment'] })
  p.addItem({ parentId: story, type: 'document', title: 'Lede', paras: proseParagraphs(80) })
  p.addItem({ parentId: story, type: 'document', title: 'Nut Graf', paras: proseParagraphs(90) })
  p.addItem({ parentId: story, type: 'document', title: 'Body', paras: proseParagraphs(230) })
  p.addItem({ parentId: story, type: 'document', title: 'Kicker', paras: [''] }) // mid-draft: kicker not written
  p.db.close()
  return p.root
}

// 4 ─ Dissertation ────────────────────────────────────────────────────────────
function buildDissertation() {
  const p = makeProject({ folder: 'Dissertation', title: 'Sediment Transport in Tidal Estuaries', type: 'dissertation' })
  const front = p.addItem({ type: 'folder', title: 'Front Matter' })
  p.addItem({ parentId: front, type: 'document', title: 'Abstract', paras: proseParagraphs(250) })
  p.addItem({ parentId: front, type: 'document', title: 'Table of Contents', paras: [''] })
  p.addItem({ parentId: front, type: 'document', title: 'List of Figures', paras: [''] })
  p.addItem({ parentId: front, type: 'document', title: 'List of Tables', paras: [''] })
  const body = p.addItem({ type: 'folder', title: 'Body', special: true })
  for (const [t, w] of [['Introduction', 3200], ['Literature Review', 5200], ['Methodology', 4200], ['Results', 4800], ['Discussion', 4600]]) {
    p.addItem({ parentId: body, type: 'document', title: t, paras: proseParagraphs(w) })
  }
  p.addItem({ type: 'document', title: 'References', paras: [''] })
  const insSource = p.db.prepare(`INSERT INTO sources (id,kind,title,url,locator,file_path,notes,created_at,author,container,publisher,year)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
  for (let i = 1; i <= 200; i++) {
    insSource.run(randomUUID(), i % 5 === 0 ? 'book' : 'article', `On the ${ADJS[i % ADJS.length]} ${NOUNS[i % NOUNS.length]} (${i})`,
      i % 4 === 0 ? `https://doi.org/10.1000/${i}` : null, null, null, '', Date.now() - i * 100000,
      `${NAMES[i % NAMES.length]}, ${'ABCDEFG'[i % 7]}.`, i % 5 === 0 ? '' : `Journal of Estuarine Studies`,
      i % 5 === 0 ? 'University Press' : '', String(1990 + (i % 35)))
  }
  p.db.close()
  return p.root
}

// 5 ─ Nonfiction proposal ─────────────────────────────────────────────────────
function buildProposal() {
  const p = makeProject({ folder: 'Proposal', title: 'The Weather Makers of Fleet Street', type: 'nonfiction-book' })
  const prop = p.addItem({ type: 'folder', title: 'Proposal' })
  p.addItem({ parentId: prop, type: 'document', title: 'Overview', paras: proseParagraphs(700) })
  p.addItem({ parentId: prop, type: 'document', title: 'Author Bio', paras: proseParagraphs(220) })
  p.addItem({ parentId: prop, type: 'document', title: 'Comparable Titles', paras: proseParagraphs(420) })
  p.addItem({ parentId: prop, type: 'document', title: 'Market & Platform', paras: proseParagraphs(350) })
  p.addItem({
    parentId: prop, type: 'document', title: 'Annotated Table of Contents',
    paras: Array.from({ length: 12 }, (_, i) => `Chapter ${i + 1} — ${sentence()} ${sentence()}`)
  })
  const ms = p.addItem({ type: 'folder', title: 'Manuscript', special: true })
  const ch1 = p.addItem({ parentId: ms, type: 'folder', title: 'Chapter 1' })
  p.addItem({ parentId: ch1, type: 'document', title: 'Chapter 1 — draft', paras: proseParagraphs(4200) })
  const ch2 = p.addItem({ parentId: ms, type: 'folder', title: 'Chapter 2' })
  p.addItem({ parentId: ch2, type: 'document', title: 'Chapter 2 — draft', paras: proseParagraphs(3900) })
  p.addItem({ type: 'document', title: 'Bibliography', paras: [''] })
  p.db.close()
  return p.root
}

fs.mkdirSync(OUT, { recursive: true })
const built = [buildNovel(), buildFeature(), buildBrief(), buildDissertation(), buildProposal()]
for (const r of built) {
  const docs = fs.readdirSync(path.join(r, 'documents')).length
  console.log(`built ${path.basename(r)} (${docs} documents)`)
}
console.log(`\nOpen any of these from the Foolscap launcher: ${OUT}`)

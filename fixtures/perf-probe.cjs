/*
 * Storage-level performance probe against the generated fixtures.
 * Replicates the app's own algorithms (search.ts full scan; documents.ts parse)
 * so numbers reflect real main-process costs, without launching the UI.
 *
 *   ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron fixtures/perf-probe.cjs
 */
const fs = require('fs')
const path = require('path')
const Database = require('better-sqlite3')

const OUT = path.join(__dirname, 'out')

function extractPlainText(node, parts = []) {
  if (typeof node.text === 'string') parts.push(node.text)
  if (node.content) for (const c of node.content) extractPlainText(c, parts)
  return parts.join(' ')
}

function probe(projectDir) {
  const root = path.join(OUT, projectDir)
  const db = new Database(path.join(root, 'project.db'), { readonly: true })
  const t0 = performance.now()
  const rows = db.prepare("SELECT id, title FROM binder_items WHERE deleted IS NULL ORDER BY parent_id, position").all()
  const tList = performance.now() - t0

  // search.ts:searchProject equivalent — read + scan every document
  const docRows = db.prepare("SELECT id FROM binder_items WHERE type = 'document'").all()
  const q = 'harbor'
  const t1 = performance.now()
  let matches = 0
  let biggest = { ms: 0, id: '' }
  for (const { id } of docRows) {
    const p = path.join(root, 'documents', `${id}.json`)
    if (!fs.existsSync(p)) continue
    const td = performance.now()
    const body = extractPlainText(JSON.parse(fs.readFileSync(p, 'utf8')).doc).toLowerCase()
    const dms = performance.now() - td
    if (dms > biggest.ms) biggest = { ms: dms, id }
    for (let i = body.indexOf(q); i !== -1; i = body.indexOf(q, i + q.length)) matches++
  }
  const tSearch = performance.now() - t1
  console.log(
    `${projectDir.padEnd(28)} items=${String(rows.length).padStart(3)} ` +
    `binderList=${tList.toFixed(1)}ms  fullSearch("${q}")=${tSearch.toFixed(0)}ms (${matches} hits, ` +
    `slowest doc parse ${biggest.ms.toFixed(0)}ms)`
  )
  db.close()
}

for (const d of fs.readdirSync(OUT).filter((d) => d.endsWith('.writeproject'))) probe(d)

/*
 * Generate THIRD-PARTY-LICENSES.md — an attribution/notice file for every
 * open-source component distributed in the packaged app. Run after dependency
 * changes:  node scripts/gen-licenses.cjs
 *
 * "Distributed" = the production dependency tree (electron-builder ships it as
 * node_modules) UNION the runtime libraries Vite bundles into the renderer.
 * Build-only tooling (vite, typescript, eslint, electron-builder, @types) is not
 * distributed and is omitted. Dual-licensed packages elect their permissive
 * option (see ELECT). Not legal advice — an engineering inventory.
 */
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
// Runtime libraries imported into the renderer (bundled by Vite though they sit
// in devDependencies). Their transitive trees are included too.
const BUNDLED = [
  'react', 'react-dom', 'react-resizable-panels', 'zustand', '@tanstack/react-table',
  '@tiptap/core', '@tiptap/pm', '@tiptap/react', '@tiptap/starter-kit',
  '@tiptap/extension-underline', '@tiptap/extension-placeholder', '@tiptap/extension-character-count',
  '@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/modifiers', '@dnd-kit/utilities'
]
// Dual-licensed → the permissive option we use.
const ELECT = {
  jszip: 'MIT (elected from "MIT OR GPL-3.0-or-later")',
  dompurify: 'Apache-2.0 (elected from "MPL-2.0 OR Apache-2.0")'
}

function parseable(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.includes('node_modules'))
      .map((s) => path.resolve(s))
  } catch (e) {
    // npm ls exits non-zero on peer-dep quirks but still prints the tree.
    return (e.stdout || '')
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.includes('node_modules'))
      .map((s) => path.resolve(s))
  }
}

const shipped = new Set([
  ...parseable('npm ls --omit=dev --all --parseable'),
  ...parseable(`npm ls --all --parseable ${BUNDLED.join(' ')}`)
])

function walk(dir, out) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue
    if (e.name.startsWith('@')) {
      walk(path.join(dir, e.name), out)
      continue
    }
    const pd = path.join(dir, e.name)
    if (fs.existsSync(path.join(pd, 'package.json'))) out.push(pd)
    const nn = path.join(pd, 'node_modules')
    if (fs.existsSync(nn)) walk(nn, out)
  }
}

const licOf = (pj) =>
  typeof pj.license === 'string'
    ? pj.license
    : pj.license && pj.license.type
      ? pj.license.type
      : Array.isArray(pj.licenses)
        ? pj.licenses.map((l) => l.type || l).join(' OR ')
        : null
function findText(dir) {
  try {
    for (const f of fs.readdirSync(dir))
      if (/^(LICEN[CS]E|COPYING|NOTICE)(\..*)?$/i.test(f)) {
        const t = fs.readFileSync(path.join(dir, f), 'utf8')
        if (t.trim()) return t.trim()
      }
  } catch {
    /* none */
  }
  return null
}

const dirs = []
walk(path.join(ROOT, 'node_modules'), dirs)
const seen = new Map()
for (const d of dirs) {
  let pj
  try {
    pj = JSON.parse(fs.readFileSync(path.join(d, 'package.json'), 'utf8'))
  } catch {
    continue
  }
  if (!pj.name || !pj.version) continue
  const rec = {
    name: pj.name,
    version: pj.version,
    license: ELECT[pj.name] || licOf(pj),
    shipped: shipped.has(d),
    repo: (pj.repository && (pj.repository.url || pj.repository)) || pj.homepage || '',
    text: findText(d)
  }
  const k = pj.name + '@' + pj.version
  if (!seen.has(k)) seen.set(k, rec)
  else if (rec.shipped) seen.get(k).shipped = true
}
const ship = [...seen.values()].filter((r) => r.shipped).sort((a, b) => a.name.localeCompare(b.name))
const wn = fs.readFileSync(path.join(ROOT, 'node_modules/wordnet-db/LICENSE'), 'utf8').trim()

let md = `# Third-Party Licenses

Foolscap ("the Software") is distributed with the open-source components listed
below, each used under its own license. Keep this file packaged with any
distribution of the Software — reproducing these notices is the attribution the
permissive licenses require.

**License interpretation.** Every distributed component is under a *permissive*
license (MIT, ISC, BSD, Apache-2.0, BlueOak, 0BSD, and similar) or is
dual-licensed with a permissive option elected here:

- **jszip** — used under **MIT** (from "MIT OR GPL-3.0-or-later").
- **dompurify** — used under **Apache-2.0** (from "MPL-2.0 OR Apache-2.0").

No distributed component imposes a copyleft (GPL/LGPL/AGPL/MPL) obligation.
*(Engineering inventory, not legal advice — regenerate with \`node scripts/gen-licenses.cjs\`.)*

## WordNet data

The offline thesaurus (\`resources/thesaurus.txt\`) is derived from Princeton
University's **WordNet 3.0** lexical database, used under the WordNet License:

\`\`\`
${wn}
\`\`\`

---

## Distributed components (${ship.length})

| Component | Version | License |
|---|---|---|
`
for (const r of ship) md += `| ${r.name} | ${r.version} | ${r.license || 'see notice'} |\n`
md += '\n---\n\n## License texts\n\n'
const shown = new Set()
for (const r of ship) {
  if (shown.has(r.name)) continue
  shown.add(r.name)
  md += `### ${r.name} @ ${r.version}\n\nLicense: ${r.license || '(see below)'}\n`
  if (r.repo) md += `Source: ${String(r.repo).replace(/^git\+/, '').replace(/\.git$/, '')}\n`
  md += '\n' + (r.text ? '```\n' + r.text.slice(0, 6000) + '\n```\n\n' : `_(No license file bundled; used under its declared ${r.license || 'license'}.)_\n\n`)
}
fs.writeFileSync(path.join(ROOT, 'THIRD-PARTY-LICENSES.md'), md)
console.log(`THIRD-PARTY-LICENSES.md — ${ship.length} distributed components`)

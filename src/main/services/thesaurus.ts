import { existsSync } from 'fs'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { app } from 'electron'
import type { ThesaurusSense } from '@shared/api'

/**
 * Offline thesaurus backed by the WordNet-derived data file
 * (resources/thesaurus.txt, built at package time). One line per word —
 * "word<TAB>sensesJSON" — so we keep compact strings in memory and parse only
 * the looked-up entry.
 *
 * IMPORTANT: the file is loaded ASYNCHRONOUSLY, in yielding chunks. Keyboard
 * input in Electron is routed through the main process, so a synchronous read
 * of a ~16 MB file here (worsened by AV scanning on Windows) would freeze
 * typing app-wide. lookup() therefore never blocks — it returns nothing until
 * the data has finished loading in the background.
 */

type RawSense = [string, string, string[], string[]] // [pos, def, syns, ants]

let index: Map<string, string> | null = null
let loading: Promise<Map<string, string>> | null = null

function dataPath(): string | null {
  // Packaged (extraResources), dev build, and headless test (cwd) — first hit wins.
  const candidates = [
    join(process.resourcesPath, 'thesaurus.txt'),
    join(app.getAppPath(), 'resources', 'thesaurus.txt'),
    join(process.cwd(), 'resources', 'thesaurus.txt')
  ]
  return candidates.find((p) => existsSync(p)) ?? null
}

async function build(): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  try {
    const p = dataPath()
    if (p) {
      const text = await readFile(p, 'utf8')
      let start = 0
      let count = 0
      while (start < text.length) {
        let nl = text.indexOf('\n', start)
        if (nl === -1) nl = text.length
        const tab = text.indexOf('\t', start)
        if (tab > start && tab < nl) map.set(text.slice(start, tab), text.slice(tab + 1, nl))
        start = nl + 1
        // Yield to the event loop periodically so input routing never stalls.
        if ((++count & 8191) === 0) await new Promise<void>((r) => setImmediate(r))
      }
    }
  } catch {
    /* missing/unreadable data → empty thesaurus */
  }
  return map
}

/** Load the data off the main thread (async I/O + chunked parse). Idempotent. */
export async function load(): Promise<void> {
  if (index) return
  if (!loading) loading = build().then((m) => (index = m))
  await loading
}

/** Kick off loading ahead of first use (fire-and-forget; never blocks). */
export function warm(): void {
  void load()
}

/** Best-effort base forms when an exact entry isn't found (plurals, -ed, -ing). */
function morphedForms(w: string): string[] {
  const out: string[] = []
  if (w.endsWith('ies')) out.push(w.slice(0, -3) + 'y')
  if (w.endsWith('es')) out.push(w.slice(0, -2))
  if (w.endsWith('s')) out.push(w.slice(0, -1))
  if (w.endsWith('ed')) out.push(w.slice(0, -2), w.slice(0, -1))
  if (w.endsWith('ing')) out.push(w.slice(0, -3), w.slice(0, -3) + 'e')
  return out
}

/** Synonym/antonym senses for a word. Non-blocking: empty until data loads. */
export function lookup(word: string): ThesaurusSense[] {
  if (!index) {
    void load()
    return []
  }
  const w = word.trim().toLowerCase()
  if (!w) return []
  let raw = index.get(w)
  if (!raw) {
    for (const form of morphedForms(w)) {
      raw = index.get(form)
      if (raw) break
    }
  }
  if (!raw) return []
  try {
    return (JSON.parse(raw) as RawSense[]).map(([pos, def, syns, ants]) => ({ pos, def, syns, ants }))
  } catch {
    return []
  }
}

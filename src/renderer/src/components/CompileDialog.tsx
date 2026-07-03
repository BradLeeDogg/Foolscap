import { useEffect, useMemo, useState } from 'react'
import type { CompileEntry, CompilePreset, CompilePresetId, Source } from '@shared/types'
import { COMPILE_PRESETS, defaultPresetFor } from '@shared/presets'
import { BIBLIOGRAPHY_HEADINGS } from '@shared/citations'
import { runCommand } from '../lib/commands'
import { useStore } from '../store/useStore'
import { childrenOf, descendantDocuments } from '../lib/tree'

interface Props {
  onClose: () => void
}

// The citation page (Works Cited / References / Bibliography) — matched by title.
const CITATION_TITLES = new Set(['works cited', 'references', 'bibliography'])

type BibMode = 'sources' | 'document' | 'none'

/** The citation style implied by a compile preset (other presets default to MLA). */
const styleForPreset = (id: CompilePresetId): 'mla' | 'apa' | 'chicago' =>
  id === 'apa' ? 'apa' : id === 'chicago' ? 'chicago' : 'mla'

function buildEntries(
  tree: Parameters<typeof childrenOf>[0],
  rootId: string | null
): CompileEntry[] {
  const entries: CompileEntry[] = []
  for (const child of childrenOf(tree, rootId)) {
    if (child.type === 'folder') {
      entries.push({ heading: child.title })
      for (const d of descendantDocuments(tree, child.id)) entries.push({ docId: d.id, title: d.title })
    } else {
      entries.push({ docId: child.id, title: child.title })
    }
  }
  return entries
}

export default function CompileDialog({ onClose }: Props): JSX.Element {
  const meta = useStore((s) => s.meta)
  const tree = useStore((s) => s.tree)

  const topFolders = useMemo(() => childrenOf(tree, null).filter((c) => c.type === 'folder'), [tree])
  const defaultRoot = topFolders.find((f) => f.isSpecial)?.id ?? null

  const [rootId, setRootId] = useState<string | null>(defaultRoot)
  const [presetId, setPresetId] = useState<CompilePresetId>(
    meta ? defaultPresetFor(meta.type) : 'shunn'
  )
  const [preset, setPreset] = useState<CompilePreset>(
    COMPILE_PRESETS[meta ? defaultPresetFor(meta.type) : 'shunn']
  )

  const [title, setTitle] = useState(meta?.title ?? '')
  const [author, setAuthor] = useState('')
  const [contact, setContact] = useState('')
  const [keyword, setKeyword] = useState('')
  const [byline, setByline] = useState('')
  const [dateline, setDateline] = useState('')
  const [includeFactCheck, setIncludeFactCheck] = useState(!!meta?.settings.factCheckEnabled)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const choosePreset = (id: CompilePresetId): void => {
    setPresetId(id)
    setPreset(COMPILE_PRESETS[id])
  }
  const patch = (p: Partial<CompilePreset>): void => setPreset((cur) => ({ ...cur, ...p }))

  // The bibliography is built from the writer's actual Sources by default, so it
  // always reflects the real source list — never a stale placeholder page.
  const bibStyle = styleForPreset(presetId)
  const [sources, setSources] = useState<Source[]>([])
  const [bibMode, setBibMode] = useState<BibMode>('none')

  const citationDoc = useMemo(
    () => tree.find((t) => t.type === 'document' && CITATION_TITLES.has(t.title.trim().toLowerCase())),
    [tree]
  )
  const citationDocIds = useMemo(
    () =>
      new Set(
        tree
          .filter((t) => t.type === 'document' && CITATION_TITLES.has(t.title.trim().toLowerCase()))
          .map((t) => t.id)
      ),
    [tree]
  )

  useEffect(() => {
    void window.api.source.list().then((list) => {
      setSources(list)
      setBibMode(list.length ? 'sources' : citationDoc ? 'document' : 'none')
    })
    void window.api.factcheck.counts().then(setFactCounts)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fact-check gate: the one moment the outstanding count matters is export.
  const [factCounts, setFactCounts] = useState<{
    total: number
    verified: number
    needsSourcing: number
    disputed: number
  } | null>(null)
  // The last successful export, for one-click Open / Show in folder.
  const [lastExport, setLastExport] = useState<string | null>(null)

  const entries = useMemo(() => {
    let base = buildEntries(tree, rootId)
    if (bibMode === 'document' && citationDoc) {
      // Use the stored citation page, page-broken, wherever it sits in the binder.
      if (!base.some((e) => e.docId === citationDoc.id)) base.push({ docId: citationDoc.id, pageBreak: true })
      else base = base.map((e) => (e.docId === citationDoc.id ? { ...e, pageBreak: true } : e))
    } else {
      // 'sources' / 'none': drop any stored citation page (the generated one, if
      // any, is appended by Compile) so it never duplicates or goes stale.
      base = base.filter((e) => !e.docId || !citationDocIds.has(e.docId))
    }
    return base
  }, [tree, rootId, bibMode, citationDoc, citationDocIds])
  const docCount = entries.filter((e) => e.docId).length

  const request = (): Parameters<typeof window.api.compile.docx>[0] => ({
    entries,
    preset,
    meta: { title, author, contact, keyword, byline, dateline },
    includeFactCheck,
    bibliography: bibMode === 'sources' && sources.length ? { style: bibStyle, sources } : null
  })

  const runExport = async (
    label: string,
    fn: () => Promise<{ path: string | null; note?: string }>
  ): Promise<void> => {
    setBusy(true)
    setStatus(`Compiling ${label}…`)
    setLastExport(null)
    try {
      const { path, note } = await fn()
      setStatus(path ? `Exported ${path}${note ?? ''}` : null)
      setLastExport(path)
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setBusy(false)
    }
  }

  const exportDocx = (): Promise<void> =>
    runExport('DOCX', async () => {
      const res = await window.api.compile.docx(request())
      return { path: res?.docxPath ?? null, note: res?.packetPath ? ' (+ fact-check packet)' : '' }
    })
  const exportPdf = (): Promise<void> =>
    runExport('PDF', async () => ({ path: (await window.api.compile.pdf(request()))?.pdfPath ?? null }))
  const exportEpub = (): Promise<void> =>
    runExport('ePub', async () => ({ path: (await window.api.compile.epub(request()))?.epubPath ?? null }))
  const exportPlain = (kind: 'markdown' | 'text'): Promise<void> =>
    runExport(kind === 'markdown' ? 'Markdown' : 'plain text', async () => ({
      path: (await window.api.compile[kind](request()))?.path ?? null
    }))

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal compile" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Compile &amp; Export</h2>
          <button className="icon" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="compile-grid">
          <section>
            <h4>Scope</h4>
            <select value={rootId ?? ''} onChange={(e) => setRootId(e.target.value || null)}>
              <option value="">Whole project</option>
              {topFolders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.title}
                </option>
              ))}
            </select>
            <p className="muted compile-count">{docCount} document(s) in binder order</p>

            <h4>Preset</h4>
            <select value={presetId} onChange={(e) => choosePreset(e.target.value as CompilePresetId)}>
              {Object.values(COMPILE_PRESETS).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            <div className="compile-fields">
              <label>
                Font
                <input value={preset.font} onChange={(e) => patch({ font: e.target.value })} />
              </label>
              <label>
                Size (pt)
                <input
                  type="number"
                  value={preset.fontSizePt}
                  onChange={(e) => patch({ fontSizePt: Number(e.target.value) || 12 })}
                />
              </label>
              <label>
                Line spacing
                <select
                  value={preset.lineSpacing}
                  onChange={(e) => patch({ lineSpacing: Number(e.target.value) })}
                >
                  <option value={1}>Single</option>
                  <option value={1.5}>1.5</option>
                  <option value={2}>Double</option>
                </select>
              </label>
              <label>
                Margin (in)
                <input
                  type="number"
                  step="0.25"
                  value={preset.marginInches}
                  onChange={(e) => patch({ marginInches: Number(e.target.value) || 1 })}
                />
              </label>
              <label>
                Indent (in)
                <input
                  type="number"
                  step="0.1"
                  value={preset.firstLineIndentInches}
                  onChange={(e) => patch({ firstLineIndentInches: Number(e.target.value) || 0 })}
                />
              </label>
              {(COMPILE_PRESETS[presetId].sceneBreak !== '' || preset.sceneBreak !== '') && (
                <label>
                  Scene break
                  <input value={preset.sceneBreak} onChange={(e) => patch({ sceneBreak: e.target.value })} />
                </label>
              )}
              <label className="compile-check">
                <input
                  type="checkbox"
                  checked={preset.titlePage}
                  onChange={(e) => patch({ titlePage: e.target.checked })}
                />
                Title page
              </label>
              <label className="compile-check">
                <input
                  type="checkbox"
                  checked={preset.runningHeader}
                  onChange={(e) => patch({ runningHeader: e.target.checked })}
                />
                Running header
              </label>
              <label className="compile-check">
                <input
                  type="checkbox"
                  checked={preset.chapterHeadings}
                  onChange={(e) => patch({ chapterHeadings: e.target.checked })}
                />
                Chapter headings
              </label>
            </div>
          </section>

          <section>
            <h4>Front matter</h4>
            <label className="compile-stack">
              Title
              <input value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="compile-stack">
              Author
              <input value={author} onChange={(e) => setAuthor(e.target.value)} />
            </label>
            {preset.titlePage && (
              <label className="compile-stack">
                Contact (for title page)
                <textarea value={contact} onChange={(e) => setContact(e.target.value)} rows={3} />
              </label>
            )}
            {preset.runningHeader && (
              <label className="compile-stack">
                Running-header keyword
                <input value={keyword} onChange={(e) => setKeyword(e.target.value)} />
              </label>
            )}
            {preset.bylineDateline && (
              <>
                <label className="compile-stack">
                  Byline
                  <input value={byline} onChange={(e) => setByline(e.target.value)} />
                </label>
                <label className="compile-stack">
                  Dateline
                  <input value={dateline} onChange={(e) => setDateline(e.target.value)} />
                </label>
              </>
            )}
            <label className="compile-check">
              <input
                type="checkbox"
                checked={includeFactCheck}
                onChange={(e) => setIncludeFactCheck(e.target.checked)}
              />
              Export fact-check packet alongside
            </label>
            <label className="compile-stack">
              Bibliography (final page)
              <select value={bibMode} onChange={(e) => setBibMode(e.target.value as BibMode)}>
                <option value="sources" disabled={!sources.length}>
                  {BIBLIOGRAPHY_HEADINGS[bibStyle]} from your sources ({sources.length})
                </option>
                {citationDoc && <option value="document">Use the “{citationDoc.title}” page as written</option>}
                <option value="none">Don’t include</option>
              </select>
            </label>
            {bibMode === 'sources' && (
              <p className="muted compile-count">
                Generated in {bibStyle.toUpperCase()} — alphabetized, hanging indent.
              </p>
            )}
          </section>
        </div>

        {factCounts && factCounts.total > 0 && (
          <div className={`compile-factline ${factCounts.verified === factCounts.total ? 'ok' : 'warn'}`}>
            {factCounts.verified === factCounts.total ? (
              <>✓ All {factCounts.total} claims verified</>
            ) : (
              <>
                ⚠ {factCounts.total - factCounts.verified} of {factCounts.total} claims outstanding (
                {factCounts.needsSourcing} need sourcing, {factCounts.disputed} disputed)
                <button
                  className="link"
                  onClick={() => {
                    onClose()
                    runCommand('panel-factcheck')
                  }}
                >
                  View
                </button>
              </>
            )}
          </div>
        )}

        <div className="modal-foot">
          {status && <span className="compile-status muted">{status}</span>}
          {lastExport && (
            <>
              <button onClick={() => void window.api.app.openPath(lastExport)}>Open</button>
              <button onClick={() => void window.api.app.revealPath(lastExport)}>Show in folder</button>
            </>
          )}
          <span className="spacer" />
          <button onClick={onClose}>Close</button>
          <button disabled={busy || docCount === 0} onClick={() => exportPlain('text')}>
            Plain text
          </button>
          <button disabled={busy || docCount === 0} onClick={() => exportPlain('markdown')}>
            Markdown
          </button>
          <button disabled={busy || docCount === 0} onClick={exportEpub}>
            Export ePub
          </button>
          <button disabled={busy || docCount === 0} onClick={exportPdf}>
            Export PDF
          </button>
          <button className="primary" disabled={busy || docCount === 0} onClick={exportDocx}>
            Export DOCX
          </button>
        </div>
      </div>
    </div>
  )
}

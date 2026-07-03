import { useEffect, useRef, useState } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { flushAllDirty, useStore } from '../store/useStore'
import { allDocuments } from '../lib/tree'
import { onCommand } from '../lib/commands'
import { redoLast, undoLast } from '../lib/undo'
import Binder from './Binder'
import Editor from './Editor'
import SplitPane from './SplitPane'
import SnapshotsPanel from './SnapshotsPanel'
import TargetsPanel from './TargetsPanel'
import FindPanel from './FindPanel'
import Inspector from './Inspector'
import SourcesPanel from './SourcesPanel'
import FactCheckPanel from './FactCheckPanel'
import TranscriptsPanel from './TranscriptsPanel'
import ProofreaderPanel from './ProofreaderPanel'
import AnalysisPanel from './AnalysisPanel'
import ResearchViewer from './ResearchViewer'
import CompileDialog from './CompileDialog'
import SettingsDialog from './SettingsDialog'
import CompositionMode from './CompositionMode'
import QuickOpen from './QuickOpen'
import CommandPalette from './CommandPalette'
import HelpDialog from './HelpDialog'

/** Transient store-driven toast (undo hints, import summaries). */
function StoreToast(): JSX.Element | null {
  const toast = useStore((s) => s.toast)
  return toast ? <div className="toast">{toast}</div> : null
}

/** Persistent, self-clearing banner while any editor can't reach the disk. */
function SaveErrorBanner(): JSX.Element | null {
  const saveError = useStore((s) => s.saveError)
  if (!saveError) return null
  return (
    <div className="save-error-banner" role="alert">
      Your last change couldn’t be saved to disk ({saveError}). Retrying automatically —
      don’t close the app until this clears.
    </div>
  )
}

function saveLabel(state: string, at: number | null): string {
  switch (state) {
    case 'saving':
      return 'Saving…'
    case 'saved':
      return at ? `Saved ${new Date(at).toLocaleTimeString()}` : 'Saved'
    case 'error':
      return 'Save failed'
    default:
      return ''
  }
}

export default function Workspace(): JSX.Element {
  const meta = useStore((s) => s.meta)
  const tree = useStore((s) => s.tree)
  const selectedId = useStore((s) => s.selectedId)
  const closeProject = useStore((s) => s.closeProject)
  const saveState = useStore((s) => s.saveState)
  const lastSavedAt = useStore((s) => s.lastSavedAt)
  const docWordCount = useStore((s) => s.docWordCount)
  const selectionWordCount = useStore((s) => s.selectionWordCount)
  const splitId = useStore((s) => s.splitId)
  const viewSourceId = useStore((s) => s.viewSourceId)
  const setMeta = useStore((s) => s.setMeta)
  const setSplit = useStore((s) => s.setSplit)
  const composition = useStore((s) => s.composition)
  const setComposition = useStore((s) => s.setComposition)
  const setFolderView = useStore((s) => s.setFolderView)
  const select = useStore((s) => s.select)

  const [showSnapshots, setShowSnapshots] = useState(false)
  const [showTargets, setShowTargets] = useState(false)
  const [showFind, setShowFind] = useState(false)
  const [showInspector, setShowInspector] = useState(false)
  const [showSources, setShowSources] = useState(false)
  // Journalism types open the fact-check packet by default.
  const [showFactCheck, setShowFactCheck] = useState(() => !!meta?.settings.factCheckEnabled)
  const [showTranscripts, setShowTranscripts] = useState(false)
  const [showProof, setShowProof] = useState(false)
  const [showAnalysis, setShowAnalysis] = useState(false)
  const [showCompile, setShowCompile] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showQuickOpen, setShowQuickOpen] = useState(false)
  const [showPalette, setShowPalette] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [backupMsg, setBackupMsg] = useState<string | null>(null)

  // First-run: show the welcome/help sheet once.
  useEffect(() => {
    if (!localStorage.getItem('wp-onboarded-v1')) {
      setShowHelp(true)
      localStorage.setItem('wp-onboarded-v1', '1')
    }
  }, [])

  // "Where was I": one quiet line on open when resuming after a real gap.
  const [resume, setResume] = useState<string | null>(null)
  useEffect(() => {
    const s = useStore.getState()
    const sel = s.tree.find((t) => t.id === s.selectedId)
    if (!sel) return
    const gapMs = Date.now() - sel.updatedAt
    if (gapMs < 24 * 3600_000) return
    const days = Math.round(gapMs / 86_400_000)
    const when = days >= 14 ? `${Math.round(days / 7)} weeks ago` : days >= 2 ? `${days} days ago` : 'yesterday'
    setResume(`Resuming “${sel.title}” · last edited ${when}`)
    const t = setTimeout(() => setResume(null), 10_000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta?.id])

  // Panels close in reverse open order via Esc; track that order here.
  const panelStack = useRef<string[]>([])
  const panelSetters: Record<string, [boolean, (v: boolean) => void]> = {
    find: [showFind, setShowFind],
    targets: [showTargets, setShowTargets],
    inspector: [showInspector, setShowInspector],
    sources: [showSources, setShowSources],
    factcheck: [showFactCheck, setShowFactCheck],
    snapshots: [showSnapshots, setShowSnapshots],
    transcripts: [showTranscripts, setShowTranscripts],
    proofread: [showProof, setShowProof],
    analysis: [showAnalysis, setShowAnalysis]
  }
  const panelSettersRef = useRef(panelSetters)
  panelSettersRef.current = panelSetters
  // The right-hand "item detail" panels share one slot — opening one closes the
  // others so the editor is never crushed by a stack (the calm ethos). Find is
  // the search tool and may coexist.
  const EXCLUSIVE = ['inspector', 'sources', 'factcheck', 'snapshots', 'transcripts', 'proofread', 'analysis', 'targets']
  const togglePanel = (key: string, force?: boolean): void => {
    const [open, set] = panelSettersRef.current[key]!
    const next = force ?? !open
    if (next && EXCLUSIVE.includes(key)) {
      for (const other of EXCLUSIVE) {
        if (other !== key && panelSettersRef.current[other]?.[0]) {
          panelSettersRef.current[other][1](false)
          panelStack.current = panelStack.current.filter((k) => k !== other)
        }
      }
    }
    set(next)
    panelStack.current = panelStack.current.filter((k) => k !== key)
    if (next) panelStack.current.push(key)
  }

  // Ctrl+S: flush pending saves, acknowledge, and snapshot if anything changed.
  const saveNow = async (): Promise<void> => {
    await flushAllDirty()
    const state = useStore.getState()
    state.setSaveState('saved', Date.now())
    const sel = state.tree.find((t) => t.id === state.selectedId)
    if (sel?.type === 'document') {
      const snap = await window.api.snapshot.createIfChanged(sel.id, 'Ctrl+S')
      state.showToast(snap ? 'Saved ✓ — snapshot taken' : 'Saved ✓ (no changes since last snapshot)')
    } else {
      state.showToast('Saved ✓')
    }
  }

  // Workspace-owned menu/shortcut commands (ref keeps handler closures fresh).
  const cmdRef = useRef<(cmd: string) => void>(() => {})
  cmdRef.current = (cmd) => {
    if (useStore.getState().composition && cmd !== 'compose') return
    switch (cmd) {
      case 'quick-open':
        setShowQuickOpen(true)
        break
      case 'compose':
        setComposition(true)
        break
      case 'compile':
        setShowCompile(true)
        break
      case 'snapshot':
        togglePanel('snapshots', true)
        break
      case 'save-now':
        void saveNow()
        break
      case 'split-view':
        toggleSplit()
        break
      case 'view-corkboard':
        openCorkboard()
        break
      case 'view-outliner':
        setFolderView('outliner')
        break
      case 'view-scrivenings':
        setFolderView('scrivenings')
        break
      case 'command-palette':
        setShowPalette(true)
        break
      case 'help':
        setShowHelp(true)
        break
      case 'panel-inspector':
        togglePanel('inspector')
        break
      case 'panel-sources':
        togglePanel('sources')
        break
      case 'panel-factcheck':
        togglePanel('factcheck')
        break
      case 'panel-transcripts':
        togglePanel('transcripts')
        break
      case 'panel-proofread':
        togglePanel('proofread')
        break
      case 'panel-analysis':
        togglePanel('analysis')
        break
      case 'panel-targets':
        togglePanel('targets')
        break
      case 'open-settings':
        setShowSettings(true)
        break
      case 'backup-now':
        void handleBackup()
        break
      case 'toggle-theme': {
        const next = useStore.getState().meta?.settings.theme === 'dark' ? 'paper' : 'dark'
        void window.api.project.updateSettings({ theme: next }).then(setMeta)
        break
      }
    }
  }
  useEffect(() => onCommand((cmd) => cmdRef.current(cmd)), [])

  // Esc closes the most recently opened side panel (modals handle their own
  // Esc and stop propagation; composition owns Esc entirely).
  useEffect(() => {
    const onEsc = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      const s = useStore.getState()
      if (s.composition) return
      // Any modal open → its own handler wins.
      if (document.querySelector('.modal-backdrop')) return
      const stack = panelStack.current
      for (let i = stack.length - 1; i >= 0; i--) {
        const key = stack[i]!
        const entry = panelSettersRef.current[key]
        if (entry?.[0]) {
          entry[1](false)
          panelStack.current = stack.filter((k) => k !== key)
          e.preventDefault()
          return
        }
      }
    }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [])

  // Structural undo: Ctrl/⌘-Z outside a text field reverses binder/metadata
  // ops (inside a field, the native/ProseMirror history keeps the keystroke).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return
      e.preventDefault()
      const done = e.shiftKey ? redoLast() : undoLast()
      void done.then((label) => {
        if (label) useStore.getState().showToast(`${e.shiftKey ? 'Redid' : 'Undid'}: ${label}`)
      })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Keep Chromium's spell-check dictionary in sync with the project's dialect.
  useEffect(() => {
    void window.api.spellcheck.setDialect(meta?.settings.english === 'british' ? 'british' : 'american')
  }, [meta?.settings.english])

  const handleClose = async (): Promise<void> => {
    // Drain every editor's pending autosave BEFORE the DB closes — otherwise
    // the last debounce-window of typing dies with the project handle.
    await flushAllDirty()
    await window.api.project.close()
    closeProject()
  }

  const handleBackup = async (): Promise<void> => {
    setBackupMsg('Backing up…')
    try {
      const info = await window.api.backup.runNow()
      setBackupMsg(`Backed up · ${info.fileName}`)
    } catch {
      setBackupMsg('Backup failed')
    }
    setTimeout(() => setBackupMsg(null), 4000)
  }

  const toggleSplit = (): void => {
    if (splitId) {
      setSplit(null)
      return
    }
    const selected = tree.find((t) => t.id === selectedId)
    const target = selected?.type === 'document' ? selected.id : allDocuments(tree)[0]?.id ?? null
    setSplit(target)
  }

  // Open the corkboard for the most relevant folder: the selection if it's a
  // folder, else its parent folder, else the first top-level folder.
  const openCorkboard = (): void => {
    const sel = tree.find((t) => t.id === selectedId)
    const folderId =
      sel?.type === 'folder'
        ? sel.id
        : sel?.parentId ??
          tree.find((t) => t.type === 'folder' && t.parentId === null)?.id ??
          tree.find((t) => t.type === 'folder')?.id ??
          null
    if (!folderId) return
    select(folderId)
    setFolderView('corkboard')
  }

  return (
    <div className="workspace">
      <header className="topbar">
        <div className="topbar-left">
          <button className="link" onClick={handleClose} title="Close project">
            ‹ Projects
          </button>
          <span className="project-title">{meta?.title}</span>
        </div>
        <div className="topbar-right">
          <span className="wordcount">
            {docWordCount.toLocaleString()} words
            {selectionWordCount > 0 && ` · ${selectionWordCount.toLocaleString()} selected`}
          </span>
          <span className={`savestate ${saveState}`}>{saveLabel(saveState, lastSavedAt)}</span>
          <span className="sep" />
          <button className={showFind ? 'on' : ''} onClick={() => togglePanel('find')}>
            Find
          </button>
          <button onClick={() => setShowQuickOpen(true)} title="Quick open (Ctrl/⌘ P)">
            Go to
          </button>
          <button className={splitId ? 'on' : ''} onClick={toggleSplit}>
            Split
          </button>
          <button onClick={() => setComposition(true)}>Compose</button>
          <button onClick={openCorkboard} title="Index cards for a folder">
            Corkboard
          </button>
          <button className={showInspector ? 'on' : ''} onClick={() => togglePanel('inspector')}>
            Inspector
          </button>
          <button className={showSources ? 'on' : ''} onClick={() => togglePanel('sources')}>
            Sources
          </button>
          <button className={showFactCheck ? 'on' : ''} onClick={() => togglePanel('factcheck')}>
            Fact-check
          </button>
          <button className={showTranscripts ? 'on' : ''} onClick={() => togglePanel('transcripts')}>
            Transcripts
          </button>
          <button className={showProof ? 'on' : ''} onClick={() => togglePanel('proofread')}>
            Proofread
          </button>
          <button className={showTargets ? 'on' : ''} onClick={() => togglePanel('targets')}>
            Targets
          </button>
          <button className={showSnapshots ? 'on' : ''} onClick={() => togglePanel('snapshots')}>
            Snapshots
          </button>
          <button onClick={handleBackup}>Back up now</button>
          <button title="Settings" onClick={() => setShowSettings(true)}>
            ⚙
          </button>
          <span className="sep" />
          <button className="primary topbar-compile" onClick={() => setShowCompile(true)}>
            Compile
          </button>
        </div>
      </header>

      {backupMsg && <div className="toast">{backupMsg}</div>}
      <StoreToast />
      <SaveErrorBanner />
      {resume && (
        <div className="resume-line">
          {resume}
          <button className="icon" aria-label="Dismiss" onClick={() => setResume(null)}>
            ×
          </button>
        </div>
      )}

      <div className="workspace-body">
        <PanelGroup direction="horizontal" autoSaveId="wp-main-split">
          <Panel id="binder" order={1} defaultSize={22} minSize={14} maxSize={40} className="pane">
            <Binder />
          </Panel>
          <PanelResizeHandle className="resize-handle" />
          <Panel id="editor" order={2} minSize={25} className="pane">
            <Editor />
          </Panel>
          {splitId && (
            <>
              <PanelResizeHandle className="resize-handle" />
              <Panel id="split" order={3} defaultSize={38} minSize={20} className="pane">
                <SplitPane />
              </Panel>
            </>
          )}
          {showFind && (
            <>
              <PanelResizeHandle className="resize-handle" />
              <Panel id="find" order={4} defaultSize={24} minSize={16} maxSize={40} className="pane">
                <FindPanel onClose={() => setShowFind(false)} />
              </Panel>
            </>
          )}
          {showTargets && (
            <>
              <PanelResizeHandle className="resize-handle" />
              <Panel id="targets" order={5} defaultSize={22} minSize={16} maxSize={38} className="pane">
                <TargetsPanel onClose={() => setShowTargets(false)} />
              </Panel>
            </>
          )}
          {showInspector && (
            <>
              <PanelResizeHandle className="resize-handle" />
              <Panel id="inspector" order={6} defaultSize={24} minSize={18} maxSize={42} className="pane">
                <Inspector onClose={() => setShowInspector(false)} />
              </Panel>
            </>
          )}
          {showSources && (
            <>
              <PanelResizeHandle className="resize-handle" />
              <Panel id="sources" order={7} defaultSize={26} minSize={18} maxSize={44} className="pane">
                <SourcesPanel onClose={() => setShowSources(false)} />
              </Panel>
            </>
          )}
          {showFactCheck && (
            <>
              <PanelResizeHandle className="resize-handle" />
              <Panel id="factcheck" order={8} defaultSize={28} minSize={20} maxSize={46} className="pane">
                <FactCheckPanel onClose={() => setShowFactCheck(false)} />
              </Panel>
            </>
          )}
          {showSnapshots && (
            <>
              <PanelResizeHandle className="resize-handle" />
              <Panel id="snapshots" order={9} defaultSize={24} minSize={16} maxSize={40} className="pane">
                <SnapshotsPanel onClose={() => setShowSnapshots(false)} />
              </Panel>
            </>
          )}
          {showTranscripts && (
            <>
              <PanelResizeHandle className="resize-handle" />
              <Panel id="transcripts" order={10} defaultSize={30} minSize={22} maxSize={48} className="pane">
                <TranscriptsPanel onClose={() => setShowTranscripts(false)} />
              </Panel>
            </>
          )}
          {showProof && (
            <>
              <PanelResizeHandle className="resize-handle" />
              <Panel id="proofread" order={11} defaultSize={26} minSize={18} maxSize={42} className="pane">
                <ProofreaderPanel onClose={() => setShowProof(false)} />
              </Panel>
            </>
          )}
          {showAnalysis && (
            <>
              <PanelResizeHandle className="resize-handle" />
              <Panel id="analysis" order={13} defaultSize={24} minSize={18} maxSize={40} className="pane">
                <AnalysisPanel onClose={() => setShowAnalysis(false)} />
              </Panel>
            </>
          )}
          {viewSourceId && (
            <>
              <PanelResizeHandle className="resize-handle" />
              <Panel id="research" order={12} defaultSize={34} minSize={22} maxSize={55} className="pane">
                <ResearchViewer />
              </Panel>
            </>
          )}
        </PanelGroup>
      </div>

      {composition && <CompositionMode />}
      {showCompile && <CompileDialog onClose={() => setShowCompile(false)} />}
      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}
      {showQuickOpen && <QuickOpen onClose={() => setShowQuickOpen(false)} />}
      {showPalette && <CommandPalette onClose={() => setShowPalette(false)} />}
      {showHelp && <HelpDialog onClose={() => setShowHelp(false)} />}
    </div>
  )
}

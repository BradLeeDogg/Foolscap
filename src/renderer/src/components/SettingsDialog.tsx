import { useEffect, useState } from 'react'
import type { ProjectSettings } from '@shared/types'
import { OVERLAYS_BY_TYPE, OVERLAY_LABELS, type StructureOverlay } from '@shared/api'
import { useStore } from '../store/useStore'
import { playKeyClick } from '../lib/typewriter'

interface Props {
  onClose: () => void
}

/** "Last backup 12m ago · restore from the Snapshots panel." */
function LastBackupNote(): JSX.Element | null {
  const [note, setNote] = useState<string | null>(null)
  useEffect(() => {
    void window.api.backup.list().then((list) => {
      if (!list.length) return setNote('No backups yet — they run automatically while you write.')
      const mins = Math.max(0, Math.round((Date.now() - list[0]!.createdAt) / 60000))
      setNote(
        `Last backup ${mins === 0 ? 'moments' : `${mins} min`} ago (${list.length} kept) · restore from the Snapshots panel.`
      )
    })
  }, [])
  return note ? <p className="muted settings-backup-note">{note}</p> : null
}

/** Adjust the working manuscript defaults + behavior. Output presets are separate. */
export default function SettingsDialog({ onClose }: Props): JSX.Element {
  const meta = useStore((s) => s.meta)
  const setMeta = useStore((s) => s.setMeta)
  const setTree = useStore((s) => s.setTree)
  const select = useStore((s) => s.select)
  const [overlay, setOverlay] = useState<StructureOverlay | ''>('')
  const [adding, setAdding] = useState(false)
  const [added, setAdded] = useState(false)
  if (!meta) return <></>
  const s = meta.settings
  const m = s.manuscript
  const overlaysForType = (OVERLAYS_BY_TYPE[meta.type] ?? []) as StructureOverlay[]

  const addOutline = async (): Promise<void> => {
    if (!overlay) return
    setAdding(true)
    try {
      const { folderId, tree } = await window.api.binder.applyOverlay(overlay)
      setTree(tree)
      select(folderId)
      setAdded(true)
    } finally {
      setAdding(false)
    }
  }

  const save = async (patch: Partial<ProjectSettings>): Promise<void> => {
    setMeta(await window.api.project.updateSettings(patch))
  }
  const saveManuscript = (patch: Partial<typeof m>): Promise<void> => save({ manuscript: { ...m, ...patch } })

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal settings" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Settings</h2>
          <button className="icon" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="settings-body">
          <h4>Manuscript “paper” (working view)</h4>
          <div className="compile-fields">
            <label>
              Font
              <input defaultValue={m.fontFamily} onBlur={(e) => saveManuscript({ fontFamily: e.target.value })} />
            </label>
            <label>
              Size (pt)
              <input
                type="number"
                defaultValue={m.fontSizePt}
                onBlur={(e) => saveManuscript({ fontSizePt: Number(e.target.value) || 12 })}
              />
            </label>
            <label>
              Line spacing
              <select value={m.lineSpacing} onChange={(e) => saveManuscript({ lineSpacing: Number(e.target.value) })}>
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
                defaultValue={m.marginInches}
                onBlur={(e) => saveManuscript({ marginInches: Number(e.target.value) || 1 })}
              />
            </label>
            <label>
              Page size
              <select
                value={m.pageSize}
                onChange={(e) => saveManuscript({ pageSize: e.target.value as 'us-letter' | 'a4' })}
              >
                <option value="us-letter">US Letter</option>
                <option value="a4">A4</option>
              </select>
            </label>
          </div>
          <p className="muted settings-note">
            These change the editor’s paper only. Submission layouts live in Compile presets.
          </p>

          <h4>Behavior</h4>
          <div className="compile-fields">
            <label>
              Theme
              <select
                value={s.theme}
                onChange={(e) => save({ theme: e.target.value as 'paper' | 'dark' })}
              >
                <option value="paper">Paper (light)</option>
                <option value="dark">Dark</option>
              </select>
            </label>
          </div>
          <label className="compile-check">
            <input
              type="checkbox"
              checked={s.typewriterSound}
              onChange={(e) => {
                void save({ typewriterSound: e.target.checked })
                if (e.target.checked) playKeyClick() // instant confirmation + unlock audio
              }}
            />
            Typewriter keystroke sound <span className="muted">— plays a sample when enabled</span>
          </label>
          <label className="compile-check">
            <input
              type="checkbox"
              checked={s.smartQuotes !== false}
              onChange={(e) => save({ smartQuotes: e.target.checked })}
            />
            Smart quotes <span className="muted">— curly “quotes” and apostrophes as you type</span>
          </label>
          <div className="compile-fields">
            <label>
              Autosave delay (ms)
              <input
                type="number"
                step="100"
                defaultValue={s.autosaveDebounceMs}
                onBlur={(e) => save({ autosaveDebounceMs: Math.max(200, Number(e.target.value) || 800) })}
              />
            </label>
            <label>
              Backup every (min)
              <input
                type="number"
                defaultValue={Math.round(s.backupIntervalMs / 60000)}
                onBlur={(e) =>
                  save({ backupIntervalMs: Math.max(1, Number(e.target.value) || 15) * 60000 })
                }
              />
            </label>
            <label>
              Keep backups
              <input
                type="number"
                defaultValue={s.maxAutomaticBackups}
                onBlur={(e) => save({ maxAutomaticBackups: Math.max(1, Number(e.target.value) || 25) })}
              />
            </label>
          </div>
          <LastBackupNote />

          {overlaysForType.length > 0 && (
            <>
              <h4>Structure</h4>
              <p className="muted settings-note">
                Add a planning outline of placeholder sections to this project. It appears as
                an “Outline — …” folder you can rearrange or delete.
              </p>
              <div className="location-row">
                <select
                  value={overlay}
                  onChange={(e) => {
                    setOverlay(e.target.value as StructureOverlay | '')
                    setAdded(false)
                  }}
                >
                  <option value="">Choose an outline…</option>
                  {overlaysForType.map((v) => (
                    <option key={v} value={v}>
                      {OVERLAY_LABELS[v]}
                    </option>
                  ))}
                </select>
                <button onClick={addOutline} disabled={!overlay || adding}>
                  {adding ? 'Adding…' : 'Add outline'}
                </button>
                {added && <span className="muted">Added ✓</span>}
              </div>
            </>
          )}
        </div>

        <div className="modal-foot">
          <span className="spacer" />
          <button className="primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

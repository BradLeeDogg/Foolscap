import type { ProjectSettings } from '@shared/types'
import { useStore } from '../store/useStore'

interface Props {
  onClose: () => void
}

/** Adjust the working manuscript defaults + behavior. Output presets are separate. */
export default function SettingsDialog({ onClose }: Props): JSX.Element {
  const meta = useStore((s) => s.meta)
  const setMeta = useStore((s) => s.setMeta)
  if (!meta) return <></>
  const s = meta.settings
  const m = s.manuscript

  const save = async (patch: Partial<ProjectSettings>): Promise<void> => {
    setMeta(await window.api.project.updateSettings(patch))
  }
  const saveManuscript = (patch: Partial<typeof m>): Promise<void> => save({ manuscript: { ...m, ...patch } })

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal settings" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Settings</h2>
          <button className="icon" onClick={onClose}>
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
          <label className="compile-check">
            <input
              type="checkbox"
              checked={s.typewriterSound}
              onChange={(e) => save({ typewriterSound: e.target.checked })}
            />
            Typewriter keystroke sound
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

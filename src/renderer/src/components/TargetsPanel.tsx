import type { ProjectSettings } from '@shared/types'
import { useStore, totalWords } from '../store/useStore'

interface Props {
  onClose: () => void
}

function Progress({ value, target }: { value: number; target: number | null }): JSX.Element {
  const pct = target && target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0
  return (
    <div className="target-progress">
      <div className="target-bar">
        <div className="target-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="target-figures">
        {value.toLocaleString()}
        {target ? ` / ${target.toLocaleString()} · ${pct}%` : ''}
      </span>
    </div>
  )
}

export default function TargetsPanel({ onClose }: Props): JSX.Element {
  const tree = useStore((s) => s.tree)
  const meta = useStore((s) => s.meta)
  const sessionStartWords = useStore((s) => s.sessionStartWords)
  const setMeta = useStore((s) => s.setMeta)

  const total = totalWords(tree)
  const session = Math.max(0, total - sessionStartWords)
  const projectTarget = meta?.settings.projectWordTarget ?? null
  const sessionTarget = meta?.settings.sessionWordTarget ?? null
  const deadline = meta?.settings.deadline ?? null

  const save = async (patch: Partial<ProjectSettings>): Promise<void> => {
    const updated = await window.api.project.updateSettings(patch)
    setMeta(updated)
  }
  const num = (v: string): number | null => {
    const n = parseInt(v, 10)
    return Number.isFinite(n) && n > 0 ? n : null
  }

  let daysLeft: number | null = null
  let perDay: number | null = null
  let deadlinePassed = false
  if (deadline) {
    const ms = new Date(deadline).getTime() - Date.now()
    deadlinePassed = ms < 0
    daysLeft = Math.max(0, Math.ceil(ms / 86_400_000))
    if (projectTarget && daysLeft > 0) {
      perDay = Math.max(0, Math.ceil((projectTarget - total) / daysLeft))
    }
  }

  return (
    <aside className="drawer">
      <div className="drawer-head">
        <h3>Targets</h3>
        <button className="icon" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>

      <div className="target-section">
        <h4>This session</h4>
        <Progress value={session} target={sessionTarget} />
        <label className="target-field">
          <span>Session target</span>
          <input
            type="number"
            min={0}
            defaultValue={sessionTarget ?? ''}
            placeholder="e.g. 1000"
            onBlur={(e) => save({ sessionWordTarget: num(e.target.value) })}
          />
        </label>
      </div>

      <div className="target-section">
        <h4>Whole project</h4>
        <Progress value={total} target={projectTarget} />
        <label className="target-field">
          <span>Project target</span>
          <input
            type="number"
            min={0}
            defaultValue={projectTarget ?? ''}
            placeholder="e.g. 80000"
            onBlur={(e) => save({ projectWordTarget: num(e.target.value) })}
          />
        </label>
        <label className="target-field">
          <span>Deadline</span>
          <input
            type="date"
            defaultValue={deadline ?? ''}
            onChange={(e) => save({ deadline: e.target.value || null })}
          />
        </label>
        {deadlinePassed ? (
          <p className="target-note">
            That deadline has passed — pick a new date when you’re ready. The words are still
            here.
          </p>
        ) : (
          daysLeft !== null && (
            <p className="target-note">
              {daysLeft} day{daysLeft === 1 ? '' : 's'} left
              {perDay !== null && ` · ~${perDay.toLocaleString()} words/day to finish`}
            </p>
          )
        )}
      </div>
    </aside>
  )
}

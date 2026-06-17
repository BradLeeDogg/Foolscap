import { ruleLabel } from '@shared/proofreader'
import { useStore } from '../store/useStore'

interface Props {
  onClose: () => void
}

/** Style/consistency checker: dialect, Oxford comma, repeats, spacing.
 *  Spelling itself is handled by the native (en-US/en-GB) dictionary. */
export default function ProofreaderPanel({ onClose }: Props): JSX.Element {
  const issues = useStore((s) => s.proofIssues)
  const apply = useStore((s) => s.proofApply)
  const focus = useStore((s) => s.proofFocus)
  const meta = useStore((s) => s.meta)
  const setMeta = useStore((s) => s.setMeta)

  const dialect = meta?.settings.english === 'british' ? 'british' : 'american'
  const oxford = meta?.settings.oxfordComma !== false

  const setDialect = async (d: 'american' | 'british'): Promise<void> => {
    setMeta(await window.api.project.updateSettings({ english: d }))
    await window.api.spellcheck.setDialect(d)
  }
  const setOxford = async (on: boolean): Promise<void> => {
    setMeta(await window.api.project.updateSettings({ oxfordComma: on }))
  }

  return (
    <aside className="drawer">
      <div className="drawer-head">
        <h3>Proofreader</h3>
        <button className="icon" onClick={onClose}>
          ×
        </button>
      </div>

      <div className="src-section pf-controls">
        <label className="insp-label">English</label>
        <div className="pf-seg">
          <button className={dialect === 'american' ? 'on' : ''} onClick={() => setDialect('american')}>
            American
          </button>
          <button className={dialect === 'british' ? 'on' : ''} onClick={() => setDialect('british')}>
            British
          </button>
        </div>
        <label className="pf-check">
          <input type="checkbox" checked={oxford} onChange={(e) => setOxford(e.target.checked)} />
          Oxford (serial) comma
        </label>
      </div>

      <div className="pf-summary muted">
        {issues.length === 0
          ? 'No style issues in this document.'
          : `${issues.length} issue${issues.length === 1 ? '' : 's'} in this document`}
      </div>

      <ul className="pf-list">
        {issues.map((is, i) => (
          <li key={`${is.from}-${i}`} className="pf-item">
            <div className="pf-item-head">
              <span className={`pf-chip pf-chip-${is.rule}`}>{ruleLabel(is.rule)}</span>
              <button className="pf-jump" title="Go to in document" onClick={() => focus?.(is.from, is.to)}>
                Jump
              </button>
              <button className="pf-fix" title="Apply this fix" onClick={() => apply?.(is.from, is.to, is.replacement)}>
                Fix
              </button>
            </div>
            <div className="pf-msg">{is.message}</div>
          </li>
        ))}
      </ul>

      <p className="pf-note muted">
        Spelling uses the {dialect === 'british' ? 'British' : 'American'} system dictionary —
        right-click a red-underlined word for suggestions.
      </p>
    </aside>
  )
}

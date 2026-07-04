import { useEffect, useState } from 'react'
import type { MetaField, MetaFieldType, MetaValues } from '@shared/types'
import { useStore } from '../store/useStore'
import { pushUndo } from '../lib/undo'
import { confirmSheet } from './Sheets'

/** Persist an item field with its inverse on the undo stack. */
function fieldEdit(
  label: string,
  apply: (v: string | null) => Promise<void> | void,
  oldValue: string | null,
  newValue: string | null
): void {
  if (oldValue === newValue) return
  void apply(newValue)
  pushUndo({
    label,
    undo: () => apply(oldValue),
    redo: () => apply(newValue)
  })
}

interface Props {
  onClose: () => void
}

/** Per-item detail: synopsis, notes, label/status, and custom metadata. */
export default function Inspector({ onClose }: Props): JSX.Element {
  const tree = useStore((s) => s.tree)
  const selectedId = useStore((s) => s.selectedId)
  const labels = useStore((s) => s.labels)
  const patchItem = useStore((s) => s.patchItem)
  const item = tree.find((t) => t.id === selectedId) ?? null

  const [fields, setFields] = useState<MetaField[]>([])
  const [values, setValues] = useState<MetaValues>({})
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<MetaFieldType>('text')

  const statuses = labels.filter((l) => l.kind === 'status')
  const labelDefs = labels.filter((l) => l.kind === 'label')

  const loadFields = (): void => {
    void window.api.metadata.listFields().then(setFields)
  }
  useEffect(loadFields, [])
  useEffect(() => {
    if (selectedId) void window.api.metadata.getValues(selectedId).then(setValues)
    else setValues({})
  }, [selectedId])

  const head = (
    <div className="drawer-head">
      <h3>Inspector</h3>
      <button className="icon" aria-label="Close" onClick={onClose}>
        ×
      </button>
    </div>
  )

  if (!item) {
    return (
      <aside className="drawer">
        {head}
        <p className="muted drawer-pad">Select an item in the binder.</p>
      </aside>
    )
  }

  const setVal = (fieldId: string, value: string): void => {
    const old = values[fieldId] ?? ''
    fieldEdit(
      `Metadata on “${item.title}”`,
      (v) => {
        setValues((prev) => ({ ...prev, [fieldId]: v ?? '' }))
        void window.api.metadata.setValue(item.id, fieldId, v ?? '')
      },
      old,
      value
    )
  }
  const addField = async (): Promise<void> => {
    if (!newName.trim()) return
    await window.api.metadata.createField(newName.trim(), newType)
    setNewName('')
    setNewType('text')
    loadFields()
  }
  const removeField = async (id: string): Promise<void> => {
    const ok = await confirmSheet({
      title: 'Remove this field?',
      body: 'It and all its values are removed from every item in the project. This can’t be undone.',
      confirmLabel: 'Remove field',
      danger: true
    })
    if (!ok) return
    setFields(await window.api.metadata.removeField(id))
  }

  return (
    <aside className="drawer inspector">
      {head}
      <div className="insp-section">
        <span className="insp-item-title">
          {item.type === 'folder' ? '📁' : '📄'} {item.title}
        </span>
      </div>

      <div className="insp-section">
        <label className="insp-label">Synopsis</label>
        <textarea
          key={`${item.id}-syn`}
          defaultValue={item.synopsis}
          placeholder="One or two lines…"
          onBlur={(e) =>
            fieldEdit(
              `Synopsis of “${item.title}”`,
              (v) => {
                void window.api.binder.updateSynopsis(item.id, v ?? '')
                patchItem(item.id, { synopsis: v ?? '' })
              },
              item.synopsis,
              e.target.value
            )
          }
        />
      </div>

      <div className="insp-section">
        <label className="insp-label">Notes</label>
        <textarea
          className="insp-notes"
          key={`${item.id}-notes`}
          defaultValue={item.notes}
          placeholder="Longer notes for this item…"
          onBlur={(e) =>
            fieldEdit(
              `Notes on “${item.title}”`,
              (v) => {
                void window.api.binder.updateNotes(item.id, v ?? '')
                patchItem(item.id, { notes: v ?? '' })
              },
              item.notes,
              e.target.value
            )
          }
        />
      </div>

      <div className="insp-section insp-row">
        <div>
          <label className="insp-label">Label</label>
          <select
            value={item.labelId ?? ''}
            onChange={(e) =>
              fieldEdit(
                `Label of “${item.title}”`,
                (v) => {
                  void window.api.binder.setLabel(item.id, v)
                  patchItem(item.id, { labelId: v })
                },
                item.labelId,
                e.target.value || null
              )
            }
          >
            <option value="">—</option>
            {labelDefs.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="insp-label">Status</label>
          <select
            value={item.statusId ?? ''}
            onChange={(e) =>
              fieldEdit(
                `Status of “${item.title}”`,
                (v) => {
                  void window.api.binder.setStatus(item.id, v)
                  patchItem(item.id, { statusId: v })
                },
                item.statusId,
                e.target.value || null
              )
            }
          >
            <option value="">—</option>
            {statuses.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="insp-section">
        <label className="insp-label">Metadata</label>
        {fields.map((f) => (
          <div className="insp-field" key={f.id}>
            <span className="insp-field-name">
              {f.name}
              <button className="insp-field-x" title="Remove field" onClick={() => removeField(f.id)}>
                ×
              </button>
            </span>
            {f.type === 'select' ? (
              <select value={values[f.id] ?? ''} onChange={(e) => setVal(f.id, e.target.value)}>
                <option value="">—</option>
                {f.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={f.type === 'number' ? 'number' : 'text'}
                key={`${item.id}-${f.id}`}
                defaultValue={values[f.id] ?? ''}
                onBlur={(e) => setVal(f.id, e.target.value)}
              />
            )}
          </div>
        ))}
        <div className="insp-add-field">
          <input
            value={newName}
            placeholder="New field"
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addField()}
          />
          <select value={newType} onChange={(e) => setNewType(e.target.value as MetaFieldType)}>
            <option value="text">Text</option>
            <option value="number">Number</option>
            <option value="select">Select</option>
          </select>
          <button onClick={addField}>Add</button>
        </div>
      </div>
    </aside>
  )
}

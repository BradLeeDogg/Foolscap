import { useMemo } from 'react'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable
} from '@tanstack/react-table'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { LabelDef } from '@shared/api'
import { useStore } from '../store/useStore'
import { subtreeFlat, toMove, type FlatNode } from '../lib/tree'

const col = createColumnHelper<FlatNode>()

interface Props {
  folderId: string
}

/** Spreadsheet-style outline of a folder's subtree; inline-editable, reorderable. */
export default function Outliner({ folderId }: Props): JSX.Element {
  const tree = useStore((s) => s.tree)
  const labels = useStore((s) => s.labels)
  const select = useStore((s) => s.select)
  const patchItem = useStore((s) => s.patchItem)
  const setTree = useStore((s) => s.setTree)
  const rows = useMemo(() => subtreeFlat(tree, folderId), [tree, folderId])
  const statuses = labels.filter((l) => l.kind === 'status')
  const labelDefs = labels.filter((l) => l.kind === 'label')
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const columns = useMemo(
    () => [
      col.display({
        id: 'title',
        header: 'Title',
        cell: ({ row }) => (
          <input
            className="ol-title"
            style={{ paddingLeft: 4 + row.original.depth * 16 }}
            defaultValue={row.original.title}
            onClick={() => select(row.original.id)}
            onBlur={(e) => {
              const v = e.target.value.trim()
              if (v) {
                void window.api.binder.rename(row.original.id, v)
                patchItem(row.original.id, { title: v })
              }
            }}
          />
        )
      }),
      col.accessor('synopsis', {
        header: 'Synopsis',
        cell: ({ row }) => (
          <input
            className="ol-synopsis"
            defaultValue={row.original.synopsis}
            placeholder="—"
            onBlur={(e) => {
              void window.api.binder.updateSynopsis(row.original.id, e.target.value)
              patchItem(row.original.id, { synopsis: e.target.value })
            }}
          />
        )
      }),
      col.accessor('wordCount', { header: 'Words', cell: ({ getValue }) => getValue().toLocaleString() }),
      col.display({
        id: 'label',
        header: 'Label',
        cell: ({ row }) => (
          <LabelSelect
            value={row.original.labelId}
            options={labelDefs}
            onChange={(v) => {
              void window.api.binder.setLabel(row.original.id, v)
              patchItem(row.original.id, { labelId: v })
            }}
          />
        )
      }),
      col.display({
        id: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <LabelSelect
            value={row.original.statusId}
            options={statuses}
            onChange={(v) => {
              void window.api.binder.setStatus(row.original.id, v)
              patchItem(row.original.id, { statusId: v })
            }}
          />
        )
      })
    ],
    [labelDefs, statuses, select, patchItem]
  )

  const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel() })

  const onDragEnd = async ({ active, over }: DragEndEvent): Promise<void> => {
    if (!over || active.id === over.id) return
    const overNode = rows.find((r) => r.id === String(over.id))
    if (!overNode) return
    const { newParentId, newIndex } = toMove(rows, String(active.id), String(over.id), overNode.parentId)
    setTree(await window.api.binder.move({ id: String(active.id), newParentId, newIndex }))
  }

  if (rows.length === 0) {
    return (
      <div className="editor-empty">
        <p>This folder is empty.</p>
      </div>
    )
  }

  return (
    <div className="outliner">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <table className="ol-table">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                <th className="ol-handle-col" />
                {hg.headers.map((h) => (
                  <th key={h.id}>{flexRender(h.column.columnDef.header, h.getContext())}</th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
              {table.getRowModel().rows.map((row) => (
                <OutlinerRow key={row.id} id={row.original.id}>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className={`ol-${cell.column.id}`}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </OutlinerRow>
              ))}
            </SortableContext>
          </tbody>
        </table>
      </DndContext>
    </div>
  )
}

function OutlinerRow({ id, children }: { id: string; children: React.ReactNode }): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  }
  return (
    <tr ref={setNodeRef} style={style}>
      <td className="ol-handle" {...attributes} {...listeners} title="Drag to reorder">
        ⠿
      </td>
      {children}
    </tr>
  )
}

function LabelSelect({
  value,
  options,
  onChange
}: {
  value: string | null
  options: LabelDef[]
  onChange: (v: string | null) => void
}): JSX.Element {
  const color = options.find((o) => o.id === value)?.color
  return (
    <select
      className="ol-select"
      style={{ borderLeft: `4px solid ${color ?? 'transparent'}` }}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">—</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  )
}

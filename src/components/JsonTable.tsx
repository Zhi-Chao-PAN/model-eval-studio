'use client'

import { useState, useRef, useEffect } from 'react'

interface Props {
  /** JSON string to detect + render. */
  text: string
  /** If true, hide the "raw JSON" toggle. */
  hideRaw?: boolean
  /** Persists edited rows when the table is used as an editable correction surface. */
  onSave?: (rows: ModelRow[]) => Promise<void> | void
}

interface ModelRow {
  modelCode: string
  displayName?: string
  status?: string
  duration?: string
  toolCalls?: number
  processSummary?: string
  processDetail?: string
  issues?: string[]
  metrics?: Record<string, any>
}

/**
 * Scans a string for a JSON object. Returns the first match, or null.
 */
function extractFirstJson(text: string): any | null {
  // Try a few common patterns: ```json ... ```, ``` ... ```, or a bare { ... }
  const fences = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)]
  for (const m of fences) {
    try {
      return JSON.parse(m[1])
    } catch {}
  }
  // Find first balanced {...} block
  let depth = 0
  let start = -1
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '{') {
      if (depth === 0) start = i
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 0 && start >= 0) {
        const slice = text.slice(start, i + 1)
        try {
          return JSON.parse(slice)
        } catch {
          start = -1
        }
      }
    }
  }
  return null
}

/**
 * Normalize an arbitrary AI-returned "models" array into ModelRow[].
 */
function normalizeModels(parsed: any): { rows: ModelRow[]; allColumns: string[] } {
  let models: any[] = []
  if (Array.isArray(parsed?.models)) models = parsed.models
  else if (Array.isArray(parsed)) models = parsed

  if (!models.length) return { rows: [], allColumns: [] }

  const rows: ModelRow[] = models.map((m: any) => {
    const row: ModelRow = {
      modelCode: m.modelCode || m.code || m.name || m.model || '未识别',
      displayName: m.displayName || m.display_name,
      status: m.status,
      duration: m.duration || m.elapsed || m.elapsedTime || m.time,
      toolCalls: m.toolCalls ?? m.tool_calls,
      processSummary: m.processSummary || m.process_summary,
      processDetail: m.processDetail || m.process_detail,
      issues: m.issues || m.problems,
    }
    if (m.metrics && typeof m.metrics === 'object') {
      row.metrics = m.metrics
    } else if (m.hardMetrics && typeof m.hardMetrics === 'object') {
      row.metrics = m.hardMetrics
    } else {
      // If the model has additional top-level string/number fields, treat them as metrics
      const reserved = new Set([
        'modelCode', 'code', 'name', 'model', 'displayName', 'display_name',
        'status', 'duration', 'elapsed', 'elapsedTime', 'time',
        'toolCalls', 'tool_calls', 'processSummary', 'process_summary',
        'processDetail', 'process_detail', 'issues', 'problems',
        'metrics', 'hardMetrics',
      ])
      const extras: Record<string, any> = {}
      for (const [k, v] of Object.entries(m)) {
        if (reserved.has(k)) continue
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
          extras[k] = v
        }
      }
      if (Object.keys(extras).length) row.metrics = extras
    }
    return row
  })

  const allColumns = new Set<string>()
  rows.forEach((r) => {
    if (r.metrics) Object.keys(r.metrics).forEach((k) => allColumns.add(k))
  })
  return { rows, allColumns: Array.from(allColumns) }
}

function formatCellValue(v: any): string {
  if (v === null || v === undefined) return '-'
  if (typeof v === 'string') return v
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '-'
  if (typeof v === 'boolean') return v ? '是' : '否'
  return JSON.stringify(v)
}

export function JsonTable({ text, hideRaw, onSave }: Props) {
  const [rawOpen, setRawOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editedColumns, setEditedColumns] = useState<string[]>([])
  const [editedRows, setEditedRows] = useState<Record<string, Record<string, string>>>({})
  const [savedRows, setSavedRows] = useState<ModelRow[] | null>(null)
  const [savedColumns, setSavedColumns] = useState<string[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [addColOpen, setAddColOpen] = useState(false)
  const [newColName, setNewColName] = useState('')
  const newColInputRef = useRef<HTMLInputElement | null>(null)

  // Focus the new column input when the add-column UI opens
  useEffect(() => {
    if (addColOpen) {
      setTimeout(() => newColInputRef.current?.focus(), 30)
    } else {
      setNewColName('')
    }
  }, [addColOpen])

  const parsed = extractFirstJson(text)
  if (!parsed) return null

  const normalized = normalizeModels(parsed)
  const rows = savedRows || normalized.rows
  const allColumns = savedColumns || normalized.allColumns
  if (!rows.length) return null

  // Build a stable list of display columns: explicit metrics first, then a few standard fields
  const standardColumns: { key: keyof ModelRow; label: string }[] = [
    { key: 'modelCode', label: '模型代号' },
    { key: 'status', label: '状态' },
    { key: 'duration', label: '耗时' },
    { key: 'toolCalls', label: '工具调用' },
  ]

  // When editing, user can add/remove extra metric columns
  const displayColumns = editing
    ? editedColumns
    : [...standardColumns.map((c) => ({ key: c.key, label: c.label, editable: false })),
       ...allColumns.map((c) => ({ key: c, label: c, editable: true, isMetric: true }))]

  function startEditing() {
    setEditing(true)
    setEditedColumns(allColumns)
    const init: Record<string, Record<string, string>> = {}
    rows.forEach((r) => {
      init[r.modelCode] = {}
      ;(allColumns).forEach((col) => {
        init[r.modelCode][col] = r.metrics?.[col] !== undefined ? formatCellValue(r.metrics[col]) : ''
      })
    })
    setEditedRows(init)
  }

  function cancelEditing() {
    setEditing(false)
    setEditedColumns([])
    setEditedRows({})
  }

  async function saveEditing() {
    const nextRows = rows.map((r) => {
      const edits = editedRows[r.modelCode] || {}
      const newMetrics: Record<string, any> = {}
      for (const col of editedColumns) newMetrics[col] = edits[col] ?? ''
      return { ...r, metrics: newMetrics }
    })

    setSaving(true)
    setSaveError(null)
    try {
      await onSave?.(nextRows)
      setSavedRows(nextRows)
      setSavedColumns([...editedColumns])
      setEditing(false)
    } catch (e: any) {
      setSaveError(e?.message || String(e))
    } finally {
      setSaving(false)
    }
  }

  function confirmAddColumn() {
    const name = newColName.trim()
    if (!name) {
      setAddColOpen(false)
      return
    }
    if (editedColumns.includes(name)) {
      setAddColOpen(false)
      setNewColName('')
      return
    }
    setEditedColumns((prev) => [...prev, name])
    setEditedRows((prev) => {
      const next = { ...prev }
      rows.forEach((r) => {
        if (!next[r.modelCode]) next[r.modelCode] = {}
        next[r.modelCode][name] = ''
      })
      return next
    })
    setAddColOpen(false)
    setNewColName('')
  }

  function removeColumn(col: string) {
    setEditedColumns((prev) => prev.filter((c) => c !== col))
    setEditedRows((prev) => {
      const next = { ...prev }
      for (const k of Object.keys(next)) {
        if (next[k]) delete next[k][col]
      }
      return next
    })
  }

  return (
    <div className="mt-3 rounded-lg border border-white/[0.08] bg-white/[0.04] overflow-hidden">
      <div className="px-3 py-2 flex items-center justify-between border-b border-white/[0.08] bg-white/[0.03]">
        <div className="text-xs font-medium text-gray-200 flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-indigo-500/20 text-indigo-300 text-[10px]">表</span>
          识别到的模型数据（{rows.length} 个）
        </div>
        <div className="flex items-center gap-2">
          {!editing ? (
            <>
              <button
                type="button"
                onClick={startEditing}
                aria-label="编辑或补充表格数据"
                className="text-xs text-indigo-300 hover:text-indigo-300"
              >
                编辑/补充
              </button>
              {!hideRaw && (
                <button
                  type="button"
                  onClick={() => setRawOpen((v) => !v)}
                  aria-expanded={rawOpen}
                  aria-label={rawOpen ? '收起原始JSON' : '查看原始JSON'}
                  className="text-xs text-gray-500 hover:text-gray-200"
                >
                  {rawOpen ? '收起 JSON' : '原始 JSON'}
                </button>
              )}
            </>
          ) : (
            <>
              {addColOpen ? (
                <div className="flex items-center gap-1">
                  <input
                    ref={newColInputRef}
                    type="text"
                    value={newColName}
                    onChange={(e) => setNewColName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') confirmAddColumn()
                      if (e.key === 'Escape') setAddColOpen(false)
                    }}
                    placeholder="新列名"
                    aria-label="新列名称"
                    className="w-28 px-1.5 py-0.5 border border-white/[0.14] rounded text-xs bg-transparent focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={confirmAddColumn}
                    aria-label="确认添加列"
                    className="text-xs px-1.5 py-0.5 text-emerald-400 hover:text-emerald-300"
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddColOpen(false)}
                    aria-label="取消添加列"
                    className="text-xs px-1 py-0.5 text-gray-500 hover:text-gray-200"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAddColOpen(true)}
                  aria-label="添加新列"
                  className="text-xs text-indigo-300 hover:text-indigo-300"
                >
                  + 添加列
                </button>
              )}
              <button
                type="button"
                onClick={saveEditing}
                disabled={saving || addColOpen}
                aria-label="保存编辑"
                className="text-xs px-2 py-0.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? '保存中...' : '保存'}
              </button>
              <button
                type="button"
                onClick={cancelEditing}
                aria-label="取消编辑"
                className="text-xs text-gray-500 hover:text-gray-200"
              >
                取消
              </button>
            </>
          )}
        </div>
      </div>

      {saveError && (
        <div role="alert" className="border-b border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          保存失败：{saveError}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-white/[0.03]">
            <tr>
              {displayColumns.map((c: any) => (
                <th key={String(c.key)} className="text-left px-3 py-2 font-medium text-gray-400 border-b border-white/[0.08] whitespace-nowrap">
                  <span>{c.label}</span>
                  {editing && c.isMetric && (
                    <button
                      type="button"
                      onClick={() => removeColumn(c.key)}
                      className="ml-1 text-red-400 hover:text-red-300"
                      title="删除此列"
                      aria-label={`删除列 ${c.label}`}
                    >
                      ×
                    </button>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.modelCode} className="border-b border-white/[0.06] last:border-0 hover:bg-white/[0.03]/50">
                {displayColumns.map((c: any) => {
                  const isStandard = !c.isMetric
                  const cellKey = String(c.key)
                  if (editing && c.isMetric) {
                    return (
                      <td key={cellKey} className="px-3 py-1.5">
                        <input
                          type="text"
                          value={editedRows[r.modelCode]?.[cellKey] ?? ''}
                          onChange={(e) => {
                            setEditedRows((prev) => ({
                              ...prev,
                              [r.modelCode]: { ...(prev[r.modelCode] || {}), [cellKey]: e.target.value },
                            }))
                          }}
                          className="w-full px-1.5 py-0.5 border border-white/[0.14] rounded text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          aria-label={`${r.modelCode} 的 ${c.label}`}
                          placeholder="-"
                        />
                      </td>
                    )
                  }
                  let val: any = ''
                  if (isStandard) {
                    val = (r as any)[c.key]
                  } else {
                    val = r.metrics?.[c.key]
                  }
                  return (
                    <td key={cellKey} className="px-3 py-1.5 text-gray-200 whitespace-nowrap">
                      {formatCellValue(val)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Per-model details (summary + issues) */}
      {rows.some((r) => r.processSummary || r.processDetail || (r.issues && r.issues.length)) && (
        <div className="border-t border-white/[0.08] p-3 space-y-2 bg-white/[0.03]/50">
          {rows.map((r) => (
            <div key={r.modelCode} className="bg-white/[0.04] rounded border border-white/[0.08] p-2">
              <div className="font-medium text-white/90 text-xs mb-1">{r.modelCode}</div>
              {r.processSummary && (
                <div className="text-xs text-gray-400 leading-relaxed">{r.processSummary}</div>
              )}
              {r.issues && r.issues.length > 0 && (
                <ul className="mt-1.5 space-y-0.5">
                  {r.issues.map((iss, i) => (
                    <li key={i} className="text-xs text-amber-300 flex items-start gap-1">
                      <span className="text-amber-400 mt-0.5">⚠</span>
                      <span>{iss}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {rawOpen && !hideRaw && (
        <pre className="border-t border-white/[0.08] p-3 text-[10px] bg-black/40 text-slate-200 overflow-x-auto max-h-64 font-mono">
{JSON.stringify(parsed, null, 2)}
        </pre>
      )}
    </div>
  )
}

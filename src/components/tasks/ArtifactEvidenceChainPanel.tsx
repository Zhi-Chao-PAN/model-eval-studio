'use client'

/**
 * Artifact Evidence Chain Panel
 * ─────────────────────────────
 * 产物分析阶段，按类型分组展示后台候选证据链。
 *
 * 设计原则：
 * - 默认折叠：避免在 StepArtifact 模型卡片里挤占太多纵向空间。
 * - 每个组独立折叠，组内逐条罗列 title / summary / artifactName / source /
 *   evidenceType / createdAt / metadata 关键字段。
 * - 不展示原始 think / 思维链；自动筛掉任何 `think` / `reasoning` /
 *   `chain_of_thought` 字段（链 builders 已做，但 UI 再确认一次）。
 * - 文案明确：后台候选证据可参考交付效率 / 产物质量 / 综合评价，
 *   但不等同于测试者本地验收截图；产物效果反馈仍需 tester_upload。
 */

import { useState } from 'react'
import { ChevronDown, Info, ListTree, ShieldAlert } from 'lucide-react'
import {
  type ArtifactEvidence,
  type EvidenceGroup,
  groupEvidenceByType,
  loadEvidenceChainFromAnalysis,
} from '@/lib/artifact-evidence-chain'

interface Props {
  /** 来自 `TaskModel.artifactAnalysisJson` 的可选字段 */
  evidenceChainRaw?: string | null
  modelCode: string
}

const SOURCE_LABELS: Record<string, string> = {
  auto_runner: '自动验收运行器',
  parser: '解析器',
  analysis_runtime: '综合分析',
  artifact_upload: '产物上传',
}

const TYPE_LABELS: Record<string, string> = {
  file_manifest: '文件清单',
  primary_artifact: '主产物',
  parsed_content: '解析摘要',
  structure_check: '结构检查',
  quality_signal: '质量信号',
  limitation: '限制说明',
  auto_candidate: '后台候选',
  error: '错误',
}

function formatTime(value: string): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function safeMetadataEntries(metadata: Record<string, unknown> | null | undefined): Array<[string, string]> {
  if (!metadata) return []
  const entries: Array<[string, string]> = []
  for (const [key, value] of Object.entries(metadata)) {
    if (key === 'think' || key === 'reasoning' || key === 'chain_of_thought') continue
    if (key === '_droppedKeys') continue
    if (value === null || value === undefined) continue
    if (typeof value === 'string') {
      entries.push([key, value])
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      entries.push([key, String(value)])
    } else if (Array.isArray(value)) {
      const text = (value as unknown[])
        .filter(item => item !== null && item !== undefined)
        .map(item => (typeof item === 'string' ? item : JSON.stringify(item)))
        .slice(0, 8)
        .join('、')
      if (text) entries.push([key, text])
    }
  }
  return entries.slice(0, 8)
}

function EvidenceRow({ item }: { item: ArtifactEvidence }) {
  const metadataEntries = safeMetadataEntries(item.metadata)
  return (
    <li className="rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2 space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[13px] text-gray-200 leading-snug break-words">{item.title || '（无标题）'}</div>
          {item.summary && (
            <div className="text-[12px] text-gray-400 mt-1 leading-relaxed break-words">{item.summary}</div>
          )}
        </div>
        <span className="text-[10px] mono shrink-0 px-1.5 py-0.5 rounded border border-white/10 text-gray-400 whitespace-nowrap">
          {TYPE_LABELS[item.evidenceType] || item.evidenceType}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-gray-500">
        <span>来源：{SOURCE_LABELS[item.source] || item.source}</span>
        {item.artifactName && <span className="truncate max-w-[180px]">产物：{item.artifactName}</span>}
        <span>时间：{formatTime(item.createdAt)}</span>
      </div>
      {metadataEntries.length > 0 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-[11px] text-gray-500 pt-1 border-t border-white/[0.04]">
          {metadataEntries.map(([key, value]) => (
            <div key={key} className="contents">
              <dt className="text-gray-500 mono">{key}</dt>
              <dd className="text-gray-400 break-words leading-relaxed">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  )
}

function GroupSection({ group, defaultOpen }: { group: EvidenceGroup; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="rounded-lg border border-white/[0.07] bg-white/[0.015]">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2 min-w-0">
          <ChevronDown
            className={`h-3.5 w-3.5 text-gray-400 transition-transform ${open ? '' : '-rotate-90'}`}
          />
          <span className="text-[13px] font-medium text-gray-200">{group.label}</span>
          <span className="text-[10px] mono text-gray-500">{group.items.length} 条</span>
        </div>
        <span className="text-[10px] text-gray-500 truncate max-w-[260px]">{group.description}</span>
      </button>
      {open && (
        <ul className="space-y-1.5 px-3 pb-3">
          {group.items.map(item => (
            <EvidenceRow key={item.evidenceId} item={item} />
          ))}
        </ul>
      )}
    </section>
  )
}

export function ArtifactEvidenceChainPanel({ evidenceChainRaw, modelCode }: Props) {
  const chain = loadEvidenceChainFromAnalysis({ evidenceChain: evidenceChainRaw ?? null })
  const [open, setOpen] = useState(false)

  // 没有 chain → 显示占位
  if (!chain || chain.items.length === 0) {
    return (
      <div
        className="mt-3 flex items-start gap-2 rounded-md border border-white/[0.07] bg-white/[0.015] px-3 py-2 text-[12px] text-gray-400"
        data-testid={`evidence-chain-empty-${modelCode}`}
      >
        <Info className="h-3.5 w-3.5 text-gray-500 mt-0.5 flex-shrink-0" />
        <span>尚未生成证据链，请先分析产物。</span>
      </div>
    )
  }

  const groups = groupEvidenceByType(chain.items)
  const total = chain.items.length

  return (
    <section
      className="mt-3 rounded-md border border-white/[0.07] bg-white/[0.015]"
      aria-label={`${modelCode} 的证据链`}
    >
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2 min-w-0">
          <ListTree className="h-4 w-4 text-indigo-300 flex-shrink-0" />
          <span className="text-[13px] font-medium text-gray-200">证据链</span>
          <span className="text-[10px] mono text-gray-500">{total} 条 / {groups.length} 组</span>
        </div>
        <ChevronDown
          className={`h-3.5 w-3.5 text-gray-400 transition-transform ${open ? '' : '-rotate-90'}`}
        />
      </button>

      {!open && (
        <div className="px-3 pb-2.5 -mt-0.5 text-[10px] text-gray-500 leading-relaxed">
          包含 {groups.map(g => g.label).join(' / ')}；后台候选证据可参考交付效率、产物质量、综合评价，不等同于测试者本地验收截图。
        </div>
      )}

      {open && (
        <div className="px-3 pb-3 space-y-2">
          <div className="flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/[0.04] px-2.5 py-1.5 text-[11px] text-amber-100/85">
            <ShieldAlert className="h-3.5 w-3.5 mt-0.5 text-amber-300 flex-shrink-0" />
            <span>
              后台候选证据可作为交付效率 / 产物质量 / 综合评价的参考依据；
              但<strong>不等同于测试者本地验收截图</strong>。产物效果反馈仍需 tester_upload 截图。
            </span>
          </div>
          <div className="space-y-1.5">
            {groups.map(group => (
              <GroupSection
                key={group.key}
                group={group}
                defaultOpen={group.key === 'primary' || group.key === 'limitations'}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
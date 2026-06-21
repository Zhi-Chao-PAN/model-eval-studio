'use client'
import { useState, useEffect } from 'react'
import { FileText, Save, Sparkles, Check, Scale, ChevronDown, ChevronUp, Settings2, AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Textarea, Label } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import type { RubricData, RubricDimension } from '@/lib/rubric-templates'

interface Props {
  task: any
  onUpdate: (data: any) => void
}

const TEMPLATE_OPTIONS = [
  { key: 'CODING', label: '代码开发评测（5+3+2）', desc: '需求完成度 + 代码质量 + 轨迹质量' },
  { key: 'AGENT', label: 'Agent 智能体评测（6 维度加权）', desc: '指令遵循+规划+工具+推理+幻觉+交付' },
]

export default function StepInfo({ task, onUpdate }: Props) {
  const [form, setForm] = useState({
    title: task.title || '',
    description: task.description || '',
    backgroundUsed: task.backgroundUsed || '',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const [rubric, setRubric] = useState<RubricData | null>(null)
  const [rubricLoading, setRubricLoading] = useState(true)
  const [rubricLoadError, setRubricLoadError] = useState<string | null>(null)
  const [rubricExpanded, setRubricExpanded] = useState(true)
  const [rubricSaving, setRubricSaving] = useState(false)
  const [rubricSaved, setRubricSaved] = useState(false)
  const [rubricError, setRubricError] = useState<string | null>(null)
  const [isCustom, setIsCustom] = useState(false)

  useEffect(() => {
    loadRubric()
  }, [task.id])

  async function loadRubric() {
    setRubricLoading(true)
    setRubricLoadError(null)
    try {
      const res = await fetch('/api/tasks/' + task.id + '/rubric')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '评分规则加载失败（HTTP ' + res.status + '）')
      if (data.rubric) {
        setRubric(data.rubric)
        setIsCustom(data.isCustom || false)
      }
    } catch (e: any) {
      setRubricLoadError(e?.message || '加载失败')
    } finally {
      setRubricLoading(false)
    }
  }

  async function save() {
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/tasks/' + task.id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      let data; try { data = await res.json(); } catch { throw new Error('保存失败（HTTP ' + res.status + '）') }
      if (!res.ok) throw new Error(data.error || '保存失败')
      if (data.task) {
        onUpdate(data.task)
        setSaved(true)
        setTimeout(() => setSaved(false), 1500)
      }
    } catch (e: any) { setError(e.message || String(e)) }
    finally { setSaving(false) }
  }

  async function switchTemplate(templateKey: string) {
    if (!rubric) return
    if (rubric.templateType === templateKey && !isCustom) return // 已经是该默认模板
    setRubricSaving(true)
    setRubricError(null)
    setRubricSaved(false)
    try {
      const templateRubric = getFullTemplateRubric(templateKey)
      if (!templateRubric) throw new Error('模板不存在')
      const saveRes = await fetch('/api/tasks/' + task.id + '/rubric', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rubric: templateRubric }),
      })
      const saveData = await saveRes.json().catch(() => ({}))
      if (!saveRes.ok) throw new Error(saveData.error || '模板切换失败')
      if (saveData.rubric) {
        setRubric(saveData.rubric)
        setIsCustom(saveData.isCustom || false)
        setRubricSaved(true)
        setTimeout(() => setRubricSaved(false), 1500)
      }
    } catch (e: any) {
      setRubricError(e?.message || '模板切换失败')
    } finally {
      setRubricSaving(false)
    }
  }

  // 从预设模板构造完整 rubric（客户端版本，与服务端一致）
  function getFullTemplateRubric(templateKey: string): RubricData | null {
    if (templateKey === 'CODING') {
      return {
        templateType: 'CODING',
        dimensions: [
          { key: 'requirementCompletion', label: '需求完成度', weight: 5, description: '决定「能不能用」', scoreRange: [0, 5] },
          { key: 'codeQuality', label: '代码质量', weight: 3, description: '决定「敢不敢合、好不好维护」', scoreRange: [0, 3] },
          { key: 'trajectoryQuality', label: '轨迹质量', weight: 2, description: '决定「过程是否可信」', scoreRange: [0, 2] },
        ],
        overallFormula: '综合评分 = 需求完成度 + 代码质量 + 轨迹质量（满分 10 分）',
      }
    }
    if (templateKey === 'AGENT') {
      return {
        templateType: 'AGENT',
        dimensions: [
          { key: 'instructionFollowing', label: '指令理解与遵循度', weight: 2.5, description: '是否准确理解并完成用户意图', scoreRange: [0, 2.5] },
          { key: 'planningAbility', label: '规划能力', weight: 2, description: '任务拆解和执行规划是否合理', scoreRange: [0, 2] },
          { key: 'toolUsage', label: '工具调用', weight: 1.5, description: '工具使用是否正确高效', scoreRange: [0, 1.5] },
          { key: 'reasoning', label: '推理与判断', weight: 1.5, description: '推理过程是否合理', scoreRange: [0, 1.5] },
          { key: 'hallucination', label: '幻觉检测', weight: 1.5, description: '是否出现严重幻觉', scoreRange: [0, 1.5] },
          { key: 'deliveryQuality', label: '交付结果', weight: 1, description: '最终交付物是否符合要求', scoreRange: [0, 1] },
        ],
        overallFormula: '综合评分 = 各维度加权求和（满分 10 分）',
      }
    }
    return null
  }

  return (
    <div className="space-y-5 animate-rise">
      <div className="flex items-start gap-3">
        <div className="relative h-11 w-11 rounded-xl bg-gradient-to-br from-indigo-500/20 to-blue-500/20 border border-white/10 flex items-center justify-center flex-shrink-0">
          <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-indigo-400/20 to-transparent blur-md" />
          <FileText className="h-5 w-5 text-indigo-300 relative z-10" />
        </div>
        <div>
          <h2 className="display text-xl sm:text-2xl tracking-tight">填写任务信息</h2>
          <p className="text-sm text-gray-400 mt-1 max-w-2xl">
            只需要填两块内容：交给待测模型的「任务 prompt」，以及这道题的「来源 / 背景说明」。
          </p>
        </div>
      </div>

      <div className="panel p-5 space-y-5">
        <div className="space-y-2">
          <Label>
            任务标题
            <span className="ml-2 text-gray-500 font-normal text-[11px]">仅用于在任务列表中识别</span>
          </Label>
          <Input
            value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })}
            onBlur={save}
            placeholder="给评估起个名字，例如：作品集项目方向决策模型对比评估"
            className="bg-white/[0.02] border-white/[0.07]"
          />
        </div>

        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            任务 prompt
            <span className="text-red-400 text-[11px]">*</span>
            <span className="text-gray-500 font-normal text-[11px]">你交给待测模型的题目原文</span>
          </Label>
          <Textarea
            value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })}
            onBlur={save}
            rows={8}
            className="mono bg-white/[0.02] border-white/[0.07] focus:bg-white/[0.03]"
            placeholder="把交给待测模型的完整 prompt 粘贴到这里。AI 会基于这段文本理解任务目标，并据此评估各模型的产物。"
          />
        </div>

        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            题目来源 / 背景说明
            <span className="text-red-400 text-[11px]">*</span>
            <span className="text-gray-500 font-normal text-[11px]">这道题来自什么场景，为什么重要</span>
          </Label>
          <Textarea
            value={form.backgroundUsed}
            onChange={e => setForm({ ...form, backgroundUsed: e.target.value })}
            onBlur={save}
            rows={6}
            className="mono bg-white/[0.02] border-white/[0.07] focus:bg-white/[0.03]"
            placeholder={"例如：这是一个真实的项目选题决策任务，来源于我正在规划 AI/Agent 作品集的需求。\n\n该任务的真实价值是 XXX，高质量结果应该能 XXX。本任务重点观察模型的 XXX 能力。"}
          />
          <div className="text-[11px] text-gray-400 mt-2 p-3 rounded-xl bg-indigo-500/[0.06] border border-indigo-500/15 flex items-start gap-2">
            <Sparkles className="h-3.5 w-3.5 text-indigo-400 mt-0.5 flex-shrink-0" />
            <span>
              这段背景帮助 AI 理解「为什么测这道题」，并据此判断模型表现是否符合预期。注意它和
              <span className="text-indigo-300"> 设置页 </span>
              的「个人背景」是两件事——那个描述你这个人长期的身份与偏好，这里描述这次任务的来源与意图。
            </span>
          </div>
        </div>
      </div>

      {/* 评分规则卡片 */}
      <div className="panel p-5">
        <div
          className="flex items-center gap-3 cursor-pointer select-none"
          onClick={() => setRubricExpanded(!rubricExpanded)}
        >
          <div className="relative h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-white/10 flex items-center justify-center flex-shrink-0">
            <Scale className="h-4.5 w-4.5 text-emerald-300" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-sm">评分规则</h3>
              {!rubricLoading && rubric && (
                <Badge variant="outline" className="text-[10px] h-5 px-1.5">
                  {rubric.templateType === 'CODING' ? '代码开发' : rubric.templateType === 'AGENT' ? 'Agent 智能体' : '自定义'}
                  {isCustom ? ' · 已自定义' : ' · 默认模板'}
                </Badge>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              {rubricLoading ? '加载中...' : rubricLoadError ? '加载失败' : rubric ? `${rubric.dimensions.length} 个评分维度，满分 10 分` : '未设置'}
            </p>
          </div>
          {rubricExpanded ? (
            <ChevronUp className="h-4 w-4 text-gray-500" />
          ) : (
            <ChevronDown className="h-4 w-4 text-gray-500" />
          )}
        </div>

        {rubricExpanded && rubricLoadError && !rubricLoading && (
          <div className="mt-4 text-center py-4 border-t border-white/[0.07] pt-4">
            <AlertTriangle className="h-5 w-5 mx-auto text-amber-400 mb-1" />
            <p className="text-xs text-amber-300 mb-2">{rubricLoadError}</p>
            <Button size="sm" variant="secondary" onClick={loadRubric}>
              <RefreshCw className="h-3 w-3 mr-1" /> 重试
            </Button>
          </div>
        )}

        {rubricExpanded && !rubricLoading && rubric && (
          <div className="mt-4 space-y-4 border-t border-white/[0.07] pt-4">
            <div className="space-y-2">
              <Label>评分模板</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {TEMPLATE_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => switchTemplate(opt.key)}
                    disabled={rubricSaving}
                    className={`text-left p-3 rounded-xl border transition-all ${
                      rubric.templateType === opt.key
                        ? 'border-emerald-500/50 bg-emerald-500/10'
                        : 'border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.04]'
                    }`}
                  >
                    <div className="text-sm font-medium">{opt.label}</div>
                    <div className="text-[11px] text-gray-400 mt-1">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>评分维度</Label>
                <span className="text-[11px] text-gray-500">{rubric.overallFormula}</span>
              </div>
              <div className="space-y-1.5">
                {rubric.dimensions.map((dim: RubricDimension, idx: number) => (
                  <div key={dim.key} className="flex items-center gap-3 p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.05]">
                    <span className="text-xs text-gray-500 w-5 text-center">{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{dim.label}</div>
                      <div className="text-[11px] text-gray-500 truncate">{dim.description}</div>
                    </div>
                    <Badge variant="outline" className="text-[10px] h-5 flex-shrink-0">
                      {dim.weight} 分
                    </Badge>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-gray-500 pt-1">
              <Settings2 className="h-3.5 w-3.5" />
              <span>评分规则将用于 AI 自动生成评估报告的评分参考。如需修改维度权重，请联系管理员。</span>
            </div>

            {rubricSaving && (
              <div className="text-xs text-emerald-400 flex items-center gap-1">
                <Save className="h-3 w-3 animate-pulse" /> 保存中...
              </div>
            )}
            {rubricSaved && !rubricError && (
              <div className="text-xs text-emerald-400 flex items-center gap-1">
                <Check className="h-3 w-3" /> 评分规则已更新
              </div>
            )}
            {rubricError && (
              <div className="text-xs text-red-400 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> {rubricError}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 pt-1">
        <Button onClick={save} loading={saving}>
          <Save className="h-3.5 w-3.5" /> 保存信息
        </Button>
        {saved && (
          <span className="text-emerald-400 text-xs flex items-center gap-1">
            <Check className="h-3 w-3" /> 已保存
          </span>
        )}
        {error && (
          <span className="text-red-400 text-xs">{error}</span>
        )}
        <span className="text-[11px] text-gray-500 ml-auto">输入框失焦时自动保存</span>
      </div>
    </div>
  )
}

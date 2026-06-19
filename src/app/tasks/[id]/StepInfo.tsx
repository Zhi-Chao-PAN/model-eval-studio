'use client'
import { useState } from 'react'
import { FileText, Save, Sparkles, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Textarea, Label } from '@/components/ui/input'

interface Props {
  task: any
  onUpdate: (data: any) => void
}

export default function StepInfo({ task, onUpdate }: Props) {
  const [form, setForm] = useState({
    title: task.title || '',
    description: task.description || '',
    backgroundUsed: task.backgroundUsed || '',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

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

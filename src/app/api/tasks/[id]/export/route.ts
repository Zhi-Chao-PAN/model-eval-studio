import { NextResponse } from 'next/server'
import JSZip from 'jszip'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'

export const runtime = 'nodejs'

function formatIntegerScore(score: number): string {
  const value = Number(score)
  if (!Number.isFinite(value) || value <= 0) return '-'
  return String(Math.min(10, Math.max(1, Math.round(value))))
}

function formatHalfScore(score: number): string {
  const value = Number(score)
  if (!Number.isFinite(value) || value <= 0) return '-'
  const normalized = Math.min(10, Math.max(1, Math.round(value * 2) / 2))
  return Number.isInteger(normalized) ? String(normalized) : normalized.toFixed(1)
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })
  const { id } = await params

  const task = await prisma.task.findFirst({
    where: { id, userId: session.userId, status: { not: 'DELETED' } },
    include: {
      models: { include: { reports: { orderBy: { createdAt: 'desc' }, take: 1 } } },
    },
  })
  if (!task) return NextResponse.json({ error: '任务不存在' }, { status: 404 })

  const zip = new JSZip()
  zip.file('README.txt', `任务：${task.title}\n导出时间：${new Date().toLocaleString('zh-CN')}\n\n本压缩包包含该任务下所有模型的评估报告（5 模块格式）。\n`)

  for (const model of task.models) {
    const report = model.reports[0]
    if (report) {
      const text = `====================================
评估对象：${model.modelCode}
====================================

【产物效果反馈】
${report.productFeedback || '（暂无）'}


【模型交付效率是否符合预期？】
评分：${formatHalfScore(report.efficiencyScore)} / 10
评论：
${report.efficiencyComment || '（暂无）'}


【模型的产物质量怎么样】
评分：${formatHalfScore(report.qualityScore)} / 10
评论：
${report.qualityComment || '（暂无）'}


【模型的综合表现怎么样】
评分：${formatIntegerScore(report.overallScore)} / 10
评论：
${report.overallComment || '（暂无）'}


【轨迹分析】
${report.trajectoryAnalysis || '未提供轨迹截图。'}
`
      zip.file(`${model.modelCode}-评估报告.txt`, text)
    }
  }

  const buffer = await zip.generateAsync({ type: 'uint8array' })

  return new NextResponse(buffer as any, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(task.title)}.zip"`,
    },
  })
}

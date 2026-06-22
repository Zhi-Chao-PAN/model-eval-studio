import { NextResponse } from 'next/server'
import JSZip from 'jszip'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { logAudit } from '@/lib/audit'
import { apiError } from '@/lib/api-error'
import { getTaskAccess, requireAccess } from '@/lib/task-access'
import { consumeRateLimit, rateLimitResponse } from '@/lib/rate-limit'

export const runtime = 'nodejs'

type ExportFormat = 'zip' | 'json' | 'csv'

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

function resolveFormat(searchParams: URLSearchParams): ExportFormat {
  const raw = (searchParams.get('format') || 'zip').toLowerCase()
  if (raw === 'json') return 'json'
  if (raw === 'csv') return 'csv'
  return 'zip'
}

function buildReportText(modelCode: string, report: any): string {
  return `====================================
评估对象：${modelCode}
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
}

/**
 * 构建完整 JSON 导出结构：任务信息 + 所有模型 + 最新报告 + 硬指标
 */
function buildJsonPayload(task: any) {
  return {
    task: {
      id: task.id,
      title: task.title,
      description: task.description,
      requirementType: task.requirementType,
      status: task.status,
      currentStep: task.currentStep,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    },
    exportedAt: new Date().toISOString(),
    models: task.models.map((model: any) => {
      const report = model.reports?.[0] || null
      return {
        id: model.id,
        modelCode: model.modelCode,
        displayName: model.displayName,
        hardMetrics: model.hardMetricsJson ? safeJsonParse(model.hardMetricsJson) : null,
        report: report ? {
          id: report.id,
          createdAt: report.createdAt,
          productFeedback: report.productFeedback,
          verificationSummary: report.verificationSummary,
          efficiencyScore: report.efficiencyScore,
          efficiencyComment: report.efficiencyComment,
          qualityScore: report.qualityScore,
          qualityComment: report.qualityComment,
          overallScore: report.overallScore,
          overallComment: report.overallComment,
          trajectoryAnalysis: report.trajectoryAnalysis,
        } : null,
      }
    }),
  }
}

function safeJsonParse(text: string): any {
  try { return JSON.parse(text) } catch { return null }
}

/**
 * 构建 CSV 横向对比表：每个模型一行，包含各项评分和关键信息
 */
function buildCsvPayload(task: any): string {
  const headers = [
    '模型编码',
    '显示名称',
    '综合评分',
    '效率评分',
    '质量评分',
    '综合评语',
    '效率评语',
    '质量评语',
    '产物效果反馈',
    '轨迹分析',
    '报告生成时间',
  ]

  const rows = task.models.map((model: any) => {
    const report = model.reports?.[0] || null
    return [
      model.modelCode || '',
      model.displayName || '',
      report ? formatIntegerScore(report.overallScore) : '-',
      report ? formatHalfScore(report.efficiencyScore) : '-',
      report ? formatHalfScore(report.qualityScore) : '-',
      report ? (report.overallComment || '') : '',
      report ? (report.efficiencyComment || '') : '',
      report ? (report.qualityComment || '') : '',
      report ? (report.productFeedback || '') : '',
      report ? (report.trajectoryAnalysis || '') : '',
      report ? report.createdAt : '',
    ].map(csvEscape)
  })

  return [headers.map(csvEscape).join(','), ...rows.map((r: string[]) => r.join(','))].join('\n')
}

function csvEscape(value: string): string {
  if (value == null) return ''
  const str = String(value)
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function sanitizeFilename(name: string): string {
  // 去除文件名中的非法字符，保留中文、字母、数字、下划线、短横线
  return name.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 80) || 'task-export'
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const startedAt = Date.now()
  const session = await requireAuth()
  if (!session) return apiError('未登录', 401)
  const { id } = await params

  // Export builds a ZIP in memory and serializes all task data; moderate
  // rate limit to prevent CPU/memory abuse.
  const rl = await consumeRateLimit({
    scope: 'task-export',
    identifier: session.userId,
    limit: 20,
    windowMs: 10 * 60_000,
  })
  if (!rl.allowed) return rateLimitResponse(rl)

  const url = new URL(request.url)
  const format = resolveFormat(url.searchParams)

  const { access } = await getTaskAccess(id, session)
  const denied = requireAccess(access, 'VIEWER')
  if (denied) {
    logAudit(request, {
      action: 'EXPORT',
      userId: session.userId,
      taskId: id,
      status: 'error',
      error: denied.error,
      durationMs: Date.now() - startedAt,
    })
    return apiError(denied.error, denied.status)
  }

  const task = await prisma.task.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      description: true,
      requirementType: true,
      status: true,
      currentStep: true,
      createdAt: true,
      updatedAt: true,
      models: {
        select: {
          id: true,
          modelCode: true,
          displayName: true,
          hardMetricsJson: true,
          reports: {
            // 导出只需要最新一版报告的可读字段，不拉 generationSnapshot/generationConfig（@db.Text 大字段）
            select: {
              id: true,
              version: true,
              source: true,
              createdAt: true,
              productFeedback: true,
              verificationSummary: true,
              efficiencyScore: true,
              efficiencyComment: true,
              qualityScore: true,
              qualityComment: true,
              overallScore: true,
              overallComment: true,
              trajectoryAnalysis: true,
            },
            orderBy: { version: 'desc' },
            take: 1,
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  })
  if (!task) {
    logAudit(request, {
      action: 'EXPORT',
      userId: session.userId,
      taskId: id,
      status: 'error',
      error: '任务不存在',
      durationMs: Date.now() - startedAt,
    })
    return apiError('任务不存在', 404)
  }

  const baseFilename = sanitizeFilename(task.title)

  // fire-and-forget audit
  logAudit(request, {
    action: 'EXPORT',
    userId: session.userId,
    taskId: id,
    status: 'success',
    durationMs: Date.now() - startedAt,
    detail: { modelCount: task.models.length, title: task.title, format },
  })

  if (format === 'json') {
    const payload = buildJsonPayload(task)
    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${baseFilename}.json"`,
      },
    })
  }

  if (format === 'csv') {
    const csv = buildCsvPayload(task)
    // 添加 BOM 以便 Excel 正确识别 UTF-8 中文
    const bomCsv = '\uFEFF' + csv
    return new NextResponse(bomCsv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${baseFilename}.csv"`,
      },
    })
  }

  // ZIP 格式（默认）
  const zip = new JSZip()
  zip.file('README.txt', `任务：${task.title}\n导出时间：${new Date().toLocaleString('zh-CN')}\n\n本压缩包包含该任务下所有模型的评估报告（5 模块格式）。\n`)

  for (const model of task.models) {
    const report = model.reports[0]
    if (report) {
      const text = buildReportText(model.modelCode, report)
      zip.file(`${sanitizeFilename(model.modelCode)}-评估报告.txt`, text)
    }
  }

  const buffer = await zip.generateAsync({ type: 'uint8array' })

  return new NextResponse(buffer as any, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${baseFilename}.zip"`,
    },
  })
}

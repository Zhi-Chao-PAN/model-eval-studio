import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/session'
import { PRESET_TEMPLATES } from '@/lib/rubric-templates'
import { safeServerError } from '@/lib/api-error'

// 获取预设评分模板列表
export async function GET() {
  try {
    const session = await requireAuth()
    if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })

    const templates = PRESET_TEMPLATES.map((t) => ({
      key: t.key,
      name: t.name,
      description: t.description,
      dimensionCount: t.rubric.dimensions.length,
      totalWeight: t.rubric.dimensions.reduce((s, d) => s + d.weight, 0),
    }))

    return NextResponse.json({ templates })
  } catch (e: unknown) {
    const { status, message } = safeServerError(e, 'rubrics-templates')
    return NextResponse.json({ error: message }, { status })
  }
}

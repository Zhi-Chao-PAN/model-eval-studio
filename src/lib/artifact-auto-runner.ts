/**
 * Safe Artifact Auto Runner V1
 * ────────────────────────────
 * 纯函数、零依赖、零网络、零执行。V1 只做"安全静态验收"：
 *
 *   1. 读取模型已上传产物元数据（name / size / mimeType / 解析文本）。
 *   2. 识别主产物：报告 / 文档 / 表格 / README / package.json / 入口文件优先；
 *      node_modules / 字体 / 缓存 / 二进制 / HTML 错误页一律降权。
 *   3. 生成文件清单证据（file_manifest）。
 *   4. 生成解析摘要（parsed_content）。
 *   5. 生成项目结构摘要（structure_check）。
 *   6. 生成质量信号（quality_signal）：README、入口、报告、明显无关文件、空文件等。
 *   7. 生成自动限制（limitation）：明确写"未执行不可信代码"、"未接入 Sandbox"、
 *      "该证据属于后台自动候选证据，不等同于测试者本地验收截图"。
 *   8. 生成 auto_candidate 证据：可作为交付效率 / 产物质量 / 综合评价的依据；
 *      **不**作为产物效果反馈的正式截图依据。
 *
 * 设计边界：
 *   - 不执行用户代码；不打开外部网络；不调用任何 LLM。
 *   - 复用 artifact-preview 已有的辅助函数（inferArtifactPreviewKind、
 *     shouldIgnoreArchiveEntry、isJunkArtifactText、artifactEntryScore），
 *     避免重复造轮子。
 *   - 入参是 ModelArtifact 数组（不是 blob），不读取文件二进制；依赖已经
 *     解析好的 textContent / parsedText。
 */

import {
  artifactEntryScore,
  inferArtifactPreviewKind,
  isJunkArtifactText,
  shouldIgnoreArchiveEntry,
  type ArtifactPreviewKind,
} from './artifact-preview'
import {
  buildEvidence,
  type ArtifactEvidence,
} from './artifact-evidence-chain'

// ── 类型 ─────────────────────────────────────────────────────────────────

export interface AutoRunnerArtifact {
  id: string
  name: string
  size?: number | null
  mimeType?: string | null
  parsedText?: string | null
  textContent?: string | null
}

export interface AutoRunnerInput {
  modelId: string
  artifacts: AutoRunnerArtifact[]
}

export interface AutoRunnerResult {
  items: ArtifactEvidence[]
  /** 是否识别到至少一个真正可解析的主产物（false = 产物为空 / 全是无效内容） */
  hasUsablePrimary: boolean
  /** 找到的主产物（按 artifactEntryScore 排序的第一名；可能为 null） */
  primaryName: string | null
  primaryKind: ArtifactPreviewKind | null
}

// ── 工具 ────────────────────────────────────────────────────────────────

function safeFirstLine(text: string, max = 120): string {
  const trimmed = text.replace(/\r\n?/g, '\n').trim()
  if (!trimmed) return ''
  return trimmed.split('\n').slice(0, 6).join(' / ').slice(0, max)
}

function looksLikeHtmlErrorPage(text: string): boolean {
  return /<\/?(html|body|head|!doctype)\b/i.test(text.slice(0, 4000))
}

function isJunkName(name: string): boolean {
  if (!name) return true
  if (shouldIgnoreArchiveEntry(name)) return true
  return /\.(map|pyc|pyo|class|dll|exe|so|dylib|ico|ds_store)$/i.test(name)
}

// ── 主入口 ──────────────────────────────────────────────────────────────

export function runSafeArtifactAutoRunner(input: AutoRunnerInput): AutoRunnerResult {
  const { modelId, artifacts } = input
  const items: ArtifactEvidence[] = []

  // ── 0) 空产物 / 全无效路径 ──
  if (!artifacts || artifacts.length === 0) {
    items.push(buildEvidence({
      modelId,
      evidenceType: 'limitation',
      source: 'auto_runner',
      title: '尚未上传产物',
      summary: '没有产物可分析；产物质量、交付效率只能基于硬指标与任务信息评估。',
    }))
    items.push(buildEvidence({
      modelId,
      evidenceType: 'limitation',
      source: 'auto_runner',
      title: '未执行不可信代码、未接入 Sandbox',
      summary: 'V1 自动验收运行器只做静态分析，不运行用户上传脚本、不连外网。',
    }))
    return { items, hasUsablePrimary: false, primaryName: null, primaryKind: null }
  }

  // ── 1) 文件清单 ──
  const manifestLines = artifacts.slice(0, 30).map(artifact => {
    const kind = inferArtifactPreviewKind(artifact.name)
    const sizeKb = typeof artifact.size === 'number' && artifact.size > 0
      ? (artifact.size > 1024 * 1024 ? `${(artifact.size / 1024 / 1024).toFixed(1)}MB` : `${Math.round(artifact.size / 1024)}KB`)
      : ''
    return `${artifact.name}（${kind}${sizeKb ? `, ${sizeKb}` : ''}）`
  })
  const ignoredCount = artifacts.filter(artifact => isJunkName(artifact.name)).length
  items.push(buildEvidence({
    modelId,
    evidenceType: 'file_manifest',
    source: 'auto_runner',
    title: `已收集 ${artifacts.length} 个产物${ignoredCount > 0 ? `（已过滤 ${ignoredCount} 个无关文件）` : ''}`,
    summary: manifestLines.slice(0, 8).join('；'),
    detail: manifestLines.join('\n'),
    metadata: {
      artifactCount: artifacts.length,
      ignoredCount,
      manifestPreview: manifestLines.slice(0, 12),
    },
  }))

  // ── 2) 主产物识别 ──
  const ranked = artifacts
    .map(artifact => {
      const text = (artifact.parsedText || artifact.textContent || '').trim()
      const kind = inferArtifactPreviewKind(artifact.name)
      const score = artifactEntryScore(artifact.name, kind, text)
      return { artifact, text, kind, score }
    })
    // 过滤：junk 文件名 / HTML 错误页 / 完全空内容
    .filter(item => !isJunkName(item.artifact.name))
    .filter(item => !looksLikeHtmlErrorPage(item.text))
    .filter(item => !isJunkArtifactText(item.text))
    .sort((a, b) => b.score - a.score)

  const primary = ranked[0]
  if (!primary || primary.score <= 0) {
    items.push(buildEvidence({
      modelId,
      evidenceType: 'limitation',
      source: 'auto_runner',
      title: '未识别到可解析主产物',
      summary: '产物文件名、解析文本或大小未能匹配任何已知有效模板。',
      detail: artifacts.slice(0, 12).map(a => a.name).join('\n'),
    }))
    items.push(buildEvidence({
      modelId,
      evidenceType: 'limitation',
      source: 'auto_runner',
      title: '未执行不可信代码、未接入 Sandbox',
      summary: 'V1 自动验收运行器只做静态分析；产物效果反馈仍需测试者本地验收截图。',
    }))
    return { items, hasUsablePrimary: false, primaryName: null, primaryKind: null }
  }

  items.push(buildEvidence({
    modelId,
    evidenceType: 'primary_artifact',
    source: 'auto_runner',
    title: `主产物：${primary.artifact.name}（${primary.kind}）`,
    summary: `评分 ${primary.score}，${primary.text ? `已抽取 ${primary.text.length} 字文本` : '无解析文本'}。`,
    artifactId: primary.artifact.id,
    artifactName: primary.artifact.name,
    metadata: { kind: primary.kind, score: primary.score },
  }))

  // ── 3) 解析摘要 ──
  if (primary.text) {
    items.push(buildEvidence({
      modelId,
      evidenceType: 'parsed_content',
      source: 'parser',
      title: `${primary.artifact.name} 解析摘要`,
      summary: safeFirstLine(primary.text) || '已抽取文本内容。',
      detail: primary.text.slice(0, 1000),
      artifactId: primary.artifact.id,
      artifactName: primary.artifact.name,
      metadata: {
        charactersRead: primary.text.length,
        kind: primary.kind,
      },
    }))
  }

  // ── 4) 项目结构摘要 ──
  const hasReadme = artifacts.some(a => /(^|\/)readme(\.[a-z]+)?$/i.test(a.name))
  const hasManifest = artifacts.some(a =>
    /(^|\/)(package\.json|requirements\.txt|pyproject\.toml|go\.mod|cargo\.toml|pom\.xml|build\.gradle)(\.|$)/i.test(a.name),
  )
  const hasEntry = artifacts.some(a =>
    /(^|\/)(index\.(html|js|ts|tsx|jsx|vue|svelte)|main\.(py|go|rs|java|ts)|app\.(py|ts|tsx|jsx)|server\.(js|ts))$/i.test(a.name),
  )
  const hasReport = artifacts.some(a =>
    /(报告|总结|成果|报告|results?|summary|交付|deliverable)/i.test(a.name) && !isJunkName(a.name),
  )
  const onlyImages = artifacts.every(a => inferArtifactPreviewKind(a.name) === 'image')
  const emptyCount = artifacts.filter(a => !(a.parsedText || a.textContent || '').trim() && inferArtifactPreviewKind(a.name) !== 'image').length

  const structureSignals: string[] = []
  if (hasReadme) structureSignals.push('有 README / 说明文档')
  if (hasManifest) structureSignals.push('有项目清单（package.json / requirements / pyproject 等）')
  if (hasEntry) structureSignals.push('有源码入口（index / main / app / server）')
  if (hasReport) structureSignals.push('含显式报告 / 交付物')
  if (onlyImages) structureSignals.push('产物全部为图片，未提供可解析正文')
  if (emptyCount > 0) structureSignals.push(`${emptyCount} 个文本类产物无解析内容`)

  items.push(buildEvidence({
    modelId,
    evidenceType: 'structure_check',
    source: 'auto_runner',
    title: '项目结构信号',
    summary: structureSignals.length > 0
      ? structureSignals.join('；')
      : '未识别到 README / 项目清单 / 入口等典型结构。',
    metadata: {
      hasReadme,
      hasManifest,
      hasEntry,
      hasReport,
      onlyImages,
      emptyCount,
    },
  }))

  // ── 5) 质量信号 ──
  const qualityParts: string[] = []
  if (hasReadme && hasManifest && hasEntry) qualityParts.push('具备基本工程结构')
  else if (hasManifest || hasEntry) qualityParts.push('部分具备工程结构')
  else qualityParts.push('缺少典型工程结构')
  if (onlyImages) qualityParts.push('未提供可解析正文')
  if (emptyCount > 0) qualityParts.push(`含 ${emptyCount} 个无内容产物`)
  const tooSmallForProject = artifacts.filter(a => {
    const size = typeof a.size === 'number' ? a.size : 0
    return size > 0 && size < 256 && inferArtifactPreviewKind(a.name) !== 'image'
  }).length
  if (tooSmallForProject > 0) qualityParts.push(`${tooSmallForProject} 个文本类产物体积过小`)
  if (ignoredCount > 0) qualityParts.push(`过滤 ${ignoredCount} 个明显无关文件`)

  items.push(buildEvidence({
    modelId,
    evidenceType: 'quality_signal',
    source: 'auto_runner',
    title: '质量信号（仅基于产物内容，不依赖截图）',
    summary: qualityParts.join('；'),
    metadata: {
      hasReadme,
      hasManifest,
      hasEntry,
      hasReport,
      onlyImages,
      emptyCount,
      tooSmallForProject,
      ignoredCount,
    },
  }))

  // ── 6) 自动候选证据（可作为效率/质量/综合评价依据） ──
  items.push(buildEvidence({
    modelId,
    evidenceType: 'auto_candidate',
    source: 'auto_runner',
    title: '候选证据摘要（可引用到报告，但不代表测试者本地验收）',
    summary: `主产物为 ${primary.artifact.name}（${primary.kind}），${structureSignals.join('；') || '无典型结构信号'}。`,
    artifactId: primary.artifact.id,
    artifactName: primary.artifact.name,
  }))

  // ── 7) 限制说明 ──
  items.push(buildEvidence({
    modelId,
    evidenceType: 'limitation',
    source: 'auto_runner',
    title: '本轮自动验收边界',
    summary: 'V1 仅做静态分析；未执行产物内部代码、未接入 Sandbox、未连接外部网络。',
    detail: '该证据属于后台自动候选证据，可作为交付效率 / 产物质量 / 综合评价的辅助依据，但不构成测试者本地验收截图；产物效果反馈仍需测试者上传本地验收截图。',
  }))

  return {
    items,
    hasUsablePrimary: true,
    primaryName: primary.artifact.name,
    primaryKind: primary.kind,
  }
}
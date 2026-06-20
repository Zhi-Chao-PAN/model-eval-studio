import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  buildLegacyArchivePreview,
  buildPreviewFrameDocument,
  inferArtifactPreviewKind,
  parseStoredArtifactPreview,
  sanitizePreviewHtml,
  type ArtifactPreviewKind,
  type StoredArtifactPreview,
} from '@/lib/artifact-preview'

const MAX_CAPTURE_DATA_URL_LENGTH = 1_100_000

export type ArtifactCaptureInput = {
  taskTitle: string
  modelCode: string
  artifact: {
    id: string
    name: string
    url?: string | null
    mimeType?: string | null
    size?: number | null
    parsedText?: string | null
    textContent?: string | null
    previewJson?: string | null
  }
}

export type ArtifactCaptureResult = {
  dataUrl: string
  artifactKind: ArtifactPreviewKind
  renderMode: StoredArtifactPreview['renderMode']
  primaryName: string
  runner: string
  runLog: string
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function isImageArtifact(artifact: ArtifactCaptureInput['artifact']): boolean {
  return Boolean(
    artifact.url?.startsWith('data:image/') ||
    artifact.mimeType?.startsWith('image/') ||
    /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(artifact.name),
  )
}

function isHtmlArtifact(artifact: ArtifactCaptureInput['artifact'], text: string): boolean {
  return Boolean(
    /\.(html?|xhtml)$/i.test(artifact.name) ||
    artifact.mimeType?.includes('html') ||
    /^\s*<!doctype html/i.test(text) ||
    /^\s*<html[\s>]/i.test(text),
  )
}

function artifactText(artifact: ArtifactCaptureInput['artifact']): string {
  return (artifact.textContent || artifact.parsedText || '').trim()
}

function previewForArtifact(artifact: ArtifactCaptureInput['artifact'], text: string): StoredArtifactPreview | null {
  const stored = parseStoredArtifactPreview(artifact.previewJson)
  if (stored) return stored
  if (/\.zip$/i.test(artifact.name) || artifact.mimeType?.includes('zip')) {
    return buildLegacyArchivePreview(artifact.name, text)
  }
  return null
}

function localChromiumPath(): string | undefined {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    process.env.CHROME_EXECUTABLE_PATH,
    path.join(process.env.ProgramFiles || '', 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(process.env['ProgramFiles(x86)'] || '', 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(process.env.ProgramFiles || '', 'Microsoft\\Edge\\Application\\msedge.exe'),
    path.join(process.env['ProgramFiles(x86)'] || '', 'Microsoft\\Edge\\Application\\msedge.exe'),
  ].filter(Boolean) as string[]

  return candidates.find(candidate => existsSync(candidate))
}

function buildVerificationHtml(input: ArtifactCaptureInput): {
  html: string
  kind: ArtifactCaptureResult['artifactKind']
  renderMode: ArtifactCaptureResult['renderMode']
  primaryName: string
} {
  const { taskTitle, modelCode, artifact } = input
  const text = artifactText(artifact)
  const now = new Date().toLocaleString('zh-CN', { hour12: false })
  const title = escapeHtml(taskTitle || '未命名任务')
  const name = escapeHtml(artifact.name || '未命名产物')
  const code = escapeHtml(modelCode || 'UNKNOWN')
  const size = typeof artifact.size === 'number'
    ? `${(artifact.size / 1024).toFixed(1)} KB`
    : '未知'

  let body = ''
  let kind: ArtifactCaptureResult['artifactKind'] = inferArtifactPreviewKind(artifact.name)
  let renderMode: ArtifactCaptureResult['renderMode'] = 'plain-text'
  let primaryName = artifact.name
  const preview = previewForArtifact(artifact, text)

  if (isImageArtifact(artifact) && artifact.url?.startsWith('data:image/')) {
    kind = 'image'
    renderMode = 'direct-image'
    body = `
      <section class="canvas image-canvas">
        <img src="${artifact.url}" alt="${name}" />
      </section>
    `
  } else if (preview) {
    kind = preview.primaryKind
    renderMode = preview.renderMode
    primaryName = preview.primaryName
    body = `
      <section class="preview-note">
        <strong>当前打开：${escapeHtml(preview.primaryName)}</strong>
        <span>${preview.renderMode === 'legacy-extract' ? '压缩包主文件预览' : '源文件结构化预览'}</span>
      </section>
      <section class="canvas html-canvas">
        <iframe sandbox="" srcdoc="${escapeHtml(buildPreviewFrameDocument(preview))}" title="Artifact structured preview"></iframe>
      </section>
    `
  } else if (isHtmlArtifact(artifact, text) && text) {
    kind = 'html'
    renderMode = 'sanitized-html'
    const directPreview: StoredArtifactPreview = {
      version: 1, source: 'file', sourceName: artifact.name, primaryName: artifact.name,
      primaryKind: 'html', renderMode, html: sanitizePreviewHtml(text), text,
    }
    body = `<section class="canvas html-canvas"><iframe sandbox="" srcdoc="${escapeHtml(buildPreviewFrameDocument(directPreview))}" title="HTML artifact preview"></iframe></section>`
  } else if (text) {
    kind = inferArtifactPreviewKind(artifact.name)
    renderMode = kind === 'table' ? 'structured-table' : kind === 'document' ? 'converted-document' : 'plain-text'
    const directPreview: StoredArtifactPreview = {
      version: 1, source: 'file', sourceName: artifact.name, primaryName: artifact.name,
      primaryKind: kind, renderMode, text,
    }
    body = `
      <section class="preview-note"><strong>当前打开：${escapeHtml(artifact.name)}</strong><span>文件内容预览</span></section>
      <section class="canvas html-canvas">
        <iframe sandbox="" srcdoc="${escapeHtml(buildPreviewFrameDocument(directPreview))}" title="Artifact content preview"></iframe>
      </section>
    `
  } else {
    body = `
      <section class="canvas empty-canvas">
        <div class="empty-icon">FILE</div>
        <h2>该产物没有可直接渲染的文本或图片内容</h2>
        <p>后台已读取产物元数据，但未能形成可视预览。可通过窗口捕获或上传截图补充核验证据。</p>
      </section>
    `
  }

  return {
    kind,
    renderMode,
    primaryName,
    html: `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    :root {
      color-scheme: light;
      background: #eef2f7;
      color: #172033;
      font-family: "Segoe UI", "Microsoft YaHei", "PingFang SC", Arial, sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: #eef2f7;
    }
    .shell {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      padding: 18px;
      gap: 12px;
    }
    header {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 18px;
      align-items: start;
      border: 1px solid #d7dde8;
      background: #ffffff;
      border-radius: 10px;
      padding: 12px 14px;
      box-shadow: 0 4px 18px rgba(15,23,42,.06);
    }
    .eyebrow {
      color: #64748b;
      font-size: 11px;
      font-weight: 600;
      margin-bottom: 5px;
    }
    h1 {
      font-size: 18px;
      line-height: 1.25;
      margin: 0;
      max-width: 920px;
      word-break: break-word;
    }
    .meta {
      margin-top: 11px;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      color: #475569;
      font-size: 11px;
    }
    .pill {
      border: 1px solid #d7dde8;
      background: #f8fafc;
      border-radius: 7px;
      padding: 4px 7px;
      max-width: 420px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .stamp {
      text-align: right;
      color: #94a3b8;
      font-size: 11px;
      line-height: 1.6;
      white-space: nowrap;
    }
    .canvas {
      flex: 1;
      min-height: 0;
      border: 1px solid #d7dde8;
      background: #ffffff;
      color: #0f172a;
      border-radius: 10px;
      overflow: hidden;
      box-shadow: 0 10px 28px rgba(15,23,42,.08);
    }
    .preview-note {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: center;
      padding: 9px 12px;
      border: 1px solid #d7dde8;
      background: #ffffff;
      color: #1f2937;
      border-radius: 10px;
      font-size: 12px;
    }
    .preview-note span { color: #64748b; }
    .image-canvas {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      background: #f8fafc;
    }
    .image-canvas img {
      max-width: 100%;
      max-height: 650px;
      object-fit: contain;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      background: white;
    }
    .html-canvas iframe {
      width: 100%;
      height: 650px;
      border: 0;
      background: white;
    }
    .text-canvas {
      padding: 0;
      background: #f8fafc;
    }
    pre {
      margin: 0;
      padding: 24px;
      white-space: pre-wrap;
      word-break: break-word;
      color: #111827;
      font: 13px/1.68 "SFMono-Regular", Consolas, "Liberation Mono", monospace;
    }
    .empty-canvas {
      display: grid;
      place-items: center;
      text-align: center;
      padding: 48px;
      background: #f8fafc;
    }
    .empty-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      height: 64px;
      width: 64px;
      margin-bottom: 18px;
      border-radius: 16px;
      background: #e0f2fe;
      color: #0369a1;
      font-weight: 800;
      font-size: 13px;
    }
    .empty-canvas h2 {
      margin: 0 0 8px;
      font-size: 21px;
    }
    .empty-canvas p {
      margin: 0;
      max-width: 520px;
      color: #64748b;
      line-height: 1.7;
    }
  </style>
</head>
<body>
  <main class="shell">
    <header>
      <div>
        <div class="eyebrow">产物核验视图</div>
        <h1>${escapeHtml(primaryName || artifact.name || '未命名产物')}</h1>
        <div class="meta">
          <span class="pill">模型：${code}</span>
          <span class="pill">任务：${title}</span>
          <span class="pill">来源：${name}</span>
          <span class="pill">大小：${escapeHtml(size)}</span>
        </div>
      </div>
      <div class="stamp">
        <div>${escapeHtml(now)}</div>
        <div>后台代验</div>
      </div>
    </header>
    ${body}
  </main>
</body>
</html>`,
  }
}

// Vercel/serverless 环境用 puppeteer + @sparticuz/chromium（稳定、社区验证充分）
// 本地环境用 playwright-core（开发体验好）
async function launchChromium(): Promise<{
  newPage: (opts?: { viewport?: { width: number; height: number } }) => Promise<any>
  close: () => Promise<void>
  driver: 'playwright' | 'puppeteer'
}> {
  const isVercel = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME)

  if (isVercel) {
    // ---- Vercel / Lambda: puppeteer + @sparticuz/chromium ----
    const puppeteer = (await import('puppeteer-core')).default
    const chromium = (await import('@sparticuz/chromium')).default

    const browser = await puppeteer.launch({
      args: [...chromium.args, '--hide-scrollbars', '--disable-web-security'],
      executablePath: await chromium.executablePath(),
      headless: true,
      defaultViewport: null,
    } as any)

    return {
      driver: 'puppeteer',
      async newPage(opts) {
        const page = await browser.newPage()
        if (opts?.viewport) {
          await page.setViewport({
            width: opts.viewport.width,
            height: opts.viewport.height,
            deviceScaleFactor: 1,
          })
        }
        return page
      },
      close: () => browser.close(),
    }
  }

  // ---- 本地: playwright-core ----
  const { chromium: playwrightChromium } = await import('playwright-core')

  const executablePath = localChromiumPath()
  if (!executablePath) {
    throw new Error('本机未找到 Chrome/Edge，可设置 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH 后重试。')
  }

  const browser = await playwrightChromium.launch({
    executablePath,
    headless: true,
    args: ['--hide-scrollbars', '--no-sandbox'],
  })

  return {
    driver: 'playwright',
    async newPage(opts) {
      return browser.newPage({
        viewport: opts?.viewport || { width: 1365, height: 900 },
        deviceScaleFactor: 1,
      })
    },
    close: () => browser.close(),
  }
}

export async function captureArtifactScreenshot(input: ArtifactCaptureInput): Promise<ArtifactCaptureResult> {
  const { html, kind, renderMode, primaryName } = buildVerificationHtml(input)
  const browser = await launchChromium()

  try {
    const page = await browser.newPage({ viewport: { width: 1365, height: 900 } })

    if (browser.driver === 'playwright') {
      // ---- Playwright driver ----
      const pwPage = page as any
      await pwPage.route('**/*', async (route: any) => {
        const url = route.request().url()
        if (
          url.startsWith('data:') ||
          url.startsWith('blob:') ||
          url === 'about:blank'
        ) {
          await route.continue()
          return
        }
        await route.abort()
      })

      await pwPage.setContent(html, { waitUntil: 'load', timeout: 15_000 })
      await pwPage.waitForTimeout(300)

      const attempts = [
        { width: 1365, height: 900, quality: 82 },
        { width: 1280, height: 820, quality: 76 },
        { width: 1100, height: 760, quality: 70 },
      ]

      let dataUrl = ''
      for (const attempt of attempts) {
        await pwPage.setViewportSize({ width: attempt.width, height: attempt.height })
        const buffer = await pwPage.screenshot({
          type: 'jpeg',
          quality: attempt.quality,
          fullPage: false,
        })
        dataUrl = `data:image/jpeg;base64,${buffer.toString('base64')}`
        if (dataUrl.length <= MAX_CAPTURE_DATA_URL_LENGTH) break
      }

      return {
        dataUrl,
        artifactKind: kind,
        renderMode,
        primaryName,
        runner: process.env.VERCEL ? 'vercel-server-chromium' : `${os.platform()}-local-chromium`,
        runLog: [
          `artifact=${input.artifact.name}`,
          `kind=${kind}`,
          `primary=${primaryName}`,
          `render_mode=${renderMode}`,
          `driver=playwright`,
          `executed_untrusted_code=false`,
        ].join('\n'),
      }
    } else {
      // ---- Puppeteer driver (Vercel) ----
      const pupPage = page as any

      // 拦截所有非 data/blob 资源
      await pupPage.setRequestInterception(true)
      pupPage.on('request', (req: any) => {
        const url = req.url()
        if (url.startsWith('data:') || url.startsWith('blob:') || url === 'about:blank') {
          req.continue()
        } else {
          req.abort()
        }
      })

      await pupPage.setContent(html, { waitUntil: 'load', timeout: 15_000 })
      await new Promise(r => setTimeout(r, 300))

      const attempts = [
        { width: 1365, height: 900, quality: 82 },
        { width: 1280, height: 820, quality: 76 },
        { width: 1100, height: 760, quality: 70 },
      ]

      let dataUrl = ''
      for (const attempt of attempts) {
        await pupPage.setViewport({
          width: attempt.width,
          height: attempt.height,
          deviceScaleFactor: 1,
        })
        const screenshot = await pupPage.screenshot({
          type: 'jpeg',
          quality: attempt.quality,
          fullPage: false,
          encoding: 'base64',
        })
        dataUrl = `data:image/jpeg;base64,${screenshot}`
        if (dataUrl.length <= MAX_CAPTURE_DATA_URL_LENGTH) break
      }

      return {
        dataUrl,
        artifactKind: kind,
        renderMode,
        primaryName,
        runner: 'vercel-server-chromium',
        runLog: [
          `artifact=${input.artifact.name}`,
          `kind=${kind}`,
          `primary=${primaryName}`,
          `render_mode=${renderMode}`,
          `driver=puppeteer`,
          `executed_untrusted_code=false`,
        ].join('\n'),
      }
    }
  } finally {
    await browser.close()
  }
}

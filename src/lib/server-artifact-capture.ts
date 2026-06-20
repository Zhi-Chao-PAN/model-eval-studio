import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const MAX_CAPTURE_TEXT_LENGTH = 90_000
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
  }
}

export type ArtifactCaptureResult = {
  dataUrl: string
  artifactKind: 'image' | 'html' | 'text' | 'metadata'
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

function truncate(value: string, limit: number): { text: string; truncated: boolean } {
  if (value.length <= limit) return { text: value, truncated: false }
  return {
    text: value.slice(0, limit),
    truncated: true,
  }
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

function buildVerificationHtml(input: ArtifactCaptureInput): { html: string; kind: ArtifactCaptureResult['artifactKind'] } {
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
  let kind: ArtifactCaptureResult['artifactKind'] = 'metadata'

  if (isImageArtifact(artifact) && artifact.url?.startsWith('data:image/')) {
    kind = 'image'
    body = `
      <section class="canvas image-canvas">
        <img src="${artifact.url}" alt="${name}" />
      </section>
    `
  } else if (isHtmlArtifact(artifact, text) && text) {
    kind = 'html'
    body = `
      <section class="canvas html-canvas">
        <iframe sandbox="" srcdoc="${escapeHtml(text)}" title="HTML artifact preview"></iframe>
      </section>
    `
  } else if (text) {
    kind = 'text'
    const clipped = truncate(text, MAX_CAPTURE_TEXT_LENGTH)
    body = `
      <section class="canvas text-canvas">
        <pre>${escapeHtml(clipped.text)}${clipped.truncated ? '\n\n[内容过长，后台核验截图仅展示前 90,000 个字符。]' : ''}</pre>
      </section>
    `
  } else {
    body = `
      <section class="canvas empty-canvas">
        <div class="empty-icon">FILE</div>
        <h2>该产物没有可直接渲染的文本或图片内容</h2>
        <p>后台已读取产物元数据，但未能自动打开可视内容。请使用手动真实截图作为兜底证据。</p>
      </section>
    `
  }

  return {
    kind,
    html: `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    :root {
      color-scheme: dark;
      background: #0b0d12;
      color: #eef2ff;
      font-family: Inter, "Segoe UI", "Microsoft YaHei", "PingFang SC", Arial, sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background:
        linear-gradient(180deg, rgba(15, 23, 42, 0.94), rgba(9, 12, 18, 0.98)),
        radial-gradient(circle at 20% 0%, rgba(14, 165, 233, 0.14), transparent 32%);
    }
    .shell {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      padding: 32px;
      gap: 18px;
    }
    header {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 24px;
      align-items: start;
      border: 1px solid rgba(255,255,255,0.1);
      background: rgba(255,255,255,0.045);
      border-radius: 14px;
      padding: 18px 20px;
    }
    .eyebrow {
      color: #67e8f9;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: .08em;
      text-transform: uppercase;
      margin-bottom: 8px;
    }
    h1 {
      font-size: 26px;
      line-height: 1.25;
      margin: 0;
      max-width: 920px;
      word-break: break-word;
    }
    .meta {
      margin-top: 11px;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      color: #a5b4fc;
      font-size: 12px;
    }
    .pill {
      border: 1px solid rgba(255,255,255,0.1);
      background: rgba(255,255,255,0.05);
      border-radius: 999px;
      padding: 5px 9px;
      max-width: 420px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .stamp {
      text-align: right;
      color: #94a3b8;
      font-size: 12px;
      line-height: 1.7;
      white-space: nowrap;
    }
    .canvas {
      flex: 1;
      min-height: 0;
      border: 1px solid rgba(255,255,255,0.11);
      background: #ffffff;
      color: #0f172a;
      border-radius: 14px;
      overflow: hidden;
      box-shadow: 0 24px 80px rgba(0,0,0,.35);
    }
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
        <div class="eyebrow">后台自动产物核验截图</div>
        <h1>${title}</h1>
        <div class="meta">
          <span class="pill">模型：${code}</span>
          <span class="pill">产物：${name}</span>
          <span class="pill">大小：${escapeHtml(size)}</span>
        </div>
      </div>
      <div class="stamp">
        <div>Capture: ${escapeHtml(now)}</div>
        <div>Runner: Server Chromium</div>
      </div>
    </header>
    ${body}
  </main>
</body>
</html>`,
  }
}

async function launchChromium() {
  const { chromium: playwrightChromium } = await import('playwright-core')

  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const chromium = (await import('@sparticuz/chromium')).default
    chromium.setGraphicsMode = false
    return playwrightChromium.launch({
      args: [...chromium.args, '--hide-scrollbars', '--disable-web-security'],
      executablePath: await chromium.executablePath(),
      headless: true,
    })
  }

  const executablePath = localChromiumPath()
  if (!executablePath) {
    throw new Error('本机未找到 Chrome/Edge，可设置 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH 后重试。')
  }

  return playwrightChromium.launch({
    executablePath,
    headless: true,
    args: ['--hide-scrollbars', '--no-sandbox'],
  })
}

export async function captureArtifactScreenshot(input: ArtifactCaptureInput): Promise<ArtifactCaptureResult> {
  const { html, kind } = buildVerificationHtml(input)
  const browser = await launchChromium()

  try {
    const page = await browser.newPage({
      viewport: { width: 1365, height: 900 },
      deviceScaleFactor: 1,
    })

    await page.route('**/*', async (route) => {
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

    await page.setContent(html, { waitUntil: 'load', timeout: 15_000 })
    await page.waitForTimeout(300)

    const attempts = [
      { width: 1365, height: 900, quality: 82 },
      { width: 1280, height: 820, quality: 76 },
      { width: 1100, height: 760, quality: 70 },
    ]

    let dataUrl = ''
    for (const attempt of attempts) {
      await page.setViewportSize({ width: attempt.width, height: attempt.height })
      const buffer = await page.screenshot({
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
      runner: process.env.VERCEL ? 'vercel-server-chromium' : `${os.platform()}-local-chromium`,
      runLog: [
        `artifact=${input.artifact.name}`,
        `kind=${kind}`,
        `render=text/image/html safe viewer`,
        `executed_untrusted_code=false`,
      ].join('\n'),
    }
  } finally {
    await browser.close()
  }
}

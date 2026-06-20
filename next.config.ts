import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const chromiumRuntimeFiles = [
  './node_modules/@sparticuz/chromium/**/*',
  './node_modules/.pnpm/@sparticuz+chromium@*/node_modules/@sparticuz/chromium/**/*',
  './node_modules/puppeteer-core/**/*',
  './node_modules/.pnpm/puppeteer-core@*/node_modules/puppeteer-core/**/*',
]

const nextConfig: NextConfig = {
  // Vercel serverless 环境下后台截图用 puppeteer-core + @sparticuz/chromium
  // 这两个包需要作为外部包加载，确保浏览器二进制和资源文件完整
  serverExternalPackages: ['puppeteer-core', '@sparticuz/chromium'],
  outputFileTracingIncludes: {
    '/api/tasks/*/models/*/verification/auto': chromiumRuntimeFiles,
    '/api/tasks/*/models/*/artifact-analysis': chromiumRuntimeFiles,
  },
};

export default withWorkflow(nextConfig);

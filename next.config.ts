import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // playwright-core / @sparticuz/chromium 依赖浏览器二进制和资源文件
  // Vercel 默认 output file tracing 会丢失 browsers.json 等非 JS 资源
  // 1. serverExternalPackages: 不内联打包，运行时直接从 node_modules 加载
  // 2. outputFileTracingIncludes: 确保所有资源文件被包含到函数中
  //    pnpm 结构下文件实际在 .pnpm 目录，node_modules 下是 symlink
  serverExternalPackages: ['playwright-core', '@sparticuz/chromium'],
  outputFileTracingIncludes: {
    '/api/tasks/*/models/*/verification/auto': [
      './node_modules/playwright-core/**/*',
      './node_modules/.pnpm/playwright-core@*/node_modules/playwright-core/**/*',
      './node_modules/@sparticuz/chromium/**/*',
      './node_modules/.pnpm/@sparticuz+chromium@*/node_modules/@sparticuz/chromium/**/*',
    ],
  },
};

export default nextConfig;

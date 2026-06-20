import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // playwright-core / @sparticuz/chromium 依赖浏览器二进制和资源文件
  // 1. serverExternalPackages: 不内联打包，运行时直接从 node_modules 加载
  // 2. outputFileTracingIncludes: 确保 browsers.json 等非 JS 资源也被包含到函数中
  serverExternalPackages: ['playwright-core', '@sparticuz/chromium'],
  outputFileTracingIncludes: {
    '/api/tasks/*/models/*/verification/auto': [
      './node_modules/playwright-core/**/*',
      './node_modules/@sparticuz/chromium/**/*',
    ],
  },
};

export default nextConfig;

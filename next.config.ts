import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // playwright-core / @sparticuz/chromium 依赖浏览器二进制和资源文件
  // Vercel 默认打包会丢失 browsers.json 等资源文件
  // 通过 outputFileTracingIncludes 确保所有需要的文件都被包含到函数中
  outputFileTracingIncludes: {
    // 后台自动截图 API 需要的 playwright 资源
    '/api/tasks/*/models/*/verification/auto': [
      './node_modules/playwright-core/**/*',
      './node_modules/@sparticuz/chromium/**/*',
    ],
  },
};

export default nextConfig;

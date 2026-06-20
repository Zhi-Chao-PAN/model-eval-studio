import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // playwright-core 必须作为外部包加载，否则 Vercel 打包时会丢失 browsers.json 等资源文件
  // 导致后台截图功能在生产环境报错
  serverExternalPackages: ['playwright-core', '@sparticuz/chromium'],
};

export default nextConfig;

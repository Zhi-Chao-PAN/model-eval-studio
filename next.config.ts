import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  experimental: {
    // Workflow 插件会在 dev 模式下向 src/app/.well-known/workflow/ 写入生成文件。
    // Windows 上 rename 操作常因文件锁定失败（EPERM），进而触发 Next.js 全量重启。
    // 忽略这些生成文件的变动，避免 workflow 内部写入影响热更新稳定性。
    watchOptions: {
      ignored: [
        "**/node_modules/**",
        "**/.git/**",
        "**/.next/**",
        "**/src/app/.well-known/workflow/**",
      ],
    },
  },
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: [
          ...(Array.isArray(config.watchOptions?.ignored) ? config.watchOptions.ignored : []),
          /node_modules/,
          /\.git/,
          /\.next/,
          /src\/app\/\.well-known\/workflow/,
        ],
        aggregateTimeout: 150,
      };
    }
    return config;
  },
};

export default withWorkflow(nextConfig);

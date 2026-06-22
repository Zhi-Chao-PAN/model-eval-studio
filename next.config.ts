import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
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

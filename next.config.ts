import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // cacheComponents (Next 16 dynamic-caching model) is disabled: every page is
  // session-aware and must render per-request; route segment config stays available.
  cacheComponents: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

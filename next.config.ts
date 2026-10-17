import type { NextConfig } from "next";

// REPRO_HANDLER=infinity or REPRO_HANDLER=zero serves both kinds from the test handler in
// cache-handlers/. Set it for both `next build` and `next start`.
const handler = process.env.REPRO_HANDLER
  ? require.resolve("./cache-handlers/tags-in-get.js")
  : undefined;

const nextConfig: NextConfig = {
  cacheComponents: true,
  ...(handler && { cacheHandlers: { default: handler, remote: handler } }),
};

export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '200mb',
    },
  },
  // puppeteer-core resolves a Chromium executable at runtime; keep it out of the
  // server bundle so Next doesn't try to trace/bundle it (it's a runtime dep).
  serverExternalPackages: ['puppeteer-core'],
  outputFileTracingExcludes: {
    '*': [
      'node_modules/@swc/core-linux-x64-gnu',
      'node_modules/@swc/core-linux-x64-musl',
      'node_modules/@esbuild/linux-x64',
    ],
  },
};

export default nextConfig;

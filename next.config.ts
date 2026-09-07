import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  ...(process.env.STATIC_EXPORT === '1' ? { output: 'export' as const } : {}),
  // Vinext's exporter requests the root route without basePath. This app has
  // one route and in-page tabs, so prefix assets/data while exporting root HTML.
  basePath: process.env.STATIC_EXPORT === '1' ? '' : process.env.NEXT_PUBLIC_BASE_PATH || '',
  assetPrefix: process.env.STATIC_EXPORT === '1' ? process.env.NEXT_PUBLIC_BASE_PATH || '' : '',
  trailingSlash: true,
};

export default nextConfig;

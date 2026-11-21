import type { NextConfig } from 'next';

// The API as this server reaches it. In deployment the browser calls `/api/...`
// on this origin (NEXT_PUBLIC_API_URL=/api) and it is forwarded here, so the
// refresh cookie is first-party. Read at build time.
const API_URL = (process.env.API_URL || 'http://localhost:5000').replace(/\/+$/, '');

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Signed-in pages wait for a client-side session check (SessionGate), so Next's
    // implicit "instant navigation" check flags every one of them in dev. Only check
    // pages that opt in with `export const instant = true`.
    instantInsights: { validationLevel: 'manual-warning' },
    // Uploads (20 MB, MAX_UPLOAD_BYTES on the API) pass through the /api proxy.
    proxyClientMaxBodySize: '25mb',
  },
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_URL}/:path*` }];
  },
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default nextConfig;

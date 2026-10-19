const nextConfig = {
  reactStrictMode: true,
  ...(process.env.WOOF_DESKTOP_DEV === "1" ? { distDir: ".next-desktop-dev" } : {}),
  ...(process.env.WOOF_DESKTOP_BUILD === "1" ? { output: "export", trailingSlash: true, distDir: "desktop-out" } : {}),
  images: {
    unoptimized: true,
  },
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      'recharts',
      '@mui/material',
      '@mui/icons-material',
      '@radix-ui/react-icons'
    ],
  },
  async headers() {
    const securityHeaders = [
      // Next.js emits inline bootstrap data/styles in the Pages Router; this is the documented compatibility exception.
      { key: 'Content-Security-Policy', value: "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: https:; font-src 'self' data: https:; connect-src 'self' https: wss:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'" },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      { key: 'X-Frame-Options', value: 'DENY' },
    ];
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  async rewrites() {
    if (process.env.WOOF_DESKTOP_BUILD === "1") return [];
    return [
      {
        source: "/backend-api/:path*",
        destination: `${process.env.BACKEND_API_URL || "http://127.0.0.1:3001"}/api/:path*`,
      },
    ];
  },
};

if (process.env.WOOF_DESKTOP_BUILD === "1") delete nextConfig.rewrites;

export default nextConfig;

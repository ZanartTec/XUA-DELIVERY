import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Reduz drasticamente o número de módulos processados pelo Turbopack em dev
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts", "date-fns", "@radix-ui/react-icons"],
  },

  // Evita que o Next.js trace arquivos desnecessários no build
  outputFileTracingExcludes: {
    "*": ["node_modules/@swc/**", "node_modules/@esbuild/**", "node_modules/prisma/**"],
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self'",
              "connect-src 'self' ws: wss:",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;

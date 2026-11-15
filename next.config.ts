import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Content Security Policy without nonces (see the "Without Nonces" section of
// node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md). Nonces would force
// every page to render per request, which rules out Cache Components / partial prerendering, and
// Next.js's own inline scripts differ per page, so they can't be allowed by hash. Scripts may
// therefore run inline, but only from this site; the browser may talk only to this site and
// Supabase; and no other site may frame the app. Dev needs 'unsafe-eval' for React's debugging.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  `connect-src 'self' ${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}`.trim(),
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    agentUpgrade: "security",
  },
  // The default (bottom-left) covers the Settings link at the bottom of the sidebar.
  devIndicators: {
    position: "bottom-right",
  },
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

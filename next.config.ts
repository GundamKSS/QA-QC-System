import type { NextConfig } from "next";

const securityHeaders = [
  // The login form must never be framed (clickjacking).
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=()" },
  // HTTPS only (NFR-07). Browsers ignore it over plain HTTP, so local dev is unaffected;
  // the proxy in front must still redirect HTTP → HTTPS.
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
    : []),
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  // The SQL Server driver must run as plain Node modules: bundled copies broke parameter types
  // (e.g. DateTime2 → "type.validate is not a function") and could be duplicated across hot reloads.
  serverExternalPackages: ["mssql", "tedious"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async redirects() {
    // The home route checks the session and sends signed-out users to /login.
    return [{ source: "/", destination: "/home", permanent: false }];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

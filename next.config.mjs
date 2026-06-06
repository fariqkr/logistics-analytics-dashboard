/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The deterministic layer reads data/mock_logistics_data.csv from disk at
  // runtime. On Vercel, serverless functions only bundle files the tracer can
  // see, and a dynamic fs read isn't traced — so include the CSV explicitly for
  // the routes that read it at runtime (the dashboard + /api/kpis are static and
  // read it at build time, but /api/query runs per-request).
  experimental: {
    outputFileTracingIncludes: {
      "/api/query": ["./data/**"],
      "/api/kpis": ["./data/**"],
      "/": ["./data/**"],
      "/chat": ["./data/**"],
    },
  },
};

export default nextConfig;

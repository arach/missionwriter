import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // HudsonKit ships ESM + "use client" source that Next must transpile.
  transpilePackages: ["hudsonkit"],
  // Missionwriter's writer adapters stay Node-side; the route calls the shared
  // core without asking Turbopack to ingest provider package artifacts.
  serverExternalPackages: ["@cursor/sdk", "@openscout/agent-sessions"],
};

export default nextConfig;

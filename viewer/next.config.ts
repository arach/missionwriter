import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // HudsonKit ships ESM + "use client" source that Next must transpile.
  transpilePackages: ["hudsonkit"],
};

export default nextConfig;

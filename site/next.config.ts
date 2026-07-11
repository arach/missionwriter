import type { NextConfig } from "next";

const isGitHubPages = process.env.GITHUB_ACTIONS === "true";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath: isGitHubPages ? "/missionwriter" : "",
  assetPrefix: isGitHubPages ? "/missionwriter/" : undefined,
  images: { unoptimized: true },
  transpilePackages: ["hudsonkit"],
  devIndicators: false,
};

export default nextConfig;

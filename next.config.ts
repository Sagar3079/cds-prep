import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  experimental: {
    useTypeScriptCli: true,
  },
  async rewrites() {
    return [
      // Digital Asset Links must live at this exact path for Chrome to find it,
      // and the handler behind it reads the certificate fingerprint from the
      // environment. See src/app/api/assetlinks/route.ts.
      { source: "/.well-known/assetlinks.json", destination: "/api/assetlinks" },
    ];
  },
};
export default nextConfig;
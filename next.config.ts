import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  /**
   * Where the build goes. `.next` unless told otherwise.
   *
   * Overridable because the deploy is blue/green: two instances share this one
   * checkout and each owns its own build directory (`.next-a`, `.next-b`), so a
   * new version can be compiled and started while the old one is still serving
   * traffic from a directory nothing is touching. Building in place under a
   * running server is what produced the "Server Reference ID did not match"
   * errors in the logs — the process had a manifest in memory that no longer
   * matched the chunks on disk.
   *
   * Set by the systemd units and by ops/deploy.sh. Nothing else needs it.
   */
  distDir: process.env.NEXT_DIST_DIR || ".next",
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
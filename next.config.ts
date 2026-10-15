import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The news poller and ship feed run inside the server process, so this app
  // needs a long-running Node server (`next start`), not serverless functions.
  serverExternalPackages: ["ws"],
};

export default nextConfig;

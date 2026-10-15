import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The ship feed is a websocket client; keep it out of the bundle.
  serverExternalPackages: ["ws"],
  // The dev badge sits over the phone tab bar and swallows taps while testing.
  devIndicators: false,
};

export default nextConfig;

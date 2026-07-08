import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["smartapi-javascript", "ws", "pg"],
};

export default nextConfig;

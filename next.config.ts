import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["smartapi-javascript", "ws", "@neondatabase/serverless"],
};

export default nextConfig;

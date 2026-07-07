import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["smartapi-javascript", "@prisma/client", "better-sqlite3"],
};

export default nextConfig;

import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  serverExternalPackages: ["smartapi-javascript", "better-sqlite3"],
  turbopack: {
    resolveAlias: {
      // Map the generated Prisma TypeScript client so Turbopack can find it
      "@generated/prisma": path.resolve(__dirname, "src/generated/prisma"),
    },
  },
};

export default nextConfig;

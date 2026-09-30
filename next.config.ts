import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env.MVP_RUNTIME === "node" ? { output: "standalone" } : {}),
};

export default nextConfig;

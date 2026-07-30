import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/newsclip",
  reactStrictMode: true,
  images: {
    // domains 는 deprecated → remotePatterns 사용
    remotePatterns: [],
  },
};

export default nextConfig;

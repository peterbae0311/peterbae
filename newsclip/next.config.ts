import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    // domains 는 deprecated → remotePatterns 사용
    remotePatterns: [],
  },
};

export default nextConfig;

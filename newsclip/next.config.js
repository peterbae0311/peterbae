/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: "/newsclip",
  reactStrictMode: true,
  images: {
    // domains 는 deprecated → remotePatterns 사용
    remotePatterns: [],
  },
};

module.exports = nextConfig;

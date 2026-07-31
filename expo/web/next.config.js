const path = require("node:path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: "/expo",
  turbopack: {
    root: path.join(__dirname),
  },
};

module.exports = nextConfig;

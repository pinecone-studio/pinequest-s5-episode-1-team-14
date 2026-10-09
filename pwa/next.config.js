/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [{ source: "/", destination: "/landing/index.html" }];
  },
};

module.exports = nextConfig;

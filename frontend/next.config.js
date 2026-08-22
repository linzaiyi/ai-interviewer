/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [],
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "https://ai-interviewer-production-479c.up.railway.app/api/:path*",
      },
    ];
  },
};

module.exports = nextConfig;
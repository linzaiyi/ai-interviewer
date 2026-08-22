/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_API_URL: "https://ai-interviewer-production-479c.up.railway.app",
  },
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
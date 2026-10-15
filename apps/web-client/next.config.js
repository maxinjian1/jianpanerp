/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Docker（V64）用 standalone 输出；本地 dev / next start 不受影响
  output: 'standalone',
  transpilePackages: ['@japan-erp/shared-types'],
  images: {
    domains: ['localhost', 'images.unsplash.com'],
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        // 本地开发 = localhost:4000；Docker 里由 API_INTERNAL_URL 指向 api-core 容器
        destination: `${process.env.API_INTERNAL_URL || 'http://localhost:4000'}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;


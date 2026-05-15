/** @type {import('next').NextConfig} */
const nextConfig = {
  typedRoutes: true,
  async headers() {
    return [
      {
        source: '/addin/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "frame-ancestors 'self'",
              'https://*.office.com',
              'https://*.office365.com',
              'https://outlook.live.com',
              'https://*.outlook.com',
              'https://*.officeapps.live.com',
            ].join(' '),
          },
          { key: 'X-Frame-Options', value: '' },
        ],
      },
    ];
  },
};
export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for E2B sandbox: allow the app to be proxied from any hostname
  experimental: {
    allowedDevOrigins: ['*.e2b.app', '*.e2b.dev'],
  },
}

module.exports = nextConfig

import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'export',
  basePath: '/solstream', 
  images: {
    unoptimized: true,
  },
}

export default nextConfig
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Gzip/br the HTML and RSC payloads. Vercel's edge already compresses static
  // assets, but this covers the streamed responses too and costs nothing.
  compress: true,

  // Source maps for the browser bundle roughly double what has to be uploaded
  // and downloaded in production. We debug from local dev, not from the demo.
  productionBrowserSourceMaps: false,

  poweredByHeader: false,

  // The image pipeline is unused today (8 raw <img> tags, 0 next/image) but
  // these are the settings we want in place before Phase 3 swaps them over.
  images: {
    formats: ['image/avif', 'image/webp'],
  },
};

export default nextConfig;

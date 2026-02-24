import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@napi-rs/canvas",
    "tesseract.js",
    "canvas",
    "pdf-parse",
    "pdfjs-dist",
  ],
};

export default nextConfig;

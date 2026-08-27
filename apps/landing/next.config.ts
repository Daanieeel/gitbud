import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  // Lets `next dev` be reached from other devices on the LAN (e.g. testing on a phone).
  allowedDevOrigins: ["192.168.10.89"],
};

export default nextConfig;

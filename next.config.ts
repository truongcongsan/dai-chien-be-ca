import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  env: { NEXT_PUBLIC_ENGINE_PORT: process.env.ENGINE_PORT ?? "3321" },
};

export default config;

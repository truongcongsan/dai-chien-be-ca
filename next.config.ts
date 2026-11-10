import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  // beca-7f000001.nip.io: DNS công khai trỏ về 127.0.0.1 (7f000001 = 127.0.0.1 dạng hex),
  // dùng khi phần mềm LIVE (vd. TikTok LIVE Studio) không nhận link localhost.
  allowedDevOrigins: ["127.0.0.1", "localhost", "beca-7f000001.nip.io"],
  env: { NEXT_PUBLIC_ENGINE_PORT: process.env.ENGINE_PORT ?? "3321" },
};

export default config;

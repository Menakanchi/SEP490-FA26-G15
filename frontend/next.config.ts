import type { NextConfig } from "next";

// Header bảo mật cho mọi trang. CSP chỉ gồm các chỉ thị KHÔNG chặn script/style (Next và theme dùng script inline),
// nên không làm hỏng trang: chống nhúng khung (clickjacking), plugin, đổi <base>, và gửi form ra ngoài.
const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async redirects() {
    // URL cũ của khu VehicSim có tiền tố /vs; giờ trang nằm thẳng ở gốc `app/`.
    // Chuyển hướng để bookmark / link cũ vẫn mở đúng trang.
    return [
      { source: "/vs", destination: "/", permanent: false },
      { source: "/vs/:path*", destination: "/:path*", permanent: false },
    ];
  },
};

export default nextConfig;

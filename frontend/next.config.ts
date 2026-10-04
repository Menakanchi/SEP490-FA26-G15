import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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

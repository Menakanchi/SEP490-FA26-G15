import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `/label` là bàn làm việc nội bộ để tạo ground truth cho oracle L4, không
  // phải một bước trong hành trình sản phẩm. Giữ route khi chạy local để tiếp
  // tục kiểm định, nhưng không công khai nó trên deployment Demo Day.
  async redirects() {
    // URL cũ của khu VehicSim có tiền tố /vs; giờ trang nằm thẳng ở gốc `app/`.
    // Chuyển hướng để bookmark / link cũ vẫn mở đúng trang.
    const legacyVehicSim = [
      { source: "/vs", destination: "/", permanent: false },
      { source: "/vs/:path*", destination: "/:path*", permanent: false },
    ];
    return process.env.VERCEL_ENV === "production"
      ? [
          ...legacyVehicSim,
          {
            source: "/label",
            destination: "/",
            permanent: false,
          },
        ]
      : legacyVehicSim;
  },
};

export default nextConfig;

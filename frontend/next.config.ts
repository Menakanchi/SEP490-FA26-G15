import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `/label` là bàn làm việc nội bộ để tạo ground truth cho oracle L4, không
  // phải một bước trong hành trình sản phẩm. Giữ route khi chạy local để tiếp
  // tục kiểm định, nhưng không công khai nó trên deployment Demo Day.
  async redirects() {
    return process.env.VERCEL_ENV === "production"
      ? [
          {
            source: "/label",
            destination: "/",
            permanent: false,
          },
        ]
      : [];
  },
};

export default nextConfig;

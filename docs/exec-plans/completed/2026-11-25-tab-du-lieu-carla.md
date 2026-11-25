# Chia tab trang dữ liệu CARLA — 25/11/2026

## Phạm vi

- Chia trang dữ liệu CARLA theo nhóm tác vụ, lấy cách trình bày tab ở phần phân tích làm tham chiếu.
- Giữ hành vi chạy, theo dõi và xem cảm biến; giữ quyền, dữ liệu và hợp đồng API.
- Kiểm tra giao diện với dữ liệu hiện có, thao tác tab, trạng thái và màn hình hẹp; chạy kiểm tra frontend phù hợp.

## Tài liệu

- AGENTS.md, frontend/AGENTS.md, CLAUDE.md, DESIGN.md và hướng dẫn Next.js được cài trong frontend.
- Tài liệu CARLA và các ADR liên quan được đọc trong lần kiểm tra giao diện module 2 trước đó; thay đổi này chỉ tổ chức giao diện, không thay đổi mô phỏng.

## Kết quả kiểm chứng

- Đã kiểm tra trên trình duyệt bằng tài khoản kỹ sư và dữ liệu project hiện có: bốn tab, xem cảm biến, mở lịch sử qua `?run=`, giữ giá trị biểu mẫu khi chuyển tab và chuyển tab bằng phím mũi tên.
- Đã quan sát giao diện tại mức thu phóng 100% và 150%; chưa kiểm thử trên thiết bị di động thực.
- ESLint hai file và TypeScript frontend đạt. Không đổi API, dữ liệu hay schema; không chạy mô phỏng mới vì CARLA chưa sẵn sàng.
- Chưa đối chiếu Figma vì không có bản thiết kế; tham chiếu tab và màu sắc trong phần phân tích hiện tại.

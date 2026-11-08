# Đồng bộ giao diện theo Experiencer

- Experiencer, Engineer và Reviewer dùng chung mẫu thẻ việc tiếp theo, thanh bên có project đang mở và thanh hành trình. Tổng quan Engineer dùng danh sách năm bước. Reviewer giữ hàng đợi, so sánh từng cặp và lịch sử quyết định.
- Các lối vào Workspace và nhiệm vụ vẫn dựa trên vai trò. Reviewer đổi project trên thanh bên và thấy trạng thái chỉ xem với project lưu trữ. Thay đổi thuộc frontend, dùng API và dữ liệu hiện có.

## Kiểm chứng

- `npm run lint`, `npx tsc --noEmit`, `npm run build`, `node --test tests/reviewer-project.test.mjs` và `mvnw.cmd -B -Dtest=RepoDocsTest test` đều đạt.
- Đăng nhập qua form trên bản build với API fixture cho cả ba vai trò. Kiểm tra ảnh desktop 1440px và mobile 390px, mục đang chọn trong hành trình, menu mobile, đường dẫn chạy hồi quy của Engineer và hành vi chỉ xem khi Reviewer chuyển sang project lưu trữ.
- Chạy bộ kiểm tra trình duyệt Analysis và Admin với API fixture. Đối chiếu ảnh với UI Experiencer trong ứng dụng. Chưa xác thực bằng backend thật hoặc đối chiếu với Figma.

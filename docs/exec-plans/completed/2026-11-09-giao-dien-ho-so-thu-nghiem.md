# Đưa giao diện Hồ sơ thử nghiệm vào VehicSim

- [x] Áp dụng nền trung tính, điểm nhấn xanh và thành phần phẳng vào khung dùng chung. Đặt điều hướng, tìm lượt chạy, thông báo và hồ sơ ở vị trí nhất quán.
- [x] Bố trí kết quả và quy trình trên tổng quan Kỹ sư, project cá nhân và tổng quan Người duyệt. Dùng API và đường dẫn hiện có cho mọi số liệu và hành động.
- [x] Kiểm tra lint, TypeScript, build và chụp các màn đã đăng nhập ở desktop và mobile. Đối chiếu với bố cục C đã chọn.

Phạm vi là frontend. Các luồng phân quyền, API và dữ liệu do các service hiện có quản lý.

- Kỹ sư đọc số biến thể có lỗi trên bản cơ sở hiện hành từ danh sách họ kịch bản. Trang project cá nhân đọc kết quả đã phân loại từ hành trình dự án.
- `npm run lint`, `npx tsc --noEmit`, `npm run build` và sáu bài kiểm tra trong `frontend/tests` đều đạt.
- Kiểm tra trên bản build với API fixture cho Kỹ sư, Người duyệt, Người trải nghiệm và Quản trị viên. Đã kiểm tra điều hướng mobile, đổi dự án lưu trữ, mở bộ lọc ca lỗi và mở Workspace, Kịch bản, AEB, Kiểm thử hồi quy, Nhiệm vụ & báo cáo.
- Ảnh được chụp từ bản build và đối chiếu với bố cục C. Chưa đối chiếu với Figma hoặc đăng nhập qua backend thật.

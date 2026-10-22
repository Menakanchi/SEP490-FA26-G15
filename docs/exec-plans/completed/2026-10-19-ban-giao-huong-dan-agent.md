# Bàn giao hướng dẫn agent cho nhóm 5 thành viên

Trạng thái: hoàn tất cập nhật tài liệu và kiểm chứng ngày 19/10/2026.

## Mục tiêu

Viết lại `AGENTS.md` và `CLAUDE.md` ở gốc repo để thành viên mới hoặc AI agent
tiếp nhận được code hiện tại, chọn đúng phần trong luồng 5 màn và chạy/kiểm tra
được dự án mà không dựa vào lịch sử chat hay cấu hình riêng của một máy.

## Phạm vi

- Giữ `AGENTS.md` là bản đồ ngắn, tối đa 150 dòng theo `RepoDocsTest`.
- Liên kết tài liệu chia 5 phần chức năng; phân biệt chức năng đã có và MOBO,
  hủy chạy, các phần phân tích chưa triển khai.
- Viết lại `CLAUDE.md` thành hướng dẫn tiếp nhận và vận hành Windows/CARLA
  hiện tại, giữ các bẫy đã đo và ghi chú Linux khi còn hữu ích.
- Giữ các bất biến kiến trúc, quyền, seed, simulator, DB, bảo mật và kiểm chứng.
- Ghi nợ đã đối chiếu khi bàn giao: thiết kế tối ưu cho phanh oan tăng 5 điểm %,
  regression mặc định 0,5 điểm % (TD-48); không đổi chính sách hoặc code trong lần này.
- Chỉ sửa tài liệu; không đổi code, schema, cấu hình máy, dữ liệu hay nhánh Git.

## Các bước

1. Đối chiếu hai file cũ với code, scripts, CI, tài liệu CARLA và tài liệu chia việc.
2. Viết lại bản đồ chung và hướng dẫn tiếp nhận, loại bỏ chỉ dẫn Python backend/CARLA cũ gây hiểu nhầm.
3. Rà chéo tính chính xác, các luật được giữ lại và liên kết tài liệu.
4. Chạy `RepoDocsTest`, kiểm tra UTF-8, giới hạn dòng, liên kết và `git diff --check`.
5. Chuyển kế hoạch sang completed kèm kết quả kiểm chứng.

## Tiêu chí xong

- Người tiếp nhận tìm được cả 5 phần và điểm nối dữ liệu từ hai file gốc.
- Lệnh Windows khớp script thật; CI được mô tả đúng cả backend, worker và frontend.
- Không khẳng định MOBO, hủy chạy, mọi category hay cảm nhận từ ảnh đã hoàn thành.
- Không nới quyền Reviewer, không trộn kết quả CARLA với động học, không thay quy tắc bảo toàn dữ liệu.
- Các cổng kiểm tài liệu qua; không ghi secret hoặc đường dẫn cá nhân như yêu cầu chung cho cả nhóm.

## Quyết định trong phạm vi

- Giữ `@AGENTS.md` trong `CLAUDE.md`; luật chung có một nguồn, chi tiết vận hành đặt ở CLAUDE/tài liệu liên kết.
- Phân chia theo chức năng là đề xuất đã có trong tài liệu; tên người, deadline và tiến độ theo GitHub Issues/Project.
- Tài liệu cũ ghi frontend chưa ở CI là sai với workflow hiện tại; CI đã có đủ
  ba cổng và thêm npm audit, còn `make check` không gồm npm audit.

## Kiểm chứng

- `.\mvnw.cmd -B -Dtest=RepoDocsTest test`: 5 test qua, 0 lỗi/0 thất bại.
  Chạy lại sau khi hoàn tất sửa hai file hướng dẫn, BUILD SUCCESS.
- `AGENTS.md`: 134 dòng, dưới giới hạn 150; giữ nguyên số 1–9 của các luật cứng
  để các tham chiếu trong tài liệu kiến trúc vẫn đúng.
- Kiểm UTF-8 không BOM và 36 liên kết/anchor trong AGENTS, CLAUDE và tài liệu
  chia việc: không có lỗi; CLAUDE vẫn bắt đầu bằng `@AGENTS.md`.
- `git diff --check`: qua. Đã rà chéo các chỉ dẫn với scripts, CI và code hiện tại.
- Cập nhật TD-48 để phần tối ưu và regression chốt cấu hình tiêu chí khi triển khai;
  không thay đổi ngưỡng, API hay hành vi hệ thống trong lần bàn giao này.
- Không chạy dịch vụ, cài dependency, sửa schema, xóa dữ liệu hay đổi nhánh.

## Kết quả

- AGENTS là bản đồ 5 phần, điểm bàn giao, trạng thái thật, nguồn sự thật,
  lệnh kiểm chứng và các bất biến chung.
- CLAUDE là hướng dẫn tiếp nhận trên Windows, tài khoản/migration, profile CARLA,
  artifact xosc2/v2, cách đọc kết quả và bẫy đã gặp; các ghi chú Linux còn hữu ích
  được ghi rõ là quan sát theo máy.
- Những tính năng chưa hoàn thành không được mô tả là đã triển khai.

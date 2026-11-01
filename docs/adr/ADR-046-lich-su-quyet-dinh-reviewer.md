# ADR-046 — Đề xuất lưu từng lần quyết định Reviewer

**Trạng thái:** Proposed 01/11/2026 — người dùng chọn giữ bảng trên nhánh để nhóm duyệt sau; chưa áp migration vào DB dev.
**Phạm vi đề xuất thay thế:** phần lưu quyết định chỉ ở `engineering_recommendations` và số bảng 29 trong ADR-036/038. Không thay role, tiêu chí Accept hay nghiệp vụ xe/workspace.

## Vấn đề

Một khuyến nghị đang mở có thể nhận REQUEST_MORE_TESTS rồi một quyết định khác. UPDATE cùng dòng làm mất người duyệt, thời điểm, lý do và điều kiện trước đó. File audit hiện chỉ ghi mã sự kiện/ID và không đủ để dựng lại màn lịch sử.

## Các lựa chọn

1. Giữ 29 bảng: chỉ hiển thị quyết định gần nhất, đổi tên màn và bỏ cam kết lịch sử đầy đủ.
2. Giữ 29 bảng, nhúng mảng sự kiện vào JSON của khuyến nghị: phải tự giữ định dạng, truy vấn và ràng buộc trong ứng dụng.
3. Thêm `recommendation_decisions` (30 bảng): mỗi quyết định là sự kiện riêng; khuyến nghị vẫn giữ trạng thái mới nhất.

## Đề xuất trong nhánh, chưa phải quyết định Accepted

Nhánh hiện cài lựa chọn 3 để nhóm review. Bảng mới thuộc nhóm regression/khuyến nghị, không phải tri thức kỹ thuật. Mỗi lần quyết định append sự kiện trong cùng transaction với thay đổi candidate/baseline; API không sửa/xóa lịch sử. Sự kiện giữ ID người duyệt, tên chụp lúc duyệt, thời điểm, lý do, điều kiện và xác nhận.

Migration 012 chỉ snapshot quyết định gần nhất còn trong DB với `source=LEGACY_SNAPSHOT`, `confirmed=NULL`; không dựng lịch sử hay xác nhận đã mất. Tên snapshot cũ là tên lúc migration, không tuyên bố là tên ở thời điểm lịch sử.

## Điều kiện triển khai và rollback

Chỉ áp vào DB dev sau khi người dùng đồng ý và nhóm chốt giữ bảng: dừng backend, sao lưu, chạy migration 012, rồi khởi động code mới. Backend hiện tại của nhánh cần bảng này cho duyệt/lịch sử; không restart lên DB cũ thiếu bảng. Rollback code giữ bảng, không xóa lịch sử; trước khi nâng lại chạy backfill idempotent. Không chạy song song backend cũ/mới trong cửa sổ migration.

Nếu nhóm chọn giữ 29 bảng, cần gỡ phụ thuộc bảng mới và sửa hợp đồng màn lịch sử trước khi chạy/commit phần đó; không chỉ bỏ file migration.

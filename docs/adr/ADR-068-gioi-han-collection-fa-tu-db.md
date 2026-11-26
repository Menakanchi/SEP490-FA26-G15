# ADR-068 — Giới hạn collection FA lấy từ DB

**Trạng thái:** Proposed 26/11/2026. Thay thế một phần hạn mức nguồn trong ADR-067;
các quyết định khác, đặc biệt handoff V3 chỉ chẩn đoán và dispatch=false, giữ nguyên.

## Bối cảnh

Một biến thể có bốn result.json CARLA hoàn tất dài tổng cộng 1.182.888 byte
trước lớp vỏ collection. Giới hạn 1 MiB của ADR-067 khiến API từ chối toàn bộ
collection, dù từng result đều hợp lệ. Không được bỏ bớt run để vượt giới hạn.

## Quyết định

Collection do backend dựng từ artifact DB được giới hạn **2 MiB**. Mỗi result gốc
và mỗi tệp tải lên vẫn giới hạn **1 MiB**; tối đa 16 run, các giới hạn parser,
bộ nhớ, metadata và output khác giữ nguyên. Nguồn vượt bất kỳ giới hạn nào bị
từ chối toàn bộ, không cắt ngầm. Phân biệt nguồn DB bằng provenance do backend
tạo; upload không tự khai quyền dùng giới hạn lớn hơn.

Các byte result, identity, hash và kiểm tra project không đổi. Khả năng lưu
collection không xác nhận baseline, calibration, hay quyền chạy MOBO.

## Triển khai và khôi phục

Schema mới tăng CHECK của fa_json_sources lên 2 MiB. DB đã có chạy migration
024 sau khi sao lưu. Không sửa migration 020 cũ. Muốn hạ lại CHECK phải xử lý
nguồn trên 1 MiB theo chính sách lưu trữ trước; không tự xóa dữ liệu. Backend cũ cũng không đọc được nguồn trên 1 MiB, nên dừng tạo nguồn lớn và xuất/xử lý chúng trước khi quay lại backend cũ.

Giới hạn 2 MiB giải quyết trường hợp quan sát, không hứa mọi collection 16
run đều được tiếp nhận: giới hạn parser, kích thước và năng lực xử lý vẫn áp dụng.

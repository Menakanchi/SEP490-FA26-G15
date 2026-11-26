# Mở rộng collection CARLA của Failure Analysis từ DB

## Mục tiêu và phạm vi

Một collection của biến thể 1080 gồm các run 2562/2564/2566/2568 lớn hơn
1 MiB, khiến module 3 không nhận đủ dữ liệu từ module 2. Nâng hạn mức riêng
cho collection dựng từ artifact DB lên 2 MiB, giữ upload và từng run ở 1 MiB.
Không cắt run, không thay quyền dispatch V3 hoặc công thức chấm.

## Quyết định và kiểm chứng

- [x] Giữ raw bytes, identity, digest, project scope và fail-closed khi vượt
  giới hạn; parser và các hạn mức khác không đổi. Xem ADR-068.
- [x] Migration 024 tăng CHECK nguồn; 020 lịch sử không sửa. Đã kiểm migration
  trên MySQL cô lập và trên bản sao lưu được phục hồi trước khi áp vào DB dev.
- [x] Test adapter với bốn member trên 1 MiB và đầu vào vượt 2 MiB, upload
  vẫn bị chặn ở 1 MiB; test MySQL kiểm lưu/đọc trên schema nâng cấp.
- [x] Kiểm riêng bốn result.json CARLA thực của biến thể 1080 qua adapter và
  lõi chẩn đoán: đủ 4/4 member, byte nguồn giữ nguyên, dispatch vẫn false.
  Đây là kiểm thử dùng repository giả và lưu bộ nhớ, không phải UI/DB E2E.
- [x] MainFlowMysqlTest: luồng HTTP/JWT, MySQL/Redis cô lập, bộ động học,
  baseline ON/OFF, dataset V2, MOBO có acquisition, regression và Reviewer
  Accept. Không coi đây là kiểm thử CARLA hay V3 dispatch.

## Giới hạn

V3 chưa có approved-context registry, quality policy và miền tham số có
thẩm quyền; không chuyển V3 thành READY hoặc thay điều kiện này bằng snapshot
V2. Giới hạn 2 MiB không bảo đảm mọi collection 16 run vừa các budget parser.
Tài liệu M2_CHANGE_PLAN cũ mô tả nhánh V2 trước khi merge; khối cập nhật đầu
file chỉ rõ chức năng đã có.

# Kiểm migration AEB và khôi phục phân tích sau merge

- Thử migration 025 sau 022 trên MySQL 8.4.11 cô lập, không sửa database đang dùng. Ba giá trị mẫu ngoài miền được giữ và liệt kê; chạy lại migration không đổi dữ liệu ba bảng được kiểm tra.
- Bổ sung cập nhật mô tả `tech_references` trong migration và schema mới, tránh mô tả khoảng cũ. Database đã có vẫn cần sao lưu, kiểm tra điều kiện và dữ liệu trước khi áp dụng migration.
- Đối chiếu các bài kiểm thử giao diện cũ với giao diện phân tích mới sau merge; giữ code mới của đồng đội theo yêu cầu, không khôi phục chức năng chỉ vì kiểm thử cũ đòi hỏi.
- Đối chiếu `CLAUDE.md`, hợp đồng chỉ số, ADR-055, ADR-069, schema, migration 022/025 và hướng dẫn frontend. Schema trước sửa còn mô tả ba khoảng cũ trong `tech_references`; migration 025 ban đầu chưa cập nhật các mô tả này.
- Kiểm thử Java `RepoDocsTest,ParameterHintsAndBoundsTest` đạt 26 bài; kiểm thử MySQL cô lập thực hiện trên dữ liệu mẫu, không thay thế việc kiểm tra dữ liệu thật. Các kiểm thử trình duyệt dùng API giả lập, không chứng minh hoạt động CARLA thật.
- `npm run test:analysis -- --browser`: 78 unit và 6 bộ browser đạt; 7 bộ legacy không chạy vì điều khiển cũ không còn trong UI, được liệt kê trong summary. Các chức năng upload/download JSON và các bảng điều tra cũ không còn được bộ kiểm thử UI hiện tại bao phủ.

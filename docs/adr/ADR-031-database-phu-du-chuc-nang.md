# ADR-031 — Database phủ đủ FE-01 → FE-14: 36 bảng, một xe không phiên bản, migration đánh số

**Trạng thái:** ⛔ Superseded by [ADR-036](ADR-036-schema-29-bang.md) (07/10/2026 — schema 29 bảng). Gốc: Proposed 03/10/2026 (TrungDQ, nhánh `trungdam`; chờ nhóm duyệt). Schema và DB dev máy
TrungDQ đã áp; 8 bảng mới **chưa có code**. Bổ sung 04/10 bởi
[ADR-033](ADR-033-cau-hinh-xe-de-so-sanh.md): +2 bảng cấu hình xe chỉ để so sánh (38 bảng) — "một xe, không
phiên bản" giữ nguyên.
**Phạm vi:** MySQL `vehicsim` ([01_schema.sql](../../database/mysql/01_schema.sql)); nghĩa từng cột ở
[database-schema.md](../vehicsim/database-schema.md).

## Bối cảnh

TrungDQ hỏi ngày 03/10: "database đã đầy đủ chưa — làm hết". Đối chiếu 28 bảng với các chức năng
FE-01 → FE-14 (báo cáo §1.7), các màn Figma chưa làm (05 sửa nhãn, 07–08 độ nhạy) và
[ADR-030](ADR-030-bo-viewer-them-expert-va-forum.md) thì thiếu: ảnh đại diện (FE-03), thông báo (FE-04),
cài đặt hệ thống và nhật ký kiểm toán (FE-10), sửa nhãn lỗi và độ nhạy/tương tác tham số (FE-12),
robustness validation và theo dõi active learning (FE-13), liên kết file cảm biến với sensor (FE-09),
forum + role EXPERT (ADR-030).

Đo trên DB dev cùng ngày còn thấy hai lỗi lệch: `regression_tests.review_decision` thiếu
`REQUEST_MORE_TESTS` (API và UI đã dùng — bấm "Yêu cầu thêm kiểm thử" sẽ lỗi), và file schema từng được
nạp bằng client latin1 nên mô tả tiếng Việt của `roles`/`aeb_parameters` vỡ chữ, CHECK và cột sinh mang
literal `_latin1` (TD-22).

Trong lúc làm, TrungDQ chốt thêm: **phạm vi chỉ nghiên cứu một xe, xe là bản duy nhất, không có phiên
bản**; nếu lấy thêm xe thì **clone thông số từ CARLA** đưa vào database.

## Quyết định

**Thêm 8 bảng** (28 → 36, vẫn trong khoảng 25–40 của giảng viên):

| Bảng | Chức năng |
|---|---|
| `robustness_tests` | FE-13 Robustness validation: một AEB version trên cả họ dưới nhiễu; run con `purpose = ROBUSTNESS` |
| `sensitivity_analyses`, `sensitivity_results` | FE-12 độ nhạy / tương tác (tương quan, RF, SHAP) trên run lịch sử |
| `notifications` | FE-04 thông báo theo người nhận |
| `system_settings` | FE-10 cài đặt (LLM key mã hoá, CARLA host/port) |
| `audit_logs` | FE-10 nhật ký kiểm toán, chỉ thêm, không chứa bí mật |
| `forum_posts`, `forum_comments` | ADR-030: forum AEB chung, duyệt bài của ENGINEER |

**Thêm cột:** `users.avatar_url` (FE-03); `optimization_trials.sampling_source`, `.acquisition_value`
(FE-13 active learning); `simulation_runs.robustness_test_id` + `purpose` thêm `ROBUSTNESS` (FK ghép ép run
dùng đúng AEB version được kiểm); `simulation_artifacts.sensor_id` + loại `SENSOR_RECORDING`,
`GROUND_TRUTH`, `TELEMETRY_CSV` (FE-09); `failures.auto_failure_type`, `labeled_by`, `labeled_at`,
`label_note` (FE-12 màn 05, giữ nhãn gốc của máy chấm).

**Role:** thêm `EXPERT`, bỏ `VIEWER` (ADR-030); `project_members.member_role` đổi theo. Code: `WRITE_ROLES`
thêm EXPERT, `scripts/create_admin.py --role EXPERT`, frontend nhận role `expert`.

**Xe:** một xe / project, **không** có bảng phiên bản. Thêm xe = clone thông số từ blueprint CARLA (bounding
box + physics control; tốc độ tối đa và giảm tốc tối đa đo bằng lượt chạy thử) vào một dòng `vehicles` ở
project mới; bản chụp đầy đủ để ở `vehicles.extra_config`. Không sửa thông số xe khi project đã có run.

**Nâng DB đang chạy:** thư mục `database/mysql/migrations/` với file đánh số; `001_2026-10-03_phu-du-chuc-nang.sql`
nâng DB 28 bảng lên bản này, sửa luôn lỗi `review_decision` và chữ vỡ latin1.

## Các lựa chọn đã cân nhắc

1. **Bảng `vehicle_versions` + `vehicle_parameters`** (phiên bản xe, trạng thái hiệu chuẩn, nhãn nguồn gốc
   Measured/Sourced/… của concept doc) — đã viết, chạy thử trên DB dev, rồi **bỏ** theo quyết định phạm vi
   một xe không phiên bản của TrungDQ. Mục "Versions and calibration status" của FE-05 ra khỏi phạm vi.
2. **Bảng `recommendations` riêng** — loại: khuyến nghị dựng được từ `regression_tests` + diff hai
   `aeb_versions` (+ `robustness_tests`); lưu riêng tạo nguồn sự thật thứ hai cho Accept/Reject.
3. **Bảng dữ liệu cảm biến / ground truth theo từng khung** — loại: hàng triệu dòng mỗi chiến dịch; file
   nằm ở `simulation_artifacts`, bản tóm tắt ở `raw_metrics.frames`.
4. **Seed sẵn `system_settings`** — loại: giá trị hiện đọc từ `.env`, seed thêm là hai nguồn; khi code đọc
   bảng thì chốt thứ tự ưu tiên.
5. **Dùng công cụ migration (Alembic) ngay** — hoãn: file SQL đánh số đủ cho 36 bảng và một đợt nâng;
   công cụ có bảng ghi lịch sử vẫn là TD-02.

## Hệ quả

- Báo cáo phải cập nhật: số bảng (36), ERD (bản PhuongNA còn lệch — xem database-schema.md §10), FE-05 bỏ
  phiên bản/hiệu chuẩn xe, phân quyền ADMIN/EXPERT/ENGINEER.
- Mỗi thành viên chạy migration 001 một lần trên DB của mình (TD-26), nếu không màn Review lỗi khi chọn
  "Yêu cầu thêm kiểm thử".
- 8 bảng mới chưa có API/màn hình; thêm code dùng bảng nào thì mô tả bảng đó trong `tables.py`.
- Luật giảng viên "4 màn / thực thể chính": thực thể chính mới cần màn List/Add/Edit/View —
  `robustness_tests`, `sensitivity_analyses`, `forum_posts`, `system_settings`; `notifications` và
  `audit_logs` chỉ cần màn danh sách (không ai sửa tay).
- Meomeo Agent **không** đánh chỉ mục `database-schema.md` (`DOC_EXCLUDED`): mô tả cấu trúc bảng `users` và
  cách lưu bí mật không giúp kỹ sư, chỉ giúp người dò tấn công.

## Kiểm chứng (03/10)

- DB dựng mới từ `01_schema.sql` và bản sao DB dev đã chạy migration 001 khớp cấu trúc 100% (cột, kiểu,
  collation, index, FK, CHECK, view): 36 bảng, 435 cột, 91 FK, 15 CHECK, 158 index; dữ liệu giữ nguyên
  (1.134 run, 717 lỗi, 804 đoạn tri thức); chạy lại migration dừng ngay ở lệnh đầu, không đổi dữ liệu.
- DB dev máy TrungDQ sau khi nâng: khớp 100% với DB dựng mới.
- 23 phép thử ràng buộc trên dữ liệu thật (rollback): xe thứ hai cùng project, run ROBUSTNESS thiếu test
  hoặc sai AEB version, điểm robustness > 1, trùng kết quả độ nhạy, tự duyệt bài forum, xoá user có bài,
  trùng khoá cài đặt đều bị chặn; thao tác hợp lệ (gồm `REQUEST_MORE_TESTS`) chạy được.

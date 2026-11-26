# ADR-067 — API Failure Analysis v3 và 4 bảng `fa_json_*`

**Trạng thái:** Accepted 26/11/2026 — người dùng duyệt gộp vào `main` (PR #46, commit `4ce6f47` của chuvv và `f5f6b18`). ADR ghi lại quyết định đã có trong code, viết sau khi gộp.
**Liên quan:** [ADR-065](ADR-065-khoi-dataset-trong-result-json.md) (khối `dataset` trong `result.json`, file gộp theo biến thể), [ADR-042](ADR-042-loi-aeb-mo-phong-cham-diem-chuyen-sang-java.md) (lõi Java), [ADR-040](ADR-040-rut-scope-4-tham-so-aeb-7-category.md) (tối ưu AEB), [hợp đồng REST của module](../failure-analysis-v3/backend-integration/03_REST_API_CONTRACT.md), [thiết kế lưu trữ](../failure-analysis-v3/backend-integration/02_DATABASE_PERSISTENCE_DESIGN.md).

## Bối cảnh

Module `com.vsos.core.failureanalysis` (Phần 3, Phân tích lỗi) đọc `result.json` có khối `dataset` (ADR-065) hoặc file gộp `vehicsim.run-collection/v1`, rồi tạo báo cáo chẩn đoán cho từng run và một file bàn giao cho MOBO. Trước 25/11 module chỉ chạy offline, chưa có API, chưa lưu kết quả và màn Phân tích không gọi được. Cần:

- nhận đúng byte JSON của Module 2 (không qua Jackson, không dựng lại từ DB) và tái lập được báo cáo đã tạo;
- tách theo project như mọi dữ liệu khác, dùng chung luật role/hạn mức;
- không coi file bàn giao là lệnh tối ưu: MOBO chưa tích hợp, ngữ cảnh duyệt (baseline, tập đã chốt) chưa có nguồn có thẩm quyền.

## Các lựa chọn

1. **Tính lại khi đọc:** không lưu gì, mỗi GET chạy lại lõi. Đơn giản nhưng kết quả đổi theo phiên bản lõi, không có mã ổn định để màn sau tham chiếu, tốn CPU.
2. **Lưu file trong `data/vehicsim/`:** giống artifact run, nhưng không có khoá ngoại tới project, không kiểm tra trùng/toàn vẹn trong một transaction.
3. **Lưu JSON nguyên byte trong MySQL, chỉ thêm không sửa (chọn):** mỗi tài nguyên một dòng có SHA-256 của nội dung và metadata, khoá ngoại tới project, khoá chống trùng.

## Quyết định

**API** dưới `/api/v1/vehicsim/analysis/v3` (`FailureAnalysisController`), mọi route cần đăng nhập và lấy project từ `X-VehicSim-Project` (`ProjectAccess`):

| Nhóm | Route | Ghi chú |
|---|---|---|
| Nguồn tải lên | `POST /sources`, `GET /sources`, `GET /sources/{id}`, `GET /sources/{id}/download` | Thân là byte JSON gốc; `X-Source-SHA256` tuỳ chọn. Gửi lại đúng byte cũ trả cùng mã |
| Nguồn từ DB | `GET /database/runs`, `GET /database/collections`, `GET /database/{runs\|collections}/{id}`, `POST /database/{runs\|collections}/{id}/executions` | Chỉ đọc run CARLA `COMPLETED` và `result.json` trong thư mục run chuẩn (`FailureAnalysisDatabaseAdapter`); `source_sha256` tuỳ chọn để chặn khi nguồn đổi sau lúc xem |
| Lượt phân tích | `POST /sources/{id}/executions`, `GET /executions`, `GET /executions/{id}` | Không nhận thân. Cùng nguồn + phiên bản lõi + ngữ cảnh trả cùng lượt. `context_id` luôn 409 `APPROVED_CONTEXT_REGISTRY_UNAVAILABLE` |
| Báo cáo, bàn giao | `GET /executions/{id}/reports`, `GET /reports/{id}[/download]`, `GET /handoffs/{id}[/download]` | Trả nguyên byte đã lưu; bàn giao luôn `dispatch_allowed = false` |

**Quyền và giới hạn:**
- Ghi (`POST`) cần ADMIN/ENGINEER/EXPERIENCER (`requireEngineer`), hạn mức `limitWrites(…, "failure_analysis_json")`. Project và workspace phải `ACTIVE`, kiểm lại bằng khoá `FOR SHARE` trong transaction ghi.
- Đọc theo luật project chung, kể cả project đã lưu trữ.
- Nguồn ≤ 1 MiB; báo cáo/lượt/bàn giao ≤ 8 MiB; metadata ≤ 256 KiB; cả lượt ≤ 32 MiB; file gộp ≤ 16 run; phân trang `limit` 1–20, `offset` ≤ 10000.
- Tối đa 2 lượt phân tích và 2 lần đọc nguồn DB cùng lúc mỗi tiến trình; vượt thì 429.

**Lưu trữ** (migration 020, `01_schema.sql`): `fa_json_sources` → `fa_json_executions` → `fa_json_reports` và `fa_json_handoffs`.
Mỗi bảng có `payload_bytes` (MEDIUMBLOB, bàn giao có thể NULL khi bị chặn), `payload_sha256`, `metadata_bytes`, `metadata_sha256`, `dedupe_key` duy nhất theo project, khoá ngoại `ON DELETE RESTRICT` (nguồn → project, con → cha cùng project) và `CHECK` kích thước.
Chỉ `INSERT`; đọc lại thì kiểm SHA-256, schema và định danh, sai thì 409. DB lên **34 bảng**.

**Báo lỗi:** lỗi chung (404 `NotFoundException`, 400 `InvalidRequestException`, 403/429 của `VehicSimAccess`) qua `ApiExceptionHandler` như mọi route.
Lỗi riêng của module trả `{"code": "<mã>", "detail": "<câu tiếng Việt>", "retryable": <bool>}` ở cấp ngoài cùng (frontend đọc `code` ở `services/api.ts`).
Không trả stack trace, câu SQL hay đường dẫn máy chủ.

## Hệ quả

- DB đã có dữ liệu chạy [migration 020](../../database/mysql/migrations/020_2026-11-25_failure_analysis_json.sql) (sau 019). Gỡ: xuất dữ liệu trước rồi xoá `fa_json_handoffs`, `fa_json_reports`, `fa_json_executions`, `fa_json_sources` theo thứ tự đó.
- Chưa có API xoá: dữ liệu chỉ tăng. Xoá kết quả baseline trên web không xoá bản sao đã nạp vào `fa_json_*` (không có khoá ngoại tới `simulation_runs`), nên báo cáo cũ vẫn mở được sau khi run gốc bị xoá.
- Bàn giao chưa gửi được sang MOBO, cần bộ đăng ký ngữ cảnh duyệt riêng (việc sau). Không gọi API tối ưu cũ để vượt `dispatch_allowed = false`.
- Test MySQL của module (`FailureAnalysisMysqlTest`, `FailureAnalysisDatabaseMysqlTest`) bỏ qua khi không có DB thật; gate CI không chạy chúng.
- Giới hạn đồng thời theo tiến trình, chưa chia theo người dùng; nhiều backend thì mỗi tiến trình có 2 suất riêng.

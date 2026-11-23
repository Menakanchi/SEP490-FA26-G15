# Tab `Project-Manage` (PM) — quản lý project cá nhân của EXPERIENCER

Thuộc [kế hoạch integration test](../2026-11-17-integration-test-va-issue-nguoi-5.md). ⭐ = cần run CARLA đang chạy hoặc đã chạy.

> **Cập nhật 20/11/2026 — đọc trước phần thân.** File này là bản nháp 3 viết theo API; bản đã chạy là sheet `docs/Integration-Test_VSOS_TuDM_v6.xlsx` (bước thao tác trên web, mã ca đánh lại theo tab, nên mã trong file này không trùng mã sheet). Kết quả, dữ liệu thật và trạng thái issue ở mục 0, 5, 8 của [kế hoạch](../2026-11-17-integration-test-va-issue-nguoi-5.md). Phần thân đã lỗi thời ở các điểm: P-TEAM có baseline **AEB v4** (TTC 4,0 s, giảm tốc 10 m/s²), không phải v1.0, nên C-GOOD / C-GOOD2 / C-GOOD3 là TTC 3,0 / 2,0 / 1,8 s giữ giảm tốc 10; `<SIM>` là `carla-0.9.16-xosc9` (không còn `-xosc7`); máy test không chạy được CARLA nên các ca cần CARLA để Untested; chỉ tài khoản role MANAGER (MGR1) thêm được thành viên workspace; mã test thật xem bảng 5.3 của kế hoạch.
>
> Trên sheet: PM-11 (150 emoji) Fail vì ô nhập giới hạn theo UTF-16 (#27); PM-59, PM-60 Fail vì xoá từ "Cài đặt project" không hiện thông báo (#26); PM-53, PM-61 chờ run đang chạy. Sau "Tạo project" trang mở bước ① (không phải trang chủ) — đúng thiết kế, đã sửa Expected PM-01.

**Đầu tab (sheet):** Module name = "Project cá nhân — `/projects`, `/projects/new`, `/projects/[id]/settings`;
`GET/POST /projects`, `GET/PATCH/DELETE /projects/{id}`, `POST /projects/{id}/archive`, `POST /projects/{id}/unarchive`,
`GET /projects/vehicle-options`".

Quy tắc nghiệp vụ được kiểm (`ProjectService`, `ProjectScope`, `ProjectError`, ADR-046):
- Chỉ EXPERIENCER tạo/sửa/lưu trữ/xoá project cá nhân; chủ project đã đổi role chỉ xem.
- Tên: bắt buộc, cắt khoảng trắng hai đầu, tối đa 150 ký tự (đếm theo code point), không ký tự điều khiển, không trùng trong các project cá nhân của cùng chủ.
- Mô tả tối đa 2000 ký tự; trống thì lưu NULL. Xe phải thuộc danh mục hỗ trợ; không chọn thì dùng xe mặc định `vehicle.audi.etron`.
- Project mới có baseline AEB `v1.0` (`TTC_THRESHOLD = 1.5`, ba tham số còn lại theo giá trị mặc định).
- Đã có lượt chạy thì không đổi xe. Lưu trữ và xoá yêu cầu project không còn việc chờ/chạy (run, tối ưu, regression).
- Xoá vĩnh viễn yêu cầu gõ đúng tên; xoá mọi dữ liệu và thư mục run.
- Danh sách: lọc `ACTIVE`/`ARCHIVED`, tìm theo tên (ký tự `%`, `_` được hiểu đúng nghĩa đen), sắp theo `updated_at` giảm dần, `page ≥ 1`, `page_size` 1–50 (mặc định 9).

Dạng lỗi project: `{"code": "<MÃ>", "detail": "<thông điệp>"}`.

---

### PM-01 — Danh sách project mặc định [N]
- **Description:** Kiểm tra danh sách project cá nhân mặc định trả tab đang hoạt động, trang 1, 9 mục, kèm số đếm từng tab.
- **Preconditions:** PRE-ENV, PRE-ACC; EXP1 có P-EXP1 và ít nhất 1 project lưu trữ; PRE-LOGIN-EXP1.
- **Test Steps:** 1. Gửi `GET /projects`. 2. Đối chiếu `SELECT status, COUNT(*) FROM projects WHERE workspace_id IS NULL AND created_by_user_id=<EXP1> GROUP BY status`.
- **Test Data:** không tham số (mặc định `status = ACTIVE`, `q = ""`, `page = 1`, `page_size = 9`).
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** HTTP 200; `page = 1`, `page_size = 9`; mọi item `status = "ACTIVE"`; `active_count`, `archived_count` khớp SQL; `total = active_count`; item sắp theo `updated_at` giảm dần; mỗi item có `id`, `name`, `description`, `vehicle_id`, `vehicle_name`, `baseline_label`, `family_count`, `run_count`, `regression_count`, `has_running_work`, `created_date`, `updated_at`, `journey`.

### PM-02 — Tìm project theo tên [N]
- **Description:** Kiểm tra tìm kiếm theo một phần tên project.
- **Preconditions:** EXP1 có "IT-EXP1 Dự án chính" và "IT-EXP1 Thử tìm 50%_x" (tạo trước); PRE-LOGIN-EXP1.
- **Test Steps:** 1. `GET /projects?q=Dự án`. 2. `GET /projects?q=50%_`. 3. `GET /projects?q=khongtontai`.
- **Test Data:** `q` lần lượt `"Dự án"`, `"50%_"`, `"khongtontai"`.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** Lần 1 chỉ có project tên chứa "Dự án"; lần 2 chỉ có "IT-EXP1 Thử tìm 50%_x" (ký tự `%`, `_` không phải ký tự đại diện); lần 3 `items = []`, `total = 0`.

### PM-03 — Tab project lưu trữ [N]
- **Description:** Kiểm tra lọc danh sách project đã lưu trữ.
- **Preconditions:** như PM-01.
- **Test Steps:** 1. `GET /projects?status=ARCHIVED`.
- **Test Data:** `status = "ARCHIVED"`.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** HTTP 200; mọi item `status = "ARCHIVED"`; `total = archived_count`.

### PM-04 — Trạng thái lọc không hợp lệ [A]
- **Description:** Kiểm tra chỉ nhận trạng thái ACTIVE hoặc ARCHIVED.
- **Preconditions:** PRE-LOGIN-EXP1.
- **Test Steps:** 1. `GET /projects?status=DELETED`. 2. `GET /projects?status=active`.
- **Test Data:** `status` = `"DELETED"`, `"active"`.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** Cả hai HTTP 400; `detail = "status phải là ACTIVE hoặc ARCHIVED"`.

### PM-05 — Tham số phân trang ngoài biên [B]
- **Description:** Kiểm tra biên của `page` và `page_size`.
- **Preconditions:** PRE-LOGIN-EXP1.
- **Test Steps:** 1. `GET /projects?page=0`. 2. `GET /projects?page_size=0`. 3. `GET /projects?page_size=51`.
- **Test Data:** `page = 0`; `page_size = 0`; `page_size = 51`.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** Cả ba HTTP 400; `detail = "page phải ≥ 1 và page_size trong khoảng 1–50"`.

### PM-06 — Phân trang đúng biên [B]
- **Description:** Kiểm tra phân trang ở giá trị biên hợp lệ.
- **Preconditions:** EXP2 có đúng 10 project ACTIVE (tạo "IT-EXP2 P01" … "IT-EXP2 P10"); PRE-LOGIN-EXP2.
- **Test Steps:** 1. `GET /projects?page=1&page_size=9`. 2. `GET /projects?page=2&page_size=9`. 3. `GET /projects?page_size=50`. 4. `GET /projects?page=1&page_size=1`.
- **Test Data:** như các bước.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** Bước 1: 9 item, `total = 10`. Bước 2: 1 item. Bước 3: 10 item. Bước 4: 1 item. Không trùng item giữa trang 1 và 2.

### PM-07 — Danh sách xe chọn được [N]
- **Description:** Kiểm tra danh mục xe cho project cá nhân, chỉ EXPERIENCER xem được.
- **Preconditions:** PRE-ACC.
- **Test Steps:** 1. `GET /projects/vehicle-options` bằng EXP1. 2. Bằng ENG1.
- **Test Data:** —
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** Lần 1 HTTP 200; mỗi phần tử có `id`, `name`, `is_default`, `length_m`, `width_m`, `mass_kg`, `max_brake_decel_mps2`; phần tử đầu là `vehicle.audi.etron` với `is_default = true`; chỉ xe `is_supported = TRUE`. Lần 2 HTTP 403, `code = "EXPERIENCER_ONLY"`, `detail = "Project cá nhân chỉ dành cho tài khoản Experiencer."`.

### PM-08 — Tạo project hợp lệ [N]
- **Description:** Kiểm tra EXPERIENCER tạo project mới kèm xe và baseline AEB v1.0.
- **Preconditions:** PRE-ENV, PRE-ACC; PRE-LOGIN-EXP1 (UI).
- **Test Steps:**
  1. Mở `/projects/new`; nhập "Tên project", mô tả; chọn xe ở mục "Phương tiện"; bấm tạo.
  2. `SELECT status, workspace_id, created_by_user_id, carla_vehicle_model_id, description FROM projects WHERE id=<id>`.
  3. `SELECT label, status, version_no, source FROM aeb_versions WHERE project_id=<id>`.
  4. `SELECT p.code, v.param_value FROM aeb_parameter_values v JOIN aeb_parameters p ON p.id=v.parameter_id WHERE v.aeb_version_id=<v1.0 mới>`.
- **Test Data:** `name = "IT-EXP1 Tạo mới"`; `description = "Kiểm thử tạo project"`; `carla_vehicle_model_id` = id xe mặc định.
- **Post conditions:** 1 project mới, 1 AEB version, 4 giá trị tham số.
- **Expected Result:**
  - HTTP 201; `status = "ACTIVE"`, `baseline_label = "v1.0"`, `family_count = 0`, `run_count = 0`, `has_running_work = false`; `journey.steps` có 5 bước `TODO`, `journey.next = "SCENARIO"`.
  - DB: `workspace_id = NULL`, `created_by_user_id` = EXP1; AEB `v1.0`, `status = BASELINE`, `version_no = 1`, `source = MANUAL`.
  - Tham số: `TTC_THRESHOLD = 1.5`, `BRAKE_ACTIVATION_DELAY = 0.15`, `MAX_DECELERATION = 8.0`, `BRAKE_BUILDUP_RATE = 20.0`.
  - UI chuyển sang trang project mới.

### PM-09 — Tạo project không chọn xe [N]
- **Description:** Kiểm tra hệ thống dùng xe mặc định khi không chọn xe.
- **Preconditions:** PRE-LOGIN-EXP1.
- **Test Steps:** 1. `POST /projects`.
- **Test Data:** `name = "IT-EXP1 Xe mặc định"`; không có `carla_vehicle_model_id`.
- **Post conditions:** 1 project mới.
- **Expected Result:** HTTP 201; `vehicle_name` = tên hiển thị của `vehicle.audi.etron`.

### PM-10 — Tên trống hoặc chỉ khoảng trắng [A]
- **Description:** Kiểm tra tên project là bắt buộc.
- **Preconditions:** PRE-LOGIN-EXP1.
- **Test Steps:** 1. `POST /projects` với `name = ""`. 2. Với `name = "   "`. 3. Không có `name`.
- **Test Data:** như các bước.
- **Post conditions:** Không tạo project.
- **Expected Result:** Cả ba HTTP 400; `code = "NAME_REQUIRED"`, `detail = "Tên project không được để trống."`.

### PM-11 — Tên 150 ký tự tiếng Việt có dấu [B]
- **Description:** Kiểm tra giá trị biên trên của tên (150 ký tự).
- **Preconditions:** PRE-LOGIN-EXP1.
- **Test Steps:** 1. `POST /projects`. 2. `SELECT CHAR_LENGTH(name) FROM projects WHERE id=<id>`.
- **Test Data:** `name` = "Đường" × 30 (150 ký tự).
- **Post conditions:** 1 project mới.
- **Expected Result:** HTTP 201; `CHAR_LENGTH(name) = 150`; tên hiển thị đúng dấu.

### PM-12 — Tên 151 ký tự [B]
- **Description:** Kiểm tra tên vượt 150 ký tự bị từ chối, thông báo nêu số ký tự hiện có.
- **Preconditions:** PRE-LOGIN-EXP1.
- **Test Steps:** 1. `POST /projects`.
- **Test Data:** `name` = "A" × 151.
- **Post conditions:** Không tạo project.
- **Expected Result:** HTTP 400; `code = "NAME_TOO_LONG"`, `detail = "Tên project tối đa 150 ký tự (đang có 151)."`.

### PM-13 — Tên 150 emoji [B]
- **Description:** Kiểm tra độ dài tên đếm theo ký tự (code point), không theo byte.
- **Preconditions:** PRE-LOGIN-EXP1.
- **Test Steps:** 1. `POST /projects`. 2. Đọc lại tên từ DB.
- **Test Data:** `name` = "🚗" × 150.
- **Post conditions:** 1 project mới.
- **Expected Result:** HTTP 201; tên đọc lại đủ 150 emoji, không bị cắt hay lỗi mã hoá.

### PM-14 — Tên chứa ký tự điều khiển [A]
- **Description:** Kiểm tra tên không được chứa ký tự điều khiển.
- **Preconditions:** PRE-LOGIN-EXP1.
- **Test Steps:** 1. `POST /projects` với tab. 2. Với xuống dòng.
- **Test Data:** `name = "IT\tTab"`; `name = "IT\nXuống dòng"`.
- **Post conditions:** Không tạo project.
- **Expected Result:** Cả hai HTTP 400; `code = "NAME_INVALID"`, `detail = "Tên project không được chứa ký tự điều khiển."`.

### PM-15 — Tên trùng project của chính mình [A]
- **Description:** Kiểm tra không tạo hai project cá nhân cùng tên cho cùng một chủ.
- **Preconditions:** EXP1 đã có "IT-EXP1 Dự án chính".
- **Test Steps:** 1. `POST /projects` với tên trùng. 2. Với tên trùng có thêm khoảng trắng hai đầu.
- **Test Data:** `name = "IT-EXP1 Dự án chính"`; `name = "  IT-EXP1 Dự án chính  "`.
- **Post conditions:** Không tạo project.
- **Expected Result:** Cả hai HTTP 409; `code = "NAME_DUPLICATE"`, `detail = "Bạn đã có project tên “IT-EXP1 Dự án chính”. Hãy chọn tên khác."`.

### PM-16 — Tên trùng khác chữ hoa/thường [A]
- **Description:** Kiểm tra cách hệ thống xử lý tên chỉ khác chữ hoa/thường.
- **Preconditions:** như PM-15.
- **Test Steps:** 1. `POST /projects`.
- **Test Data:** `name = "it-exp1 dự án chính"`.
- **Post conditions:** Ghi nhận theo kết quả.
- **Expected Result:** Ghi nhận thực tế (collation MySQL không phân biệt hoa thường → kỳ vọng 409 `NAME_DUPLICATE`). Nếu ra 201 thì ghi Fail và đề xuất thống nhất quy tắc.

### PM-17 — Tên trùng project của người khác [N]
- **Description:** Kiểm tra tên chỉ phải duy nhất trong phạm vi một chủ project.
- **Preconditions:** PRE-LOGIN-EXP2.
- **Test Steps:** 1. `POST /projects` bằng EXP2.
- **Test Data:** `name = "IT-EXP1 Dự án chính"`.
- **Post conditions:** EXP2 có thêm 1 project.
- **Expected Result:** HTTP 201.

### PM-18 — Mô tả đúng biên và vượt biên [B]
- **Description:** Kiểm tra mô tả tối đa 2000 ký tự.
- **Preconditions:** PRE-LOGIN-EXP1.
- **Test Steps:** 1. `POST /projects` với mô tả 2000 ký tự. 2. Với mô tả 2001 ký tự.
- **Test Data:** lần 1 `name = "IT-EXP1 Mô tả 2000"`, `description` = "m" × 2000; lần 2 `name = "IT-EXP1 Mô tả 2001"`, `description` = "m" × 2001.
- **Post conditions:** Chỉ lần 1 tạo project.
- **Expected Result:** Lần 1 HTTP 201. Lần 2 HTTP 400; `code = "DESCRIPTION_TOO_LONG"`, `detail = "Mô tả tối đa 2000 ký tự (đang có 2001)."`.

### PM-19 — Xe không có trong danh mục hỗ trợ [A]
- **Description:** Kiểm tra xe phải thuộc danh mục hỗ trợ.
- **Preconditions:** PRE-LOGIN-EXP1.
- **Test Steps:** 1. `POST /projects`.
- **Test Data:** `name = "IT-EXP1 Xe lạ"`; `carla_vehicle_model_id = 999999`.
- **Post conditions:** Không tạo project.
- **Expected Result:** HTTP 400; `code = "VEHICLE_NOT_FOUND"`, `detail = "Xe #999999 không có trong danh mục hoặc chưa được hỗ trợ."`.

### PM-20 — Role khác EXPERIENCER không tạo được project cá nhân [A]
- **Description:** Kiểm tra chỉ EXPERIENCER có project cá nhân.
- **Preconditions:** PRE-ACC.
- **Test Steps:** 1. `POST /projects` lần lượt bằng ENG1, REV1, MGR1, ADMIN1.
- **Test Data:** `name = "IT-Role khác"`.
- **Post conditions:** Không tạo project.
- **Expected Result:** Cả bốn HTTP 403; `code = "EXPERIENCER_ONLY"`.

### PM-21 — Xem project của người khác hoặc không tồn tại [A]
- **Description:** Kiểm tra chỉ chủ project xem được project cá nhân.
- **Preconditions:** PRE-LOGIN-EXP2.
- **Test Steps:** 1. `GET /projects/<P-EXP1>` bằng EXP2. 2. `GET /projects/999999`.
- **Test Data:** `<P-EXP1>`; `999999`.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** Lần 1 HTTP 403, `code = "PROJECT_NOT_YOURS"`, `detail = "Project #<P-EXP1> không phải project cá nhân của bạn."`. Lần 2 HTTP 404, `code = "PROJECT_NOT_FOUND"`, `detail = "Không tìm thấy project #999999."`.

### PM-22 — EXPERIENCER xem project nhóm [A]
- **Description:** Kiểm tra EXPERIENCER không xem được project thuộc workspace qua API project cá nhân.
- **Preconditions:** PRE-LOGIN-EXP1.
- **Test Steps:** 1. `GET /projects/<P-TEAM>`.
- **Test Data:** `<P-TEAM>`.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** HTTP 403; `code = "PROJECT_NOT_YOURS"`.

### PM-23 — Sửa tên và mô tả [N]
- **Description:** Kiểm tra chủ project sửa được tên và mô tả.
- **Preconditions:** Project "IT-EXP1 Tạo mới" (PM-08); PRE-LOGIN-EXP1 (UI).
- **Test Steps:** 1. Mở `/projects/<id>/settings`; sửa tên và mô tả; bấm lưu. 2. Đọc lại `name`, `description`, `updated_at`.
- **Test Data:** `name = "IT-EXP1 Đã sửa"`; `description = "Mô tả sau khi sửa"`.
- **Post conditions:** Project đổi tên và mô tả.
- **Expected Result:** HTTP 200; `name`, `description` mới; `updated_at` lớn hơn trước; UI hiện thông báo lưu thành công.

### PM-24 — Đổi xe khi chưa có lượt chạy [N]
- **Description:** Kiểm tra được đổi xe khi project chưa chạy mô phỏng.
- **Preconditions:** Project "IT-EXP1 Đã sửa" có `run_count = 0`; có ít nhất 2 xe hỗ trợ.
- **Test Steps:** 1. `PATCH /projects/<id>`.
- **Test Data:** `carla_vehicle_model_id` = id một xe hỗ trợ khác xe hiện tại.
- **Post conditions:** Project đổi xe.
- **Expected Result:** HTTP 200; `vehicle_id` = xe mới. *(Nếu danh mục chỉ có 1 xe hỗ trợ: Status = Blocked, ghi lý do.)*

### PM-25 — Không đổi xe khi đã có lượt chạy ⭐ [A]
- **Description:** Kiểm tra khoá xe sau khi project đã chạy để giữ so sánh cùng xe.
- **Preconditions:** P-EXP1 có run (baseline F3).
- **Test Steps:** 1. `PATCH /projects/<P-EXP1>`.
- **Test Data:** `carla_vehicle_model_id` = id một xe hỗ trợ khác.
- **Post conditions:** Xe không đổi.
- **Expected Result:** HTTP 409; `code = "VEHICLE_LOCKED"`, `detail = "Project đã có <run_count> lượt chạy bằng <tên xe> nên không đổi được xe. Tạo project mới để thử xe khác."`.

### PM-26 — Sửa project đang lưu trữ [A]
- **Description:** Kiểm tra hành vi khi sửa thông tin project đã lưu trữ.
- **Preconditions:** Một project của EXP1 ở `ARCHIVED`.
- **Test Steps:** 1. `PATCH /projects/<id>`.
- **Test Data:** `description = "Sửa khi lưu trữ"`.
- **Post conditions:** Theo chốt Q12.
- **Expected Result:** Theo chốt Q12 (đề xuất: cho sửa metadata, HTTP 200). *(Code hiện tại trả 200 — issue #11.)*

### PM-27 — Lưu trữ project không còn việc chạy [N]
- **Description:** Kiểm tra lưu trữ project rảnh.
- **Preconditions:** Project "IT-EXP1 Xe mặc định" (PM-09), `has_running_work = false`; PRE-LOGIN-EXP1 (UI).
- **Test Steps:** 1. Mở `/projects/<id>/settings`, bấm "Lưu trữ", xác nhận. 2. `GET /projects?status=ACTIVE` và `?status=ARCHIVED`.
- **Test Data:** project "IT-EXP1 Xe mặc định".
- **Post conditions:** Project `ARCHIVED`.
- **Expected Result:** HTTP 200, `status = "ARCHIVED"`; project rời tab ACTIVE, có trong tab ARCHIVED; `active_count` giảm 1, `archived_count` tăng 1.

### PM-28 — Lưu trữ lần hai [A]
- **Description:** Kiểm tra không lưu trữ project đã lưu trữ.
- **Preconditions:** PM-27 xong.
- **Test Steps:** 1. `POST /projects/<id>/archive`.
- **Test Data:** project "IT-EXP1 Xe mặc định".
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** HTTP 409; `code = "ALREADY_ARCHIVED"`, `detail = "Project “IT-EXP1 Xe mặc định” đã ở trạng thái lưu trữ."`.

### PM-29 — Lưu trữ khi còn việc đang chạy ⭐ [A]
- **Description:** Kiểm tra không lưu trữ khi project còn run hoặc regression chờ/chạy.
- **Preconditions:** P-EXP1 đang có run `PENDING`/`RUNNING` (ví dụ lúc T-E1 chạy).
- **Test Steps:** 1. `POST /projects/<P-EXP1>/archive`. 2. Mở trang settings.
- **Test Data:** `<P-EXP1>`.
- **Post conditions:** Project vẫn `ACTIVE`.
- **Expected Result:** HTTP 409; `code = "PROJECT_BUSY"`, `detail = "Project “IT-EXP1 Dự án chính” còn <N> việc đang chờ hoặc đang chạy. Đợi xong hoặc huỷ rồi thử lại."` (N = số run chờ/chạy + tối ưu + regression đang chạy); UI khoá nút "Lưu trữ" kèm lý do.

### PM-30 — Bỏ lưu trữ [N]
- **Description:** Kiểm tra bỏ lưu trữ project lưu trữ và từ chối với project đang hoạt động.
- **Preconditions:** PM-27 xong.
- **Test Steps:** 1. `POST /projects/<id lưu trữ>/unarchive`. 2. Gọi lại lần nữa.
- **Test Data:** project "IT-EXP1 Xe mặc định".
- **Post conditions:** Project về `ACTIVE`.
- **Expected Result:** Lần 1 HTTP 200, `status = "ACTIVE"`. Lần 2 HTTP 409; `code = "NOT_ARCHIVED"`, `detail = "Project “IT-EXP1 Xe mặc định” đang hoạt động, không cần bỏ lưu trữ."`.

### PM-31 — Làm việc trong project đã lưu trữ [A]
- **Description:** Kiểm tra không làm việc được trong project đã lưu trữ qua header chọn project.
- **Preconditions:** Một project của EXP1 ở `ARCHIVED`.
- **Test Steps:** 1. `GET /families` với `X-VehicSim-Project: <id lưu trữ>`. 2. `POST /families` với cùng header.
- **Test Data:** body bước 2 như F3 nhưng `name = "IT-Lưu trữ"`, `run_baseline = false`.
- **Post conditions:** Không tạo họ.
- **Expected Result:** Cả hai HTTP 409; `code = "PROJECT_ARCHIVED"`, `detail = "Project “<tên>” đang lưu trữ. Bỏ lưu trữ để mở lại."`.

### PM-32 — Header trỏ project người khác hoặc sai định dạng [A]
- **Description:** Kiểm tra header chọn project chỉ nhận project của chính mình.
- **Preconditions:** PRE-LOGIN-EXP2.
- **Test Steps:** 1. `GET /families` với `X-VehicSim-Project: <P-EXP1>`. 2. Với `X-VehicSim-Project: abc`.
- **Test Data:** header `<P-EXP1>`; header `abc`.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** Lần 1 HTTP 403, `code = "PROJECT_NOT_YOURS"`. Lần 2 HTTP 404, `code = "PROJECT_NOT_FOUND"`, `detail = "Không tìm thấy project #abc."`.

### PM-33 — Không gửi header chọn project [N]
- **Description:** Kiểm tra project được dùng khi EXPERIENCER không gửi header.
- **Preconditions:** EXP1 có ≥ 2 project ACTIVE; project cập nhật gần nhất không phải P-EXP1.
- **Test Steps:** 1. `GET /families` không có `X-VehicSim-Project`. 2. So danh sách họ với project cập nhật gần nhất.
- **Test Data:** —
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** Theo chốt Q12. Hiện tại: HTTP 200, trả họ của project ACTIVE mới nhất (không phải P-EXP1) — ghi nhận rủi ro ghi nhầm project (issue #13).

### PM-34 — Cô lập dữ liệu giữa hai project cá nhân [N]
- **Description:** Kiểm tra dữ liệu của project này không hiện ở project khác của cùng chủ.
- **Preconditions:** P-EXP1 có F3; EXP1 có project ACTIVE khác chưa có họ.
- **Test Steps:** 1. `GET /families` với header `<P-EXP1>`. 2. Với header project kia. 3. Trên UI, chuyển project trong "Project của tôi" và mở danh sách kịch bản.
- **Test Data:** hai project id.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** Lần 1 có "IT-F3 Cá nhân"; lần 2 không có; UI tương ứng.

### PM-35 — Xoá vĩnh viễn project đã có dữ liệu ⭐ [N]
- **Description:** Kiểm tra xoá project xoá hết dữ liệu liên quan và thư mục run.
- **Preconditions:** Chạy cuối. P-EXP2 có ít nhất 1 họ, 1 run CARLA `COMPLETED`, 1 regression `COMPLETED`, không còn việc chạy (tạo thêm nếu cần); ghi lại id run và đường dẫn `data/runs/<id>`; PRE-LOGIN-EXP2 (UI).
- **Test Steps:**
  1. Mở `/projects/<P-EXP2>/settings`, bấm xoá, gõ đúng tên, xác nhận.
  2. Chạy SQL đếm theo `project_id = <P-EXP2>` ở các bảng `projects`, `scenarios`, `scenario_versions` (qua `scenario_id`), `aeb_versions`, `simulation_runs`, `regression_tests`, `regression_test_items` (qua `regression_test_id`), `analysis_results`, `optimization_runs`.
  3. Kiểm thư mục run trên đĩa.
- **Test Data:** `confirm_name = "IT-EXP2 Dự án"`.
- **Post conditions:** P-EXP2 và dữ liệu liên quan không còn.
- **Expected Result:** HTTP 204; mọi câu đếm = 0; thư mục run đã ghi lại không còn; log có sự kiện `project.delete` với số run; UI quay về danh sách project.

### PM-36 — Xoá khi gõ sai tên hoặc thiếu xác nhận [A]
- **Description:** Kiểm tra bắt buộc gõ đúng tên khi xoá.
- **Preconditions:** P-EXP1 tồn tại; PRE-LOGIN-EXP1.
- **Test Steps:** 1. `DELETE /projects/<P-EXP1>` với tên sai. 2. Với tên viết thường. 3. Không có body.
- **Test Data:** `confirm_name = "IT-EXP1 Sai"`; `confirm_name = "it-exp1 dự án chính"`; không body.
- **Post conditions:** Project không bị xoá.
- **Expected Result:** Lần 1, 2: HTTP 400, `code = "CONFIRM_NAME_MISMATCH"`, `detail = "Gõ đúng “IT-EXP1 Dự án chính” để xác nhận xoá vĩnh viễn."`. Lần 3: HTTP 400, `detail = "Dữ liệu gửi lên không đúng định dạng"`.

### PM-37 — Xoá khi còn việc đang chạy ⭐ [A]
- **Description:** Kiểm tra không xoá project còn việc chờ/chạy.
- **Preconditions:** P-EXP1 đang có run chờ/chạy.
- **Test Steps:** 1. `DELETE /projects/<P-EXP1>`.
- **Test Data:** `confirm_name = "IT-EXP1 Dự án chính"`.
- **Post conditions:** Project không bị xoá.
- **Expected Result:** HTTP 409; `code = "PROJECT_BUSY"`.

### PM-38 — Chủ project được nâng role chỉ còn xem [N]
- **Description:** Kiểm tra sau khi EXPERIENCER được nâng role, project cá nhân chỉ xem được.
- **Preconditions:** Tài khoản phụ `it.exp3@<miền>` (EXPERIENCER) có project "IT-EXP3 Dự án"; ADMIN1 thêm vào workspace với `role = ENGINEER`; đăng xuất/đăng nhập lại để lấy token mới.
- **Test Steps:** 1. `GET /projects/<id>`. 2. `PATCH /projects/<id>` với `description = "Sửa sau khi đổi role"`. 3. `POST /projects/<id>/archive`. 4. `DELETE /projects/<id>`.
- **Test Data:** như các bước.
- **Post conditions:** Project không đổi.
- **Expected Result:** Bước 1 HTTP 200. Bước 2–4 HTTP 403, `code = "EXPERIENCER_ONLY"`.

### PM-39 — Vượt hạn mức thao tác ghi project [B]
- **Description:** Kiểm tra giới hạn số thao tác ghi project của một người.
- **Preconditions:** `VEHICSIM_WRITES_PER_WINDOW=30`, backend đã khởi động lại; EXP2 chưa ghi project trong cửa sổ hiện tại.
- **Test Steps:** 1. Gửi liên tiếp 31 request `POST /projects` với tên trống (bị từ chối, không tạo dữ liệu).
- **Test Data:** `name = ""` mỗi lần.
- **Post conditions:** Không tạo project.
- **Expected Result:** Request 1–30 HTTP 400 `NAME_REQUIRED`; request 31 HTTP 429, `detail = "Thao tác quá nhiều lần, thử lại sau ít phút"`.

### PM-40 — Giao diện "Project của tôi" [N]
- **Description:** Kiểm tra màn danh sách, tạo, sửa và xoá project trên giao diện, thông báo tiếng Việt.
- **Preconditions:** PRE-LOGIN-EXP1 (UI).
- **Test Steps:**
  1. Mở `/projects`: xem tab, ô "Tìm theo tên project", phân trang.
  2. Tạo project với tên trống, rồi tên trùng; đọc thông báo.
  3. Mở settings, mở hộp xoá, gõ sai tên.
- **Test Data:** tên trống; `"IT-EXP1 Dự án chính"`; tên xác nhận sai `"abc"`.
- **Post conditions:** Không tạo/xoá project.
- **Expected Result:** Thông báo đúng câu tiếng Việt như PM-10, PM-15; nút xoá vĩnh viễn chỉ bật khi gõ đúng tên; tìm kiếm lọc danh sách. Chụp màn hình từng bước.

---

## Ca bổ sung sau rà soát EP/BVA

Phân lớp và biên tương ứng ở [ep-bva.md](ep-bva.md), mục 4.

### PM-41 — Tên 1, 2 và 149 ký tự [B]
- **Description:** Kiểm tra biên min, min+1 và max−1 của tên project.
- **Preconditions:** PRE-LOGIN-EXP1.
- **Test Steps:** Gửi `POST /projects` 3 lần; đọc `CHAR_LENGTH(name)`.
- **Test Data:** `name` lần lượt `"Đ"`, `"Đư"`, "Đ" × 149.
- **Post conditions:** 3 project mới.
- **Expected Result:** Cả ba HTTP 201; độ dài lưu 1, 2, 149.

### PM-42 — Tên có khoảng trắng hai đầu [B]
- **Description:** Kiểm tra tên được cắt khoảng trắng trước khi kiểm độ dài và lưu.
- **Preconditions:** PRE-LOGIN-EXP1.
- **Test Steps:** 1. `POST /projects` lần 1. 2. Lần 2. 3. Đọc `CONCAT('[', name, ']')`.
- **Test Data:** lần 1 `name = "  IT-EXP1 Cắt  "`; lần 2 `name` = 2 khoảng trắng + "C" × 150 + 2 khoảng trắng (154 ký tự thô).
- **Post conditions:** 2 project mới.
- **Expected Result:** Cả hai HTTP 201; lưu `"[IT-EXP1 Cắt]"` và tên 150 ký tự không có khoảng trắng.

### PM-43 — Ký tự biên của nhóm ký tự điều khiển [B]
- **Description:** Kiểm tra qua HTTP và DB thật các điểm biên C0/C1 (đã kiểm đủ ở unit test, đây là kiểm đại diện).
- **Preconditions:** PRE-LOGIN-EXP1.
- **Test Steps:** Gửi `POST /projects` 4 lần (JSON escape `\uXXXX`).
- **Test Data:** `name` = `"IT\u001fA"` (C0 max), `"IT B"` (C0 max+1), `"IT~C"` (C1 min−1), `"IT\u007fD"` (C1 min).
- **Post conditions:** 2 project mới.
- **Expected Result:** `\u001f`, `\u007f` → HTTP 400 `NAME_INVALID`; ` `, `~` → HTTP 201.

### PM-44 — Mô tả rỗng, 1 ký tự và 1999 ký tự [B]
- **Description:** Kiểm tra biên dưới và max−1 của mô tả; mô tả chỉ khoảng trắng được lưu NULL.
- **Preconditions:** PRE-LOGIN-EXP1.
- **Test Steps:** Gửi `POST /projects` 3 lần; đọc `description` (`IS NULL`, `CHAR_LENGTH`).
- **Test Data:** (1) `name = "IT-Mô tả trắng"`, `description = "   "`; (2) `name = "IT-Mô tả 1"`, `description = "d"`; (3) `name = "IT-Mô tả 1999"`, `description` = "d" × 1999.
- **Post conditions:** 3 project mới.
- **Expected Result:** Cả ba HTTP 201; (1) `description IS NULL`; (2) độ dài 1; (3) độ dài 1999.

### PM-45 — Xe không hỗ trợ, id 0/âm, sai kiểu [A]
- **Description:** Kiểm tra các lớp không hợp lệ của xe (EP-PM14 → EP-PM16).
- **Preconditions:** PRE-LOGIN-EXP1; id của `vehicle.carlamotors.european_hgv` (`is_supported = FALSE`).
- **Test Steps:** Gửi `POST /projects` 4 lần.
- **Test Data:** `name = "IT-Xe lỗi"`; `carla_vehicle_model_id` lần lượt = id xe tải HGV, `0`, `-1`, `"abc"`.
- **Post conditions:** Không tạo project.
- **Expected Result:** Ba lần đầu HTTP 400, `code = "VEHICLE_NOT_FOUND"`, `detail = "Xe #<id> không có trong danh mục hoặc chưa được hỗ trợ."`; lần 4 HTTP 400, `detail = "Dữ liệu gửi lên không đúng định dạng"`.

### PM-46 — Phân trang: vượt trang cuối, âm, sai kiểu, 2 và 49 mục [B]
- **Description:** Kiểm tra các lớp và biên còn lại của phân trang.
- **Preconditions:** EXP2 có 10 project ACTIVE (như PM-06); PRE-LOGIN-EXP2.
- **Test Steps:** Gửi lần lượt: `?page=99`, `?page=-1`, `?page=abc`, `?page_size=2`, `?page_size=49`.
- **Test Data:** như bước.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** `page=99` → 200, `items = []`, `total = 10`; `page=-1` → 400 như PM-05; `page=abc` → 400 `"Yêu cầu không hợp lệ"`; `page_size=2` → 2 mục; `page_size=49` → 10 mục.

### PM-47 — Tìm kiếm có khoảng trắng hai đầu và dấu `\` [N]
- **Description:** Kiểm tra từ khoá được cắt khoảng trắng và ký tự `\` được hiểu theo nghĩa đen.
- **Preconditions:** EXP1 có project "IT-EXP1 Dự án chính" và "IT-EXP1 A\B" (tạo trước).
- **Test Steps:** 1. `GET /projects?q=%20%20Dự án%20%20`. 2. `GET /projects?q=A\B` (URL-encode `\` = `%5C`).
- **Test Data:** `q = "  Dự án  "`; `q = "A\B"`.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** Lần 1 có "IT-EXP1 Dự án chính"; lần 2 chỉ có "IT-EXP1 A\B".

### PM-48 — Xoá với tên xác nhận có khoảng trắng hai đầu, khác hoa thường, rỗng [B]
- **Description:** Kiểm tra tên xác nhận được cắt khoảng trắng nhưng phải khớp đúng chữ.
- **Preconditions:** EXP1 có project rảnh "IT-EXP1 Xoá thử" (không có run).
- **Test Steps:** 1. `DELETE /projects/<id>` với `confirm_name = ""`. 2. Với `"it-exp1 xoá thử"`. 3. Với `"  IT-EXP1 Xoá thử  "`.
- **Test Data:** như bước.
- **Post conditions:** Project bị xoá ở bước 3.
- **Expected Result:** Bước 1, 2: HTTP 400 `CONFIRM_NAME_MISMATCH`; bước 3: HTTP 204, project không còn.

### PM-49 — Đổi xe khi project có đúng 1 lượt chạy [B]
- **Description:** Kiểm tra biên khoá xe: 1 lượt chạy đã đủ để khoá.
- **Preconditions:** Project "IT-EXP1 Hành trình" sau PJ-03 có `run_count = 1` (chạy xong).
- **Test Steps:** 1. `PATCH /projects/<id>`.
- **Test Data:** `carla_vehicle_model_id` = id một xe hỗ trợ khác xe hiện tại.
- **Post conditions:** Xe không đổi.
- **Expected Result:** HTTP 409; `code = "VEHICLE_LOCKED"`, `detail = "Project đã có 1 lượt chạy bằng <tên xe> nên không đổi được xe. Tạo project mới để thử xe khác."`. *(Nếu danh mục chỉ có 1 xe hỗ trợ: Blocked.)*

### PM-50 — Lưu trữ khi còn đúng 1 việc đang chạy [B]
- **Description:** Kiểm tra biên chặn lưu trữ: 1 việc chờ/chạy đã đủ để chặn.
- **Preconditions:** Project "IT-EXP1 Hành trình" lúc PJ-03 đang có đúng 1 run `PENDING`/`RUNNING`.
- **Test Steps:** 1. `POST /projects/<id>/archive`.
- **Test Data:** project "IT-EXP1 Hành trình".
- **Post conditions:** Project vẫn `ACTIVE`.
- **Expected Result:** HTTP 409; `code = "PROJECT_BUSY"`, `detail = "Project “IT-EXP1 Hành trình” còn 1 việc đang chờ hoặc đang chạy. Đợi xong hoặc huỷ rồi thử lại."`.

### PM-51 — Header chọn project: 0, âm, không tồn tại, project nhóm [A]
- **Description:** Kiểm tra các lớp không hợp lệ còn lại của header chọn project (EP-PM37, EP-PM38).
- **Preconditions:** PRE-LOGIN-EXP1.
- **Test Steps:** `GET /families` với header lần lượt `0`, `-1`, `999999`, `<P-TEAM>`.
- **Test Data:** như bước.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** `0`, `-1`, `999999` → HTTP 404, `code = "PROJECT_NOT_FOUND"`; `<P-TEAM>` → HTTP 403, `code = "PROJECT_NOT_YOURS"`.

### PM-52 — Sửa một phần: không gửi trường và xoá mô tả [N]
- **Description:** Kiểm tra PATCH chỉ đổi trường được gửi; gửi mô tả rỗng thì xoá mô tả.
- **Preconditions:** Project "IT-EXP1 Đã sửa" (PM-23) có mô tả.
- **Test Steps:** 1. `PATCH` với body `{}`. 2. `PATCH` với `{"description": ""}`. 3. Đọc `name`, `description`, xe.
- **Test Data:** như bước.
- **Post conditions:** Mô tả bị xoá.
- **Expected Result:** Bước 1 HTTP 200, không trường nào đổi; bước 2 HTTP 200, `description` = null; tên và xe giữ nguyên.

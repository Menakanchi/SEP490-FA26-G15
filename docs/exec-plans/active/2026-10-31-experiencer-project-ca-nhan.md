# 31/10/2026 — Project cá nhân cho EXPERIENCER

**Trạng thái:** Luồng 1–2 **đã code và kiểm chứng** (31/10/2026). Luồng 3 và phần đổi role của Luồng 5 đã code (01/11/2026, chưa
chạy app thật); Luồng 4 đã rà code, còn kiểm bằng hai tài khoản; thông báo của Luồng 5 chờ quyết định (mục 8).
Phần TD-30 dành riêng cho role EXPERIENCER ([tech-debt-tracker](../tech-debt-tracker.md)). Người làm, deadline theo GitHub Issues/Project.
Mỗi luồng là một việc EXPERIENCER làm được trọn vẹn từ giao diện tới DB, có kịch bản demo và merge riêng được.

## 1. Mục tiêu

Theo [ADR-035](../../adr/ADR-035-nam-role-he-thong-bo-cau-hinh-xe-va-meomeo.md): EXPERIENCER (người tự đăng ký) có **project cá nhân**,
tự quản lý project và làm trọn quy trình trong đó mà **không** thấy dữ liệu người khác, **không** có khuyến nghị, **không** qua Reviewer.
Role khác không đổi hành vi; điều kiện duy nhất với họ: không bao giờ nhận project cá nhân làm project đang làm việc.

## 2. Ràng buộc đã chốt

- **Không sửa database của nhóm**: dùng nguyên `01_schema.sql` (29 bảng, không migration mới). Project cá nhân = `projects.workspace_id IS NULL`,
  `status` chỉ `ACTIVE/ARCHIVED`, tên duy nhất theo người nhờ `uq_projects_personal_name` có sẵn.
- **Ít đụng code người khác**: route nghiệp vụ, `RunService`, các `*ViewService` giữ nguyên; chỉ sửa tối thiểu các file chung ở mục 7.2.
- Code mới không comment, theo gói `com.vsos.backend.<tầng>.project` và `frontend/src/components/project/`.

## 3. Quyết định

| Mã | Câu hỏi | Chốt |
|---|---|---|
| Q1 | Frontend báo project đang mở bằng cách nào? | Header `X-VehicSim-Project: <id>` trên mọi request; không gửi thì mở project `ACTIVE` cập nhật gần nhất. Role khác: backend bỏ qua header, chạy như cũ (project nhóm `ACTIVE` đầu tiên) |
| Q2 | EXPERIENCER thấy gì? | Chỉ project cá nhân của mình (bảng 4.1) |
| Q3 | Hạn mức | Tối đa 3 project `ACTIVE` (`ProjectService.MAX_ACTIVE`); mọi thao tác ghi qua `limitWrites(uid, "project")` |
| Q4 | Project mới có gì sẵn | Xe chọn từ danh mục (mặc định Audi e-tron) + baseline AEB v1.0 như bootstrap (TTC 1,5 s) |
| Q5 | Lưu trữ và xoá | 2 trạng thái `ACTIVE ⇄ ARCHIVED` + **xoá vĩnh viễn** có gõ tên xác nhận. Không có thùng rác vì không thêm cột/trạng thái vào DB |
| Q6 | Dữ liệu EXPERIENCER đã tạo trong project chung | Giữ nguyên, không chuyển |
| Q7 | EXPERIENCER được nâng role | Project cá nhân còn nguyên, chủ project đọc được danh sách / chi tiết / hành trình nhưng không mở để làm việc (01/11/2026) |
| Q8 | Báo lỗi | Mỗi tình huống một **tên lỗi** riêng (enum `ProjectError`), thân lỗi `{"code": "<TÊN>", "detail": "<câu tiếng Việt có số liệu>"}` (mục 6) |

## 4. Nghiệp vụ

### 4.1 EXPERIENCER thấy và làm được gì

| Project | Thấy trong danh sách | Mở để làm việc |
|---|---|---|
| Của mình — Đang hoạt động | tab Đang hoạt động | có |
| Của mình — Lưu trữ | tab Lưu trữ | không (bỏ lưu trữ để mở lại) |
| Của người khác / project nhóm | không | không |

Project lưu trữ **không mở được** (thay vì "mở chỉ xem"): mọi request mang header tới project lưu trữ bị chặn ở `ProjectScope`,
nên không phải thêm kiểm "chỉ đọc" vào từng route ghi của các phần khác.

### 4.2 Chức năng

| UC | Tên | Màn hình | Luồng |
|---|---|---|---|
| UC-P01 | Danh sách project của tôi + hạn mức | `/projects` | 1 |
| UC-P02 | Tạo project | `/projects/new` | 1 |
| UC-P03 | Xem chi tiết | `/projects/[projectId]` | 1 |
| UC-P04 | Sửa tên, mô tả, xe | `/projects/[projectId]/edit` | 1 |
| UC-P05 | Lưu trữ / bỏ lưu trữ | hộp thoại | 1 |
| UC-P06 | Xoá vĩnh viễn | hộp thoại gõ tên | 1 |
| UC-P07 | Mở / đổi project đang làm việc | nút "Mở", ô chọn trên sidebar | 2 |

### 4.3 Quy tắc

- **BR-01** Chỉ EXPERIENCER dùng API project cá nhân; chỉ chủ project thấy và thao tác.
- **BR-02** Hạn mức chỉ đếm project `ACTIVE`; tạo mới và bỏ lưu trữ đều kiểm.
- **BR-03** Tên: bỏ khoảng trắng đầu/cuối, 1–150 ký tự, không ký tự điều khiển; không trùng (không phân biệt hoa thường, theo collation DB)
  trong project cá nhân của cùng người. Mô tả tối đa 2.000 ký tự.
- **BR-04** Chỉ đổi được xe khi project chưa có lượt chạy nào.
- **BR-05** Không lưu trữ hoặc xoá khi còn run `PENDING/RUNNING/PAUSED`, tối ưu `PENDING/RUNNING` hoặc regression `PENDING/RUNNING`.
- **BR-06** Xoá vĩnh viễn phải gõ đúng tên; xoá mọi dữ liệu con trong một transaction, sau đó xoá thư mục run; không hoàn tác.
- **BR-07** Mọi thao tác ghi `AuditLog.event("project.create|update|status|delete", ...)`.
- **BR-08** Khi tải ngữ cảnh, frontend lưu id project đang mở; project đó bị xoá/lưu trữ/không còn của mình thì tự bỏ chọn, mở project
  hoạt động gần nhất và báo cho người dùng.

## 5. API (`/api/v1/vehicsim/projects`)

| Route | UC |
|---|---|
| `GET /projects` → `{items, active_count, active_limit}` | P01 |
| `GET /projects/vehicle-options` → `[{id, name, is_default}]` | P02, P04 |
| `POST /projects` `{name, description?, carla_vehicle_model_id?}` → 201 | P02 |
| `GET /projects/{projectId}` | P03 |
| `PATCH /projects/{projectId}` `{name?, description?, carla_vehicle_model_id?}` | P04 |
| `POST /projects/{projectId}/archive`, `POST /projects/{projectId}/unarchive` | P05 |
| `DELETE /projects/{projectId}` `{confirm_name}` → 204 | P06 |
| `GET /projects/{projectId}/journey` | Hành trình 5 bước ([exec plan hành trình](2026-11-01-hanh-trinh-experiencer.md)) |
| `POST /projects/{projectId}/regressions/{testId}/adopt` `{reason, confirmed}` → hành trình mới | Dùng ứng viên đạt kiểm chứng làm baseline (ADR-046) |

`GET /projects`, `GET /projects/{projectId}` và `/journey` mở cho mọi role nhưng chỉ trả project cá nhân của chính người gọi (chủ project
đã được nâng role vẫn xem được); các route còn lại chỉ EXPERIENCER.

`ProjectItem`: `id, name, description, status, vehicle_id, vehicle_name, baseline_label, family_count, run_count, regression_count,
has_running_work, created_date, updated_at`. Mọi route khác của VehicSim nhận header `X-VehicSim-Project` (UC-P07).

## 6. Danh mục lỗi

Thân lỗi: `{"code": "NAME_DUPLICATE", "detail": "Bạn đã có project tên “Thử AEB”. Hãy chọn tên khác."}`. `detail` giữ đúng khoá frontend
đang đọc; frontend rẽ nhánh theo `code` (ví dụ `NAME_*` hiện dưới ô Tên, `VEHICLE_*` dưới ô Xe). Nguồn: `exception/project/ProjectError.java`.

| Tên | HTTP | Khi nào | Giao diện |
|---|---|---|---|
| `EXPERIENCER_ONLY` | 403 | Role khác gọi API ghi / xe chọn được của project cá nhân | Hiện câu lỗi |
| `NO_PROJECT_OPEN` | 409 | EXPERIENCER chưa có project `ACTIVE` mà vào màn làm việc | Màn "Chưa có project" + nút tạo |
| `PROJECT_NOT_FOUND` | 404 | Id không có hoặc header không phải số | Tự bỏ chọn, mở project gần nhất, báo |
| `PROJECT_NOT_YOURS` | 403 | Project của người khác hoặc project nhóm | Như trên |
| `PROJECT_ARCHIVED` | 409 | Mở project đang lưu trữ | Như trên |
| `PROJECT_LIMIT_REACHED` | 409 | Tạo / bỏ lưu trữ khi đã đủ 3 project hoạt động | Nút bị khoá kèm lý do |
| `PROJECT_BUSY` | 409 | Lưu trữ / xoá khi còn việc đang chạy | Nút bị khoá kèm lý do |
| `ALREADY_ARCHIVED`, `NOT_ARCHIVED` | 409 | Lưu trữ lại / bỏ lưu trữ project đang hoạt động | Hiện câu lỗi |
| `NAME_REQUIRED`, `NAME_TOO_LONG`, `NAME_INVALID` | 400 | Tên trống / quá 150 ký tự / có ký tự điều khiển | Dưới ô Tên |
| `NAME_DUPLICATE` | 409 | Trùng tên project khác của mình | Dưới ô Tên |
| `DESCRIPTION_TOO_LONG` | 400 | Mô tả quá 2.000 ký tự | Dưới ô Mô tả |
| `VEHICLE_NOT_FOUND` | 400 | Xe không có hoặc không được hỗ trợ | Dưới ô Xe |
| `VEHICLE_LOCKED` | 409 | Đổi xe khi đã có lượt chạy | Ô Xe bị khoá kèm lý do |
| `CONFIRM_NAME_MISMATCH` | 400 | Xoá vĩnh viễn gõ sai tên | Nút xoá bị khoá tới khi gõ đúng |
| `REASON_REQUIRED`, `CONFIRM_REQUIRED` | 400 | Chọn baseline thiếu lý do / chưa xác nhận | Nút trong hộp thoại bị khoá tới khi đủ |
| `TEST_NOT_FOUND` | 404 | Lần kiểm chứng không thuộc project | Hiện câu lỗi |
| `TEST_NOT_FINISHED`, `TEST_NOT_PASSED` | 409 | Kiểm chứng chưa xong / không đạt | Không hiện nút chọn baseline |
| `CANDIDATE_ALREADY_DECIDED`, `BASELINE_CHANGED` | 409 | Ứng viên đã thành baseline / baseline đổi sau lần kiểm chứng | Màn kết luận nói rõ lý do |

Lỗi giới hạn tần suất (429) và lỗi chung khác giữ định dạng cũ `{"detail": ...}`.

## 7. Bản đồ file

### 7.1 File mới

| File | Việc |
|---|---|
| `exception/project/ProjectError.java`, `ProjectException.java` | Enum tên lỗi + HTTP + mẫu câu; exception mang enum |
| `repository/project/ProjectRepository.java` | Đọc kèm số đếm, danh sách, hạn mức, trùng tên, xe hỗ trợ; tạo project + baseline v1.0 (`INSERT … SELECT` từ `aeb_parameters`); đổi trạng thái; xoá vĩnh viễn theo thứ tự khoá ngoại |
| `service/project/ProjectService.java` | UC-P01…P06, BR-01…BR-07; `requireOwner` dùng chung với `ProjectScope` |
| `dto/project/ProjectDtos.java`, `controller/project/ProjectController.java` | API mục 5 |
| `security/ProjectScope.java` | Bean `@RequestScope` chọn project của request (Q1) |
| `frontend/src/components/project/` | `ProjectGate` (màn chưa có project + thông báo), `ProjectSwitcher`, `ProjectForm`, `useProjectActions` (hộp thoại) |
| `frontend/src/app/projects/**` | `ListProjectPage`, `AddProjectPage`, `ViewProjectDetailPage`, `EditProjectPage` |

### 7.2 File chung đã sửa (tối thiểu)

| File | Thay đổi |
|---|---|
| `repository/common/Queries.java` | `currentProject()` lấy từ `ProjectScope` (giữ tên, 30 chỗ gọi không đổi) |
| `security/VehicSimAccess.java` | Thêm `requireExperiencer` |
| `exception/ApiExceptionHandler.java` | Thêm handler `ProjectException` |
| `config/SecurityConfig.java` | CORS cho header `X-VehicSim-Project` |
| `service/system/SystemViewService.java` | `getLong("workspace_id")` thay `lng(...)` (project cá nhân không có workspace) |
| `service/system/BootstrapService.java` | Kiểm "đã có project mặc định" theo `workspace_id IS NOT NULL` (nếu không, EXPERIENCER tạo project trước thì bootstrap không tạo project nhóm) |
| `service/simulation/RunService.java` | `runDir` thành `public` để xoá thư mục run |
| `frontend/src/services/api.ts` | Gắn header project; `ApiError.code`; nhận 204 |
| `frontend/src/context/AuthContext.tsx` | Đăng xuất thì bỏ project đang chọn |
| `frontend/src/components/VehicSimContext.tsx` | `isExperiencer`, `needsProject`, `projectNotice`, `openProject` |
| `frontend/src/components/VehicSimShell.tsx`, `VehicSimSidebar.tsx` | `ProjectGate`; menu "Project của tôi" + ô chọn project (chỉ EXPERIENCER) |
| `frontend/src/types/vehicsim.ts`, `services/vehicsim.ts` | Kiểu và client cho API mục 5 |

## 8. Lộ trình theo luồng

| Luồng | Xong thì EXPERIENCER làm được | Trạng thái |
|---|---|---|
| **1** | Quản lý project: tạo, xem, sửa, lưu trữ, bỏ lưu trữ, xoá vĩnh viễn | **Xong 31/10/2026** |
| **2** | Mở project → thiết kế kịch bản → chạy baseline → xem kết quả, chỉ trong project của mình | **Xong 31/10/2026** |
| 3 | Phân tích → candidate → tối ưu → regression, tự đọc kết quả, không qua Reviewer | **Đã code 01/11/2026**, chưa chạy app thật |
| 4 | Riêng tư: route đọc theo id không lộ dữ liệu người khác; link sai project được giải thích | Đã rà code; còn kiểm hai tài khoản |
| 5 | Được nâng role không mất project; nhận thông báo khi lô chạy / regression xong | Đổi role **đã code**; thông báo chờ quyết định |

### Luồng 1 — Quản lý project cá nhân (xong)

Demo đã chạy (mục 10): tên trống/quá dài/trùng → lỗi dưới ô; tạo 3 project → tạo thứ 4 bị `PROJECT_LIMIT_REACHED`; sửa tên, đổi xe khi
chưa có run; lưu trữ → tạo được thêm; bỏ lưu trữ khi đủ 3 → `PROJECT_LIMIT_REACHED`; xoá gõ sai tên → `CONFIRM_NAME_MISMATCH`, gõ đúng
→ biến mất (`PROJECT_NOT_FOUND`); exp2 xem/sửa project của exp1 → `PROJECT_NOT_YOURS`; ENGINEER gọi API → `EXPERIENCER_ONLY`.

### Luồng 2 — Làm việc trong project của mình (xong)

Demo đã chạy: exp1 mở project A → `/context` trả project A (`workspace` = null) → tạo họ + chạy baseline động học (2 run COMPLETED) →
project B không thấy họ của A; ENGINEER vẫn ở project nhóm và không thấy họ của A; exp2 gửi header A → `PROJECT_NOT_YOURS`; đổi xe A khi
đã có run → `VEHICLE_LOCKED`; lưu trữ A → mở hoặc ghi vào A → `PROJECT_ARCHIVED`, không header thì mở project hoạt động gần nhất;
xoá vĩnh viễn A → không còn dòng `projects/scenarios/simulation_runs/aeb_versions` nào của A; project nhóm còn nguyên.

### Luồng 3 — Phân tích tới regression không qua Reviewer (đã code 01/11/2026)

1. Đã có sẵn từ trước: `RegressionService.createRecommendation` bỏ qua project không thuộc workspace. Chưa có test riêng; không thêm vì
   đó là code phần 5 (đề nghị người phụ trách phần 5 bổ sung).
2. Không sửa backend phần 5: trang `/validation/regression/[testId]` rẽ nhánh theo `isExperiencer` (project cá nhân chỉ EXPERIENCER mở
   được) — bỏ "Mở khuyến nghị", câu "cần kỹ sư quyết định", thay bằng "Xem kết luận" dẫn tới màn Kết luận vòng.
3. Khép vòng: chủ project tự chọn ứng viên `PASSED` làm baseline (`ProjectService.adopt`, ADR-046).
4. Còn lại: demo trên app thật (chọn ca lỗi → candidate → regression → chọn baseline → vòng 2); xoá vĩnh viễn project có regression thật.

### Luồng 4 — Riêng tư

Rà code 01/11/2026: run, bundle, xosc, playback, carla-data/files, dataset, handoff, family versions / variants, regression,
recommendation, optimization / trial đều lọc theo project hiện hành; `findTest(testId)` không kèm project chỉ dùng ở luồng nền,
`findVersion(versionId)` chỉ gọi sau khi đã lấy test theo project. Chưa thấy chỗ cần sửa backend. Chạy thật 01/11/2026: exp2 đọc
project, hành trình, regression của exp1 và gửi header project của exp1 đều bị chặn
([bằng chứng](2026-11-01-hanh-trinh-experiencer.md#12-kiểm-chứng)). Còn lại:

1. Rà từng route đọc theo id (`/runs/{id}`, `/regression/{id}`, `/optimizations/{id}`, `/analysis/datasets/{id}`…) xem đã lọc `project_id`
   chưa; chú ý hàm tra theo id không kèm project (`RegressionRepository.findTest(testId)`, `findVersion(versionId)`).
2. Lỗi riêng khi id thuộc project khác của mình / của người khác / không tồn tại; script gọi mọi route bằng token exp2 với id của exp1.

### Luồng 5 — Đổi role và thông báo

1. Đã code 01/11/2026: chủ project không còn là EXPERIENCER đọc được `/projects`, trang chủ project và hành trình (chỉ xem, không có
   nút mở / sửa / lưu trữ); sidebar của role khác có mục "Project cá nhân (n)" chỉ khi người đó có project. Trở lại EXPERIENCER thì
   dùng tiếp như cũ.
2. Chờ quyết định: thông báo khi lô chạy / regression xong. Muốn ghi đúng lúc phải móc vào `RunService` (phần 2) và
   `RegressionService` (phần 5); cách không đụng code người khác là bộ quét định kỳ trong gói `project`, cần bật `@EnableScheduling`
   cho cả app. `NotificationService.notify` hiện bỏ qua khi người nhận là người làm, nên cần thêm hàm báo cho chính chủ.

## 9. Rủi ro và giới hạn còn lại

| Vấn đề | Ghi chú |
|---|---|
| Hai request tạo cùng lúc có thể vượt hạn mức 1 project | Kiểm rồi mới ghi, không khoá; trùng tên thì `uq_projects_personal_name` chặn (409 chung) |
| Không có thùng rác | Xoá là vĩnh viễn; bù lại bằng gõ tên xác nhận và chặn khi còn việc chạy |
| Chốt chặn khuyến nghị cho project cá nhân chưa có test riêng | Code phần 5; đề nghị người phụ trách bổ sung |
| Route đọc theo id mới rà bằng code | Luồng 4: còn kiểm bằng hai tài khoản trên app thật |
| Xoá thư mục run CARLA | Kiểm bằng `ProjectServiceTest`; run động học không tạo thư mục; chưa xoá thử run CARLA thật |
| `currentProject()` gọi ngoài request | `ProjectScope` là bean request; đã grep: chỉ service xem/ghi theo request gọi, luồng nền không gọi |
| Figma | Không có khung Figma cho màn Project; giao diện theo thành phần `VehicSimUi` sẵn có, chưa đối chiếu thiết kế |

## 10. Kiểm chứng (31/10/2026)

- `.\mvnw.cmd -B clean test`: 424 test, 0 lỗi, 1 bỏ qua (có `ProjectServiceTest` 8, `ProjectScopeTest` 6, `ProjectSecurityTest` 5).
- Frontend: `npm run lint`, `npx tsc --noEmit` sạch.
- Chạy thật: backend `:8102` + MySQL 8.4 dùng một lần dựng từ `01_schema.sql` gốc + Redis riêng, bộ động học. Script gọi API luồng 1–2:
  **44/44 bước đúng mã HTTP và tên lỗi**. Frontend `:3102` qua Edge headless: chưa có project → tạo → chi tiết → trùng tên → danh sách →
  sidebar đổi project → lưu trữ → xoá vĩnh viễn → màn kịch bản trong project; ENGINEER giữ giao diện cũ; không có lỗi trang.
- Không chạm DB dev của nhóm (dùng container riêng, đã xoá sau khi kiểm).

## 11. Nhật ký quyết định

| Ngày | Nội dung |
|---|---|
| 31/10/2026 | Lập kế hoạch từ rà code: 49 chỗ gọi project hiện tại, không API tạo project, project bootstrap thuộc workspace |
| 31/10/2026 | Góp ý: chỉ tập trung EXPERIENCER; Luồng 1 là quản lý project; lỗi phải có tên rõ ràng thay vì chỉ 404/403 |
| 31/10/2026 | Góp ý: **không sửa database của nhóm** → bỏ migration, bỏ thùng rác/bia mộ, project lưu trữ không mở được; rút gọn lỗi còn enum tên + câu tiếng Việt, bỏ mã `PRJ-xxx`/`SYS-xxx`, bỏ gói `exception/common` |
| 31/10/2026 | Code và kiểm chứng Luồng 1, Luồng 2 (mục 10) |
| 01/11/2026 | Góp ý: hạn chế đụng màn của thành viên khác — không sửa phần 1; phần 4 chỉ đọc `?tab=`; phần 5 chỉ rẽ nhánh frontend theo role. Code Luồng 3 (kèm ADR-046) và phần đổi role của Luồng 5; thông báo để chờ quyết định |

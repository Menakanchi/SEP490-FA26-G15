# Bắt buộc đọc sau khi pull: cập nhật code theo tên gói mới

Ngày 30/10/2026 nhóm đã chốt gốc gói `com.vsos`. Toàn bộ backend và lõi đã chuyển từ `com.vehicsim.*` sang
`com.vsos.backend.<tầng>.<chức năng>` và `com.vsos.core.<gói con>` theo [quy tắc đặt tên](quy-tac-dat-ten.md).
URL API, JSON, DB và định danh run/xosc **không đổi**; chỉ đổi tên gói, chỗ đặt file và một số lớp được tách.

Ai pull hoặc merge code từ sau commit này đều phải làm các bước dưới đây trước khi code tiếp. Không đoán tên gói mới:
**tra [mục 7 của quy tắc đặt tên](quy-tac-dat-ten.md#7-bảng-chuyển-đổi-gói-backend-cũ--mới)** cho từng class mình import.

## 1. Kéo code về nhánh của mình

```powershell
git fetch origin
git switch <nhánh-của-bạn>
git merge origin/main        # hoặc origin/refactor/package-naming nếu chưa merge vào main
```

- File bạn **đã sửa** ở chỗ cũ (`src/main/java/com/vehicsim/...`): Git thường tự nhận ra file đã đổi chỗ và đưa thay đổi của bạn sang
  file mới. Nếu báo xung đột, mở file ở chỗ mới, giữ phần code của bạn, sửa lại dòng `package`/`import`.
- File bạn **mới tạo** trong `com/vehicsim/...`: Git không tự chuyển. Tự chuyển file sang gói mới theo
  [mục 1 của quy tắc](quy-tac-dat-ten.md#1-gói-java-backend) (tầng → chức năng), rồi sửa dòng `package`.

## 2. Sửa `package` và `import` theo mục 7

Với mỗi dòng `import com.vehicsim...` còn lại trong code của bạn, tìm class đó trong
[bảng mục 7](quy-tac-dat-ten.md#7-bảng-chuyển-đổi-gói-backend-cũ--mới) và đổi sang gói mới. Một số class hay dùng:

| Cũ | Mới |
|---|---|
| `com.vehicsim.vehicsim.Vs`, `Json` | `com.vsos.backend.common.Vs`, `com.vsos.backend.common.Json` |
| `com.vehicsim.vehicsim.Db`, `Row`, `Queries` | `com.vsos.backend.repository.common.Db`, `Row`, `Queries` |
| `com.vehicsim.vehicsim.VehicSimAccess` | `com.vsos.backend.security.VehicSimAccess` |
| `com.vehicsim.vehicsim.RunService` | `com.vsos.backend.service.simulation.RunService` |
| `com.vehicsim.vehicsim.FamilyService` | `com.vsos.backend.service.scenario.FamilyService` |
| `com.vehicsim.service.RegressionService` | `com.vsos.backend.service.regression.RegressionService` |
| `com.vehicsim.entity.X` | `com.vsos.backend.entity.<chức năng>.X` (enum vẫn ở `com.vsos.backend.entity.enums`) |
| `com.vehicsim.core.AebStack`, `AebParams` | `com.vsos.core.aeb.AebStack`, `AebParams` |
| `com.vehicsim.core.Simulator`, `Frame` | `com.vsos.core.simulation.Simulator`, `Frame` |
| `com.vehicsim.core.XoscExport` | `com.vsos.core.xosc.XoscExport` |

Hai lớp đã bị tách, code gọi tới phải đổi lớp chứ không chỉ đổi import:

- `VehicSimController` không còn. Route của bạn nằm ở `ScenarioController`, `SimulationController`, `AnalysisController`,
  `AebController`, `OptimizationController` hoặc `SystemController` trong `com.vsos.backend.controller.<chức năng>`; thêm route mới vào
  đúng controller của chức năng. Hàm `requireEngineer`, `limitWrites`, `projectId` gọi thẳng qua `VehicSimAccess`.
  `VehicSimController.csvCell` đổi thành `com.vsos.backend.common.Csv.cell`.
- `ViewsService` không còn. Dùng `SystemViewService` (`context`), `ScenarioViewService` (họ, bản, biến thể),
  `AebViewService` (AEB versions), `AnalysisViewService` (ca lỗi, chi tiết, phát lại, tập baseline) hoặc
  `SimulationViewService` (bundle của run). Test `@WebMvcTest` mock đúng lớp View mà controller của mình dùng.

Không được đổi theo: chuỗi `vehicsim.xosc/v4`, `carla-0.9.16-xosc4`, `vsos-core-java/1`, `vsos-bridge/1`, metadata `vs_*`,
prefix cấu hình `vehicsim.*` và biến môi trường `VEHICSIM_*`. Đây là định danh dữ liệu, không phải tên gói.

## 3. Kiểm tra trước khi push

```powershell
git grep -n "com\.vehicsim"          # phải không còn kết quả trong src/, worker/, scripts/
.\mvnw.cmd -B clean test             # clean bắt buộc: class cũ trong target/ có thể che lỗi
python -m pytest worker/tests -q
```

Nếu IDE báo `Unresolved compilation problem` hoặc không xóa được `target/`, đóng IDE hoặc tắt build tự động rồi chạy lại `clean`.
Code mới từ nay đặt theo [quy tắc đặt tên](quy-tac-dat-ten.md); có class chưa có trong mục 7 thì hỏi TrungDQ trước khi tạo gói mới.

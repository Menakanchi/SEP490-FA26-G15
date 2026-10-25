# Thắc mắc còn lại cần nhóm chốt (23/10/2026)

Branch `feature/manager-workspace` (đi trước `trungdam` 6 commit, không chậm commit nào). **Chưa thực hiện mục nào dưới đây** — mỗi mục
ghi câu hỏi, ai cần chốt và đề xuất. Ký hiệu: Chi = màn 1, Trung = màn 2, Chu = màn 3, Phuong = màn 4, Tu = màn 5.

---

## A. Màn 1 (phần Chi) — task 4 → 8

### A1. Task 4 — Phiên bản kịch bản

Schema đã có `scenario_versions.version_no` + `parent_version_id` → **không cần đổi schema**. Hiện một họ chỉ có 1 bản gốc vì chưa có chức năng sửa.
Run baseline gắn với `scenario_version_id` của **từng biến thể**.

| # | Câu hỏi | Ai chốt | Đề xuất |
|---|---|---|---|
| 1 | Sửa họ thì sửa đè dữ liệu cũ hay tạo bản gốc mới (v2, v3…)? | Chi, Trung | Tạo bản mới, bản cũ giữ nguyên (DB cũng chặn xoá biến thể đã có run) |
| 2 | Biến thể có tham số giống hệt bản cũ: dùng lại (giữ baseline cũ) hay sinh mới (chạy lại baseline)? | Trung | Sinh mới — đơn giản, rõ ràng; dùng lại phải ghép theo IR |
| 3 | Màn 2 hiển thị biến thể của bản nào? Hiện `ViewsService` lấy **mọi** biến thể của họ → có v2 là trộn cũ + mới | Trung | Mặc định bản mới nhất, có ô chọn xem bản cũ |
| 4 | Họ đang có run chờ / đang chạy thì có cho sửa không? | Trung | Chặn sửa tới khi các run đó xong |
| 5 | Hồi quy và báo cáo ghi bản nào? | Chu, Tu | Hồi quy ghép theo `scenario_version_id` nên vẫn đúng; báo cáo ghi rõ v1/v2 để truy vết |

### A2. Task 5 — Nhãn ca nguy hiểm / ca an toàn

| # | Câu hỏi | Ai chốt | Đề xuất |
|---|---|---|---|
| 1 | Nhãn do hệ thống **tự suy** (vd. dừng ở lề = an toàn, băng ngang = nguy hiểm) hay **người dùng gắn tay**? | Chi, Chu | Tự suy làm mặc định, cho sửa tay |
| 2 | Lưu ở đâu: trong `scenario_ir_json` (không đổi schema) hay cột mới (phải sửa `01_schema.sql` + migration + docs)? | Cả nhóm | Trong IR trước; cần lọc nhiều thì mới thêm cột |
| 3 | Màn 3 (Chu) dùng nhãn này thế nào khi chọn tập dữ liệu? Có bắt buộc tỉ lệ ca an toàn tối thiểu không? | Chu | Chu quyết |

### A3. Task 6 — Hướng xuất phát / hành vi người đi bộ

| # | Câu hỏi | Ai chốt | Đề xuất |
|---|---|---|---|
| 1 | Thêm "từ lề trái / lề phải" vào IR: đổi hình học `.xosc` và bộ động học → **phải tách identity** (`-xosc5`) và chạy lại baseline. Nhóm có chấp nhận lúc này không? | Trung, cả nhóm | Làm sau khi chốt số liệu Demo, hoặc làm ngay nếu kịp chạy lại |
| 2 | Cần đo trên CARLA thật để nghiệm thu → bạn có cho chạy CARLA cho task này không? | Bạn | — |
| 3 | Gia tốc / hành vi theo thời gian (đi nhanh dần, dừng giữa đường) có trong phạm vi Demo không? | Cả nhóm | Để sau |

### A4. Task 7 — Mở rộng category

| # | Câu hỏi | Ai chốt | Đề xuất |
|---|---|---|---|
| 1 | Thứ tự làm 6 category còn lại (CCRS, CCRM, CCRB, CPLA, TURNING, CUT_IN)? | Cả nhóm | CCRS trước (xe trước đứng yên, đơn giản nhất) |
| 2 | TD-41: nghĩa của `lateral_overlap_pct` (−50…50 % hay −100…100 %)? | Cả nhóm | Chốt theo protocol Euro NCAP trước khi làm CCR* |
| 3 | TD-42: thời gian mô phỏng 15 s (cột DB) hay 12 s (code đang dùng)? | Trung | Giữ 12 s cho CP_CROSSING, category mới đọc theo cột |
| 4 | Trong lúc chưa làm, form có hiện category khác với nhãn "chưa hỗ trợ" không? | Chi | Có, hiện mờ kèm ghi chú |

### A5. Task 8 — Dọn dẹp

| # | Câu hỏi | Ai chốt | Đề xuất |
|---|---|---|---|
| 1 | `FamilyService.DEFAULT_MAP = "Town10HD"` nhưng `.xosc` luôn chạy Town04. Sửa thành Town04 cho dòng mới — có sửa luôn dữ liệu cũ (UPDATE) không? | Trung | Sửa cho dòng mới; dữ liệu cũ để nguyên (theo quyết định không sửa data) |
| 2 | TD-43: bản gốc mang giá trị giữ chỗ 50 km/h / CLEAR / DAY. Cho các cột này NULL ở bản gốc (đổi schema) hay giữ nguyên + luôn lọc `source = 'GENERATED'`? | Cả nhóm | Giữ nguyên, không đáng đổi schema |

---

## B. Phát sinh từ việc đã làm (task 1–3)

| # | Việc | Ai | Ghi chú |
|---|---|---|---|
| 1 | Run CARLA `-xosc3` cũ của ca dừng ở lề **không dùng làm bằng chứng phanh oan được** — cần chạy lại baseline CARLA bằng `-xosc4` | Trung | Cần CARLA |
| 2 | Report 7 của màn 2 vẫn ghi TD-47 là giới hạn | Trung | Cập nhật khi chốt báo cáo |
| 3 | `scripts/test_analysis_integration.py` đã đổi kích hoạt 60 m → 50 m (luật 12 s mới) | Chu | Chỉ cần biết |
| 4 | `CarlaRunnerPanel.tsx` đã thêm đọc `?family=` | Trung | Chỉ cần biết |
| 5 | Tốc độ người đi bộ 8 m/s (giới hạn trên của form) chưa đo trên CARLA — mới đo tới 6 m/s | Chi | Hạ giới hạn xuống 6 m/s, hoặc chạy CARLA đo |

---

## C. Role Manager — ngoài phạm vi M1–M10, còn trống

| # | Câu hỏi | Ai chốt | Ghi chú |
|---|---|---|---|
| 1 | **Luồng nộp báo cáo** (Engineer / Reviewer gửi báo cáo) chưa có → màn duyệt của Manager luôn rỗng trên dữ liệu thật. Ai làm? | Cả nhóm | Hiện phải chèn bằng SQL để test |
| 2 | Người được giao **tự cập nhật trạng thái / tiến độ task** chưa có — chỉ Manager sửa. Ai làm? | Cả nhóm | UC của Engineer / Reviewer |
| 3 | **Admin tạo workspace + gán Manager** chưa có API (máy dev phải `UPDATE workspaces SET manager_id = …`) | Admin UC | Cũng thiếu thông báo `WORKSPACE_ASSIGNED` |
| 4 | Thành viên workspace **chưa bị giới hạn dữ liệu** — app vẫn chạy trên một project chung (TD-30) | Cả nhóm | Thay đổi lớn: mọi API nhận `project_id` |
| 5 | Thông báo từ luồng mô phỏng / regression (`SIMULATION_*`, `REGRESSION_DONE`, `FAILURE_DETECTED`…) chưa nối | Trung, Chu | Hook vào `RunService` / `RegressionService` của họ |
| 6 | Thông báo realtime (WebSocket/SSE) hay giữ hỏi lại mỗi 60 s? | Cả nhóm | Đề xuất giữ 60 s cho Demo |
| 7 | Repo **không có frame Figma** cho màn Manager và chuông thông báo — ai vẽ / duyệt giao diện? | Người phụ trách UI | UI hiện làm theo token `vehicsim-*` |

---

## D. Quy trình

| # | Câu hỏi | Đề xuất |
|---|---|---|
| 1 | Merge `feature/manager-workspace` vào `trungdam` bằng PR hay để Trung tự merge? | Mở PR để Trung review (branch không xung đột, chỉ đi trước 6 commit) |
| 2 | Code màn 1 của Chi trên `chi`, `feature/carla-0.9.16-local` (kiến trúc Python cũ, chậm 46+ commit) xử lý sao? | Không merge; chỉ giữ `aeb-mobo-optimization.md` cho Phuong nếu cần |

---

## E. Trả lời của Trung (25/10/2026)

Mục có "Trung" ở cột "Ai chốt" là **quyết định**. Mục cần người khác / cả nhóm là **đề xuất của Trung**, chờ người đó chốt.
Chưa sửa code cho mục nào dưới đây.

### A1. Phiên bản kịch bản

1. **Quyết định:** tạo bản gốc mới (v2, v3…), không sửa đè — sửa đè làm hỏng tái lập baseline (bất biến 4).
2. **Quyết định:** sinh biến thể mới → `scenario_version_id` mới → chạy baseline mới. Không ghép theo IR.
3. **Quyết định:** màn 2 mặc định hiện bản gốc mới nhất, có ô chọn bản cũ. Cần thêm điều kiện
   `parent_version_id = <bản gốc đang chọn>` vào truy vấn biến thể của họ trong `ViewsService` (hiện lọc theo cả họ).
4. **Quyết định:** chặn sửa khi họ còn run PENDING/RUNNING (chưa có nút hủy — TD-37).
5. **Đề xuất (Chu, Tu):** hồi quy ghép theo `scenario_version_id` nên vẫn đúng; báo cáo ghi thêm số version.

> **Đã làm 25/10 (Chi) — mục 1–4:** `POST/GET /families/{id}/versions`, `/families` đếm theo bản hiện hành, dataset phân tích theo bản,
> `/scenarios` có ô chọn bản + nút "Sửa → bản mới". Chi tiết: [exec plan](../docs/exec-plans/completed/2026-10-25-man-1-phien-ban-ho-kich-ban.md).
> Mục 5 và dashboard run của màn 3 (`AnalysisService`, còn liệt kê run mọi bản) để Chu / Tu.

### A2. Nhãn ca nguy hiểm / an toàn

**Đề xuất:** đồng ý đề xuất trong bảng — tự suy làm mặc định, cho sửa tay, lưu trong `scenario_ir_json`.
Câu 3 do Chu quyết; bất biến repo đã bắt tập tối ưu/regression giữ ca an toàn, chỉ cần chốt tỉ lệ tối thiểu.

> **Đã làm 25/10 (Chi) — câu 1, 2:** nhãn tự suy (dừng ở lề = an toàn, băng qua = nguy hiểm), sửa tay ở `/scenarios` ("Gắn nhãn"),
> lưu `scenario_ir_json.risk_label`; API `GET /families/{id}/variants`, `PUT …/variants/{vid}/risk-label`; `/families` và dataset phân tích
> có `risk_label` / `risk_counts`. Chi tiết: [exec plan](../docs/exec-plans/completed/2026-10-25-man-1-nhan-tap-thu.md). Câu 3 (tỉ lệ, cách dùng) vẫn chờ Chu.

### A3. Hướng xuất phát người đi bộ

1. **Đề xuất:** để sau Demo. Đổi hình học → identity `-xosc5` + chạy lại toàn bộ baseline + chạy CARLA thật;
   vừa chuyển xosc4, làm ngay là chạy lại hai lần.
2. Nếu làm thì bắt buộc chạy CARLA thật (quy tắc repo).
3. **Đề xuất:** ngoài phạm vi Demo.

### A4. Mở rộng category

1. **Đề xuất:** CCRS trước.
2. **Đề xuất:** chốt TD-41 theo Euro NCAP (−50…50 %, 100 % = hai đường tâm trùng nhau) và sửa CHECK DB cho khớp, trước khi làm CCR*.
3. **Quyết định (TD-42):** CP_CROSSING giữ 12 s — hằng `MAX_DURATION_S = 12` đã được ghi vào cột của mọi run nên dữ liệu khớp
   thực tế; đổi lên 15 s sẽ phải đổi identity. Category mới đọc theo cột (mặc định 15 s).
4. **Đề xuất:** hiện category khác, để mờ kèm nhãn "chưa hỗ trợ".

### A5. Dọn dẹp

1. **Quyết định:** sửa `FamilyService.DEFAULT_MAP` thành `Town04` cho dòng mới; dữ liệu cũ để nguyên
   (`simulation_runs.map_name` đã ghi map CARLA thật nạp, đó mới là nguồn đúng).
2. **Đề xuất:** giữ nguyên, luôn lọc `source = 'GENERATED'` (code hiện đã lọc vậy).

> **Đã làm 25/10 (Chi) — mục 1:** `DEFAULT_MAP = "Town04"`; bỏ comment trỏ `describe.py` / `family.py`.

### B. Phát sinh

1. **Đồng ý:** cần chạy lại baseline CARLA bằng `-xosc4` (Trung làm, cần bật CARLA).
2. **Đồng ý, và rộng hơn:** cả `report7-man-chay-baseline.md` và `report7-baseline-screen-en.md` còn ghi identity
   `carla-0.9.16-xosc3` (bảng định danh, BR-05) và TD-47 là giới hạn → cập nhật sang xosc4.
3, 4. Đã biết.
5. **Đề xuất (Chi):** hạ giới hạn trên tốc độ người đi bộ trong `FamilyService` từ 8 xuống 6 m/s; muốn giữ 8 m/s thì cần số đo CARLA.

> **Đã làm 25/10 (Chi chốt):** tạo họ / trích xuất mô tả / form nhận tối đa 6 m/s (`FamilyService.MAX_PEDESTRIAN_SPEED_MPS`);
> `Bundle` vẫn nhận tới 8 m/s để run cũ chạy lại / xuất `.xosc` được.

### C. Role Manager (đề xuất, cả nhóm chốt)

- C1, C2, C3 giao Tu (FE-04/FE-10 workspace/admin); **C3 làm trước** vì thiếu nó máy mới không dùng được màn Manager.
- C4 (TD-30): để sau Demo — mọi API phải nhận `project_id`.
- C5: Trung nối `SIMULATION_*` trong `RunService`; Chu nối `REGRESSION_DONE`/`FAILURE_DETECTED`.
- C6: giữ hỏi lại 60 s cho Demo.
- C7: người phụ trách UI vẽ frame Figma; trước khi có, ghi rõ "chưa đối chiếu Figma".

### D. Quy trình

1. **Đã xong:** Trung merge `feature/manager-workspace` vào `trungdam` và push ngày 24/10 (commit `02c8973`).
2. **Đồng ý:** không merge `chi`, `feature/carla-0.9.16-local` (kiến trúc Python cũ đã gỡ ở ADR-042).

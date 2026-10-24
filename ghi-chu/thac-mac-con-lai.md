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

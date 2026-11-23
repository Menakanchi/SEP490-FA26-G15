# Đánh giá 5 module so với bản phân chia công việc (23/11/2026)

Đối chiếu tiêu chí nghiệm thu và mục "Chức năng giao diện" trong [phân chia 5 thành viên](phan-chia-cong-viec-5-thanh-vien.md)
với code trên `main` tại commit `c9d6f32`.

**Phạm vi kiểm:** đọc code backend (service, controller, schema) và code giao diện của từng màn theo luồng
`/scenarios/new` → `/scenarios` → `/analysis/failures` → `/aeb` → `/validation/**`, cả luồng project cá nhân `/projects/[id]/**`.
Chưa bấm thử trên trình duyệt. Mục ghi "chưa kiểm" là chưa có bằng chứng chạy thật.

## 1. Tóm tắt

| Module | Backend | Giao diện | Việc còn thiếu chính |
|---|---|---|---|
| 1. Thiết kế kịch bản | Đạt | Đạt | Không thấy lệch |
| 2. Chạy baseline | Đạt | Đạt (sau sửa 23/11) | Chưa chạy thử lỗi/hủy giữa batch; chính sách số CARLA cần nhóm chốt (mục 3) |
| 3. Phân tích lỗi | Đạt | Đạt | Tập đã chốt không được module 4 và 5 dùng |
| 4. Tối ưu AEB | Thiếu | Thiếu nhiều nhất | Không nhận tập từ module 3, chọn sai họ mặc định, không so với baseline, chưa có random search |
| 5. Regression và phê duyệt | Đạt | Đạt | Đường đi từ MOBO bỏ qua màn xem trước regression |

Chỗ hở lớn nhất nằm ở **điểm nối 3 → 4 → 5**. Từng màn chạy được, nhưng dữ liệu bàn giao không đi đúng hợp đồng ở mục 8 của bản phân chia,
và giao diện màn 4 làm người dùng phải chọn lại thứ màn 3 đã chốt.

## 2. Chi tiết theo module

### Module 1 — Thiết kế kịch bản

Backend đạt:
- Dữ liệu ngoài giới hạn bị từ chối có lý do cụ thể: khoảng tham số, trần 300 biến thể, xe không tới được điểm băng ngang, luật riêng của CCRs/CCRm/CCRb (`FamilyService`).
- Mô tả mơ hồ hoặc loại kịch bản chưa hỗ trợ bị từ chối kèm giải thích (`DescribeService`).

Giao diện đạt (`/scenarios/new`, `FamilyForm`):
- Nhập mô tả tiếng Việt (tối đa 2000 ký tự), có câu ví dụ.
- Hiện Scenario IR thành từng tham số, gắn nhãn nguồn: "Có trong câu", "Suy luận", "Giả định", "Đã sửa". Sửa được từng trường, báo lỗi khi ngoài khoảng.
- Báo khi LLM không tự sửa hết lỗi, hoặc khi phải trích bằng luật dự phòng.
- Dựng lưới biến thể quanh IR, hiện số biến thể và chặn khi vượt 300.
- Sau khi tạo: nút "Tiếp tục: Chạy baseline" chuyển đúng họ sang `/scenarios?family=<id>` và tô sáng dòng đó.

Thiếu: không thấy.

### Module 2 — Chạy baseline

Backend đạt:
- Hủy chạy đã có đủ API: hủy từng run, hủy cả họ, hủy regression, hủy đợt tối ưu (TD-37).
- Module 4 và 5 gọi lại `RunService`, không có cơ chế chạy riêng.

Giao diện đạt (`/scenarios`, `CarlaRunnerPanel`):
- Nhận họ từ màn 1 và tô sáng.
- Hiện xe, phiên bản AEB cơ sở và bộ mô phỏng sẽ dùng trước khi chạy.
- Hiện số lượt đã xong, đang chạy, đang chờ, lỗi, đã hủy. Tự tải lại mỗi 3 giây khi có lượt đang chạy.
- Hủy cả họ hoặc hủy từng lượt.
- Tùy chọn chạy thêm lượt AEB tắt để đối chiếu.
- CARLA: kiểm tra kết nối, chạy `.xosc`, tải `.xosc` từng lượt hoặc cả họ, nộp `result.json` từ máy khác.

Lệch ở giao diện, **đã sửa 23/11** trong `frontend/src/app/scenarios/page.tsx`:
1. **Từ `/scenarios` không tới được lý do run lỗi.** Màn Phân tích (danh sách lượt chạy) đã hiện lý do lỗi, nhưng `/scenarios` chỉ hiện "N lỗi". Bản đầu của đánh giá này ghi nhầm là màn Phân tích không hiện lý do.
   Đã sửa: "N lỗi · xem lý do" là link sang `/analysis/failures?view=runs&scenario_id=<họ>&status=FAILED`.
   Lưu ý: số "N lỗi" đếm mọi mục đích (cơ sở, AEB tắt, regression, tối ưu), còn màn Phân tích chỉ có lượt cơ sở AEB bật. Lỗi của lượt AEB tắt, regression, tối ưu vẫn chưa có chỗ xem lý do trên web.
2. **Chữ trên nút không khớp.** Đã sửa: thông báo giờ bảo bấm "Phân tích" ở dòng được tô sáng, đúng tên nút.
3. **Số đang chờ và đang chạy gộp làm một.** Đã sửa: hiện riêng "X đang chạy" và "Y đang chờ", mỗi loại một dòng.

Lỗi phát hiện khi chạy thử trên app thật, **đã sửa 23/11** trong `RunService`:
4. **Bật app không có CARLA thì mọi lượt chạy đều lỗi.** `application.yml` mặc định `VEHICSIM_SIMULATOR=carla-xosc` với lệnh `python3 worker/run_xosc.py`.
   Trên Windows `python3` thường là file giả trong `WindowsApps`: có trên PATH nhưng thoát mã 9009. Chạy `dev-up.cmd` rồi bấm "Chạy cơ sở" thì
   lượt chạy vẫn được xếp hàng, rồi lượt nào cũng `FAILED` với lý do "bộ mô phỏng thoát mã 9009: Python was not found".
   Đã sửa: trước khi xếp run CARLA, backend chạy thử `<lệnh> --version` một lần (nhớ khi đạt). Lệnh không chạy được thì trả 400:
   "Không chạy được lệnh CARLA "python3" (VEHICSIM_CARLA_COMMAND). Bật CARLA bằng scripts/dev-carla.ps1 -RestartBackend, hoặc đặt VEHICSIM_SIMULATOR=kinematic trong .env để chạy bộ động học", và không tạo run nào.
   Kiểm: 3 test mới trong `CarlaWebTest`; trên app thật, "Chạy cơ sở" trả đúng câu trên và số run không đổi.
   Chưa đổi giá trị mặc định `carla-xosc` vì đó là quyết định có chủ đích (commit `bea9bd0`, D1).

Kiểm trên app thật ngày 23/11 (Playwright + Edge, tài khoản thử đã xóa): cột "Lượt chạy", link "xem lý do" sang màn Phân tích lọc `FAILED` (hiện đủ 6 run kèm lý do), bảng lượt đang chờ/đang chạy, không lỗi console.

Chưa kiểm: tiêu chí "chạy lỗi hoặc hủy không làm hàng đợi bị treo" chưa chạy thử.

### Module 3 — Phân tích lỗi

Backend đạt:
- Nguyên nhân được ghi tự động khi run kết thúc (bảng `failures`, `root_causes`).
- Thiếu dữ liệu hiển thị `INCOMPLETE` hoặc trống, không thay bằng 0.

Giao diện đạt (`/analysis/failures`, các component `analysis/*`):
- Ba chế độ xem: tổng quan baseline, danh sách lượt chạy, tập bàn giao.
- Lọc theo họ, biến thể, phiên bản AEB, xe, bộ mô phỏng, thời tiết, thời điểm, trạng thái, khâu lỗi.
- Chi tiết run có biểu đồ TTC, tốc độ, ngưỡng TTC, mốc phanh và va chạm. Có trang playback.
- Gán từng run vào tập "Tối ưu" hoặc "Xác minh". Chỉ run hoàn tất, có telemetry và kết quả hợp lệ mới gán được.
- Lưu snapshot, máy chủ kiểm lại rồi mới mở nút "Tiếp tục: Tối ưu AEB →".

Thiếu:
- Tiêu chí "chuyển sang màn tối ưu mà không phải nhập lại" mới đạt ở phía màn 3. Màn 4 không dùng tập này (xem module 4, mục 1 và 2).

### Module 4 — Tối ưu AEB

Backend đạt:
- Vòng MOBO tự chạy: đề xuất tham số → chạy mô phỏng → chấm điểm → cập nhật Pareto (`OptimizationService`, `core/mobo/MoboEngine`).
- Lưu lịch sử vào `optimization_runs`, `optimization_trials`.
- Ba mục tiêu tổng hợp đúng bảng ADR-040. Ràng buộc phanh oan dùng chung hằng 5 điểm % với regression (ADR-044).
- Pareto không tự thành baseline.
- Trial chấm bằng bộ mô phỏng của backend, kể cả CARLA (quyết định D1, PR #18).

Giao diện đạt (`/aeb`, tab "Tối ưu hoá tự động"):
- Form chọn họ, tên đợt, số trial tối đa (3–50), số điểm khởi tạo (2–15).
- Danh sách đợt, thanh tiến độ theo trial, tự tải lại mỗi 2,5 giây, nút hủy.
- Bảng mọi trial kèm cờ vi phạm ràng buộc và cờ Pareto. Bảng riêng cho tập Pareto.
- Nút "Chọn ứng viên" trên từng dòng Pareto.
- Hiện snapshot từ màn 3, và ghi rõ "MOBO hiện chạy trên toàn họ kịch bản".

Thiếu hoặc lệch:
1. **Backend không nhận tập từ module 3.** `POST /optimizations` chỉ nhận `scenario_id`, `base_aeb_version_id`, `name`, `max_trials`, `n_initial_points`. Đợt tối ưu luôn chạy **toàn bộ biến thể** của họ.
2. **Vào từ màn 3 thì chọn sai họ mặc định.** Màn 3 chuyển sang `/aeb?dataset_id=…`, không kèm `scenario_id`. Ô "Kịch bản kiểm thử" vì vậy mặc định là **họ đầu tiên trong danh sách**, không phải họ của tập đã chốt. Người dùng phải tự chọn lại, và dễ chạy nhầm họ. Luồng project cá nhân (`/projects/[id]/improve` → `/aeb?tab=mobo`) cũng không kèm họ.
3. **Không hiện số của baseline để so.** Màn tối ưu không hiện baseline (phiên bản, tham số, 3 chỉ số) cạnh Pareto. Người dùng không biết nghiệm Pareto có tốt hơn baseline không.
4. **Chưa có thông báo "không tìm được cải thiện".** Khi không có Pareto chỉ hiện "Chưa tìm thấy nghiệm Pareto hợp lệ hoặc đang trong giai đoạn khởi tạo ban đầu".
5. **Khoảng tìm kiếm viết cứng trên giao diện**, không đọc từ `search_space_json` của đợt. Chưa cấu hình được khoảng hay điều kiện dừng nào ngoài số trial. Backend nhận khoảng tùy chỉnh nhưng giao diện không gửi.
6. **Câu mô tả cứng "chạy trên bộ mô phỏng CARLA".** Câu này sai khi backend chạy bộ động học. Nên lấy từ bộ mô phỏng thật của đợt.
7. **Tiến độ chỉ tính theo trial.** Trên CARLA mỗi trial mất vài phút (khoảng 37 giây × số biến thể), thanh tiến độ đứng ở 0 % cho tới khi xong trial đầu.
8. **Bảng Pareto không có tỉ lệ va chạm và phanh oan**, hai số mà ràng buộc dùng để loại trial.
9. **Chưa đối chiếu với random search.** `RANDOM_SEARCH` chỉ có trong enum `OptimizationAlgorithm`.
10. **Trial không phanh lần nào được tính RMS jerk = 0 và quãng dừng = 0** (`evaluateCandidateRuns`). Đây là thay dữ liệu thiếu bằng 0. Với họ toàn ca an toàn, trial không phanh sẽ thắng hai mục tiêu.

### Module 5 — Regression và phê duyệt

Backend đạt (`ReviewDecisionService`, `RegressionController`):
- Chỉ REVIEWER được quyết định. Người tạo khuyến nghị không tự duyệt được.
- Phải nhập lý do và xác nhận. Lý do được lưu.
- Chỉ Accept khi verdict là `PASSED`. Baseline đã đổi thì không Accept bằng kết quả test cũ.
- Accept thì lưu trữ baseline cũ và nâng candidate thành baseline mới. Reject thì đánh dấu candidate bị từ chối.

Giao diện đạt (`/validation/**`):
- Màn tạo (`/validation/regression/new`) xem trước baseline, candidate, bộ mô phỏng, số ca lỗi cũ, số lượt baseline dùng lại. Chọn được ca lỗi cũ, toàn bộ biến thể, hoặc tự chọn từng biến thể. Cảnh báo khi tập không có ca an toàn. Chỉnh được tiêu chí.
- Màn kết quả có thanh tiến độ, nút hủy, số ca được sửa và xấu đi, va chạm mới, thay đổi tỉ lệ phanh oan, bảng chuyển trạng thái từng cặp.
- Màn duyệt có danh sách kiểm, ô lý do, công tắc xác nhận. Khóa khi test không đạt hoặc còn đang chạy.
- Màn lịch sử quyết định có tìm theo mã, phiên bản, người duyệt, lý do.

Lệch ở điểm nhận từ module 4 (`OptimizationService.selectCandidateForVerification`, nút "Chọn ứng viên"):
11. **Bỏ qua màn xem trước.** Bấm "Chọn ứng viên" là tạo regression và **chạy ngay** với tiêu chí mặc định. Người dùng không qua màn `/validation/regression/new` như khi tạo candidate thủ công, nên không xem trước, không chọn tập, không chỉnh tiêu chí.
12. **Chạy toàn họ**, không dùng tập xác minh đã chốt ở module 3. Màn tạo regression đã nhận được danh sách biến thể qua `?variants=`, nhưng màn 3 và 4 không truyền sang.
13. **So với baseline hiện hành của project**, không phải `base_aeb_version_id` mà đợt tối ưu đã dùng. Nếu baseline đổi giữa hai bước, candidate bị so với baseline khác.
14. **Chọn được ứng viên khi đợt tối ưu còn đang chạy.** Regression khi đó xếp hàng chung với các run tối ưu trên cùng server CARLA.

## 3. Tài liệu và câu chữ đã cũ so với code

| Chỗ | Đang ghi | Thực tế |
|---|---|---|
| `AGENTS.md` (mục "Dự án và trạng thái hiện tại") | MOBO/Pareto chưa triển khai; chưa có API/nút hủy (TD-37) | Đã có vòng MOBO + Pareto; đã có API và nút hủy |
| `CLAUDE.md` mục 1 và mục 7.7 | Vòng MOBO và Pareto chưa triển khai; chưa có API/nút hủy | Như trên |
| [Phân chia 5 thành viên](phan-chia-cong-viec-5-thanh-vien.md) mục 1, 4 | Hủy chạy "cần hoàn thiện"; MOBO "cần triển khai mới" | Đã có cả hai |
| Màn `/aeb` | Mỗi trial chạy trên CARLA | Chạy trên bộ mô phỏng của backend |

**Cần nhóm chốt: số CARLA có được dùng làm bằng chứng không.** Hiện có hai hướng ngược nhau:
- Quyết định D1 ([kế hoạch 20/10](ke-hoach-sua-theo-pdf-va-quyet-dinh-2026-10-20.md)): trial MOBO chấm bằng CARLA. Code tối ưu và regression đã chạy trên CARLA khi backend cấu hình CARLA.
- Màn Phân tích gắn cờ `carla_observational_only` cho mọi run CARLA (`AnalysisService`). Màn `/analysis/carla` ghi số CARLA "không dùng làm bằng chứng regression". Danh sách kiểm của Reviewer bắt xác nhận số CARLA "chỉ để quan sát và đối chiếu". `CLAUDE.md` mục 7.4 ghi giống vậy.

Đây không phải lỗi câu chữ của một màn mà là chính sách chung, nên chưa sửa. Sau khi nhóm chốt, sửa đồng bộ cả cờ, câu chữ các màn và tài liệu (cần ADR nếu đổi quyết định đã Accepted).

## 4. Việc đề xuất, theo thứ tự ưu tiên

| # | Việc | Module | Mục liên quan |
|---|---|---|---|
| 1 | Đợt tối ưu nhận `dataset_id`; `/aeb` tự chọn đúng họ của tập, chỉ chạy tập tối ưu | 3 → 4 | 4.1, 4.2 |
| 2 | "Chọn ứng viên" mở màn tạo regression với tập xác minh và baseline của đợt, thay vì chạy ngay | 4 → 5 | 5.11, 5.12, 5.13 |
| 3 | Trial không phanh: để mục tiêu trống hoặc loại khỏi Pareto, không tính 0 | 4 | 4.10 |
| 4 | Hiện số baseline cạnh Pareto; thông báo "không cải thiện" | 4 | 4.3, 4.4 |
| 5 | Thêm random search cùng ngân sách để đối chiếu với MOBO | 4 | 4.9 |
| 6 | Giao diện đọc khoảng tìm kiếm và bộ mô phỏng thật; tiến độ theo run; thêm cột va chạm/phanh oan vào bảng Pareto | 4 | 4.5–4.8 |
| 7 | Nhóm chốt chính sách số CARLA (D1 so với cờ "chỉ quan sát"), rồi sửa đồng bộ | Chung | Mục 3 |
| 8 | Cập nhật `AGENTS.md`, `CLAUDE.md`, bản phân chia và câu chữ trên `/aeb` | Chung | Mục 3 |
| 9 | Chạy thử lỗi/hủy giữa batch, ghi bằng chứng | 2 | Chưa kiểm |
| — | ~~Link lý do lỗi từ `/scenarios`; tách số chờ/chạy; sửa chữ nút; chặn run CARLA khi lệnh runner không chạy được~~ (đã sửa 23/11) | 2 | 2.1–2.4 |

## 5. Giới hạn của đánh giá

- Đọc code backend và giao diện. Chỉ module 2 đã bấm thử trên trình duyệt (23/11). Riêng vòng tối ưu đã chạy thật một đợt 3 trial trên CARLA (22/11) và hoàn tất.
- Không đối chiếu với thiết kế Figma.
- Đánh giá theo module, không theo người: bản phân chia chỉ ghi "Người 1–5", phân công thật nằm trên GitHub Issues.

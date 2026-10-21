# Kế hoạch bàn giao sửa VehicSim theo PDF và quyết định ngày 20/10/2026

**Trạng thái:** kế hoạch cần triển khai; chưa phải báo cáo tính năng đã hoàn thành.
**Mốc đối chiếu code:** commit `ef90e44ea74fde5f61feaaa5d176fcbb396380e1`.
**Phạm vi của lần bàn giao này:** chỉ viết tài liệu; không sửa chức năng, database hoặc chạy tối ưu.
**Người sử dụng chính:** kỹ sư kiểm thử/hiệu chỉnh AEB. Hệ thống giúp sàng lọc cấu hình bằng mô phỏng,
giảm số thử nghiệm cần đưa sang phòng lab; mức tiết kiệm phải được đo, không tự khẳng định một tỷ lệ.

## 1. Nguồn và cách sử dụng tài liệu

- PDF người dùng cung cấp: **VehicSim - Phương pháp kỹ thuật và tối ưu tham số.pdf**, 19 trang.
  Trang 8: cảm biến và ground truth; trang 11–13: MOBO, phép đo và đầu ra; trang 14–17: kiểm chứng xe/mô phỏng.
  PDF hiện là tài liệu ngoài repo; khi bàn giao nhóm cần đính kèm đúng bản này.
- Google Docs: [Tổng quan](https://docs.google.com/document/d/1I0pizGPFGkZV-IjLugH2NLQvP0PNxJPN0N2Z2C37peU/edit).
- Năm quyết định của người dùng ngày 20/10/2026, được diễn giải thành yêu cầu ở mục 2.
- Code hiện tại và [bản phân chia 5 thành viên](phan-chia-cong-viec-5-thanh-vien.md).
- Quy tắc kỹ thuật: [AGENTS.md](../../AGENTS.md), [CLAUDE.md](../../CLAUDE.md),
  [ADR-040](../adr/ADR-040-rut-scope-4-tham-so-aeb-7-category.md),
  [ADR-041](../adr/ADR-041-xosc-va-scenariorunner-tu-web.md).

Đây là kế hoạch mục tiêu mới. Mô tả “cần làm” không có nghĩa code đã hỗ trợ.
Các con số 100 Hz/10 Hz dưới đây là yêu cầu chọn theo PDF, không phải tuyên bố đã đáp ứng hoặc
đã kiểm chứng đầy đủ tiêu chuẩn Euro NCAP. Tài liệu này không thay thế quy trình ADR của repo.
Tên người, deadline và tiến độ thực tế theo GitHub Issues/Project; “thành viên 1–5” là vai trò bàn giao.

## 2. Năm quyết định đã chốt

| Mã | Quyết định | Hệ quả cần triển khai |
|---|---|---|
| D1 | CARLA cung cấp ground truth để so sánh AEB trước/sau tối ưu trên cùng kịch bản | Baseline và candidate chạy với cùng điều kiện đầu vào; từng run thu ground truth riêng. Theo PDF, các trial MOBO được đánh giá bằng chạy CARLA. |
| D2 | Dùng gia tốc để nhận biết nhanh dần, chậm dần, tốc độ đều và hỗ trợ tính nguy cơ va chạm | Thu vị trí, vận tốc, gia tốc của ego và target; dự đoán có xét hướng và gia tốc. Gia tốc không thay thế chỉ số vận tốc tại va chạm. |
| D3 | Phép đo đi theo PDF | Mục tiêu 100 Hz, bước thời gian 0,01 s; lọc gia tốc Butterworth 10 Hz trước khi tính jerk; chuẩn hóa pha phanh và ba objective. |
| D4 | Engineer chọn ứng viên; Reviewer phê duyệt thành baseline | MOBO chỉ đề xuất; candidate phải qua regression và quyết định hợp lệ. Không tự Accept. |
| D5 | Giữ các ca an toàn/không va chạm khi tắt AEB | Dùng để phát hiện phanh oan và đánh giá ảnh hưởng xấu; không loại bỏ chỉ vì không có va chạm. |

**Thay đổi so với tài liệu cũ:** mục 9, quy tắc 7 của bản phân chia 5 thành viên hiện ghi tối ưu hàng loạt
bằng bộ động học, CARLA kiểm tra bổ sung. Đối với kế hoạch mới, dùng vòng đánh giá CARLA theo PDF;
bộ động học có thể tiếp tục phục vụ kiểm tra phát triển riêng, không thay thế kết quả CARLA trong campaign này.
Khi triển khai phải cập nhật tài liệu cũ và ADR liên quan để không tồn tại hai chỉ dẫn trái nhau.
ADR-040/041 hiện có trạng thái Proposed; không tự ghi thành Accepted hoặc sửa lịch sử bằng chứng cũ.

## 3. Luồng mục tiêu và ranh giới dữ liệu

```text
Thiết kế kịch bản, xe và điều kiện môi trường
  → Chốt phiên bản kịch bản, seed và baseline AEB
  → Chạy baseline trên CARLA, thu cảm biến + ground truth
  → Phân tích kết quả bằng bộ chỉ số chung
  → MOBO/qEHVI đề xuất bộ 4 tham số AEB
  → Chạy candidate trên CARLA với cùng điều kiện đầu vào
  → Chấm điểm, kiểm ràng buộc, cập nhật mô hình và Pareto; lặp theo ngân sách
  → Engineer chọn candidate
  → Regression trên tập đã chốt, bao gồm các ca an toàn
  → Reviewer Accept/Reject
  → Baseline mới nếu Accept; xuất gói kết quả và phạm vi áp dụng
```

Một run CARLA có hai đường dữ liệu:

```text
Cảm biến → theo dõi/ước lượng chuyển động → lõi AEB chung → lệnh điều khiển xe
Ground truth + sự kiện va chạm → bộ đánh giá → objective và bằng chứng đối chiếu
```

Ground truth là trạng thái thật **trong mô phỏng**, không phải dữ liệu thử nghiệm ngoài đời.
Cùng kịch bản nghĩa là cùng đầu vào, không phải buộc hai lần chạy dùng chung một trace ground truth.
Candidate phanh khác baseline thì quỹ đạo và ground truth tương ứng có thể khác.
So sánh sai số perception phải ghép cảm biến và ground truth cùng run, cùng thời điểm, cùng đối tượng.
So sánh hiệu quả AEB phải ghép hai run baseline/candidate có cùng điều kiện đầu vào.

## 4. Đối chiếu hiện trạng và phần cần sửa

| Hạng mục | Hiện trạng tại mốc code | Việc cần làm |
|---|---|---|
| Kịch bản | Schema có 7 category; mô phỏng/xuất XOSC mới hỗ trợ CP_CROSSING | Hoàn thiện phạm vi đã chạy được; chọn rõ thứ tự mở rộng category, map và target, không coi schema là tính năng hoàn chỉnh. |
| XOSC | Có xuất và chạy file theo hợp đồng riêng; chưa có nhập XOSC tổng quát | Giữ xuất/tái chạy; nếu làm import theo tài liệu tổng quan, chỉ nhận tập con được công bố và báo rõ phần không hỗ trợ. |
| AEB và cảm biến | Controller đọc vị trí/vận tốc ground truth đưa vào AEB; radar/IMU chủ yếu ghi dữ liệu | Tạo đường perception từ cảm biến; ground truth phục vụ đánh giá. Không tạo một lõi quyết định AEB thứ hai. |
| Chuyển động target | CP_CROSSING chưa có hợp đồng gia tốc tổng quát của target | Thêm biểu diễn/ước lượng gia tốc có hướng, phân loại chuyển động và dự đoán giao cắt. |
| Thời gian/lọc | Đường chạy hiện gắn với 0,05 s; recorder dùng trung bình trượt rồi đạo hàm | Đồng bộ runner, điều khiển, recorder và đánh giá về cấu hình 0,01 s; thực hiện bộ lọc đã đặc tả. |
| Chỉ số | Có ba chỉ số nhưng impact chủ yếu là tốc độ ego; quãng dừng có ngoại suy | Chuẩn hóa vận tốc va chạm tương đối, pha phanh, dữ liệu đo/ước lượng và trường hợp thiếu số đo. |
| Tối ưu | Candidate thủ công; có bảng campaign/trial nhưng chưa có MOBO/Pareto thật | Xây vòng đề xuất → chạy → đánh giá → cập nhật; mọi điểm trên Pareto phải truy được run. |
| Regression | Có kiểm thử và Reviewer quyết định; phạm vi hiện một họ kịch bản | Chốt tập xác minh độc lập với tập tìm tham số, hỗ trợ phạm vi đã chọn và so sánh đủ ba objective. |
| Runtime CARLA | Có chạy web; chưa có API/nút hủy; tính tái lập CARLA chưa có đủ bằng chứng | Bổ sung vòng đời job, hủy/timeout/cleanup, reset world và kiểm tra chạy lặp. |
| Vật lý xe | Chưa hiệu chuẩn phanh; đường XOSC chưa mang đầy đủ cấu hình bánh/phanh | Đo, đọc lại cấu hình thực tế và ghi giới hạn trước khi dùng làm căn cứ phê duyệt định lượng. |
| Gói bàn giao | Có XOSC, bundle và artifact từng run | Gom tham số, so sánh trước/sau, regression, quyết định và manifest tái lập. |

Các nợ liên quan đã có trong [tech-debt tracker](../exec-plans/tech-debt-tracker.md):
TD-01, TD-06, TD-17, TD-30, TD-37, TD-39, TD-40, TD-42, TD-47, TD-48.
Đặc biệt TD-47: người đi bộ “dừng ở lề” chưa có hành vi dừng hoàn chỉnh; phải sửa trước khi dùng
loại ca này làm bằng chứng đo phanh oan.

## 5. Hợp đồng kỹ thuật phải thống nhất trước khi triển khai thuật toán

### 5.1. Đầu vào và khả năng tái lập

Mỗi campaign chốt snapshot: kịch bản/biến thể, xe và physics, map, thời tiết, trạng thái đầu,
seed, baseline AEB, CARLA/ScenarioRunner, bước thời gian, cấu hình cảm biến và phiên bản đánh giá.
Chỉ 4 tham số AEB thay đổi trong quá trình tìm kiếm:

| Tham số | Đơn vị | Biên hiện có để đối chiếu |
|---|---|---|
| `TTC_THRESHOLD` | s | 0,5–4 |
| `BRAKE_ACTIVATION_DELAY` | s | 0–0,5 |
| `MAX_DECELERATION` | m/s² | 3–10 |
| `BRAKE_BUILDUP_RATE` | m/s³ | 5–20 |

Không thêm gia tốc target vào vector tối ưu AEB. Nếu thay gia tốc target, đó là thay kịch bản;
phải chạy lại baseline tương ứng. Không gộp kết quả CARLA và động học thành một phép so sánh.
Lưu giới hạn tìm kiếm thực tế trong campaign, không chỉ dựa vào giá trị mặc định của phiên bản code mới nhất.

### 5.2. Gia tốc, hướng chuyển động và va chạm

- Ghi vector vị trí, vận tốc, gia tốc, hệ tọa độ, đơn vị, timestamp/frame và chất lượng dữ liệu.
- Ground truth lấy từ mô phỏng để chấm; đầu vào AEB phải là giá trị cảm biến/ước lượng tương ứng.
  IMU trên ego không tự cung cấp gia tốc target; target cần theo dõi qua các lần đo và xử lý nhiễu.
- Khi vật thể đang chuyển động, gia tốc theo hướng vận tốc là `a_t = dot(a, v) / norm(v)`.
  Dương: nhanh dần; âm: chậm dần; gần 0: tốc độ gần đều. Cần ngưỡng và khoảng thời gian xác nhận.
- Khi tốc độ gần 0, có trạng thái đứng yên/khởi hành riêng; không chia cho 0.
  Gia tốc vuông góc vận tốc có thể đổi hướng mà không làm tăng tốc độ.
- Dự đoán ngắn hạn có thể dùng `p(t+dt) = p(t) + v(t)*dt + 0.5*a(t)*dt²` dưới giả định
  gia tốc gần hằng. Đây là mô hình dự đoán, không phải bảo đảm target sẽ giữ nguyên gia tốc.
- Với người đi bộ băng ngang, xét quỹ đạo và hình học chiếm chỗ của cả hai đối tượng.
  Không dùng riêng `khoảng cách / tốc độ ego` cho mọi trường hợp.
- Sự kiện collision xác định va chạm thực tế. Chốt cách lấy mẫu ngay trước/thời điểm tiếp xúc,
  tránh dùng vận tốc sau xung lực va chạm để đánh giá độ nặng.

### 5.3. Ba objective và dữ liệu không đầy đủ

| Objective | Yêu cầu mục tiêu | Chi tiết còn phải đặc tả |
|---|---|---|
| RMS jerk | Lọc gia tốc Butterworth 10 Hz; tính jerk và RMS trong pha phanh; đơn vị m/s³ | Bậc lọc, khởi tạo/biên, causal hay offline, trục gia tốc, cửa sổ pha phanh, run không phanh. |
| Vận tốc va chạm tương đối | Dùng vận tốc của ego và đối tượng liên quan tại tiếp xúc; đơn vị m/s. Run hợp lệ không va chạm đóng góp 0 cho objective này | Chọn độ lớn vector tương đối hay thành phần theo hướng va chạm; không dùng chênh lệch hai tốc độ vô hướng cho băng ngang. |
| Quãng đường phanh đến dừng | Đo từ mốc phanh đến lúc xe dừng; đơn vị m | Ngưỡng tốc độ/thời gian xác nhận dừng; va chạm trước khi dừng; timeout; cách đưa run chưa dừng vào tối ưu. |

Theo PDF, đặc tả mốc phanh dựa vào gia tốc đã lọc và các ngưỡng −0,3/−1 m/s².
Nhóm phải làm rõ chiều vượt ngưỡng, đoạn phanh được chọn và xử lý nhiều lần phanh bằng ví dụ tín hiệu;
không chỉ sao chép câu mô tả thành điều kiện rời rạc.
Chốt nguồn gia tốc dùng để chấm objective và cách đối chiếu IMU–ground truth; không để worker và Java
ngầm dùng hai nguồn khác nhau cho cùng một tên chỉ số.

Quãng đường ngoại suy phải có nhãn ước lượng riêng, không ghi đè quãng đường dừng đã đo.
Run lỗi/hủy/thiếu sensor không được biến thành “0 va chạm, 0 jerk, 0 quãng dừng”.
Phải có chính sách loại trial không hợp lệ hoặc đánh dấu không khả thi trước khi fit mô hình.
Run an toàn không phanh vẫn là bằng chứng hữu ích; cách biểu diễn objective không áp dụng phải được
thống nhất, tránh làm mất các ca này chỉ vì RMS jerk hoặc quãng phanh không có giá trị đo.

### 5.4. Ràng buộc và các điểm chưa được người dùng chốt

Những việc dưới đây là chi tiết thiết kế còn mở, không được trình bày là quyết định đã phê duyệt:

| Điểm cần chốt | Người phối hợp | Sản phẩm cần có trước khi code phụ thuộc |
|---|---|---|
| Một trial tối ưu một scenario hay tổng hợp nhiều biến thể/seed | Thành viên 1, 3, 4, 5 | Snapshot đầu vào và quy tắc tổng hợp; PDF hướng một kịch bản, schema hiện có objective trung bình theo họ. |
| Baseline đo gồm AEB hiện tại, AEB OFF hay cả hai | Thành viên 2, 3, 5 | Mốc trước/sau bắt buộc là baseline AEB hiện tại; OFF là chế độ bổ sung cần định nghĩa, không phải lệnh xóa AEB baseline. |
| Định nghĩa impact, pha phanh, lọc và run chưa dừng | Thành viên 2, 3 | Hợp đồng đánh giá có ví dụ và kết quả kỳ vọng. |
| Ngưỡng phanh oan và quy tắc va chạm mới | Thành viên 3, 4, 5 | Một cấu hình dùng chung; xử lý TD-48: ADR-040 ghi 5 điểm %, regression hiện 0,5 điểm % và cấm va chạm mới. |
| Chuẩn hóa objective, reference point hypervolume, số điểm đầu, ngân sách và q | Thành viên 3, 4 | Cấu hình campaign có phiên bản; đề xuất q=1 cho một CARLA server, chưa tự coi là quyết định người dùng. |
| Sai số chạy lặp và điều kiện đủ bằng chứng vật lý | Thành viên 2, 3, 5 | Protocol đo, dung sai và điều kiện cho phép dùng kết quả để phê duyệt định lượng. |
| Phạm vi category/map/xe và nhập XOSC | Thành viên 1, 2 | Danh sách hỗ trợ thật và thứ tự mở rộng. |

## 6. Phân công chi tiết cho 5 thành viên

### Thành viên 1 — Thiết kế kịch bản

**Màn chính:** `/scenarios/new` và bước chốt kịch bản trước chạy.

- Chuẩn hóa đầu vào target: vị trí, hướng, vận tốc, gia tốc/hành vi theo thời gian và điều kiện kích hoạt.
- Kiểm tra quy tắc theo category; hiển thị rõ category chưa chạy được. Ưu tiên hoàn thiện CP_CROSSING
  để nghiệm thu luồng xuyên suốt, sau đó mở rộng theo danh sách được chốt.
- Lưu phiên bản bất biến cho tập thử; đánh dấu ca có nguy cơ và ca an toàn, giữ cả hai trong bàn giao.
- Phối hợp thành viên 2 ánh xạ đúng đơn vị/hướng sang XOSC; xử lý hành vi dừng ở lề trước khi dùng để chấm.
- Nếu mở rộng chọn map/ego/target hoặc nhập XOSC, phải kiểm khả năng chạy thực tế và báo lỗi đầu vào rõ ràng.

**Điểm vào code:** [FamilyService](../../src/main/java/com/vehicsim/vehicsim/FamilyService.java),
[ScenarioRules](../../src/main/java/com/vehicsim/vehicsim/ScenarioRules.java),
[controller](../../src/main/java/com/vehicsim/vehicsim/VehicSimController.java),
[exporter](../../worker/openscenario_export.py).

**Bàn giao:** snapshot kịch bản/biến thể, seed, xe và môi trường cho thành viên 2/3.
**Nghiệm thu:** target đi đúng hướng và hành vi; đầu vào không hỗ trợ bị từ chối rõ;
thay kịch bản tạo phiên bản mới; tập đã chốt vẫn giữ ca an toàn.

### Thành viên 2 — Chạy baseline và thu dữ liệu CARLA

**Màn chính:** `/scenarios`, `/analysis/carla`.

- Xây cơ chế chạy chung để baseline, trial tối ưu và regression gọi lại; một server chạy tuần tự.
- Đồng bộ timestep 0,01 s trên runner, controller, recorder và các phép tích phân/đạo hàm.
  Kiểm tra frame/timestamp thực tế, không coi đổi cấu hình là đã đạt 100 Hz.
- Thu cảm biến và ground truth riêng; triển khai target tracking/ước lượng vận tốc, gia tốc, độ tin cậy
  để cấp cho lõi AEB. Quy định xử lý mất mục tiêu và dữ liệu trễ.
- Reset world/trạng thái trước run, ghi seed/cấu hình; thực hiện thử lặp cùng đầu vào.
- Bổ sung hủy, timeout, giải phóng actor/sensor và trạng thái job nhất quán; không để run hủy có điểm hợp lệ.
- Đọc lại physics đã áp dụng, đo khả năng phanh và ghi phạm vi xe được kiểm chứng.

**Điểm vào code:** [RunService](../../src/main/java/com/vehicsim/vehicsim/RunService.java),
[run_xosc](../../worker/run_xosc.py), [controller CARLA](../../worker/vehicsim_aeb_control.py),
[sensor recorder](../../worker/sensor_recorder.py), [lõi AEB](../../worker/vehicsim_core/aeb_stack.py).

**Bàn giao:** run/artifact với sensor, ground truth, frame/timestamp, physics thực tế và metadata đầy đủ.
**Nghiệm thu:** chứng minh AEB dùng perception từ sensor; dữ liệu chấm truy được về ground truth;
chạy lặp nằm trong dung sai đã chốt; hủy/timeout không làm bẩn lần chạy tiếp theo.

### Thành viên 3 — Phân tích lỗi và bộ chỉ số chung

**Màn chính:** `/analysis/failures/**`.

- Chủ trì hợp đồng gia tốc và ba objective ở mục 5; viết các ví dụ có kết quả kỳ vọng trước khi tích hợp.
- Hiển thị đồ thị vị trí/vận tốc/gia tốc theo thời gian, trạng thái nhanh/chậm/đều và sự kiện phanh/va chạm.
- Phân biệt sensor/ước lượng/ground truth, giá trị đo/ngoại suy và dữ liệu không hợp lệ.
- Thống nhất cách chấm giữa worker, API, UI, tối ưu và regression; tránh hai công thức cùng tên.
- Phân tích sai số perception tách khỏi đánh giá hiệu quả phanh; chuẩn bị tập tối ưu và tập xác minh
  có ca an toàn, có phiên bản và không âm thầm đổi trong chiến dịch.

**Điểm vào code:** [TelemetryMetricsService](../../src/main/java/com/vehicsim/vehicsim/TelemetryMetricsService.java),
[ViewsService](../../src/main/java/com/vehicsim/vehicsim/ViewsService.java),
[evaluation](../../worker/vehicsim_core/evaluation.py), [simulator](../../worker/vehicsim_core/simulator.py).

**Bàn giao:** hợp đồng chỉ số có phiên bản, kết quả phân tích và snapshot tập thử cho thành viên 4/5.
**Nghiệm thu:** đúng trên tín hiệu mẫu; xử lý được đứng yên, băng ngang, giảm tốc, không phanh,
va chạm và timeout; cùng artifact/cấu hình cho cùng kết quả ở các nơi sử dụng.

### Thành viên 4 — Tối ưu AEB bằng MOBO/qEHVI

**Màn chính:** `/aeb`, bổ sung luồng campaign, trial và Pareto.

- Nhận snapshot đầu vào, baseline, phạm vi 4 tham số, objective/ràng buộc và ngân sách đã chốt.
- Triển khai lấy mẫu ban đầu, mô hình surrogate, qEHVI, vòng đề xuất–chạy–chấm–cập nhật.
  Ghi seed thuật toán, phiên bản thư viện và cấu hình chuẩn hóa/reference point.
- Gọi cơ chế chạy của thành viên 2 và bộ chỉ số của thành viên 3; không viết runner/chấm riêng.
- Lưu trạng thái campaign/trial, lỗi, điểm objective, vi phạm ràng buộc và nguồn candidate.
- Hiển thị Pareto từ trial đã chạy hợp lệ; cho Engineer so sánh và chọn.
  Có thể trình bày lựa chọn ưu tiên va chạm thấp, độ êm hoặc cân bằng theo quy tắc công khai.
- Không hứa luôn cải thiện. Nếu không có candidate khả thi, báo đúng và giữ baseline.

**Điểm vào code:** [AebService](../../src/main/java/com/vehicsim/vehicsim/AebService.java),
[schema campaign/trial](../../database/mysql/01_schema.sql), [worker](../../worker/).
Service/worker tối ưu còn phải bổ sung; tên module mới chưa được quyết định trong tài liệu này.

**Bàn giao:** candidate được Engineer chọn, campaign/trial/run nguồn, tham số, objective và cấu hình đánh giá.
**Nghiệm thu:** mỗi điểm Pareto truy được run; tham số đúng biên; trial lỗi không thành điểm tốt;
ngân sách/hủy được tôn trọng; không tự ghi đè baseline hoặc tự phê duyệt.

### Thành viên 5 — Regression, Reviewer và gói kết quả

**Màn chính:** `/validation/**`.

- Nhận candidate và chạy xác minh trên tập đã chốt; phân biệt tập tìm tham số với tập xác minh.
- Ghép baseline/candidate đúng scenario, seed, xe, simulator và phiên bản đánh giá.
  Chạy lại baseline nếu không có cặp tương thích; không ghép số cũ khác phép đo.
- So sánh đủ ba objective, va chạm mới, phanh oan, ca cải thiện và ca xấu đi; dùng cùng ràng buộc với tối ưu.
- Giữ Engineer chọn và Reviewer quyết định; kiểm quyền ở API, lý do/xác nhận, trạng thái PASSED,
  baseline còn hiệu lực và các điều kiện đủ bằng chứng đã chốt.
- Xuất gói tham số JSON/CSV có đơn vị, bảng trước/sau, regression, XOSC, quyết định và manifest.
  JSON cho tham số/kết quả vẫn cần; XOSC dùng mô tả kịch bản chạy CARLA.

**Điểm vào code:** [RegressionService](../../src/main/java/com/vehicsim/service/RegressionService.java),
[ViewsService](../../src/main/java/com/vehicsim/vehicsim/ViewsService.java),
[controller](../../src/main/java/com/vehicsim/vehicsim/VehicSimController.java).

**Bàn giao:** báo cáo xác minh, quyết định có thể truy vết và baseline mới khi được Accept hợp lệ.
**Nghiệm thu:** Engineer không gọi API Accept được; FAILED hoặc baseline đã đổi bị chặn;
Reviewer có lý do/xác nhận; giữ lịch sử và tái dựng được điều kiện chạy từ gói xuất.

## 7. Các điểm nối bắt buộc

| Bàn giao | Nội dung tối thiểu |
|---|---|
| Thiết kế → chạy | ID/phiên bản scenario, biến thể, xe/physics, môi trường, seed, XOSC tương ứng |
| Chạy → phân tích | Run ID, baseline/candidate ID, sensor và GT artifact, timestamp/frame, trạng thái hợp lệ, simulator identity |
| Phân tích → tối ưu | Snapshot tập tìm tham số, baseline, hợp đồng chỉ số, ràng buộc, phạm vi 4 tham số |
| Tối ưu → regression | Candidate và campaign/trial/run nguồn, cấu hình đánh giá, snapshot tập xác minh |
| Regression → baseline | Kết quả, Reviewer, lý do/xác nhận, baseline cũ/mới, thời điểm quyết định |

Màn sau nhận ID và tự tải dữ liệu; không yêu cầu người dùng chép tham số giữa màn.
Manifest gói xuất cần ghi phiên bản code, CARLA/ScenarioRunner, simulator/evaluation, dt,
sensor/filter, seed, physics, kịch bản, môi trường, baseline/candidate và cấu hình optimizer.
Đây là nội dung hợp đồng cần thiết kế, không khẳng định các cột/API này đã tồn tại.

## 8. Thứ tự triển khai và điều kiện chuyển bước

| Giai đoạn | Công việc | Điều kiện hoàn thành |
|---|---|---|
| G0 — Đặc tả chung | Nhóm chốt mục 5, snapshot, phạm vi xe/category; cập nhật ADR và tài liệu mâu thuẫn | Có hợp đồng và ví dụ tính toán; phân biệt quyết định đã chốt với đề xuất; không còn hai ngưỡng mặc định ngầm khác nhau. |
| G1 — Một kịch bản chạy đúng | Thành viên 1/2 hoàn thiện CP_CROSSING, cảm biến/GT, gia tốc, 100 Hz và vòng đời run | Có artifact CARLA thật, target đúng hành vi, thử lặp và hủy/timeout đạt; ghi rõ giới hạn physics. |
| G2 — Chấm và so sánh đúng | Thành viên 3 hoàn thiện bộ chỉ số; thành viên 5 nối so sánh baseline/candidate chỉnh tay | Cặp chạy cùng điều kiện, đủ ba objective và ca an toàn; không dùng số giả hoặc số khác phiên bản. |
| G3 — Tối ưu thật | Thành viên 4 nối MOBO với runner và evaluator đã kiểm chứng | Có campaign CARLA thật và Pareto truy vết được; xử lý được không cải thiện, lỗi và hết ngân sách. |
| G4 — Bàn giao toàn luồng | Thành viên 5 nối chọn, regression, Reviewer và xuất gói | Đạt điều kiện bằng chứng đã chốt, phê duyệt đúng quyền và tái chạy được gói xuất; UI có dữ liệu thật. |

Các thành viên có thể làm UI/hợp đồng song song sau G0, nhưng không nghiệm thu MOBO trên số đo chưa thống nhất.
Chưa hiệu chuẩn phanh thì kết quả CARLA vẫn phải ghi phạm vi quan sát/đối chiếu theo quy tắc repo;
không gắn nhãn chứng nhận an toàn hoặc coi mô phỏng thay thế thử nghiệm thực tế.

## 9. Kiểm chứng và bảo toàn dữ liệu khi sửa

- Đổi hành vi/chấm điểm phải tách simulator/evaluation identity, giữ bằng chứng run cũ.
  Nếu đổi kết quả lõi động học, đồng bộ `KINEMATIC_SIMULATOR` ở Python bundle và Java RunService.
- Nếu đổi schema, sửa schema gốc, SQL/service, tài liệu DB và migration đánh số trong cùng thay đổi.
  Không ghi đè dữ liệu cũ hoặc xóa volume để nâng schema.
- Bổ sung kiểm thử có ý nghĩa: chuyển động tăng/giảm/đều/đứng yên/băng ngang; chỉ số trên tín hiệu biết trước;
  trial lỗi; ghép cặp sai phiên bản; hủy; quyền phê duyệt và baseline cũ.
- Test tự động không gọi CARLA/provider thật; bằng chứng tích hợp CARLA thật ghi riêng, có cấu hình/run ID.
- Khi sửa UI: chạy app, đăng nhập, kiểm tra xuyên màn, lưu ảnh và đối chiếu thiết kế nếu truy cập được.
- Giữ quota, quyền và lõi AEB chung; không phục hồi FastAPI/Celery cũ.

Các lệnh kiểm chứng khi triển khai, chọn theo phần bị ảnh hưởng:

```powershell
# Từ gốc repo
.\mvnw.cmd -B clean test
python -m ruff check worker
python -m pytest worker/tests -q

# Trong frontend
npm run lint
npx tsc --noEmit
npx next build

# Thay đổi chỉ tài liệu
.\mvnw.cmd -B -Dtest=RepoDocsTest test
```

## 10. Kịch bản nghiệm thu cuối cùng

1. Engineer tạo CP_CROSSING có ca nguy hiểm và ca an toàn; target băng ngang đúng hướng/hành vi.
2. Chốt xe, kịch bản, seed, baseline và cấu hình đánh giá; chạy CARLA và lưu sensor/GT.
3. Trang phân tích hiển thị vận tốc/gia tốc, sự kiện phanh/va chạm và ba objective đúng hợp đồng.
4. Chạy MOBO với ngân sách đã chọn; mỗi trial có kết quả CARLA và nguồn dữ liệu chấm rõ ràng.
5. Engineer chọn candidate từ các trial hợp lệ; không tự biến thành baseline.
6. Regression kiểm tra trên tập xác minh, bao gồm ca an toàn, và chỉ ra cả cải thiện lẫn xấu đi.
7. Thử nhánh lỗi: hủy run, mất sensor, candidate không khả thi, test FAILED và baseline đã đổi.
8. Reviewer xem bằng chứng, nhập lý do/xác nhận và Accept/Reject đúng điều kiện.
9. Nếu Accept, lần chạy tiếp theo dùng baseline mới; nếu Reject/không cải thiện, baseline hiện tại được giữ.
10. Xuất gói và chạy lại một cặp baseline/candidate trong phạm vi phiên bản, cấu hình và dung sai đã công bố.

## 11. Phần không gộp vào đợt sửa luồng chính

Quản trị người dùng, workspace/project isolation, quản lý task/work report và hỗ trợ mọi xe đặc biệt
là các hạng mục riêng. Google Docs có nhắc đến nhưng không nên dùng để kéo rộng nhiệm vụ của 5 màn
trước khi luồng AEB hoàn chỉnh. TD-30 về cách ly dữ liệu vẫn phải được xử lý trước triển khai nhiều nhóm
người dùng độc lập. Chưa có bằng chứng thì hiển thị hạn chế/NOT_RUN, không đánh dấu đã hoàn thành.

**Bàn giao hiện tại:** tài liệu kế hoạch này. Tất cả công việc triển khai trong các mục trên còn phải được
giao người thực hiện, kiểm chứng và ghi bằng chứng; tài liệu không xác nhận code đã được sửa.

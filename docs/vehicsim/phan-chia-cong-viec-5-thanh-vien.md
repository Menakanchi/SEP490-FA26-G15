# Phân chia công việc cho nhóm 5 thành viên — luồng chính VehicSim

## 1. Mục tiêu và phạm vi

Mỗi thành viên phụ trách một màn chính, bao gồm giao diện, API/nghiệp vụ,
lưu dữ liệu và kiểm thử phần mình. Các trang chi tiết, tab và hộp thoại là
chức năng hỗ trợ thuộc màn chính đó.

Luồng phục vụ kỹ sư kiểm thử, hiệu chỉnh AEB. Reviewer là người đưa ra quyết
định phê duyệt cuối cùng. Mục tiêu là tạo tình huống kiểm thử phanh trong mô
phỏng, tìm cấu hình AEB có kết quả tốt hơn và kiểm chứng trước khi cân nhắc
thử nghiệm vật lý.

```text
Thiết kế kịch bản
       ↓
Chạy mô phỏng baseline
       ↓
Phân tích kết quả và nguyên nhân lỗi
       ↓
Tối ưu tham số AEB
       ↓
Kiểm thử, so sánh và Reviewer phê duyệt
       ↓
Baseline mới cho vòng tiếp theo
```

Đây là đề xuất phạm vi chức năng dựa trên code hiện có, chưa phải xác nhận
các tính năng đều đã hoàn thành. Hiện hệ thống có tạo candidate thủ công và
regression; vòng tối ưu MOBO cần triển khai mới. Phân công tên người, deadline
và tiến độ thực tế theo dõi trên GitHub Issues/Project.

Trong bài demo CARLA, tập trung vào tình huống người đi bộ băng ngang
`CP_CROSSING` mà bộ sinh OpenSCENARIO hiện hỗ trợ.

## 2. Bảng phân chia tổng quan

| Thành viên | Màn chính | Trách nhiệm trọng tâm | Đầu ra bàn giao |
|---|---|---|---|
| Người 1 | Thiết kế bộ kịch bản | Mô tả → tham số hợp lệ → sinh và lưu biến thể | Họ kịch bản, danh sách biến thể |
| Người 2 | Chạy mô phỏng baseline | Thực thi, tiến độ, hủy chạy, OpenSCENARIO và CARLA | Lượt chạy baseline, seed, kết quả và artifact |
| Người 3 | Phân tích kết quả và nguyên nhân lỗi | Chỉ số, biểu đồ, playback, nguyên nhân, chuẩn bị tập dữ liệu | Tập tình huống đã chốt và dữ liệu phân tích |
| Người 4 | Tối ưu tham số AEB | MOBO, thử nghiệm tham số, mục tiêu, ràng buộc và Pareto | Candidate được chọn và bằng chứng tối ưu |
| Người 5 | Kiểm thử, so sánh và phê duyệt | Regression, so sánh, quyền Reviewer và quyết định | Kết quả xác minh, quyết định và baseline mới nếu được Accept |

## 3. Người 1 — Thiết kế bộ kịch bản

### Mục đích

Tạo tập tình huống đầu vào có tham số rõ ràng, dùng được cho mô phỏng và tối ưu.

### Chức năng giao diện

- Nhập mô tả tình huống bằng tiếng Việt.
- Hiển thị kết quả phân tích thành tham số để người dùng kiểm tra, chỉnh sửa.
- Chọn giá trị hoặc khoảng giá trị: tốc độ xe, tốc độ người đi bộ, khoảng cách
  kích hoạt và các điều kiện được hỗ trợ.
- Xem trước số lượng biến thể, kiểm tra giới hạn và lưu họ kịch bản.
- Hiển thị thông báo kiểm tra dữ liệu rõ ràng.
- Nút **Tiếp tục: Chạy baseline** chuyển đúng họ kịch bản sang màn 2.

### Xử lý và dữ liệu

- Phụ trách luồng mô tả → Scenario IR → kiểm tra hợp lệ → sinh biến thể.
- Phát triển `DescribeService`, `FamilyService`; lời gọi LLM tiếp tục đi qua
  `LlmService`.
- Lưu dữ liệu tại `scenarios`, `scenario_versions`.
- Tận dụng màn `/scenarios/new`; danh sách và xem lại kịch bản là chức năng hỗ trợ.
- Kiểm tra lựa chọn có tương thích với bộ mô phỏng dự kiến sử dụng.

### Bàn giao

Mã họ kịch bản, danh sách biến thể và bộ tham số của từng biến thể.

### Tiêu chí nghiệm thu

- Từ mô tả người đi bộ băng ngang, tạo được một họ kịch bản.
- Dữ liệu ngoài giới hạn bị từ chối với lý do cụ thể.
- Mọi biến thể lưu thành công đều có dữ liệu hợp lệ.
- Họ kịch bản vừa tạo xuất hiện và chọn được ở màn chạy mô phỏng.

## 4. Người 2 — Chạy mô phỏng baseline

### Mục đích

Chạy tập tình huống với cấu hình AEB cơ sở, tạo dữ liệu ban đầu để phân tích.

### Chức năng giao diện

- Nhận họ kịch bản từ màn 1.
- Hiển thị xe, cấu hình AEB baseline và bộ mô phỏng sẽ sử dụng.
- Khởi chạy, theo dõi số lượt chờ/chạy/thành công/thất bại.
- Hiển thị lỗi và bổ sung thao tác hủy lượt chạy.
- Với CARLA: kiểm tra kết nối, chạy `.xosc`, xem ảnh và dữ liệu cảm biến.
- Nút **Tiếp tục: Phân tích kết quả** chuyển tập lượt chạy sang màn 3.

### Xử lý và dữ liệu

- Phụ trách `RunService`, hàng đợi thực thi và quản lý tiến trình worker.
- Phụ trách xuất OpenSCENARIO, ScenarioRunner và tích hợp CARLA.
- Lưu lượt chạy, trạng thái và artifact bằng cơ chế hiện có.
- Cung cấp cơ chế chạy dùng chung để phần tối ưu và regression gọi lại.
- Tận dụng phần chạy tại `/scenarios` và phần CARLA tại `/analysis/carla`.
- API/nút hủy chạy là phần cần hoàn thiện; không coi thao tác hủy thủ công
  trên máy phát triển là chức năng sản phẩm đã có.

### Bàn giao

Các `runId`, trạng thái, seed, cấu hình AEB, xe, phiên bản bộ mô phỏng và kết
quả tương ứng.

### Tiêu chí nghiệm thu

- Chạy được một họ kịch bản từ web.
- Tiến độ phản ánh trạng thái thực tế của các lượt chạy.
- Kết quả mở được ở màn 3.
- Chạy lỗi hoặc hủy không làm hàng đợi bị treo.
- Người đi bộ băng ngang đúng hình học của tình huống CARLA được hỗ trợ.

### Gợi ý phân công

Thành viên đang làm CARLA và OpenSCENARIO nên nhận phần này để tiếp nối phần
tích hợp và kinh nghiệm xử lý môi trường hiện có.

## 5. Người 3 — Phân tích kết quả và nguyên nhân lỗi

### Mục đích

Giải thích baseline đang hoạt động như thế nào và chuẩn bị dữ liệu cho tối ưu.

### Chức năng giao diện

- Tổng hợp số ca an toàn, va chạm, phanh oan và các chỉ số liên quan.
- Lọc theo họ kịch bản, điều kiện và loại lỗi.
- Xem chi tiết một lượt chạy: tốc độ, khoảng cách, TTC, thời điểm kích hoạt phanh.
- Playback diễn biến và hiển thị nguyên nhân theo chuỗi cảm nhận → quyết định
  → điều khiển → động lực học.
- Chọn bộ tình huống đưa sang tối ưu.
- Nút **Tiếp tục: Tối ưu AEB** chuyển đúng dữ liệu sang màn 4.

### Xử lý và dữ liệu

- Phụ trách dữ liệu phân tích trong `ViewsService`, `TelemetryMetricsService`
  và phần đánh giá kết quả liên quan.
- Chuẩn hóa cách tính, đơn vị và cách tổng hợp chỉ số để màn 4 và 5 dùng chung.
- Chuẩn bị tập biến thể đã chốt cho tối ưu và tập kiểm thử xác minh.
- Giữ cả tình huống an toàn để đánh giá nguy cơ phanh oan; việc chọn tập dữ
  liệu không chỉ dựa vào các ca va chạm.
- Chốt baseline, danh sách biến thể và seed trước khi bắt đầu một đợt so sánh.
- Tận dụng `/analysis/failures` cùng trang chi tiết và playback.

### Bàn giao

Tập biến thể, baseline tương ứng, seed và bảng chỉ số/nguyên nhân. Tập regression
phải có cả ca lỗi và ca trước đây an toàn để kiểm tra ảnh hưởng của candidate.

### Tiêu chí nghiệm thu

- Người dùng xem được diễn biến và nguyên nhân hệ thống ghi nhận cho một ca lỗi.
- Chỉ số có đơn vị và nguồn lượt chạy rõ ràng.
- Thiếu dữ liệu được thể hiện đúng, không thay bằng số 0 hoặc kết quả đạt giả.
- Chuyển sang màn tối ưu mà không phải nhập lại dữ liệu đã chọn.

## 6. Người 4 — Tối ưu tham số AEB

### Mục đích

Tự động tìm các bộ tham số AEB có sự đánh đổi tốt hơn trên tập tình huống đã
chọn. Đây là phần thuật toán trọng tâm, cần có vòng tìm kiếm và đánh giá thực tế.

### Chức năng giao diện

- Nhận baseline và bộ tình huống từ màn 3.
- Hiển thị khoảng tìm kiếm của bốn tham số AEB.
- Cấu hình ngân sách tối ưu: số bộ tham số được thử và điều kiện dừng.
- Hiển thị tiến độ, lịch sử thử, chỉ số và trạng thái ràng buộc của từng ứng viên.
- Hiển thị tập Pareto: những ứng viên có sự đánh đổi giữa các mục tiêu.
- Cho chọn candidate và bấm **Chuyển sang kiểm thử xác minh**.

| Tham số | Ý nghĩa |
|---|---|
| `TTC_THRESHOLD` | Ngưỡng TTC kích hoạt |
| `BRAKE_ACTIVATION_DELAY` | Độ trễ kích hoạt phanh |
| `MAX_DECELERATION` | Giảm tốc tối đa |
| `BRAKE_BUILDUP_RATE` | Tốc độ tăng giảm tốc |

### Xử lý và dữ liệu

- Bổ sung service/API điều phối tối ưu và worker thuật toán.
- Triển khai vòng MOBO: đề xuất tham số → chạy mô phỏng → tính mục tiêu
  → cập nhật thuật toán → đề xuất tiếp.
- Áp dụng giới hạn tham số từ danh mục hiện có, ràng buộc va chạm và phanh oan.
- Lưu chiến dịch và từng lần thử vào `optimization_runs`, `optimization_trials`;
  liên kết với bộ tham số AEB tương ứng.
- Tái sử dụng cơ chế chạy, logic AEB và cách tính chỉ số đã thống nhất.
- Phát triển `/aeb` thành màn tối ưu, với cấu hình thủ công là chức năng hỗ trợ.
- Đối chiếu MOBO với random search trên cùng tập dữ liệu và ngân sách thử.

Ba mục tiêu theo ADR-040:

| Mục tiêu cần giảm | Cách tổng hợp theo họ kịch bản |
|---|---|
| RMS jerk | Trung bình các run có phanh |
| Tốc độ va chạm | Trung bình mọi run; run không va chạm tính 0 |
| Quãng phanh dừng | Trung bình các run có phanh, gồm cả ca va chạm theo định nghĩa đã chốt |

### Bàn giao

Mã chiến dịch tối ưu, mã lần thử được chọn, candidate, bộ tham số, kết quả ba
mục tiêu, cấu hình ràng buộc và thông tin baseline/tập dữ liệu đã sử dụng.

### Tiêu chí nghiệm thu

- Hệ thống tự đề xuất và đánh giá nhiều bộ tham số trong ngân sách đã đặt.
- Lưu được lịch sử để truy xuất quá trình tìm kiếm.
- Candidate được chọn có bằng chứng đánh giá và thông tin truy xuất đầy đủ.
- Nếu không tìm được cải thiện thì hiển thị đúng kết quả đó.
- Tìm được điểm Pareto không tự động làm candidate trở thành baseline.

## 7. Người 5 — Kiểm thử, so sánh và phê duyệt

### Mục đích

Kiểm tra độc lập sau tối ưu: candidate có cải thiện và có làm xấu các tình
huống khác hay không; sau đó chuyển bằng chứng cho Reviewer quyết định.

### Chức năng giao diện

- Nhận candidate từ màn 4.
- Xem trước baseline, candidate và tập regression.
- Khởi chạy kiểm thử và theo dõi tiến độ.
- So sánh từng cặp baseline–candidate.
- Hiển thị ca cải thiện, ca xấu đi, va chạm mới và phanh oan.
- Reviewer nhập lý do, xác nhận và thực hiện Accept/Reject.
- Hiển thị lịch sử quyết định và tổng hợp kết quả.

### Xử lý và dữ liệu

- Phụ trách `RegressionService` và luồng recommendation/decision.
- Kiểm thử trên cả ca lỗi và ca trước đây an toàn.
- Ghép đúng biến thể, seed, xe và phiên bản bộ mô phỏng.
- Thống nhất cấu hình tiêu chí với phần tối ưu; không tự suy diễn candidate
  thuộc Pareto sẽ đạt regression.
- Kiểm tra quyền Reviewer và điều kiện cho phép phê duyệt.
- Khi Accept hợp lệ, cập nhật baseline cho vòng tiếp theo và giữ lịch sử.
- Tận dụng `/validation/regression` và các trang chi tiết/recommendation.

### Bàn giao

Kết quả regression, quyết định có lý do của Reviewer và baseline mới nếu
candidate được chấp nhận.

### Tiêu chí nghiệm thu

- Candidate được kiểm tra với baseline trên dữ liệu đã chốt.
- Test thất bại không thể được Accept.
- Chỉ tài khoản Reviewer có quyền quyết định.
- Baseline đã thay đổi thì không phê duyệt bằng kết quả test cũ.
- Quyết định lưu được lý do và truy xuất lại được.

## 8. Hợp đồng bàn giao giữa các màn

| Điểm nối | Dữ liệu bắt buộc |
|---|---|
| Màn 1 → 2 | Mã họ kịch bản, danh sách/mã phiên bản biến thể |
| Màn 2 → 3 | Mã các run baseline, phiên bản AEB, seed, xe, bộ mô phỏng và kết quả |
| Màn 3 → 4 | Tập tình huống đã chốt, baseline tham chiếu, seed và dữ liệu phân tích |
| Màn 4 → 5 | Mã chiến dịch/lần thử, candidate, tập dữ liệu và cấu hình đánh giá |
| Màn 5 → 2 | Quyết định và mã baseline mới khi được chấp nhận |

Các màn truyền mã định danh và tự tải dữ liệu liên quan. Người dùng không cần
chép mã thủ công hoặc nhập lại tham số giữa các bước. Mọi tập kết quả phải truy
xuất được về biến thể, xe, seed, phiên bản AEB và phiên bản bộ mô phỏng đã dùng.

## 9. Ranh giới trách nhiệm và quy tắc tích hợp

1. Người 1 phụ trách dữ liệu kịch bản; người 2 phụ trách xuất `.xosc` và thực thi.
2. Người 2 phụ trách cơ chế chạy dùng chung; người 4 và 5 gọi lại cơ chế đó.
3. Người 3 phụ trách định nghĩa chỉ số; người 4 và 5 dùng cùng cách tính.
4. Người 4 phụ trách thuật toán tìm kiếm; người 5 phụ trách xác minh và quyết định.
5. Trong một lần so sánh, giữ nguyên tham số kịch bản và chỉ thay tham số AEB.
6. Cùng biến thể và seed phải tái lập được; candidate dùng đúng seed baseline.
7. Tối ưu hàng loạt bằng bộ động học hiện có; CARLA dùng kiểm tra bổ sung và
   quan sát. Kết quả hai bộ mô phỏng được lưu và so sánh riêng. Số đo CARLA chưa
   hiệu chuẩn phanh không dùng làm bằng chứng regression trong báo cáo.
8. Logic AEB tiếp tục dùng chung trong `worker/vehicsim_core/`; không viết
   phiên bản AEB riêng cho tối ưu hay CARLA.
9. Mọi lời gọi LLM qua `LlmService`; bộ sinh `.xosc` hoạt động offline.
10. Các thao tác chạy, tối ưu và regression phải tuân thủ quyền và hạn mức tài nguyên.
11. Chỉ Reviewer quyết định; hệ thống không tự Accept candidate.
12. Đăng nhập, hồ sơ, khung giao diện, API client và cấu hình nền là phần dùng chung.

Các file dùng chung như controller, kiểu dữ liệu API và thanh tiến trình cần
được phối hợp thay đổi để tránh xung đột và lệch hợp đồng giữa các màn.

## 10. Kịch bản nghiệm thu toàn luồng

1. Người dùng mô tả tình huống người đi bộ băng ngang đường.
2. Màn 1 sinh và lưu một họ kịch bản với các biến thể hợp lệ.
3. Màn 2 chạy baseline và theo dõi kết quả thực tế.
4. Màn 3 phân tích một ca lỗi, đồng thời chuẩn bị tập tình huống gồm cả ca an toàn.
5. Màn 4 chạy MOBO, hiển thị lịch sử và cho chọn một candidate để xác minh.
6. Màn 5 chạy regression trên tập đã chốt, trình bày cả cải thiện và ảnh hưởng xấu.
7. Reviewer nhập lý do, xác nhận và quyết định Accept/Reject theo điều kiện hợp lệ.
8. Nếu được Accept, vòng tiếp theo sử dụng baseline mới; dữ liệu cũ vẫn truy xuất được.

Bài demo phải thể hiện được dữ liệu đi xuyên suốt cả năm màn. Nếu chiến dịch tối
ưu không cải thiện, báo đúng kết quả và giữ baseline hiện tại.

## 11. Tài liệu đối chiếu

- [Kiến trúc và luồng hiện tại](architecture.md).
- [ADR-040: 4 tham số AEB và 3 mục tiêu MOBO](../adr/ADR-040-rut-scope-4-tham-so-aeb-7-category.md).
- [Ý tưởng triển khai tối ưu](fe13-y-tuong-tu-forge.md).
- [Schema database](database-schema.md).
- [CARLA local](carla-local.md).
- [Nợ kỹ thuật, gồm TD-39 về vòng tối ưu chưa triển khai](../exec-plans/tech-debt-tracker.md).

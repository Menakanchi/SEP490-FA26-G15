# Runbook Demo Day — 10 phút

Mục tiêu của phần trình bày là chứng minh một câu duy nhất:

> Scenario Forge không chỉ viết XML. Nó biến yêu cầu tiếng Việt thành artifact
> chạy được, dùng CARLA để đo tình huống có thật sự xảy ra, rồi dò và lưu bộ tham
> số làm lộ giới hạn của controller.

## Chuẩn bị trước khi vào Zoom

- Chạy `make demo` và `make demo-check` trước giờ ít nhất 15 phút.
- Đăng nhập sẵn bằng tài khoản reviewer; đóng notification và tab không dùng.
- Trình duyệt zoom 90%, sidebar ứng dụng thu gọn nếu màn hình chia sẻ nhỏ.
- Mở sẵn bốn tab, đúng thứ tự:
  1. `http://localhost:3000/`
  2. `http://localhost:3000/review?scenario_id=sc_115_t1_t1`
  3. `http://localhost:3000/library/sc_107`
  4. `http://localhost:3000/metrics`
- Mở `presentation/pitch_deck.pdf` làm bản dự phòng cho PowerPoint.
- Không dùng lần sinh LLM mới hoặc lượt CARLA mới làm đường sống duy nhất của
  demo. Có thể bấm thử nếu còn thời gian, nhưng kết quả đã lưu phải kể trọn câu
  chuyện ngay cả khi mạng hoặc GPU lỗi.

## Nhịp trình bày

### 0:00–0:35 — Slide 1: lời hứa

“Kỹ sư mô tả một tình huống nguy hiểm bằng tiếng Việt. Scenario Forge biến nó
thành file OpenSCENARIO chạy được, có người duyệt và có bằng chứng CARLA trước
khi đưa vào thư viện.”

Không giới thiệu thành viên dài; tên đội đã có trên Zoom.

### 0:35–1:15 — Slide 2: vấn đề

“Xe tự lái không khó ở đoạn đường thẳng. Nó khó ở những tình huống hiếm. Người
hiểu tình huống giao thông không nhất thiết biết viết hàng trăm dòng XML, tọa độ
làn và trigger; đó là khoảng trống sản phẩm.”

### 1:15–1:50 — Slide 3–4: giải pháp và phạm vi

“LLM dựng spec có cấu trúc; code deterministic validate và biên dịch. Hiện hệ
thống dựng được sáu maneuver trong phạm vi đã kiểm chứng. Em xin chứng minh trên
dữ liệu chạy thật, không phải ảnh minh họa.”

Chuyển sang trình duyệt.

### 1:50–2:35 — Demo 1: từ câu tiếng Việt tới workflow sinh

Ở tab trang chủ, dán câu đã tập trước:

> Trên cao tốc trời quang, xe máy chạy từ phía sau, vượt lên tạt đầu ô tô rồi
> phanh gấp.

Bấm sinh và chỉ vào tiến trình node. Nói:

“LLM không viết XML trực tiếp. Nó dựng spec có cấu trúc; validator và converter
deterministic mới tạo artifact.”

Chỉ chờ tối đa 20 giây. Nếu hoàn tất, mở kết quả và chỉ câu gốc, actor, tốc độ,
trigger. Nếu lỗi hoặc còn chờ, nói “Em chuyển sang một artifact đã hoàn tất để
không dùng thời gian của BGK chờ API”, rồi mở ngay tab `sc_115_t1_t1`. Đây là
fallback có chủ đích, không đứng sửa lỗi live.

### 2:35–3:45 — Demo 2: kiểm chứng một near-miss thật

Mở tab `review?scenario_id=sc_115_t1_t1`.

1. Chỉ vào câu mô tả và bốn trục ODD.
2. Chỉ vào banner “Khớp ý định mô tả”.
3. Bấm phát lại quỹ đạo.
4. Chỉ vào `PET`, `Khe hở nhỏ nhất 0,10 m` và `Kết quả tiếp cận: suýt va chạm`.

Nói:

“Ca này không đâm. Nhưng hai xe trượt nhau 10 cm và qua điểm cắt lệch khoảng
0,08 giây. Nếu UI chỉ nói ‘không va chạm’, ta đã đánh đồng một ca gần chết với
một ca vô hại. Vì vậy hệ thống giữ riêng bằng chứng vật lý và phán quyết đúng
intent.”

Không mở XML trừ khi BGK hỏi; XML dài làm mất nhịp.

### 3:45–4:20 — Demo 3: HITL và quản lý

Ngay trên trang review, chỉ vào lịch sử/trạng thái và nói:

“AI không tự đưa dữ liệu vào bộ test. Cổng 1 cấp phép dùng GPU. CARLA trả trace
và metrics. Cổng 2 mới cho reviewer quyết định lưu. Artifact đã duyệt được đóng
băng; nếu rút khỏi thư viện cũng phải có người và lý do.”

Không thực hiện approve/reject trên artifact chuẩn bị sẵn.

### 4:20–5:30 — Demo 4: tìm bộ tham số nguy hiểm

Mở `library/sc_107`, cuộn tới “Dò biến thể khó hơn”.

Chỉ hai số:

- bản gốc: `6,85 m`;
- `sc_107_t1`: `0,00 m`.

Nói:

“Kịch bản vượt đèn đỏ có sẵn trên mạng chỉ cho loại tình huống. Với controller
này, xe cắt ngang 36 km/h đi qua quá sớm nên cách ego 6,85 m. Hệ thống tính thời
điểm hai xe tới giao điểm, đề xuất 22,2 km/h và chạy lại; kết quả là va chạm.
Khi tìm được, bộ tham số được đóng băng thành regression test. Không sinh lại
nếu thư viện đã có ca phù hợp.”

Không bấm “Sinh biến thể khó hơn”: chuỗi này đã đạt ngưỡng và bấm live không
thêm bằng chứng.

### 5:30–6:10 — Slide 5: hai cổng

Quay lại deck. Dùng đúng hai câu:

- “Cổng 1 bảo vệ GPU.”
- “Cổng 2 bảo vệ dữ liệu dùng lại cho lần sinh sau.”

### 6:10–7:00 — Slide 6: closed-loop

“Cùng một artifact được chạy với baseline và BehaviorAgent. Nếu controller vẫn
đâm, giữ làm regression. Nếu tránh được, người dùng khởi động một bước dò khó
hơn. Vòng lặp không tự chạy để không đi vòng qua HITL.”

### 7:00–8:10 — Slide 7: bằng chứng

Không đọc toàn bộ bảng. Nói:

“119/119 lượt ScenarioRunner chạy hết. 63 lượt va chạm thật và 19 near-miss dưới
một mét. 72/72 ô trong phạm vi đã có lượt CARLA. Con số em quan tâm nhất là L4:
76/118 quỹ đạo đúng ý định; 42 ca được đánh giá chưa khớp cho thấy file chạy
được chưa đồng nghĩa kịch bản có giá trị.”

Nếu bị hỏi vì sao 64% thấp: “Vì mẫu số gồm cả toàn bộ chiến dịch trước khi sửa
converter và prompt; em giữ thất bại trong mẫu số thay vì chỉ báo phần đẹp.”

### 8:10–8:45 — Slide 8: ý nghĩa và kết

“Bước tiếp theo không phải sinh thêm file cho đẹp số. Nó là cắm controller thật
của doanh nghiệp vào chỗ BehaviorAgent, để câu hỏi trở thành: kịch bản nào làm
controller của bạn thất bại?”

Kết đúng một câu:

> “Template cho ta loại tình huống; Scenario Forge tìm, kiểm chứng và quản lý bộ
> tham số làm lộ giới hạn của chính controller đang được thử.”

Còn hơn một phút làm đệm cho chuyển tab hoặc câu hỏi ngắt quãng.

## Ba câu hỏi dễ bị hỏi

### “Sao không tải kịch bản có sẵn?”

“Kịch bản có sẵn cho loại tình huống. Nó không cho biết tốc độ, khoảng cách và
thời điểm nào làm controller của tôi thất bại. Hệ thống tìm các giá trị đó và
lưu kết quả thành regression test.”

### “Tại sao cần AI nếu đã có thư viện?”

“Có ca phù hợp thì tái sử dụng. AI chỉ dựng ca mới khi yêu cầu chưa được phủ;
retrieval còn đưa artifact cũ làm few-shot để không bắt đầu từ số 0.”

### “Không va chạm sao vẫn duyệt?”

“Duyệt là quyết định quản trị; va chạm là một tín hiệu vật lý. Near-miss 10 cm
vẫn nguy hiểm. UI hiển thị riêng trạng thái review, đúng intent và mức tiếp cận
để không gộp ba câu hỏi này.”

## Kế hoạch dự phòng

- LLM lỗi: mở artifact `sc_115_t1_t1` và nói đây là kết quả đã lưu từ pipeline.
- CARLA/GPU lỗi: phát replay từ trajectory đã lưu; đây là telemetry của lượt
  CARLA trước, không phải animation dự đoán.
- Frontend lỗi: dùng slide 6 và PDF; bảng 36 → 22,2 km/h vẫn kể đủ discovery.
- Mất quá 45 giây vì lỗi kỹ thuật: bỏ thao tác live, quay ngay về slide 5–7.

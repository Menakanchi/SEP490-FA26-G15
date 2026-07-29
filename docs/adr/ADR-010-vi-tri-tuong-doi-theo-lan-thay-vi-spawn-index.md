# ADR-010: Vị trí trong `ScenarioSpec` là tương đối theo làn, không phải chỉ số điểm xuất phát

**Ngày:** 2026-07-29
**Trạng thái:** Accepted
**Thay thế:** thiết kế `spawn_index` mô tả ở `docs/overview.html` bước 3–5 và ở `BATTLE_PLAN.md` §9 (bản trước 29/7)

## Bối cảnh

`ScenarioSpec` phải nói được chủ thể đứng ở đâu. LLM sinh ra trường này, nên nó
phải là thứ LLM điền được mà không bịa.

Thiết kế ban đầu: dump sẵn `world.get_map().get_spawn_points()` của Town01 ra
file JSON tĩnh (`scripts/cache_waypoints.py`), LLM chọn **chỉ số** trong danh
sách đó, validator kiểm `index < N`.

Khi viết `src/models/schemas.py` (29/7) chọn cách khác — offset tương đối so với
ego — nên hai tài liệu vênh nhau. ADR này chốt.

## Các lựa chọn

### Lựa chọn 1: `spawn_index` vào danh sách dump sẵn
- Ưu: kiểm tra cực đơn giản (`index < N`); câu chuyện "LLM không thể bịa toạ độ"
  gọn, dễ demo.
- Nhược: **một chỉ số không mang ý nghĩa gì.** LLM không biết điểm 42 là cao tốc
  hay ngõ hẹp, không biết điểm 87 cách điểm 42 hai mươi mét hay hai cây số, thậm
  chí không biết chúng có nằm trên cùng một con đường không.

### Lựa chọn 2: offset tương đối theo làn (`lane_offset`, `s_offset_m`)
- Ưu: LLM phát biểu **quan hệ**, đúng thứ câu tiếng Việt chứa và đúng thứ nó giỏi;
  không có ô nào để điền toạ độ tự do; độc lập simulator.
- Nhược: converter nặng hơn — cần đồ thị làn của bản đồ chứ không chỉ danh sách
  điểm; phải xử lý trường hợp offset rơi ra ngoài đoạn đường.

### Lựa chọn 3: toạ độ tuyệt đối `x, y, z`
- Ưu: —
- Nhược: LLM bịa 100%. Loại ngay.

## Quyết định

**Lựa chọn 2.** `Position` gồm `lane_offset` (−4…4) và `s_offset_m` (±200 m),
tính tương đối so với ego. `ScenarioSpec` **không** chứa tên bản đồ.

Converter chọn một điểm xuất phát hợp lệ cho ego, rồi dùng API waypoint của bản
đồ (`waypoint.next(d)`, `get_left_lane()`) để phân giải offset thành vị trí thật.

`scripts/cache_waypoints.py` **vẫn cần** nhưng đổi người dùng: nó cache điểm xuất
phát ứng viên cho ego và dữ liệu làn mà converter cần — **không phải** một danh
sách để LLM đánh số vào.

## Lý do

1. **Kịch bản là một quan hệ, không phải hai vị trí.** "Xe máy ở làn trái, sau ego
   25 m" là một câu về *khoảng cách và làn*. Với `spawn_index` câu đó **không viết
   ra được** — chỉ có hai con số rời rạc mà không gì ràng buộc chúng với nhau.

2. **Lỗi hình học trở nên bắt được bằng số học tĩnh.** Ngày 29/7, review tự động
   bắt được đúng lỗi này ở fixture đầu tiên: chủ thể đặt *phía trước* ego mà chạy
   nhanh hơn ⇒ khoảng cách nới rộng ⇒ trigger không bao giờ bắn ⇒ kịch bản chạy
   trót lọt mà **không có gì xảy ra**. Với lane-relative, phép kiểm là ba dòng số
   học chạy trong `pytest` (`test_cut_in_geometry_actually_produces_a_cut_in`).
   Với `spawn_index`, cách duy nhất để phát hiện là **chạy sim và ngồi nhìn**.

3. **Chống bịa mạnh hơn, không phải yếu hơn.** `spawn_index` cho LLM một ô số tự
   do rồi kiểm sau. Lane-relative **không có ô nào để bịa**: `lane_offset` là số
   nguyên chặn cứng −4…4, `s_offset_m` chặn ±200. Không tồn tại giá trị "sai bản
   đồ" để sinh ra.

4. Giữ được ADR-005: `ScenarioSpec` không dính khái niệm riêng của CARLA, nên
   "thêm Isaac là viết converter thứ hai" vẫn là câu nói thật.

5. Prompt ngắn hơn hẳn — không phải mô tả hàng trăm điểm xuất phát cho LLM chọn.

## Hệ quả

- `converter.py` phải xử lý **offset không phân giải được** (hết đoạn đường, không
  có làn bên trái) và trả lỗi rõ ràng để vòng repair sửa được. Đây là phần việc
  khó nhất của converter — Tuấn Anh cần biết từ đầu.
- Static validator chuyển từ "kiểm chỉ số có thật" sang **kiểm quan hệ hình học**:
  chủ thể có bắt kịp ego không, trigger có bắn trước khi hết giờ không, sau khi
  tạt có thể va chạm không.
- `docs/overview.html` bước 3–5 và `BATTLE_PLAN.md` §9 phải viết lại theo ADR này.
- Câu trả lời mentor cho "hallucination xử lý sao?" đổi thành: **biểu diễn không
  có chỗ để bịa** — mạnh hơn "chúng em kiểm tra sau khi nó bịa".

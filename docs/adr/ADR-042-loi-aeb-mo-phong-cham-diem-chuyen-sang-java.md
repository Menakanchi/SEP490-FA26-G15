# ADR-042 — Lõi AEB, mô phỏng và chấm điểm chuyển sang Java; Python chỉ còn lớp CARLA mỏng

**Trạng thái:** Proposed 21/10/2026 (TrungDQ, nhánh `trungdam`; kế hoạch và bằng chứng ở
[exec plan 21/10](../exec-plans/active/2026-10-21-port-loi-aeb-sang-java.md))
**Phạm vi:** thay phần "mô phỏng + chấm điểm ở lại worker Python" của [ADR-039](ADR-039-backend-java-mo-phong-o-worker-python.md).
Các phần còn lại của ADR-039 giữ nguyên (Java lo REST/nghiệp vụ/lưu trữ, thread pool thay Celery, mật khẩu/JWT).
Không đổi schema, hợp đồng JSON `result.json` (ADR-027), 5 role (ADR-035), luật regression (ADR-025) hay phạm vi tham số (ADR-040).
ADR-039 chỉ đổi trạng thái sang *Superseded* khi ADR này được duyệt.

## Bối cảnh

ADR-039 chọn giữ lõi (`aeb_stack`, `simulator`, `evaluation`, `bundle`) bằng Python và loại việc viết lại bằng Java vì ba lý do:
(1) sẽ có hai bản AEB (Java và Python cho CARLA) lệch nhau; (2) nhiễu perception lấy từ `random.Random(seed)` của Python mà Java
không tái lập, nên cùng seed ra kết quả khác và không khớp các run đã lưu; (3) regression không còn so được run cũ với run mới.

Chủ dự án quyết định ngày 21/10/2026 chuyển **toàn bộ logic thuần** sang Java. Lý do nghiệp vụ: nhóm viết và bảo trì Java; các việc tiếp
theo (perception từ radar, định nghĩa pha phanh, chế độ AEB tắt, tối ưu) đều nằm trong lõi và sẽ phải viết lại nếu port sau.
Cái **không** đổi được: controller chạy trong tiến trình ScenarioRunner và gọi API `carla` nên chỉ có thể là Python.

## Lựa chọn

1. Giữ ADR-039 (lõi Python) — không chọn theo quyết định của chủ dự án.
2. **Port toàn bộ logic thuần sang Java; controller Python chỉ chuyển quan sát cho Java và áp lệnh phanh Java trả về, qua tiến trình
   Java con trao đổi JSON từng dòng trên stdin/stdout** — chọn.
3. Endpoint HTTP trên backend Spring Boot — loại: luật cứng 3 buộc mọi route `/api/v1/vehicsim/*` đăng nhập (phải thêm cổng nội bộ),
   và `run_xosc.py` chạy độc lập để lấy bằng chứng sẽ không chạy được khi backend tắt.
4. JPype/Py4J/JNI (hai runtime trong một tiến trình) — loại: nặng, dễ lỗi với venv CARLA Python 3.10.

## Quyết định

- **Lõi Java** nằm ở `com.vehicsim.core` (không Spring, không DB, không `carla`): bộ sinh số ngẫu nhiên tương thích CPython (MT19937 + `gauss`),
  `AebParams`, `AebStack`, bộ mô phỏng động học, luật chấm (`evaluation`), bộ lọc, `bundle`, xuất `.xosc`. Backend gọi trực tiếp trong tiến trình
  cho bộ động học; không còn tiến trình Python cho đường này.
- **Cầu nối CARLA:** `run_xosc.py` bật một tiến trình Java con cho mỗi run; giao thức `vsos-bridge/1`: bắt tay trao phiên bản giao thức và
  phiên bản lõi; mỗi tick một yêu cầu → một đáp án, có hạn chót, flush từng dòng; Java thoát khi stdin đóng (chống tiến trình mồ côi);
  lỗi/timeout/đứt ống thì run kết thúc có lỗi, **không** rơi về giá trị mặc định. Java ghi stderr vào log trong thư mục run.
- **Python còn lại** chỉ gồm adapter CARLA: controller trong ScenarioRunner, `run_xosc.py`, recorder, camera bám xe, dọn world. Không còn AEB,
  bộ mô phỏng, luật chấm, bundle hay bộ xuất `.xosc` ở `worker/`.
- **Luật cứng viết lại** khi ADR được duyệt: (2) backend Java và lõi `com.vehicsim.core` không import `carla`; adapter CARLA chỉ ở `worker/`.
  (8) logic AEB chỉ ở `com.vehicsim.core.AebStack`, dùng chung cho bộ động học và CARLA; có test kiến trúc cấm logic AEB xuất hiện lại dưới `worker/`.
- **Tái lập là điều kiện nghiệm thu, không phải mong muốn.** Bộ ngẫu nhiên Java phải cho đúng chuỗi của CPython với mọi seed (kể cả BIGINT lớn
  và âm); `round` của Python (làm tròn theo giá trị nhị phân, chẵn khi hòa) phải được tái hiện. Chứng minh bằng fixture sinh từ Python
  (cả chuỗi ngẫu nhiên, phép làm tròn và kết quả mô phỏng đầy đủ), so từng trường: trường rời rạc (lý do kết thúc, loại và thời điểm sự kiện, thời điểm
  quyết định/phanh) phải trùng tuyệt đối; số thực so theo số lưu. **Mọi sai khác ở một trường đã lưu buộc phải đổi định danh simulator
  (`KINEMATIC_SIMULATOR`, `RunService`)**; run cũ không bị ghi đè hay ghép với run mới.
- **Giữ nguyên định nghĩa chỉ số khi port** (`rms_jerk_mps3`, `stopping_distance_m`, vận tốc va chạm…). Đổi định nghĩa là việc riêng với phiên bản
  đánh giá mới (kế hoạch 20/10, mục 5.3).
- **Không chạy hai AEB song song lâu.** Chưa định tuyến web sang Java khi chưa đạt cả hai: parity trên fixture và một run CARLA thật qua cầu nối.
  Đạt rồi thì xóa AEB/bộ mô phỏng/luật chấm Python trong cùng đợt thay đổi.

## Hệ quả

- Ba điều ADR-039 lo ngại được xử lý như sau: chỉ còn **một** AEB (Java; bản Python bị xóa); nhiễu theo seed khớp nhờ MT19937 tương thích và fixture;
  regression vẫn so được run cũ với run mới vì định danh simulator chỉ đổi khi kết quả đổi.
- **Ảnh hưởng tới các phần khác của nhóm:** phần 1 (xuất `.xosc`), phần 3 (`evaluation`), phần 4/5 (`AebParams`, `bundle`, regression) đều đang đọc
  `worker/vehicsim_core`. Cần thông báo cho nhóm trước khi đổi; không đổi hợp đồng chung âm thầm (AGENTS.md).
- Mỗi run CARLA tốn thêm một lần khởi động JVM (đo trong kế hoạch) và một vòng yêu cầu–đáp án mỗi tick (đo độ trễ ở 100 Hz).
- Test Python của lõi (`worker/tests/test_simulator.py`, `test_filters.py`, `test_step_100hz.py`, `test_sim_contract.py`…) chuyển thành test Java;
  tài liệu sống đang nhắc tên test Python bị xóa (`RepoDocsTest`) phải cập nhật cùng đợt.
- Ràng buộc "lõi chỉ thư viện chuẩn, Python ≥ 3.10" biến mất; còn adapter CARLA vẫn phải chạy trên Python của venv CARLA.
- Rủi ro đã biết: `Math.sin/cos/log/tan` của Java có thể lệch 1 ulp so với CPython; giá trị sát ngưỡng (confidence ≥ 0,70; TTC ≤ ngưỡng) có thể đổi quyết định.
  Fixture phải phủ các ca sát ngưỡng; nếu gặp thì xử lý bằng định danh mới, không sửa số cho khớp.

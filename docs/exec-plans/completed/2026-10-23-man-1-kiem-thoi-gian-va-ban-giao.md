# 23/10/2026 — Màn 1: chặn biến thể không chạy tới vạch, nút "Tiếp tục: Chạy baseline"

Hai việc của Thành viên 1 (thiết kế kịch bản) còn thiếu so với [phân chia 5 thành viên §3](../../vehicsim/phan-chia-cong-viec-5-thanh-vien.md):
"kiểm tra lựa chọn có tương thích với bộ mô phỏng" và "nút **Tiếp tục: Chạy baseline** chuyển đúng họ kịch bản sang màn 2". Không đổi schema,
không chạy CARLA (kiểm bằng bộ động học trong tiến trình Java).

## 1. Biến thể xe không tới vạch băng ngang

**Vấn đề.** Điểm băng ngang luôn nằm trong đoạn Town04 road 40 (s lớn nhất ≈ 154 m < 228 m) nên hình học không vượt đường; giới hạn thật là thời gian
mô phỏng `Simulator.MAX_DURATION_S = 12 s` (bộ động học và `StopTrigger` của `.xosc` dùng chung). Xe chạy đều cần `kích hoạt / v + LEAD_TIME_S (1,5 s)`
để tới vạch; ví dụ 10 km/h + 80 m cần 30,3 s → run TIMEOUT khi xe còn chưa gặp người đi bộ, kết quả vô nghĩa. Form và backend trước đây vẫn cho tạo.

**Sửa.**
- `FamilySpec.unreachablePairs()` + kiểm trong `validate()`: từ chối khi có cặp (tốc độ, khoảng cách) tới vạch ≥ 12 s, thông báo liệt kê tối đa 5 cặp
  kèm số giây và cách sửa.
- `FamilyForm` tính cùng công thức (hằng số ghi rõ là bản sao của lõi), hiện cảnh báo ngay khi nhập và khoá nút "Tạo họ kịch bản".
- `scripts/test_analysis_integration.py` (Thành viên 3) dùng 20 km/h + 60 m (12,3 s) → đổi sang 50 m; vẫn 18 biến thể, phần TIMEOUT của script dựng bằng
  cách sửa trạng thái nên không đổi ý nghĩa.

Dải mặc định của form (40–70 km/h × 20–40 m) đều hợp lệ. Biên: 10 km/h + 29 m (11,94 s) hợp lệ; 30 m (12,3 s) bị từ chối.

## 2. Bàn giao sang màn chạy baseline

- `/scenarios/new`: tạo họ xong không tự chuyển trang mà hiện khung "Đã tạo họ kịch bản PXn" (số biến thể, số lượt đã xếp) với
  **"Tiếp tục: Chạy baseline →"** (`/scenarios?family=<id>`), "Chạy trên CARLA" (`/analysis/carla?family=<id>`) và "Tạo họ khác".
- `/scenarios?family=<id>`: tô sáng + cuộn tới dòng của họ, dòng trạng thái gợi ý bước tiếp (đang chạy / chưa chạy cơ sở / đã có kết quả); id không có
  trong project thì báo rõ. Tạo bằng form "Nhập tay" trên cùng trang cũng tô sáng họ vừa tạo.
- `CarlaRunnerPanel` đọc `?family=` để chọn sẵn đúng họ.

## Kiểm chứng (23/10/2026)

- `FamilyReachTest` (12 test): cặp lỗi được liệt kê, rút gọn khi dài, dải mặc định hợp lệ, các điểm biên; **mọi cặp bị từ chối chạy bộ động học thật đều
  TIMEOUT với mũi xe chưa tới vạch** (luật không lệch khỏi mô phỏng).
- `bash scripts/pre_push_check.sh`: `mvnw clean test`, ruff, pytest worker, eslint, `next build` qua (số liệu ở mục dưới).
- Chạy thật (backend `VEHICSIM_SIMULATOR=kinematic`, MySQL docker, `next dev`), Playwright + Edge headless, không mock API:
  `POST /families` với 10 km/h + 80 m → 400 kèm câu trên; form nhập tay hiện cảnh báo "10 km/h + 80 m (30.3 s)" và khoá nút, sửa thành 25 m thì mở;
  tạo họ từ mô tả (bộ luật, không có khoá LLM) → khung bàn giao, không đổi URL; "Tiếp tục: Chạy baseline" mở `/scenarios?family=2` với dòng PX2 được tô
  sáng; "Chạy trên CARLA" mở panel với họ PX2 đã chọn. Không có lỗi JS. Chưa đối chiếu Figma.

## Giới hạn

- Luật dùng tốc độ đầu, giả định xe chạy đều; ca AEB phanh sớm vẫn có thể TIMEOUT khi xe đã tới gần — đó là kết quả hợp lệ, không bị chặn.
- Chưa kiểm giới hạn riêng của CARLA (ví dụ tốc độ người đi bộ 8 m/s mới đo tới 6 m/s ở TD-47) — cần CARLA để đo, chưa làm.

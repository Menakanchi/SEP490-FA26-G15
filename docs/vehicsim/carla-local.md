# OpenSCENARIO và CARLA 0.9.16 trên Windows

Web xuất `.xosc` OpenSCENARIO 1.0 và gọi ScenarioRunner để chạy trên máy Windows đang chạy backend.
Controller dùng lại `AebStack`/bộ chấm Python hiện có. Cửa sổ CARLA bám theo xe; web xem ảnh RGB và số đo sau khi run xong.
Phạm vi hiện tại là **CP_CROSSING** (người đi bộ băng ngang hoặc dừng ở lề), đúng IR mà web đang hỗ trợ.

## Chuẩn bị một lần

- CARLA 0.9.16 ở `C:\Carla_package` (đổi bằng `-CarlaRoot` nếu đặt nơi khác).
- Python 3.12 (`py -3.12`), Git, JDK 21, Docker Desktop và frontend đã `npm ci`.

```powershell
.\scripts\setup-carla.ps1
.\scripts\dev-carla.ps1 -RestartBackend
```

Setup tạo `worker/.venv-carla/`, cài dependencies từ `worker/requirements-carla-0.9.16.txt` và lấy ScenarioRunner tag
v0.9.16 vào `~/scenario_runner`; không sửa venv CARLA 0.9.15 cũ. Script dev đặt biến môi trường cho phiên chạy,
chọn `VEHICSIM_SIMULATOR=carla-xosc`, phiên bản 0.9.16 và timeout 300 s. `.env` và DB không bị ghi lại.
`-RestartBackend` chỉ dừng Java đang phục vụ :8001 khi command line thuộc repo này; ứng dụng khác không bị dừng.
Các dịch vụ app do script CARLA khởi động chạy nền; mở `http://localhost:3000/analysis/carla` để sử dụng.

## Dùng trên web

1. Đăng nhập bằng ADMIN, ENGINEER hoặc EXPERIENCER; MANAGER/REVIEWER vẫn xem được nhưng không khởi chạy.
2. Tạo một họ nhỏ ở **Kịch bản**, hoặc chọn họ đã có. Mỗi biến thể là một run CARLA, chạy lần lượt trên một server.
3. Vào **Phân tích → Dữ liệu CARLA**; kiểm tra kết nối, chọn họ rồi bấm **Chạy trên CARLA**.
4. Chờ trạng thái **Hoàn thành**, bấm **Xem cảm biến**: 3 số đo, ảnh RGB có thanh chọn khung, tải CSV/JSON va chạm.
5. **Phát lại** dùng dữ liệu AEB/ground truth cùng định dạng với vòng MVP. **Tải .xosc** lấy XML của đúng run.
6. Từ chi tiết một run cũ, **Chạy trên CARLA** tạo run mới giữ đúng biến thể, xe, AEB và seed; không ghi đè kết quả cũ.

IR ở màn **Sinh từ mô tả** cũng tải `.xosc` để chạy thử, nhưng chưa gắn run trong DB. Muốn nộp kết quả từ máy khác,
phải tải `.xosc` của run CARLA PENDING/FAILED để file mang đầy đủ seed/source hợp lệ.

## Chạy file ngoài web

```powershell
worker\.venv-carla\Scripts\python.exe worker\run_xosc.py vehicsim-run-42.xosc --out data\manual-run --camera
```

`SR_ROOT` trỏ tới ScenarioRunner, `CARLA_ROOT` trỏ tới gói CARLA; mặc định là `~/scenario_runner` và `C:/Carla_package`.
Wrapper kiểm client/server cùng phiên bản, chỉ gắn đường dẫn controller vào bản `scenario.runtime.xosc`; artifact
tải xuống không bị sửa. Module controller phải đi cùng repo; controller mặc định của ScenarioRunner không phải AEB của dự án.

File kết quả nội bộ vẫn là `result.json` để Java kiểm metadata và lưu cùng một luật chấm. Thư mục mỗi run có:
`scenario.xosc`, `scenario.runtime.xosc`, `result.json`, log ScenarioRunner, `sensors/frames.csv`, `collisions.json` và
`sensors/camera/*.png`. Không có livestream/video giả: nếu không ghi camera thì giao diện nói rõ không có ảnh.

## Hợp đồng và giới hạn

- Profile mới ghi `carla-0.9.16-xosc1`, khác runner trực tiếp `carla-0.9.16`; regression không ghép hai profile.
- XML dùng LanePosition trên đoạn thẳng road 40/lane -4 của Town04, lấy cao độ từ map; không chiếu người đi bộ lên
  mặt phẳng sai cao độ. Dải tốc độ/khoảng cách hiện có nằm trong đoạn road đã chọn.
- Một backend local dùng một server CARLA; không chạy ScenarioRunner tay song song với web trên cùng server.
- Phanh CARLA chưa hiệu chuẩn (TD-17). Chỉ số là quan sát/đối chiếu, không phải chứng nhận an toàn hoặc bằng chứng regression chính thức.
- Sáu category còn lại trong schema vẫn theo TD-42; không tự biến chúng thành CP_CROSSING.

API: `GET /runs/{id}/xosc`, `POST /scenarios/xosc`, `POST /runs/{id}/carla`, `GET /carla/status`, `GET /carla/runs`,
`GET /runs/{id}/carla-data`, `GET /runs/{id}/carla-files/{name}` dưới tiền tố `/api/v1/vehicsim`.

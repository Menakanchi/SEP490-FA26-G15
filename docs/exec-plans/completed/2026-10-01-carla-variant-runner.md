# Exec plan (đã xong) — JSON từ kịch bản chạy được trên CARLA; bộ mô phỏng cắm được

- **Nhánh:** `trungdam`
- **Thời gian:** 01/10/2026
- **Người chịu trách nhiệm:** TrungDQ, làm cùng Claude Code
- **Quyết định:** [ADR-027](../../adr/ADR-027-bo-mo-phong-cam-duoc-hop-dong-json.md)
- **Kiến trúc kết quả:** [docs/vehicsim/architecture.md](../../vehicsim/architecture.md#bộ-mô-phỏng-động-học-và-carla)
- **Nợ còn lại:** TD-01, TD-17 → TD-21 trong [tech-debt-tracker](../tech-debt-tracker.md)

## Mục tiêu

Theo luồng MVP chốt ngày 01/10: phần mô phỏng là một bộ phận cắm vào được — đầu vào
luôn là file JSON của web, đầu ra luôn là `result.json`; phía sau là CARLA hoặc mô
hình động học, dùng chung một AEB và một luật chấm. Yêu cầu riêng của TrungDQ: **file
JSON xuất ra từ kịch bản phải hiện lên CARLA và chạy được**.

## Đã giao, theo thứ tự

1. Tách hệ AEB cần kiểm thử ra `src/services/vehicsim/aeb_stack.py`; `simulator.py` chỉ
   còn "thế giới" + `make_frame`/`MotionStats`/`build_outcome` dùng chung.
2. `bundle.py`: định dạng `vehicsim.variant/v1` / `vehicsim.result/v1`, đọc cả Scenario IR
   trần, báo đủ mọi lỗi đầu vào một lần.
3. `worker/kinematic_sim.py`, `worker/run_variant.py` (CARLA), `worker/sim_common.py`:
   cùng tham số dòng lệnh, cùng file kết quả.
4. Backend: `GET /runs/{id}/bundle`; `VEHICSIM_SIMULATOR=carla` gọi CLI bằng tiến trình
   con có timeout, ghi `simulation_artifacts`; regression chép bộ mô phỏng của run
   baseline và chỉ lấy baseline của bộ mô phỏng đang cấu hình.
5. Frontend: nút "Tải JSON chạy CARLA" ở Chi tiết lỗi và Phát lại; tải Scenario IR ở
   Sinh từ mô tả.
6. Sửa luật chấm: va vào hông xe là va chạm, có nguyên nhân riêng
   `SIDE_ENTRY_NOT_PREDICTED` (trước đó có thể bị chấm thành phanh oan).

## Nhật ký quyết định

- **Không đổi schema.** Danh tính bộ mô phỏng dùng cột sẵn có `carla_version`; DB chưa
  ép cặp cùng simulator (TD-20).
- **Phiên bản CARLA lấy từ server**, không cố định: máy Windows dev có CARLA 0.9.16, máy
  Ubuntu của nhóm 0.9.15. Run yêu cầu `VEHICSIM_CARLA_VERSION`; lệch thì FAILED.
- **Không sửa điểm mù của AEB** (TD-18) dù đoạn chat đề xuất: sửa sẽ đổi kết quả của
  288/6.912 lượt trong lưới kiểm và làm baseline đã lưu không còn so được. Chờ nhóm chốt.
- **Không sửa dữ liệu cũ** (theo quyết định giữ nguyên data): 32 run cũ giữ nhãn của
  luật chấm cũ (TD-19).
- **Bỏ chỉnh ma sát lốp trong CARLA** vì đo thấy không có tác dụng trên 0.9.16; ghi rõ
  mưa chỉ có hình ảnh (TD-17) thay vì giữ code gây hiểu nhầm.

## Kiểm chứng

| Kiểm | Kết quả |
|---|---|
| Refactor AEB không đổi kết quả: 6.912 lượt (4 tốc độ × 3 trigger × 3 tốc độ người × 2 lề × 4 thời tiết × 2 giờ × 3 bộ tham số × 2 xe × 2 seed), hash outcome + chấm | Trước = sau: `ff2316d7…74ce` |
| Sửa luật chấm chỉ chạm ca va vào hông xe (so luật cũ từ `HEAD` với luật mới trên cùng lưới) | 288 lượt đổi, **0** lượt đổi ngoài ca va vào hông xe |
| `uv run pytest tests/test_vehicsim tests/test_worker tests/test_architecture.py tests/test_agent_docs.py tests/test_api/test_auth.py` | 221 passed, 1 skipped (skip có sẵn) |
| `npm run lint`, `npx tsc --noEmit` (frontend) | sạch |
| Python 3.12 không cài gói ngoài chạy `worker/kinematic_sim.py` (lõi chỉ cần thư viện chuẩn) | chạy được |
| **Luồng thật:** API web xuất `vehicsim-run-1055.json` (PX7-030, 60 km/h, chạng vạng, web ghi COLLISION/DECISION) | `kinematic_sim.py` ra đúng COLLISION, 14,6 km/h như web |
| Cùng file đó trên **CARLA 0.9.16** (Windows, AMD Radeon tích hợp, `-quality-level=Low`, Town10HD_Opt) | Chạy trong cửa sổ CARLA, camera bám xe; COLLISION 54,1 km/h: người đi bộ va vào hông xe sau khi đầu xe đã qua vạch → `SIDE_ENTRY_NOT_PREDICTED` |
| Biến thể 40 km/h, trigger 30 m trên CARLA | AEB phanh, dừng cách 3,1 m (động học: 3,7 m); `--video` ghi 85 khung PNG (máy không có ffmpeg) |
| Đo phanh xe CARLA (bàn đạp 1,0 từ 40 km/h) | e-tron ~4,6 m/s², Lincoln ~5,3, Tesla ~4,1; dưới ~6 m/s dừng ở 21–27 m/s²; đổi `tire_friction`/`max_brake_torque` không đổi kết quả |

Chưa kiểm: batch CARLA thật qua Celery (đã kiểm đường tiến trình con bằng CLI giả
`tests/test_vehicsim/fake_carla_cli.py`); CARLA 0.9.15 trên Ubuntu.

## Review chéo sau commit `d6551d6` (Antigravity · Gemini 3.1 Pro)

Toàn bộ test backend trên `d6551d6`: 725 passed, 35 skipped. Bốn phát hiện, từng cái
được đối chiếu trên code và CARLA thật:

| Phát hiện | Kết luận | Bằng chứng / xử lý |
|---|---|---|
| `enable_constant_velocity` nhận vector toàn cục, xe trượt ngang trên đường không hướng Đông | **Sai** | Đo trên hai đoạn yaw 90° và −90°: vận tốc dọc hướng xe 10,13 m/s, ngang 0,00 m/s — vector là hệ cục bộ |
| Timeout của `subprocess.run` giết cứng CLI, bỏ qua `finally`: CARLA giữ actor và kẹt chế độ đồng bộ | **Đúng** | Tái hiện: sau khi giết, `synchronous_mode=True`, còn xe + người đi bộ + cảm biến. Sửa 3 lớp: backend xin dừng (CTRL_BREAK / SIGTERM cả nhóm tiến trình), chờ `STOP_GRACE_S` rồi mới giết cả cây; CLI đổi tín hiệu thành `SystemExit` (mã 4); runner gắn `role_name=vehicsim_*`, khi khởi động gỡ chế độ đồng bộ + xoá actor sót, khi thoát luôn về không đồng bộ. Kiểm trên CARLA: dừng êm → sạch; giết cứng → lần chạy sau xoá 3 actor sót và gỡ đồng bộ. Máy kiểm: `test_hung_simulator_is_asked_to_stop_and_cleans_up` |
| `AebStack` cộng `ramp·dt` ngay ở tick bắt đầu phanh — phanh sớm 1 tick | **Không sửa** | Là quy ước mô hình có từ trước (refactor giữ nguyên từng bit); chênh ≤ 0,05 m/s; đổi sẽ làm mọi baseline đã lưu không còn so được |
| `ffmpeg` không có timeout | **Đúng, mức thấp** | Thêm `FFMPEG_TIMEOUT_S = 120`; quá hạn thì giữ ảnh PNG |

Khi sửa còn lộ thêm một bẫy: lúc server đang đồng bộ, `get_actors()` trả ảnh cũ (rỗng)
cho tới tick kế tiếp — phải gỡ đồng bộ và chờ một tick trước khi tìm actor sót.

## Bài học

- Chạy cùng biến thể trên một bộ vật lý khác là cách rẻ nhất để tìm lỗi trong luật
  chấm: ca va vào hông xe tồn tại trong dữ liệu động học từ trước (32 run) nhưng chỉ
  lộ ra khi CARLA cho người đi bộ tăng tốc dần.
- Tốc độ đọc từ CARLA trong chế độ đồng bộ có dạng răng cưa chu kỳ 2 tick; đạo hàm thô
  cho giảm tốc giả. Lấy trung bình 2 tick trước khi tin số.

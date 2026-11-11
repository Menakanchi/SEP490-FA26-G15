# Sửa công thức CP_CROSSING trên CARLA theo sổ tay công thức (11/11/2026)

**Trạng thái:** đang làm. **Nhánh:** `TuDM` (đã gộp `fix/carla-brake-calibration`, [ADR-051](../../adr/ADR-051-hieu-chuan-phanh-carla-xosc5.md)).
**Đầu vào:** sổ tay công thức của nhóm (HTML 10/11/2026), nay ở [cong-thuc-cp-crossing.md](../../vehicsim/cong-thuc-cp-crossing.md);
[sổ kiểm chứng nguồn](../../vehicsim/nguon-va-kiem-chung-du-lieu.md); quyết định 10/11/2026: CARLA là bộ mô phỏng chính, code bộ động học giữ nguyên.

**Phạm vi:** dựng kịch bản (`XoscExport`) và run CARLA (`CarlaSession`). **Ngoài phạm vi:** MOBO (`core/mobo`, `OptimizationService`,
khoảng tham số) và phần phân tích kết quả / lỗi (`Evaluation`, các service màn 3) — chỉ ghi bàn giao. Không đổi kết quả bộ động học:
`KinematicParityTest`, `BundleParityTest` phải xanh mà không sửa.

## Quyết định cần chốt

| # | Câu hỏi | Đề xuất | Trạng thái |
|---|---|---|---|
| D1 | Đổi thời tiết + $a_{avail}$ gộp vào `.xosc` v5 (ADR-051) hay lên v6 | Gộp v5 nếu chưa có run `-xosc5` nào ngoài kiểm chứng ADR-051 | **Chờ tác giả ADR-051.** Code hiện gộp vào v5; v5 chưa lên `main` |
| D2 | Mưa trên CARLA: R1 kẹp lệnh bàn đạp ở μ·g / R2 mưa chỉ là hình ảnh | R1 | Chờ đo (bước 1) |
| D3 | RMS jerk: phía run chỉ đo, không đổi định nghĩa | Có | Đề xuất |
| D4 | Hành lang theo bề rộng xe, chỉ áp cho CARLA | Có | Chờ |
| D5 | Đổi mặc định `VEHICSIM_SIMULATOR` chỉ trong `.env.example` | Có | Chờ |
| D6 | μ RAIN 0,65 cho họ tạo mới; không UPDATE dữ liệu cũ | — | **Chốt 11/11** (người dùng) |

## Việc và trạng thái

| Bước | Việc | Trạng thái |
|---|---|---|
| 0 | Nền: gộp ADR-051 vào `TuDM` (`541fa1d`, không xung đột) | Xong; chưa push |
| 1 | Đo CARLA trước khi đổi hành vi mưa: e-tron 40 / 60 km/h × CLEAR / RAIN / HEAVY_RAIN; ghi `max_deceleration_mps2`, `decel_clamped_frames`, `rms_jerk_mps3`, `jerk_filtered`, `physics_applied.wheels[].tire_friction`, giảm tốc IMU; kiểm preset `carla.WeatherParameters` | Chưa làm (cần máy CARLA) |
| 1b | μ RAIN 0,65 (`Vs.WEATHER_FRICTION`); bảng dự phòng `CrossingCase` giữ 0,70 | **Xong** |
| 2 | Thời tiết theo preset CARLA (`XoscExport.sunIntensity`, `rainIntensity`, `sunElevationRad`) | **Xong**; preset chưa kiểm trên máy CARLA |
| 3 | $a_{avail}$ trên CARLA = min(MAX_DECEL, xe DB, μ·g, phanh 100% đo được), chỉ file định dạng hiện hành (`CarlaSession.decelAvailable`) | **Xong** |
| 4 | Mưa trên CARLA theo D2 | Chờ bước 1 |
| 5 | Hành lang theo bề rộng xe (D4) | Chờ |
| 6 | Cấu hình mặc định (D5) | Chờ |
| 7 | Gate + nghiệm thu CARLA thật | Gate xong cho bước 1b–3; CARLA chưa |
| 8 | Tài liệu repo (ADR-051 bổ sung, CLAUDE.md, sổ kiểm chứng, sổ tay `.md`) | Một phần (mục Kiểm chứng) |
| 9 | Chạy lại baseline CARLA bằng `-xosc5` (sau migration 014 trên từng máy) | Chưa làm |

## Bàn giao (ngoài phạm vi)

- **Màn 3 (`Evaluation`):** từ bước 3, `decel_available_mps2` trên CARLA có thể nhỏ vì xe chưa hiệu chuẩn (Tesla 3,56) chứ không vì đường;
  khâu Động lực học vẫn báo `LOW_FRICTION`. Cần mã riêng "do xe" (số phanh 100% ở `case.carla.full_brake_decel`); TTC cần (sổ tay CT 33)
  nên dùng $a_{avail}$ cho cả thời gian tăng lực. Trong lúc chờ chỉ chạy CARLA bằng e-tron.
- **Màn 3 + MOBO:** định nghĩa RMS jerk trên CARLA (bỏ đoạn dừng gấp < 6 m/s, bộ lọc); giữ hay loại biến thể FOG / HEAVY_RAIN ban đêm.

## Kiểm chứng

**11/11/2026 — bước 0.** Gộp `origin/fix/carla-brake-calibration` vào `TuDM`: `.\mvnw.cmd -B clean test` 565 test, 0 lỗi, 1 bỏ qua;
`python -m ruff check worker` sạch; `python -m pytest worker/tests -q` 59 qua.

**11/11/2026 — bước 1b, 2, 3.** `.\mvnw.cmd -B clean test`: 573 test, 0 lỗi, 1 bỏ qua (thêm 8 test:
`XoscExportTest.weatherFollowsTheCarlaPresetsAsScenarioRunnerReadsThem` ×6, `cloudyNoLongerLooksLikeClear`,
`CarlaSessionLogicTest.decelAvailableUsesTheMeasuredFullBrakeOnTheCurrentFormatOnly`). `KinematicParityTest` và `BundleParityTest`
xanh không sửa. Thay đổi test có chủ đích: `golden/cp-crossing.xosc` (ca RAIN/NIGHT: Sun 0.4 / −π/2, mưa 0.6);
`XoscReadParityTest` che `<Sun>` và `<Precipitation>`, phần còn lại vẫn trùng từng byte với Python.

**Ảnh hưởng μ 0,65 (bộ động học, bundle ghi μ tường minh, người 1,5 m/s, kích hoạt 25 m, seed 48001):** 40 km/h dừng cách vạch
2,72 → 2,15 m, quãng phanh 9,76 → 10,33 m; 50 km/h va 3,0 → 12,9 km/h; 60 km/h va 41,4 → 42,4 km/h; ca kích hoạt 15 m (không kịp hoặc
không cần phanh) không đổi. Giảm tốc tối đa 6,87 → 6,38 m/s².

**Chưa kiểm:** số preset thời tiết trên CARLA thật; thời tiết có đổi vật lý CARLA 0.9.16 không (sổ kiểm chứng M7); toàn bộ nghiệm thu CARLA.

# Dung sai chạy lặp, vòng đời run và bước 100 Hz của CARLA (20/10/2026)

**Trạng thái:** đang làm. Phần của Thành viên 2 trong
[kế hoạch 20/10](../../vehicsim/ke-hoach-sua-theo-pdf-va-quyet-dinh-2026-10-20.md): chạy baseline AEB mặc định,
đo dung sai chạy lặp, hủy/timeout/dọn actor. Bước 100 Hz đã làm (mục 5); chưa làm perception từ sensor.

## 1. Dung sai chạy lặp (AEB mặc định, 20 Hz)

- Đầu vào: `scenario.xosc` của run 1584 (CP_CROSSING, seed 48846), `TTC_THRESHOLD=1.5`, `BRAKE_ACTIVATION_DELAY=0.15`,
  `MAX_DECELERATION=8.0`, `BRAKE_BUILDUP_RATE=20.0`. Profile `carla-0.9.16-xosc2`, CARLA 0.9.16 Town04, ScenarioRunner `v0.9.16`.
- 9 lần chạy tuần tự, một server, bằng `worker/run_xosc.py` ngoài web (không ghi DB). Mỗi run ~40 s.
- Cả 9 lần: `EGO_STOPPED`, `NEAR_MISS`, không va chạm. Thời điểm quyết định AEB (2,30 s), bắt đầu phanh (2,55 s) và
  độ trễ phanh (0,25 s) **giống hệt** ở cả 9 lần: phần quyết định của AEB tái lập; phần dao động nằm ở vật lý CARLA.

| Chỉ số | Trung bình | Độ lệch chuẩn | Khoảng (max − min) | CV |
|---|---|---|---|---|
| Quãng dừng (m) | 10,269 | 0,141 | 0,325 | 1,4 % |
| Khoảng cách tối thiểu (m) | 2,996 | 0,112 | 0,259 | 3,7 % |
| TTC tối thiểu (s) | 0,610 | 0,009 | 0,019 | 1,5 % |
| Gia tốc phanh trung bình (m/s²) | 5,376 | 0,068 | 0,229 | 1,3 % |
| RMS jerk (m/s³) | 20,825 | 1,961 | 4,565 | 9,4 % |
| Jerk lớn nhất (m/s³) | 92,787 | 20,590 | 47,486 | 22,2 % |

- Kết quả **rời rạc theo hai nhóm**, không phải nhiễu liên tục: quãng dừng 10,16 m (5/9 lần) hoặc 10,30–10,49 m;
  RMS jerk 21,9 (6/9) hoặc 17,4 (2/9). Nhóm khác nhau thường đi cùng số khung hình khác nhau (78 hoặc 79).
- **Giới hạn của phép đo:** một kịch bản, một seed, một tham số AEB, n = 9, bước 0,05 s. Chưa phải dung sai cho phép
  phê duyệt định lượng. Phải đo lại sau khi đổi bước thời gian sang 0,01 s.
- Hệ quả cho tối ưu: chênh lệch nhỏ hơn khoảng quan sát (quãng dừng 0,33 m, RMS jerk 4,6 m/s³) chưa phân biệt được với
  nhiễu chạy lặp; jerk lớn nhất quá nhạy để làm căn cứ so sánh (không nằm trong ba objective).
- Mỗi run, ego luôn nhận actor id 147: world được dọn sạch giữa các run. Log luôn có một dòng
  `failed to destroy actor 147 ... not found` ở cuối (ScenarioRunner huỷ ego hai lần); vô hại, xuất hiện cả 9/9 lần.

## 2. Vòng đời run

Thay đổi: `RunService.cancelRun`, `POST /runs/{id}/cancel`, file cờ `stop.requested`, `run_xosc.release_world`,
`wait_for_exit`, `lifecycle.json`. Mô tả hành vi ở [carla-local.md](../../vehicsim/carla-local.md).

Phát hiện: `Process.destroy()` của Java trên Windows là giết cứng, nên đường "dừng mềm → SIGBREAK → `finally` dọn dẹp"
cũ không chạy trên Windows; timeout để lại actor và server kẹt đồng bộ. File cờ thay cho tín hiệu.

Bằng chứng thật trên CARLA 0.9.16 (chạy `run_xosc.py` trực tiếp, thư mục `data/lifecycle-*-20261020/`):

| Tình huống | Kết quả |
|---|---|
| Ghi cờ dừng ở giây thứ 14 của run | Thoát mã 4; `stopped=true`; không có `result.json`; world có 4 actor sót do ScenarioRunner bị dừng, đã xoá |
| Run ngay sau lần hủy | `destroyed_before=0`; RMS jerk 21,936, quãng dừng 10,16 m: nằm trong phân bố ở mục 1 |
| Giết cứng `run_xosc.py` + ScenarioRunner + `follow_hero.py` ở giây thứ 14 | Không có `result.json`; world còn 9 actor |
| Run kế tiếp | `destroyed_before=9`, tự dọn rồi chạy hợp lệ; RMS jerk 21,937, quãng dừng 10,16 m |

Kiểm thử tự động: `worker/tests/test_run_xosc_lifecycle.py` (6 test), `CarlaWebTest` (5 test hủy mới); `mvnw clean test` 127 qua.

Qua HTTP đầu cuối (tài khoản ENGINEER local, backend + CARLA thật, runs 1782–1785): `POST /runs/{id}/carla` → RUNNING →
`POST /runs/{id}/cancel` trả 202 `STOPPING` → run thành STOPPED sau 2,2 s với `Cancelled by user`; thư mục run có
`stop.requested`, `lifecycle.json` `{"destroyed_before":0,"destroyed_after":4,"stopped":true}`, **không có `result.json`**.
Hủy lần hai trả 400 ("Run is already STOPPED"), run không tồn tại 404, không token 401. Run replay kế tiếp: COMPLETED,
`destroyed_before=0`.

Phân quyền thật qua HTTP: MANAGER và REVIEWER nhận 403 ở cả `cancel` và replay (chỉ đọc, 200 ở danh sách run);
EXPERIENCER replay (202) rồi hủy (202 → STOPPED).

## 3. Backend khởi động lại giữa run (run 1787): lỗ hổng còn mở

Giết cứng JVM backend (`Stop-Process -Force`, đúng cách `dev-carla.ps1 -RestartBackend` dừng backend) khi run đang RUNNING:

| Quan sát | Kết quả |
|---|---|
| Tiến trình worker | `run_xosc` + ScenarioRunner + `follow_hero` **sống sót** (mồ côi), chạy tiếp tới hết |
| Kết quả mồ côi | Ghi `result.json` hợp lệ và `lifecycle.json` sạch; DB **không được cập nhật** |
| Hàng DB | Kẹt `RUNNING` (`started_at` cũ, không `ended_at`) |
| `POST /runs/1787/cancel` sau restart | 400 `Run is RUNNING but not held by this backend process; it cannot be cancelled safely` |
| UI | Hàng vẫn "Đang chạy" kèm nút Hủy; bấm sẽ hiện thông báo 400 đã dịch |

`recoverUnfinished` chỉ chạy **lúc khởi động** và chỉ reset RUNNING quá `2 × simulation-timeout-s` (600 s với `dev-carla.ps1`),
rồi chạy lại cả run (bỏ `result.json` mồ côi). Hệ quả: một run mồ côi mới hơn ngưỡng đó nằm RUNNING cho tới lần restart sau
ngưỡng, và `CARLA_LOCK` chỉ có hiệu lực trong một JVM nên sau restart không có gì ngăn run mới chạy cùng worker mồ côi
(lúc đó `release_world` của run mới sẽ xoá actor của nó). Em **không vá** trong đợt này vì cách xử lý cần quyết định:
đọc lại `result.json` mồ côi hay chạy lại; có nên để backend dò tiến trình worker còn sống. Hàng 1787 (run test) đã được
đóng thành STOPPED bằng SQL sau khi xác nhận không còn tiến trình worker.

### Đã xử lý (cùng ngày)

- `RunService` ghi `worker.pid` (`{"pid","start_epoch_ms"}`) khi chạy CARLA. `recoverUnfinished` (chỉ chạy lúc khởi động) coi mọi run
  RUNNING là mồ côi: dừng worker còn sống dưới `CARLA_LOCK` (cờ `stop.requested`, quá 15 s mới giết cả cây), đưa run về PENDING và
  chạy lại; bỏ ngưỡng `2 × timeout`. Chạy lại thay vì nhận `result.json` mồ côi vì không xác minh được worker đã hoàn tất, trong khi
  ba mục tiêu chính thức (RMS jerk, quãng phanh, vận tốc va chạm) phải đến từ run hợp lệ.
- `POST /runs/{id}/cancel` trên run RUNNING mồ côi: 202 `STOPPING`, dừng worker còn sống rồi đóng STOPPED.
- Bằng chứng thật: (A) run 1792 RUNNING → giết backend → worker 38480 vẫn sống → khởi động lại → run được nhặt lại ngay bằng worker mới
  (PID 37512), COMPLETED với kết quả hợp lệ, worker cũ không còn. Nhánh này chỉ kiểm khi worker cũ **đã tự chạy xong** trước lúc backend lên
  (khởi động mất vài phút). (B) Nhánh worker còn sống kiểm bằng hàng DB RUNNING dựng tay (run 1791) + worker `run_xosc.py` thật: hủy qua
  HTTP → `stop.requested` → thoát mã 4, `lifecycle.json` `stopped:true` → STOPPED sau 6 s, không có `result.json`. Đây **không phải** tình huống
  tự nhiên. Test đơn vị dùng tiến trình thật cho nhánh giết quá hạn và nhánh PID bị tái dùng (không giết nhầm tiến trình lạ).
- **Còn hở:** một run mồ côi mới (người dùng bấm tạo run trong lúc khởi động) vẫn có thể thấy worker mồ côi trong vài giây trước khi
  `recoverUnfinished` giữ khóa; `release_world` của run mới sẽ xoá actor của worker đó. Giả định một backend cho mỗi DB.

## 4. Nút hủy trên UI (`/analysis/carla`)

`CarlaRunnerPanel`: nút **Hủy** cho run PENDING/RUNNING (cần quyền ghi), nhãn STOPPED "Đã hủy", thông báo backend được dịch
qua `vi()`. Kiểm bằng Playwright + Chrome trên app thật (run 1789): dòng chuyển "Đang chạy · Hủy" → "Đã hủy · Đã hủy theo yêu cầu".
`npm run lint`, `npx tsc --noEmit`, `npx next build` đều qua. **Không đối chiếu được Figma** (không dùng file thiết kế
trong đợt này); nút theo mẫu liên kết hiện có của hàng run. Lần kiểm đầu của em báo sai (khớp nhầm nhãn "Đã hủy" của dòng cũ)
và đã làm lại với bộ chọn theo đúng dòng.

**Chưa làm:** hủy theo lô, hủy run của regression/tối ưu (backend từ chối).

## 5. Bước 0,01 s (100 Hz): kế hoạch 20/10, D3

Profile mới `carla-0.9.16-xosc3` (định dạng `vehicsim.xosc/v3`). Không ghép với `-xosc2` (20 Hz); bộ động học không đổi.

**Đã thay đổi**
- File `.xosc` mang `vs_fixed_delta_seconds=0.01` và `vs_perception_period_s=0.05`; `run_xosc.py` truyền `--frameRate 100`;
  controller, `MotionStats`, `DecelMeter`, `brake_phase_metrics`, recorder (ảnh camera theo thời gian, không theo số khung) dùng cùng bước.
- `RunService`: `fixed_delta_seconds` theo simulator (0,0100 cho xosc3, 0,0500 còn lại; không cần migration vì cột là `decimal(6,4)`);
  run `-xosc1`/`-xosc2` chưa chạy bị từ chối. File v2 vẫn chạy được bằng `run_xosc.py` ở 20 Hz để tái lập bằng chứng cũ.
- **Lõi AEB dùng chung:** `AebStack` nhận `perception_period_s`. Rà soát phát hiện ba chỗ phụ thuộc số khung sẽ đổi hành vi
  khi tăng tần số: độ trễ perception (`lag_frames`, chỉ đúng khi truyền `dt`), nhiễu `rng.gauss` rút **mỗi khung** (gấp 5 lần cơ hội
  vượt ngưỡng phát hiện) và bộ lọc vận tốc `0,6·prev + 0,4·x` có hệ số theo khung. Cách xử lý: perception và quyết định chạy
  theo chu kỳ cảm biến 0,05 s (mặc định = bước cũ), lệnh phanh/đo/ghi chạy mỗi 0,01 s. **Đây là một lựa chọn mô hình, chưa
  phải quyết định của nhóm**: nếu nhóm muốn perception chạy 100 Hz thì phải chỉnh lại nhiễu và bộ lọc theo thời gian.
- Bằng chứng nhánh động học không đổi: sha256 `result.json` của 6 ca (3 bundle × 2 seed) trước và sau sửa lõi giống nhau;
  96 → 103 test worker qua.

**Đã xác nhận bằng số đo thật (CARLA 0.9.16, run `data/hz100-20261020/`)**: bước controller đo từ timestamp là đúng 0,01 s ở cả 381
khoảng (min = max = 0,01); `frames.csv` 383/383 khoảng 0,01 s; ảnh camera vẫn cách nhau 0,25 s (16 ảnh). Thời gian chạy ~34 s
(20 Hz ~41 s). `result.json` 91 KB so với 21 KB (4,3×), vì `frames` mang mỗi khung 0,01 s.

**Dung sai ở 100 Hz** (9 lần, cùng file, AEB mặc định) so với 20 Hz (mục 1):

| Chỉ số | 100 Hz trung bình | sd | khoảng | 20 Hz trung bình | sd | khoảng |
|---|---|---|---|---|---|---|
| Quãng dừng (m) | 10,288 | 0,066 | 0,175 | 10,269 | 0,141 | 0,325 |
| Khoảng cách tối thiểu (m) | 3,506 | 0,057 | 0,152 | 2,996 | 0,112 | 0,259 |
| TTC tối thiểu (s) | 0,674 | 0,004 | 0,012 | 0,610 | 0,009 | 0,019 |
| Gia tốc phanh trung bình (m/s²) | 5,164 | 0,031 | 0,087 | 5,376 | 0,068 | 0,229 |
| RMS jerk `Δa/dt` (m/s³) | 38,363 | 0,061 | 0,194 | 20,825 | 1,961 | 4,565 |
| Quyết định AEB / bắt đầu phanh (s) | 2,25 / 2,50 (9/9) | 0 | 0 | 2,30 / 2,55 (9/9) | 0 | 0 |

- Dao động chạy lặp **giảm khoảng một nửa** ở 100 Hz và không còn hai nhóm rời rạc (quãng dừng 10,20–10,38 m).
- Số đo ở hai tần số **khác nhau có hệ thống**: quyết định/phanh sớm hơn 0,05 s, khoảng cách tối thiểu tăng 0,5 m, TTC +0,06 s. Vì
  thế baseline phải chạy lại ở xosc3 trước khi so với candidate; không dùng baseline 20 Hz.
- **RMS jerk `Δa/dt` không so sánh được giữa hai tần số** (38,4 so với 20,8): đạo hàm sai phân của chuỗi lấy mẫu mịn hơn.
  Số đã lọc Butterworth 10 Hz bậc 2 (causal) trên cùng tín hiệu `ego_a` là **19,9** m/s³ ở 100 Hz, cùng bậc với số 20 Hz và với giới
  hạn tăng lực phanh `JERK_LIMIT_MPS3 = 20`. Số này ghi ở `case.carla.jerk_filtered` (trạng thái `EXPERIMENTAL`), không thay `rms_jerk_mps3`.

**Việc cần Thành viên 3 / nhóm chốt trước khi coi 100 Hz là hoàn chỉnh theo D3:**
1. Bậc lọc, causal hay offline, khởi tạo biên, nguồn gia tốc (`ego_a` do `DecelMeter` tính từ tốc độ, hay IMU, hay ground truth) và
   cửa sổ pha phanh (mục 5.3 của kế hoạch). Em cố ý không đổi objective chính thức `rms_jerk_mps3`.
2. Dùng số jerk đã lọc làm objective thì cần phiên bản đánh giá mới và chạy lại baseline/candidate; `TelemetryMetricsService` (Java)
   vẫn tính jerk từ IMU làm mượt 0,1 s, chưa thống nhất với worker.
3. Perception 20 Hz so với 100 Hz (lựa chọn mô hình ở trên).
4. Dung sai chấp nhận được để phê duyệt định lượng; mới đo một kịch bản, một seed.

**Chưa làm:** chạy 100 Hz với camera dày hơn/nhiều biến thể (thời gian chạy theo lô chưa đo), ADR cho profile xosc3 (ADR-041 vẫn
Proposed, em không sửa trạng thái), và kiểm lại `/analysis/failures` playback với 5× số khung.

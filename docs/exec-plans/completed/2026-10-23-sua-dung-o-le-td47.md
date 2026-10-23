# 23/10/2026 — Sửa người đi bộ "dừng ở lề" trên CARLA (TD-47), tách identity `-xosc4`

Phần của Thành viên 1 (thiết kế kịch bản) trong [kế hoạch 20/10](../../vehicsim/ke-hoach-sua-theo-pdf-va-quyet-dinh-2026-10-20.md):
"xử lý hành vi dừng ở lề trước khi dùng để chấm". Mọi họ kịch bản tạo từ mô tả đều tự thêm ca dừng ở lề để đo phanh oan, nên lỗi này
làm hỏng số phanh oan của các màn sau. Không đổi schema; bộ động học không đổi (vốn đã dừng đúng ở `CURB_STOP_Y_M`).

## Tái hiện (CARLA 0.9.16 thật, Town04, ScenarioRunner v0.9.16)

`.xosc` v3 của ca 40 km/h, kích hoạt 25 m, người đi bộ 1,5 m/s, `stops_at_curb = true`: người đi bộ qua điểm dừng −2,25 m và đi tiếp vào làn
tới −0,47 m (xe phanh tới `EGO_STOPPED`) — AEB phanh đúng chứ không phải phanh oan, nên ca này cho số sai.

## Nguyên nhân (đọc mã ScenarioRunner 0.9.16)

- `PedestrianControl.run_step` bỏ waypoint khi còn cách **< 1,0 m** theo mặt phẳng ngang; hết waypoint thì đi tiếp theo hướng hiện tại với tốc độ
  đích. Waypoint cuối đặt đúng lề nên action `CrossRoad` kết thúc sớm ~1 m và người đi bộ không bao giờ dừng.
- Hai cách đã thử / loại:
  - `Condition delay` (event dừng dùng cùng điều kiện khoảng cách, trễ đúng thời gian đi): **sai** — ScenarioRunner dựng `delay` thành
    `TimeOut` chạy trước rồi mới kiểm điều kiện, tính từ đầu kịch bản, nên event dừng chạy cùng tick với event bắt đầu đi; trên CARLA người đi bộ
    đứng yên từ đầu (`ped_y` −3,6 suốt run).
  - `ReachPositionCondition`: khoảng cách 3D (`location.distance`) giữa tâm người đi bộ (cao ~0,9 m) và mặt đường → phải nới tolerance > 0,9 m,
    điểm dừng không chính xác. Không dùng.

## Sửa (`XoscExport`, chỉ ca `stops_at_curb`)

1. Waypoint cuối = `CURB_STOP_Y_M + 1,0 − v × 0,07 s` (bán kính "đã tới" của controller, trừ quãng trượt sau khi đặt tốc độ 0).
2. Event `StopAtCurb` (`priority="parallel"`, để không dừng `HoldMeasurement` đang giữ Act mở): `SpeedAction` 0 khi
   `StoryboardElementStateCondition(action "CrossRoad", endTransition)`.
3. Ca băng ngang: không có event mới, XML giống v3 từng byte trừ `vs_format`.

Hằng số 0,07 s đo trên CARLA: trước khi bù, 0,8 / 1,5 / 3 m/s trượt quá lề 0,04 / 0,10 / 0,21 m (≈ v × 0,07 s).

## Identity

Kết quả CARLA của ca dừng ở lề đổi ⇒ theo AGENTS.md tách identity: `vehicsim.xosc/v4`, hậu tố `-xosc4` (`Xosc.FORMAT`, `RunService` dùng
`Xosc.SIMULATOR_SUFFIX`). v3 thành `PREVIOUS_FORMAT` / `-xosc3`: `run_xosc.py` vẫn đọc file v3 ngoài web với identity của nó; backend không chạy lại run
`-xosc3` (báo lỗi, tạo lượt mới — như `-xosc1`/`-xosc2`) và không ghép với `-xosc4`; `stepFor` giữ 0,01 s cho cả hai. Frontend `CarlaRunnerPanel` nhận mọi
profile `-xosc<n>` thay vì cứng `-xosc3` (nếu không nút "Chạy trên CARLA" bị khoá với backend mới).

## Fixture và test

- `src/test/resources/parity/xosc.json` giữ nguyên là đầu ra Python (v3). `XoscReadParityTest`: ca băng ngang so với Python thay `vs_format`; 3 ca dừng ở lề
  (`export 2`, `5`, `16`) so với `xosc_v4_stops_at_curb.json` **sinh từ bộ xuất Java** (ghi ở README của fixture).
- Golden `cp-crossing.xosc` (ca băng ngang) chỉ đổi `vs_format`.
- `XoscExportTest`: hình học waypoint mới; event `StopAtCurb` (song song, tốc độ 0, tham chiếu đúng action `CrossRoad`); ca băng ngang không có event;
  file v3 đọc được với `-xosc3`. `CarlaWebTest`: identity mới, `xosc3` vào danh sách profile cũ bị từ chối chạy lại. Bridge/worker test dùng v4.

## Kiểm chứng (23/10/2026)

- CARLA thật, `run_xosc.py` ngoài web (`ped_y` cuối, vận tốc người đi bộ cuối = 0, đứng tới hết run):
  1,5 m/s → −2,256 m; 3 m/s → −2,255 m; 6 m/s → −2,381 m (dừng sớm 0,13 m, vẫn trên vỉa hè, cách mép làn −1,75 m).
- Toàn luồng qua web (backend `VEHICSIM_SIMULATOR=carla-xosc`, MySQL docker): họ 2 biến thể, `run_baseline` → cả hai run `COMPLETED` với
  `simulator_version = carla-0.9.16-xosc4`; playback: ca băng ngang người đi bộ vẫn đi qua (−0,66 m, 1,5 m/s), ca dừng ở lề đứng ở −2,256 m.
- `mvnw clean test`: 373 test, 0 lỗi, 1 skip có sẵn. `pytest worker/tests`: 52 qua; `ruff` qua. Frontend lint / `tsc` qua.

## Giới hạn

- Hằng số 0,07 s đo ở 0,8–6 m/s trên một máy, một map, một mẫu người đi bộ (`walker.pedestrian.0001`); đổi mẫu người đi bộ / phiên bản CARLA thì đo lại.
- Run CARLA `-xosc3` đã có của ca dừng ở lề **không** dùng làm bằng chứng phanh oan; cần chạy lại baseline CARLA bằng `-xosc4`.
- Report 7 của màn "Chạy baseline" (Thành viên 2) còn ghi TD-47 là giới hạn — để Thành viên 2 cập nhật khi chốt báo cáo.

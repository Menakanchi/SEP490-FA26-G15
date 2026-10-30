@AGENTS.md

# Bàn giao và vận hành VehicSim cho thành viên mới

Đọc [AGENTS.md](AGENTS.md) trước để biết bản đồ code và các bất biến. File này bổ sung cách dựng máy,
kiểm tra luồng và xử lý những bẫy vận hành đã gặp; dùng chung cho thành viên và trợ lý lập trình.

## 1. Hiểu đúng trạng thái bàn giao

- Backend hiện tại là Spring Boot Java 21; frontend Next.js; AEB/mô phỏng/chấm điểm ở lõi Java `com.vsos.core` (ADR-042);
  Python `worker/` chỉ còn adapter CARLA (ScenarioRunner, sensor, áp bàn đạp).
  MySQL là database nghiệp vụ duy nhất; Redis phục vụ OTP và giới hạn tần suất. Không khởi động FastAPI/Celery cũ.
- Đã có: mô tả → sinh biến thể → baseline → phân tích lỗi → candidate chỉnh tay → regression → Reviewer quyết định.
- Đã có: xuất `.xosc` và chạy ScenarioRunner/CARLA 0.9.16 từ web, ghi kết quả và ảnh/cảm biến theo từng run.
- Mục tiêu bàn giao 5 màn: thiết kế → chạy baseline → phân tích → **tối ưu AEB** → kiểm thử/phê duyệt.
  Vòng MOBO tự đề xuất/thử tham số và Pareto chưa được triển khai; có bảng DB/chỉ số không có nghĩa đã có thuật toán.
- Phạm vi, điểm nối và nghiệm thu của từng phần nằm trong
  [phân chia 5 thành viên](docs/vehicsim/phan-chia-cong-viec-5-thanh-vien.md).
  Tên người, deadline và tiến độ theo GitHub Issues/Project; không ghi tiến độ cá nhân vào file này.
- [Kế hoạch sửa theo PDF ngày 20/10](docs/vehicsim/ke-hoach-sua-theo-pdf-va-quyet-dinh-2026-10-20.md) chốt 5 quyết định
  (D1–D5: trial MOBO chấm bằng CARLA, gia tốc có hướng, 100 Hz + lọc 10 Hz, Engineer chọn/Reviewer duyệt, giữ ca an toàn).
  Chỗ nào khác bản phân chia thì theo kế hoạch này; đây là việc cần làm, không phải tính năng đã có.
- Phần tối ưu và regression cần chốt chung cấu hình tiêu chí: ADR-040 mô tả phanh oan tăng ≤ 5 điểm %,
  `RegressionService` hiện mặc định 0,5 điểm % và bắt buộc không va chạm mới (TD-48).
  Không tự đổi ngưỡng khi nhận bàn giao; candidate thuộc Pareto vẫn cần kiểm thử xác minh.
  Cập nhật 20/10/2026: test regression mới mặc định 5 điểm % (hằng `RegressionCriteria.DEFAULT_FALSE_ACTIVATION_MAX_PTS`, `RegressionService` giữ tên cũ làm bí danh;
  [ADR-044](docs/adr/ADR-044-nguong-phanh-oan-regression-5-diem.md)). ADR này mới ở trạng thái **Proposed**: cần Người 4 (tối ưu) và nhóm xác nhận trước khi coi là quyết định chung.
  Test đã tạo giữ ngưỡng đã lưu, nên "0,5 điểm %" ở trên là trước thay đổi này.

## 2. Dựng máy Windows lần đầu

Cài Git, Docker Desktop, **JDK 21**, **Node.js 22** (khớp CI), Python ≥ 3.10 cho adapter CARLA và `pytest` của worker.
CARLA trên Windows cần thêm **Python 3.12** và CARLA server 0.9.16; venv riêng ở phần 5.
Maven dùng wrapper trong repo, không bắt buộc cài Maven toàn cục.

Chạy từ thư mục gốc repo; nếu máy mới chưa có `.env`, tạo từ mẫu:

```powershell
Copy-Item .env.example .env
Push-Location frontend
npm ci
Pop-Location
```

- Mỗi thành viên tự điền `.env`; không lấy hoặc commit khóa/token/tài khoản của người khác.
  Khi chưa dùng LLM/SMTP, bỏ giá trị mẫu ở các khóa đó và để trống. Không có khóa LLM thì bước mô tả dùng bộ luật dự phòng.
- Chạy backend trực tiếp dùng MySQL/Redis tại `localhost`; backend trong Docker dùng hostname service `mysql`/`redis`.
  Khi đổi `MYSQL_USER`/`MYSQL_PASSWORD`, cập nhật cả `SPRING_DATASOURCE_USERNAME`/`SPRING_DATASOURCE_PASSWORD` tương ứng.
- Frontend mặc định gọi `http://localhost:8001` (`frontend/src/services/api.ts`). Chỉ khi backend ở địa chỉ khác mới
  cần tạo `frontend/.env.local` (repo chưa có file mẫu frontend riêng), ví dụ:

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:8001
```

`.env` và `frontend/.env.local` là cấu hình cá nhân, không vào git. `JWT_SECRET` bắt buộc khi `APP_ENV=production`.
Chỉ bước sinh từ mô tả gọi LLM thật qua `LlmService`; không thêm test gọi provider thật.

## 3. Database, tài khoản và lần chạy đầu

```powershell
.\scripts\dev-up.cmd
```

Script bật Docker/MySQL/Redis, backend `:8001`, frontend `:3000`. Lần đầu volume MySQL rỗng mới chạy
[01_schema.sql](database/mysql/01_schema.sql). Script không tự chạy migration cho database đã có.
Muốn nâng DB cũ: sao lưu, xác định phiên bản hiện tại, đọc điều kiện đầu mỗi file trong
[migrations](database/mysql/migrations/) rồi chỉ chạy các migration còn thiếu theo thứ tự.
DB mới dựng từ schema hiện tại không cần chạy lại toàn bộ lịch sử. Không dùng `docker compose down -v` để sửa schema.

Khi backend đang chạy, tạo tài khoản dev và dữ liệu mặc định:

```powershell
java -cp target/classes scripts/CreateAdmin.java --email admin@example.com --seed
java -cp target/classes scripts/CreateAdmin.java --email engineer@example.com --role ENGINEER
java -cp target/classes scripts/CreateAdmin.java --email reviewer@example.com --role REVIEWER
```

Chương trình (chạy bằng source-file mode của JDK 21, cần `target/classes` từ `mvnw compile`) hỏi mật khẩu, đăng ký qua API rồi đổi role bằng SQL qua service Docker `mysql` của repo.
`--seed` cần ADMIN và gọi bootstrap idempotent. Dùng email riêng của nhóm khi thực hiện trên máy thật.
Nếu đã đăng nhập trước khi đổi role, đăng xuất/đăng nhập lại để nhận token mới.

- Tự đăng ký nhận EXPERIENCER. ADMIN/ENGINEER/EXPERIENCER được thao tác tạo/chạy theo hạn mức.
- MANAGER đọc dữ liệu. REVIEWER đọc và là role duy nhất được Accept/Reject; ADMIN cũng không thay quyền Reviewer.
- API nghiệp vụ dùng tiền tố `/api/v1/vehicsim` và Bearer token. ADMIN có thể seed bằng `POST /api/v1/vehicsim/bootstrap`.
- Development mặc định đăng ký trực tiếp; OTP không có SMTP được ghi log ngoài production.
  Không dùng các thiết lập dev này cho môi trường công khai.

Kiểm tra backend tại `http://localhost:8001/health`, Swagger tại `http://localhost:8001/swagger-ui.html`,
web tại `http://localhost:3000`. Swagger chỉ có ngoài production.

## 4. Chọn chế độ chạy và kiểm tra lỗi khởi động

`scripts/dev-up.ps1` bỏ qua dịch vụ nếu cổng đã có tiến trình nghe. Chạy lại script không cập nhật môi trường backend cũ.
Sau khi sửa `.env` hoặc đổi Python/profile, khởi động lại đúng backend của repo; không dừng tiến trình lạ đang giữ cổng.

- Bộ động học: dùng terminal mới, đặt `VEHICSIM_SIMULATOR=kinematic` trong `.env`, rồi bật app.
  Bộ động học chạy ngay trong tiến trình Java, không cần Python.
- Backend riêng: `.\mvnw.cmd spring-boot:run`; Docker riêng: `docker compose up -d mysql redis`.
- CARLA `.xosc`: dùng phần 5 để script đặt đúng môi trường và khởi động lại backend.
- `Unresolved compilation problem`/`ClassFormatError`: IDE có thể đã ghi `.class` lỗi vào `target/`;
  dừng backend, chạy `.\mvnw.cmd clean` rồi build/chạy lại.
- Không kết nối được DB: kiểm tra `docker compose ps`, cổng `3306`, thông tin datasource và trạng thái migration.
- `/analysis/carla` báo chưa cấu hình: backend đang chạy thiếu `VEHICSIM_CARLA_COMMAND` hoặc chưa nhận profile mới.
  Chạy `dev-carla.ps1 -RestartBackend`; nút kiểm tra kết nối không tự sửa môi trường tiến trình Java.

## 5. CARLA 0.9.16 và OpenSCENARIO trên Windows

Chuẩn bị server CARLA 0.9.16 ở `C:\Carla_package`; script không tải server CARLA.
Chạy setup một lần, rồi dùng lệnh dev mỗi khi cần bật lại dự án với CARLA:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-carla.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\dev-carla.ps1 -RestartBackend
```

Setup dùng `py -3.12`, tạo `worker/.venv-carla/`, cài
[requirements CARLA](worker/requirements-carla-0.9.16.txt), clone ScenarioRunner tag `v0.9.16`
vào `$HOME\scenario_runner` nếu thư mục chưa có. Nếu dùng checkout có sẵn, tự kiểm đúng tag trước khi chạy.

Vị trí tùy chỉnh:

```powershell
.\scripts\setup-carla.ps1 -ScenarioRunnerRoot 'D:\Tools\scenario_runner'
.\scripts\dev-carla.ps1 -CarlaRoot 'D:\Tools\CARLA_0.9.16' -ScenarioRunnerRoot 'D:\Tools\scenario_runner' -RestartBackend
```

Script dev đặt `CARLA_ROOT`, `SR_ROOT`, Python venv, `VEHICSIM_SIMULATOR=carla-xosc`,
`VEHICSIM_CARLA_VERSION=0.9.16`, lệnh `run_xosc.py --camera` và timeout backend 300 giây cho tiến trình con.
Script không ghi lại `.env`; backend cũ trên `:8001` chỉ được dừng khi thuộc repo này và có `-RestartBackend`.
Nếu cổng `2000` chưa mở, server được bật vào Town04; app chạy nền. Đợi server nạp map rồi kiểm kết nối trên web.

Vào **Phân tích → Dữ liệu CARLA**, chọn một họ nhỏ, kiểm tra kết nối rồi chạy.
Một server chạy từng run lần lượt; không bật runner tay song song hoặc đổi map khi web đang chạy.
Lệnh kiểm tra/chạy ngoài web (dùng `--sr-root` nếu đường dẫn khác mặc định):

```powershell
worker\.venv-carla\Scripts\python.exe worker\run_xosc.py --status
worker\.venv-carla\Scripts\python.exe worker\run_xosc.py vehicsim-run-42.xosc --out data\manual-run --camera
```

`--status` phải báo client/server tương thích và có ScenarioRunner; server đang nghe cổng chưa đủ để kết luận sẵn sàng.
Chi tiết thao tác và API ở [CARLA local](docs/vehicsim/carla-local.md).

## 6. Hợp đồng artifact và cách hiểu kết quả

- Đường web hiện tại: bộ xuất Java (`XoscExport`) → `.xosc` → `run_xosc.py` → ScenarioRunner → `vehicsim_aeb_control.py`
  (chỉ đọc trạng thái CARLA, áp bàn đạp) → cầu nối `vsos-bridge/1` → cùng `AebStack` và luật chấm của lõi Java.
  Mỗi run chụp lõi thành `core/vsos-core.jar` riêng, nên `mvnw clean` giữa run không làm hỏng run đó.
- Artifact hiện tại là `vehicsim.xosc/v4`, profile `carla-0.9.16-xosc4` (bước 0,01 s; v4 = v3 + người "dừng ở lề" đứng lại, TD-47).
  File v1 phải xuất lại từ web; không ghép baseline `-xosc1`, `-xosc2` (20 Hz), `-xosc3` (người dừng ở lề đi vào làn), runner trực
  tiếp `carla-0.9.16` và `-xosc4`. Backend không chạy lại run `-xosc1`/`-xosc2`/`-xosc3`; `run_xosc.py` vẫn chạy file v2/v3 ngoài web.
- `.xosc` là đầu vào mô phỏng. JSON vẫn là hợp đồng nội bộ/result; không đổi đuôi JSON thành XML hoặc bỏ metadata seed/source.
  Runner CARLA trực tiếp nhận bundle JSON (`run_variant.py`) đã gỡ ở ADR-042; `run_xosc.py` từ chối `.json`. Chạy lại bundle bằng
  bộ động học: `java -cp target/classes com.vsos.core.bridge.BridgeMain kinematic <file>` (cần `mvnw compile`).
- File tải xuống `scenario.xosc` được giữ nguyên; wrapper tạo `scenario.runtime.xosc` để gắn đường dẫn controller local.
  Một run còn có `result.json`, `scenario_runner.log`, `follow_hero.log` và thư mục sensor.
- Xem CSV/ảnh trong `sensors/frames.csv`, `collisions.json`, `summary.json`, `camera/*.png`
  (recorder có thể đặt trong thư mục con theo lượt). Không ghi camera thì không có RGB/video để hiển thị.
- Mô phỏng hoàn tất và AEB không đạt là hai trạng thái khác nhau. Worker có thể thoát 0 dù phát hiện va chạm.
  Trong tiêu chí ScenarioRunner, `CollisionTest = FAILURE` báo có va chạm, không tự có nghĩa tiến trình bị crash.
  `GLOBAL RESULT` tổng hợp nhiều tiêu chí; đọc `result.json`, log và tiêu chí va chạm thay vì suy diễn từ một nhãn.
- Nộp kết quả từ máy khác phải dùng `.xosc` tải từ đúng run CARLA PENDING/FAILED có seed/source hợp lệ;
  regression chứa run đó hoặc dùng nó làm baseline cũng phải chưa chốt.
  File xuất thử từ IR chưa có run trong DB không thay thế được hợp đồng này.

## 7. Những bẫy CARLA phải giữ khi sửa code

1. **Quỹ đạo người đi bộ:** ScenarioRunner 0.9.16 áp Orientation trước `LanePosition.offset`.
   Thêm `h=π/2` xoay offset ngang thành dịch chuyển dọc. CP_CROSSING dùng hai điểm cùng `s`, khác offset,
   không đặt Orientation; controller tự quay theo waypoint. Sửa từ xosc2, kiểm CARLA thật ngày 19/10/2026; xosc3/xosc4 giữ nguyên hình học băng ngang.
2. **Phạm vi map:** bộ xuất hiện dùng Town04 road 40/lane -4 và lấy cao độ theo map.
   Không thay bằng WorldPosition phẳng hay đổi road/map mà chưa kiểm hình học, cao độ và dải tham số.
3. **Dừng ở lề (sửa ở xosc4):** PedestrianControl bỏ waypoint khi còn cách < 1,0 m rồi đi tiếp theo hướng cũ. Bộ xuất đặt
   waypoint cuối quá lề đúng 1,0 m trừ v × 0,07 s (quãng trượt đo được), và event `StopAtCurb` đặt tốc độ 0 khi action `CrossRoad`
   kết thúc (`StoryboardElementStateCondition`). Đừng thay bằng `delay` của Condition (ScenarioRunner tính delay từ lúc bắt đầu kiểm,
   không phải từ lúc điều kiện đúng) hay `ReachPositionCondition` (khoảng cách 3D, lệch độ cao tâm người đi bộ ~0,9 m).
4. **Phanh chưa hiệu chuẩn (TD-17):** CARLA có động lực học khác bộ động học. Số CARLA dùng quan sát/đối chiếu,
   không sửa số để khớp và không đưa vào báo cáo như bằng chứng regression hoặc chứng nhận an toàn.
5. **Sensor khởi tạo/va chạm:** 0,5 giây đầu có xung do đặt lại vị trí/tốc độ; sau va chạm IMU đo xung lực đâm.
   CSV vẫn giữ các khung khởi tạo/sau va chạm nhưng đã lọc số phi lý; jerk IMU được làm mượt 0,1 giây.
   Summary và `TelemetryMetricsService` loại các đoạn đó khi tính chỉ số phanh; không lấy đỉnh thô làm chỉ số phanh.
6. **Vòng tick:** ScenarioRunner giữ quyền tick; recorder dùng `wait_for_tick()`;
   spectator chỉ đọc trạng thái/cập nhật camera, không gọi `tick()`.
   `run_xosc.py` tự chạy camera bám xe và dùng Traffic Manager `8005`; đừng tạo thêm tiến trình giành quyền tick.
7. **Hủy và phục hồi (TD-37):** chưa có API/nút hủy hoàn chỉnh dù schema có STOPPED.
   Khi khởi động, backend nhặt PENDING và RUNNING quá hai lần timeout mô phỏng; đóng cửa sổ không đồng nghĩa hủy batch.
   `VEHICSIM_RECOVER_ON_STARTUP=false` chỉ chặn nhặt lại lúc khởi động, không hủy hàng đợi đang chạy.
   Không chỉ UPDATE trạng thái khi worker còn sống vì nó có thể ghi đè. Việc khôi phục thủ công cần dừng dispatch,
   dừng đúng cây worker, dọn actor/chế độ đồng bộ rồi cập nhật nhất quán; ghi bằng chứng vào exec plan.
8. **Không giết cứng runner để thử lại:** dọn dẹp nằm trong `finally`; giết giữa chừng có thể để server đứng hình
   ở synchronous mode. Đọc log và kiểm tiến trình trước; tránh chạy chồng hoặc vô tình khởi động lại cả batch.

Quan sát Linux lịch sử: máy có cả Intel iGPU/NVIDIA từng cần `__NV_PRIME_RENDER_OFFLOAD=1`
và `__VK_LAYER_NV_optimus=NVIDIA_only`; `-quality-level=Low` từng gây sập Town04 trên một cấu hình Linux,
trong khi script Windows hiện dùng được. Đây là dữ liệu chẩn đoán theo máy, không phải yêu cầu phần cứng chung.
Bản vá [AssignRouteAction](worker/patches/scenario_runner-0.9.16-assign-route.patch) thuộc quan sát ScenarioRunner cũ;
chỉ xem xét khi tái hiện đúng lỗi, không tự áp lên checkout đang chạy ổn.

## 8. Checklist khi bàn giao một phần code

- Đọc phạm vi thành viên, chốt ID/dữ liệu bàn giao với màn trước và sau; không đổi hợp đồng chung âm thầm.
- Dùng dữ liệu thật để chạy một tình huống xuyên màn; ghi rõ chức năng đã có, chưa có và nợ liên quan.
- Chạy gate phù hợp trong AGENTS; Java/worker test thường không cần DB, CARLA hoặc khóa LLM.
  Sửa UI phải xem UI thật. Sửa CARLA cần thêm lần chạy CARLA thật ngoài unit test.
- PR ghi thay đổi, cách dựng/chạy, kiểm chứng và giới hạn. Không đưa `.env`, token, DB dump, venv hoặc artifact `data/` vào git.
- Xem [nợ kỹ thuật](docs/exec-plans/tech-debt-tracker.md),
  [định nghĩa tham số/chỉ số](docs/vehicsim/aeb-parameter-ranges.md) và
  [kiến trúc](docs/vehicsim/architecture.md) trước khi mở rộng phạm vi.

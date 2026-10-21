# AGENTS.md — bàn giao VehicSim cho thành viên và AI agent

Đọc file này trước khi sửa repo. Đây là bản đồ code, điểm nối và bất biến;
chi tiết vận hành nằm ở [CLAUDE.md](CLAUDE.md). Hướng dẫn riêng cho frontend
nằm ở [frontend/AGENTS.md](frontend/AGENTS.md). Không suy ra tính năng đã có
chỉ từ tên màn hình, bảng DB hoặc tài liệu kế hoạch.

## Dự án và trạng thái hiện tại

VehicSim / VSOS (SEP490-FA26-G15) hỗ trợ kỹ sư kiểm thử, hiệu chỉnh AEB/FCW:
tạo tình huống giả lập phanh, phân tích lỗi, tạo candidate và kiểm chứng bằng regression.
Stack hiện tại: **Spring Boot Java 21 + Next.js 16 + MySQL (29 bảng) + Redis + adapter CARLA Python**.
Java xử lý REST/nghiệp vụ/DB và lõi AEB, mô phỏng, chấm điểm (`com.vehicsim.core`, ADR-042);
Python `worker/` chỉ gọi API CARLA và nói chuyện với lõi Java qua cầu nối stdio `vsos-bridge/1`.
Backend FastAPI và Scenario Forge đã gỡ; không khôi phục kiến trúc cũ khi làm tính năng mới.

Luồng mục tiêu 5 màn: **Thiết kế kịch bản → Baseline → Phân tích → Tối ưu AEB → Regression/Reviewer**.
Code đã có mô tả, sinh biến thể, baseline, phân tích, candidate thủ công và regression;
**MOBO/Pareto/Sensitivity/Robustness chưa triển khai** (TD-39, TD-06).
CARLA web đã có `.xosc` + ScenarioRunner 0.9.16, RGB/sensor; **chưa có API/nút hủy** (TD-37).
Schema có 7 category nhưng mô phỏng/xuất `.xosc` hiện chỉ hỗ trợ `CP_CROSSING` (TD-42).
Perception CARLA dùng ground truth; vật lý phanh chưa hiệu chuẩn (TD-01, TD-17).
Hướng đi ngang đã sửa ở xosc2; hành vi `stops_at_curb` còn thiếu bước dừng (TD-47).

## Năm phần bàn giao theo chức năng

Mỗi phần bao gồm UI, API/service, dữ liệu và kiểm thử. Bảng dưới là ranh giới kỹ thuật;
tên người, deadline, tiến độ thực tế nằm trên GitHub Issues/Project.
Chi tiết chức năng và nghiệm thu: [phân chia 5 thành viên](docs/vehicsim/phan-chia-cong-viec-5-thanh-vien.md).

| Phần / màn chính | Điểm vào frontend | Code chính | Bàn giao sang bước sau |
|---|---|---|---|
| 1. Thiết kế kịch bản | `/scenarios/new` | `DescribeService`, `FamilyService`, `ScenarioRules`, `LlmService` | Họ kịch bản + biến thể hợp lệ |
| 2. Chạy baseline | `/scenarios`, `/analysis/carla` | `RunService`, `core/XoscExport`; `worker/run_xosc.py`, `sensor_recorder.py` | Run + seed + xe/AEB/simulator + kết quả/artifact |
| 3. Phân tích lỗi | `/analysis/failures/**` | `ViewsService`, `TelemetryMetricsService`, `core/Evaluation` | Tập biến thể/seed đã chốt + baseline + chỉ số/nguyên nhân |
| 4. Tối ưu AEB | `/aeb` | `AebService` hiện chỉ tạo candidate thủ công; service/worker tối ưu cần bổ sung | Candidate + campaign/trial + mục tiêu/ràng buộc |
| 5. Regression và phê duyệt | `/validation/**` | `RegressionService`, views/recommendation/decision | Kết quả xác minh + quyết định; baseline mới nếu Accept |

Các service trên ở [src/main/java/com/vehicsim/vehicsim/](src/main/java/com/vehicsim/vehicsim/).
Phần 2 giữ cơ chế chạy chung; phần 3 giữ cách tính chỉ số; phần 4 tìm tham số;
phần 5 xác minh độc lập. Màn sau nhận ID và tự tải dữ liệu từ màn trước.
Tập tối ưu/regression phải giữ cả ca an toàn để kiểm tra phanh oan.
Phối hợp khi sửa `VehicSimController`, `Queries`, `ViewsService`, schema, API client,
`vehicsimFlow.ts` và khung UI; không tạo cơ chế chạy/chấm điểm riêng cho từng màn.

## Nguồn sự thật và tài liệu cần đọc

| Cần biết | Nguồn |
|---|---|
| Kiến trúc, API, bất biến và máy kiểm | [architecture.md](docs/vehicsim/architecture.md) — phần tên Python cũ chỉ là lịch sử; ưu tiên code Java hiện tại |
| Schema và ý nghĩa dữ liệu | [01_schema.sql](database/mysql/01_schema.sql), [database-schema.md](docs/vehicsim/database-schema.md) |
| Quyết định đã chốt và quy trình ADR | [ADR index](docs/adr/README.md); [ADR-039](docs/adr/ADR-039-backend-java-mo-phong-o-worker-python.md), [ADR-040](docs/adr/ADR-040-rut-scope-4-tham-so-aeb-7-category.md) |
| CARLA local và hợp đồng `.xosc` | [carla-local.md](docs/vehicsim/carla-local.md); [bằng chứng sửa hướng đi](docs/exec-plans/completed/2026-10-19-sua-huong-nguoi-di-bo-carla.md) |
| Bắt đầu tối ưu | [Ý tưởng FE-13](docs/vehicsim/fe13-y-tuong-tu-forge.md) — đối chiếu ADR-040; tên module/Celery/10 tham số trong lịch sử đã cũ |
| Kế hoạch sửa theo PDF (20/10): MOBO đánh giá bằng CARLA, 100 Hz, hợp đồng chỉ số | [kế hoạch 20/10](docs/vehicsim/ke-hoach-sua-theo-pdf-va-quyet-dinh-2026-10-20.md) — mới hơn bản phân chia ở điểm khác nhau; chưa phải tính năng đã có |
| Việc còn thiếu | [tech-debt-tracker.md](docs/exec-plans/tech-debt-tracker.md) |
| Việc đã làm và bằng chứng | [completed plans](docs/exec-plans/completed/), [kế hoạch đang làm](docs/exec-plans/active/) |

Đồ thị `graphify-out/` là tùy chọn, bị gitignore; chỉ tin khi khớp code hiện tại.
Có graph phù hợp thì `graphify query "<câu hỏi>"`; không có thì đọc code trực tiếp.
Khi người dùng gọi `/graphify`, đọc skill graphify đã cài trước khi thực hiện.

## Chạy và kiểm chứng

Yêu cầu: Docker Desktop, JDK 21, Python ≥ 3.10 và Node.js 22 (khớp CI).
CARLA Windows dùng Python 3.12/venv riêng; cấu hình mẫu ở [.env.example](.env.example).
Các lệnh dưới chạy từ gốc repo, trừ lệnh ghi rõ frontend.

| Việc | Lệnh / hành vi |
|---|---|
| Chuẩn bị | Sao chép `.env.example` thành `.env` nếu chưa có; `cd frontend`, `npm ci`; xem [CLAUDE.md](CLAUDE.md) |
| Toàn bộ app Windows | `scripts\dev-up.cmd` → MySQL/Redis, Java `:8001`, frontend `:3000` |
| Chỉ backend | `.\mvnw.cmd spring-boot:run`; Swagger dev `http://localhost:8001/swagger-ui.html` |
| CARLA Windows | `.\scripts\setup-carla.ps1` một lần; mỗi phiên `.\scripts\dev-carla.ps1 -RestartBackend` |
| Tài khoản / seed | Backend đang chạy: `python scripts/create_admin.py --email <email> --seed`; bootstrap chỉ ADMIN |
| Backend | `.\mvnw.cmd -B clean test` |
| Worker | `python -m ruff check worker`; `python -m pytest worker/tests -q` |
| Frontend | Trong `frontend`: `npm run lint`, `npx tsc --noEmit`, `npx next build` |
| CI / tổng hợp | [ci.yml](.github/workflows/ci.yml) chạy cả ba phần; `make check` gom ba cổng; CI thêm `npm audit --omit=dev --audit-level=high` |
| Chỉ kiểm tài liệu | `.\mvnw.cmd -B -Dtest=RepoDocsTest test` |
| Chạy artifact `.xosc` | `worker\.venv-carla\Scripts\python.exe worker/run_xosc.py <file>.xosc --camera` |

Test Java/worker không cần Docker, CARLA hoặc khóa LLM. Không thêm test gọi provider thật.
Nếu gặp `Unresolved compilation problem`/`ClassFormatError`, IDE có thể đã ghi class hỏng:
chạy `.\mvnw.cmd clean` rồi build lại. Mô phỏng mặc định qua thread pool Java;
`VEHICSIM_RUN_MODE=inline` dành cho thử nhanh, `VEHICSIM_WORKER_PYTHON` chọn Python.

## Bất biến phải giữ khi nhận và sửa code

1. Mọi lời gọi LLM qua `LlmService`; bộ sinh `.xosc` offline, không dùng LLM.
2. Java, kể cả lõi `com.vehicsim.core`, không import `carla`; lời gọi API CARLA chỉ ở adapter trong `worker/`.
3. Mọi route `/api/v1/vehicsim/*` cần đăng nhập. Mỗi tài khoản một role:
   ADMIN/ENGINEER/EXPERIENCER được ghi; MANAGER chỉ đọc; chỉ REVIEWER Accept/Reject.
   Cách ly project/workspace chưa hoàn thiện (TD-30); không giả định mọi người có dữ liệu riêng.
4. Cùng biến thể + seed phải tái lập được; candidate chạy đúng seed baseline.
   So sánh phải cùng xe, biến thể và phiên bản simulator.
   Không đổi tham số kịch bản và tham số AEB cùng lúc trong một lần so sánh.
5. Không tự Accept; test FAILED không Accept; quyết định cần lý do và xác nhận.
   Baseline đã đổi thì không Accept kết quả test cũ. Pareto không đồng nghĩa regression PASSED.
6. Chỉ 4 tham số AEB chỉnh được theo ADR-040; seed Java/SQL khớp `AebParams`.
   Ba mục tiêu: RMS jerk, vận tốc va chạm, quãng phanh dừng; thống nhất ràng buộc tối ưu/regression.
7. Không lộ email tồn tại; OTP hash, dùng một lần; mật khẩu tối đa 72 byte BCrypt.
8. Logic AEB, bộ mô phỏng và luật chấm chỉ ở `com.vehicsim.core` (`AebStack`, `Simulator`, `Evaluation`), dùng chung cho
   bộ động học và CARLA qua cầu nối; `worker/` không chứa logic AEB (`ArchitectureRulesTest#pythonWorkerHoldsNoAebLogic`).
   Lõi chỉ dùng JDK (`CoreIsolationTest`) và khớp kết quả Python cũ theo fixture ở `src/test/resources/parity`.
9. Regression không ghép động học với CARLA. Bundle nội bộ tải ra phải tái lập
   được kết quả trong phiên bản tương ứng; run cũ không tái lập xem TD-40.

Các quy tắc bổ sung (giữ số 1–9 để khớp bảng bất biến trong tài liệu kiến trúc):

- Đổi kết quả của `aeb_stack.py`/`simulator.py` phải đồng bộ `KINEMATIC_SIMULATOR`
   trong `bundle.py` và `RunService` sang phiên bản mới.
   Đổi hợp đồng/hành vi CARLA cũng phải tách identity và bảo toàn bằng chứng run cũ.
- Trigger theo khoảng cách/TTC tương đối. Số CARLA chưa hiệu chuẩn chỉ để quan sát/đối chiếu;
   không tuyên bố chứng nhận an toàn hoặc “AI đã sửa xe”.
- Không có dữ liệu thật thì để mờ kèm lý do hoặc `NOT_RUN`; không tạo tick/chỉ số giả.
- UI tiếng Việt, DB/API tiếng Anh; đổi câu backend phải cập nhật mẫu `vehicsimI18n.ts`.
    Trang trong `frontend/src/app/` vào `VehicSimShell`; trang công khai khai báo ở `STANDALONE_PATHS`.
- Đổi schema phải sửa `01_schema.sql`, SQL trong `Queries`/service liên quan,
    `database-schema.md` và thêm migration đánh số trong `database/mysql/migrations/` cùng thay đổi.
    Không xóa volume bằng `docker compose down -v`; không ghi đè DB/xe đã có run khi chưa có yêu cầu.
- Không commit `.env`, khóa/token hoặc artifact `data/`; `.env.example` chỉ chứa giá trị mẫu.
- Thao tác tạo họ/candidate/regression/chạy phải qua hạn mức `limitWrites`/`checkActiveRunQuota`.
    CORS chỉ origin cấu hình, không `*`; production tắt Swagger, không ghi OTP vào log.

Máy kiểm và phần còn thiếu ở [bảng bất biến](docs/vehicsim/architecture.md#bất-biến-và-máy-kiểm).
`RepoDocsTest` giữ file này ≤150 dòng, link và tên test còn sống; không nới test để hợp thức hóa tài liệu.

## Quy trình bàn giao thay đổi

- Đọc hướng dẫn trong thư mục đang sửa; xem diff và thay đổi có sẵn trước khi bắt đầu.
- Thay đổi nhiều bước có exec plan ở `docs/exec-plans/active/`; xong chuyển `completed/` kèm bằng chứng.
- Đổi quyết định Accepted phải có ADR mới supersede; nợ chưa sửa ghi vào tech-debt tracker.
- Kiểm tra đúng phần bị ảnh hưởng; sửa UI phải chạy app, đăng nhập, chụp màn hình và đối chiếu Figma.
  Nếu không truy cập được thiết kế thì ghi rõ giới hạn kiểm chứng, không tuyên bố đã đối chiếu.
- Bàn giao kèm phạm vi, API/dữ liệu thay đổi, migration nếu có, lệnh kiểm chứng và phần chưa hoàn thành.
- Không chạm dữ liệu cá nhân, cấu hình máy hoặc thay đổi của thành viên khác ngoài phạm vi công việc.

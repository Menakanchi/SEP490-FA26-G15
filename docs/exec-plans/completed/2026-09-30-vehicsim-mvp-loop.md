# Exec plan (đã xong) — VehicSim MVP: vòng AEB khép kín + xác thực

- **Nhánh:** `trungdam` (tách từ `feature/scenario-generation`)
- **Thời gian:** 28/09 → 30/09/2026
- **Người chịu trách nhiệm:** TrungDQ (FE-12/13/14), làm cùng Claude Code
- **Kiến trúc kết quả:** [docs/vehicsim/architecture.md](../../vehicsim/architecture.md)
- **Nợ còn lại:** [docs/exec-plans/tech-debt-tracker.md](../tech-debt-tracker.md)

## Mục tiêu

Một kỹ sư đi hết **một** vòng khép kín trên motif người đi bộ băng ngang:
mô tả → biến thể → chạy baseline → phân tích lỗi → candidate AEB chạy lại cùng
seed → so sánh → kỹ sư Accept/Reject có lý do. Chạy được trên máy dev **trước khi**
có runner CARLA thật, kịp cho Demo 2 (15/11).

## Đã giao, theo thứ tự

| # | Hạng mục | Nội dung | Code / tài liệu |
|---|---|---|---|
| 1 | Schema MySQL | 27 bảng; sửa lỗi FK trên cột sinh (VIRTUAL thay STORED), CHECK + FK (`ON UPDATE RESTRICT`), `scenario_versions.parent_version_id` + nguồn `GENERATED`, một BASELINE/hệ, cặp run regression ép cùng biến thể + seed | `database/mysql/01_schema.sql`, `docker-compose.yml` (mysql, redis) |
| 2 | Xác thực | Đăng ký/quên mật khẩu bằng mã 6 số qua email (Redis), JWT có `pwv`, đổi mật khẩu thu hồi phiên cũ, admin tạo bằng script; bỏ các endpoint `/auth/*` giả của Forge | `src/services/auth/`, `src/api/auth_routes.py`, `scripts/create_admin.py`, 21 test |
| 3 | Provider LLM | Thêm DeepSeek (OpenAI-compatible, `reasoning_effort=none`, function calling) cạnh OpenAI, chọn bằng `LLM_PROVIDER`; hiện đang chạy `openai` | `src/services/llm.py`, `src/config.py` |
| 4 | Backend vòng MVP | Simulator động học, đánh giá + nguyên nhân gốc, họ kịch bản/biến thể, run qua Celery, regression + khuyến nghị + quyết định, seed dữ liệu demo | `src/services/vehicsim/`, `src/api/vehicsim_routes.py`, `src/celery_app.py`, `scripts/seed_vehicsim.py` |
| 5 | 8 màn Figma | 01 Failure Cases, 02 Failure Detail, 06 Playback, 16 Regression list, 15 New regression, 04 Regression results, 17 Recommendation, 18 Review + danh sách khuyến nghị | `frontend/src/app/{page.tsx,scenarios,aeb,analysis,validation}`, `components/VehicSim*` (ban đầu ở `components/vs/`) |
| 6 | Màn thiết lập | Họ kịch bản (form + chạy baseline), cấu hình AEB (candidate), `GET /regression/preview` | `/scenarios`, `/aeb` |
| 7 | Luồng người dùng | Đăng nhập/đăng ký/quên mật khẩu theo giao diện VehicSim; sau đăng nhập vào Tổng quan 6 bước; thanh tiến trình trên mọi màn; sidebar tiếng Việt; Generator cũ chuyển sang `/generator` | `app/login`, `app/register`, `app/forgot-password`, `app/page.tsx`, `components/FlowBar.tsx` |
| 8 | Bước 1 "Sinh từ mô tả" | Câu tiếng Việt → LLM → Scenario IR có nguồn gốc từng trường, sửa ≤ 3 lần, lùi về luật; lưới biến thể dựng quanh IR; họ lưu `NATURAL_LANGUAGE` | `describe.py`, `POST /scenarios/describe`, `/scenarios/new`, 8 test |
| 10 | URL không tiền tố | Trang VehicSim nằm thẳng trong `app/`, component thẳng trong `components/` (bỏ thư mục `vs/` và route group), khung riêng `VehicSimShell` do `AppLayoutWrapper` chọn: Tổng quan ở `/`, các màn ở `/scenarios`, `/aeb`, `/analysis/*`, `/validation/*`; link `/vs/*` cũ tự chuyển hướng; ảnh sang `public/vehicsim/` | `frontend/src/app/`, `components/VehicSimShell.tsx`, `components/AppLayoutWrapper.tsx`, `frontend/next.config.ts` |
| 9 | Chạy local | Một lệnh bật Docker + worker + backend + frontend, mỗi dịch vụ một cửa sổ | `scripts/dev-up.ps1`, `scripts/dev-up.cmd` |

## Nhật ký quyết định

| Ngày | Quyết định | Ai chốt | Ghi ở |
|---|---|---|---|
| 28/09 | App **public**: giữ tự đăng ký; cần JWT, hash, chặn dò email, rate limit | TrungDQ | [architecture §Xác thực](../../vehicsim/architecture.md#xác-thực) |
| 28/09 | Không có người duyệt kịch bản; biến thể = `scenario_versions`, không lưu min/max/step | TrungDQ | [ADR-024](../../adr/ADR-024-vehicsim-mysql-redis-tach-khoi-sqlite-forge.md) |
| 28/09 | Mã đặt lại/đăng ký là **6 số qua email**, lưu Redis thay vì MySQL | TrungDQ | [ADR-024](../../adr/ADR-024-vehicsim-mysql-redis-tach-khoi-sqlite-forge.md) |
| 29/09 | Simulator **động học** cho MVP, chưa CARLA | TrungDQ | [ADR-023](../../adr/ADR-023-vehicsim-mvp-dung-simulator-dong-hoc.md) |
| 29/09 | Chỉ 8 màn MVP của Figma; FE-06/07 làm tối thiểu; hàng đợi Celery + Redis | TrungDQ | ADR-023, ADR-024 |
| 29/09 | Không bao giờ tự Accept; chặn quyết định trên baseline đã đổi | TrungDQ + phát hiện khi review code | [ADR-025](../../adr/ADR-025-cong-regression-cung-seed-khong-tu-accept.md) |
| 30/09 | Bước 1 dùng lớp LLM chung, không dùng graph 7 node của Forge | TrungDQ | [ADR-026](../../adr/ADR-026-mo-ta-sang-ir-dung-lop-llm-chung.md) |
| 30/09 | Giao diện tiếng Việt, DB/API giữ nguyên tiếng Anh; câu backend dịch ở tầng hiển thị | TrungDQ | [architecture §Frontend](../../vehicsim/architecture.md#frontend) |
| 30/09 | Bỏ tiền tố `/vs` khỏi URL frontend (API `/api/v1/vehicsim` giữ nguyên) | TrungDQ | [architecture §Frontend](../../vehicsim/architecture.md#frontend) |
| 30/09 | Bỏ hẳn tên `vs`: API `/api/v1/vs` → `/api/v1/vehicsim`, token CSS `vs-*` → `vehicsim-*`, đối tượng client `vs` → `vehicsimApi` | TrungDQ | [architecture §Frontend](../../vehicsim/architecture.md#frontend) |
| 30/09 | Đổi `LLM_PROVIDER` từ `deepseek` sang `openai` (chỉ `.env`, giữ khoá DeepSeek để quay lại) | TrungDQ | `.env.example` |

## Kiểm chứng

Số liệu dưới đây đo trên máy dev ngày 29–30/09/2026.

- **Test backend:** 678 passed, 35 skipped (`uv run pytest tests/`, 30/09). Riêng
  VehicSim 37 test (`tests/test_vehicsim/`), xác thực 21 test
  (`tests/test_api/test_auth.py`), tài liệu agent 12 test (`tests/test_agent_docs.py`).
- **Lint:** mọi file mới/sửa của VehicSim và xác thực sạch `ruff check` +
  `ruff format --check`. Gate CI đầy đủ (`ruff check src/ tests/`) **vẫn đỏ** vì lỗi
  có sẵn từ trước nhánh này (TD-16). Frontend: `eslint`, `tsc --noEmit`,
  `next build` sạch.
- **Chạy thật đầu–cuối qua Celery + MySQL:** 2 regression song song (192 task) xong
  trong 18,5 s, worker không lỗi; RT-003 (candidate qua được) xong trong 9,2 s,
  PASSED, 13 sửa được / 0 xấu đi.
- **LLM thật:**
  - DeepSeek: 3,0 s, $0,0008 một lượt.
  - OpenAI `gpt-5.4-mini`, 3 câu ví dụ: 1,8–2,3 s mỗi câu, tổng $0,004. IR đúng với
    cả ca người dừng ở lề; câu "xe máy tạt đầu" bị từ chối đúng.
- **Giao diện:** mỗi màn được chụp bằng Chromium headless (Playwright) sau khi đăng
  nhập, so với ảnh Figma và kiểm console không lỗi. Các lỗi phát hiện nhờ cách này
  đã sửa: nhãn timeline chồng nhau, số KPI xuống dòng, card version thiếu tham số
  đã đổi, đếm lỗi của họ cộng cả run regression.

## Lệch so với kế hoạch MVP gốc

- **Chưa có CARLA.** Run chạy trên simulator động học sau cùng hợp đồng
  `execute_run`; runner CARLA cắm vào sau (ADR-023). Các view Chase cam/RGB/LiDAR,
  Export clip để mờ.
- **FE-13 (Optimization/Pareto/Robustness) và SHAP chưa làm.** Khuyến nghị hiện
  `NOT_RUN` cho các bằng chứng này, không vẽ tick giả.
- **Kế hoạch gốc có 2 tài khoản cố định;** bản này có tự đăng ký vì app public.
- **Figma MCP hết lượt gọi (gói Starter)** giữa chừng. Màn đăng nhập/đăng ký dựng
  theo token của bộ Figma, chưa có frame gốc.

## Bài học

- `GLOBAL RESULT` hay "chạy xong" không phải thước đo; phải tách
  `run_succeeded` / `had_collision` (xem [CLAUDE.md](../../../CLAUDE.md)). Tương tự,
  regression phải ghép **cặp cùng seed**; so tỉ lệ tổng là che mất ca xấu đi.
- Chỉ tăng ngưỡng TTC là đổi va chạm lấy phanh oan; tiêu chí phanh oan mặc định
  0,5 điểm % chặn cấu hình đó — đúng ý đồ, không phải lỗi.
- Prompt nói "người đi bộ đi ra đường" đã làm LLM loại nhầm ca **dừng ở lề**. Phải
  thử thật cả ba câu ví dụ trên màn, không chỉ câu đầu.
- Tiến trình nền của agent chết theo phiên chat; dịch vụ dev phải có script bật lại.

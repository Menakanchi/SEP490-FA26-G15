# Gỡ Scenario Forge, giữ bộ sinh OpenSCENARIO (04/10/2026)

**Yêu cầu (TrungDQ):** bỏ phần Scenario Forge, sửa những chỗ phụ thuộc, **giữ bộ sinh OpenSCENARIO**;
"làm sao tốt nhất cho project". **Quyết định:** [ADR-032](../../adr/ADR-032-go-scenario-forge-giu-bo-sinh-openscenario.md).

## Kiểm kê (đồ thị import, không đoán theo tên file)

- VehicSim + xác thực cần 33 module `src/`; phụ thuộc Forge đúng một chỗ: `describe.py` mượn
  `is_too_vague_to_generate` từ `src/models/schemas.py`.
- Bộ sinh `.xosc` (`convert_spec_to_xosc`) cần một phần `schemas.py` (24/65 khối, trích bằng đồ thị
  AST) và `services/scenario/{geometry,templates}.py`; `agents/state.py` chỉ để bọc thành node graph.
- Frontend (đồ thị import TS): 8 trang Forge + `/landing` + sidebar Forge; sau khi gỡ còn 4 file mồ côi
  (`RoleGate`, `ScenarioPreview`, `BackgroundCropModal`, `types/index.ts`), 41/52 export của `api.ts`
  và 55/58 kiểu của `types/index.ts` không còn ai dùng.
- Không thuộc Forge, giữ: ghi log dùng AI (`.agents/`, `scripts/log_*.py`), ADR-001 → 022 (lịch sử),
  `worker/follow_hero.py` (chạy tay `.xosc`).

## Đã làm

1. [x] Tách bộ sinh thành `src/services/openscenario/` (spec, converter, geometry, templates). Lần trích
   đầu sót một câu lệnh top-level sửa bảng hỗ trợ (`_SUPPORTED_ACTORS_BY_ROAD_MANEUVER[...] = ...`,
   dòng 253) → 5 test `run_red_light` đỏ; sửa script để lấy cả câu lệnh sửa tên đã giữ → xanh.
   Phần bọc node graph thay bằng `try_convert_spec`; 4 test tương ứng viết lại.
2. [x] `describe.py` tự giữ phép kiểm câu mơ hồ.
3. [x] Xoá backend Forge + test + worker ScenarioRunner + script Forge (`git rm`); viết lại
   `src/main.py` (không khởi tạo SQLite lúc khởi động), `tests/conftest.py`; gọn `config.py`, `email.py`,
   `test_architecture.py` (luật mới: bộ sinh `.xosc` không gọi LLM); bỏ `langgraph` (+4 gói con).
4. [x] Frontend: xoá 8 trang Forge, `/landing` + 10 component, sidebar Forge, nền/ảnh nền của khung
   Forge; tỉa `api.ts`, `types/`; `AppLayoutWrapper` còn 2 nhánh (trang xác thực độc lập / mọi trang
   khác trong `VehicSimShell`); `/profile` vào khung VehicSim + link ở sidebar (trước chỉ sidebar Forge có
   link); `Role` còn `admin/expert/engineer/guest`; nút "Trang giới thiệu" ở trang đăng nhập bỏ.
5. [x] Tài liệu + công cụ: README, AGENTS.md, CLAUDE.md, Makefile (bỏ `demo*`), `.env.example`,
   `setup.sh`, `docker-compose.yml` (bỏ khoá `version`), `.gitignore`; ADR-032, mục lục ADR,
   tech-debt (đóng TD-03, 05, 13, 15, 16; thêm TD-27, TD-28).
6. [x] `.dockerignore`: **không** còn loại `docs/` (Meomeo Agent đánh chỉ mục tài liệu lúc chạy — lỗi
   có sẵn, lộ ra khi xem đường deploy) và loại thêm `data/`, `frontend/`, `graphify-out/`, `scratch/`.

## Kiểm chứng

| Kiểm | Kết quả |
|---|---|
| Bộ sinh `.xosc` ở chỗ mới | 52/52 test (như bản gốc); 6 file `.xosc` mẫu trùng **từng byte** với bản gốc; vẫn validate theo XSD OpenSCENARIO 1.0 |
| Backend `ruff check` / `ruff format --check` | sạch — **lần đầu gate CI xanh trên nhánh này** (TD-16 hết vì 5 lỗi nằm trong file Forge) |
| Backend `pytest --cov=src` | 264 passed, 1 skipped; coverage 91% (gate 60%) — trước gỡ: 764 passed, 35 skipped (phần lớn là test Forge) |
| Frontend `eslint`, `tsc --noEmit`, `next build` | sạch; build ra 17 route (VehicSim, xác thực, `/profile`) |
| App chạy thật (`dev-up`) | `/health` 200; OpenAPI "VehicSim API" 26 path = 7 xác thực + 18 VehicSim + `/health`, không còn route Forge; khởi động không chạm `data/app.db`; worker Celery online |
| URL | `/login`, `/profile`, `/scenarios` 200; `/landing`, `/generator`, `/admin`, `/library` 404 |
| Trình duyệt headless (Edge qua Playwright, tài khoản thử tạo rồi xoá) | đăng nhập → Tổng quan hiển thị đủ; trang đăng nhập không còn nút về landing; sidebar có link `/profile`; Profile mở trong khung VehicSim; không lỗi JS |
| Thay đổi | 226 file xoá (~104.800 dòng) |

## Còn lại

- Ý tưởng tuning/campaign của Forge đã ghi lại cho FE-13:
  [fe13-y-tuong-tu-forge.md](../../vehicsim/fe13-y-tuong-tu-forge.md) (yêu cầu của TrungDQ 04/10).

- TD-27: nối bộ sinh `.xosc` vào API và dạy nó motif người đi bộ băng ngang (FE-07).
- TD-28: FE-02 quản lý user trên MySQL (trang `/admin` cũ chỉ quản lý user SQLite của Forge).
- TD-07: màn Hồ sơ vẫn kiểu giao diện cũ.
- `data/app.db` (SQLite cũ) trên máy dev không còn ai đọc — xoá tay được.

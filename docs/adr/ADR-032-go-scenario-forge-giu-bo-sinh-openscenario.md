# ADR-032 — Gỡ Scenario Forge, giữ bộ sinh OpenSCENARIO, một database duy nhất

**Trạng thái:** Proposed 04/10/2026 (TrungDQ, nhánh `trungdam`; đã làm, chờ nhóm duyệt)
**Phạm vi:** toàn repo. Supersede phần Forge của ADR-024 (hai kho dữ liệu) và đóng TD-03, TD-05,
TD-15, TD-16.

## Bối cảnh

Repo dựng lên từ **Scenario Forge** (dự án AI20K RAV-03: câu mô tả → graph 7 node → `.xosc` → worker
ScenarioRunner). Sản phẩm của đồ án là **VehicSim**; Forge vẫn chạy song song và gây ra:

- hai database — MySQL cho VehicSim, SQLite cho Forge (TD-03); lên cloud phải gắn ổ đĩa cho SQLite;
- hai lối vào "sinh kịch bản" (`/generator` của Forge và bước 1 VehicSim — TD-15);
- trang `/admin` quản lý bảng user **SQLite của Forge**, không phải tài khoản đăng nhập MySQL —
  khoá/duyệt ở đó không có tác dụng gì;
- gate CI đỏ vì lỗi nằm trong file Forge (`routes.py`, `db.py`, `test_routes.py` — TD-16);
- ~11.900 dòng backend, 8 trang + landing frontend, ~400 hàm test phải bảo trì nhưng không thuộc
  chức năng FE-01 → FE-14.

Đồ thị import (đo 04/10): VehicSim + xác thực phụ thuộc Forge **đúng một chỗ** — `describe.py` mượn
phép kiểm "câu quá mơ hồ". Bộ sinh `.xosc` (`convert_spec_to_xosc`) chỉ cần một phần `schemas.py`
(các kiểu `ScenarioSpec`) và `services/scenario/{geometry,templates}.py`.

TrungDQ yêu cầu: bỏ Forge, sửa chỗ phụ thuộc, **giữ bộ sinh OpenSCENARIO**.

## Các lựa chọn

1. Giữ Forge như cũ — loại: các vấn đề ở trên còn nguyên.
2. Chỉ ẩn trang Forge trên bản deploy — loại: vẫn hai database, CI vẫn đỏ, code vẫn phải bảo trì.
3. Gỡ hết, kể cả bộ sinh `.xosc` — loại: FE-07 có "Import/Export `.xosc`", và bộ sinh là phần đã
   kiểm chứng kỹ nhất của Forge (ADR-010, 012, 016, 020; chạy thật trên ScenarioRunner 0.9.15).
4. **Gỡ Forge, tách bộ sinh thành module độc lập** — chọn.

## Quyết định

**Giữ và tách:** `src/services/openscenario/`

| File | Từ |
|---|---|
| `spec.py` | 24/65 khối của `src/models/schemas.py` mà bộ sinh dùng (trích bằng đồ thị AST, giữ nguyên thứ tự và chú thích; `ForgeModel` → `SpecModel`) |
| `converter.py` | `agents/nodes/convert_xosc_node.py`, bỏ phần bọc node graph; thêm `try_convert_spec(spec) -> (xosc, issue)` thay cho node |
| `geometry.py`, `templates.py` | `services/scenario/` |

Test đi theo: `tests/test_openscenario/test_converter.py` + 6 file `.xosc` mẫu (`goldens/`, so từng
byte) + XSD OpenSCENARIO 1.0 (`tests/schemas/`). Luật mới: bộ sinh không gọi LLM
(`test_openscenario_generator_never_calls_an_llm`).

**Gỡ:** graph 7 node (`src/agents/`), `src/api/routes.py` (39 endpoint), `src/models/`, `src/schemas/`,
`services/{db,persistence,campaign,metrics,near_duplicate,tuning}.py`, `services/library/`; 8 trang
(`/admin`, `/campaign`, `/generator`, `/label`, `/library`, `/library/[id]`, `/metrics`, `/review`),
trang `/landing`, sidebar Forge, component/kiểu/hàm API chỉ Forge dùng; worker ScenarioRunner tự động
(`runner.py`, `mock_runner.py`, `dev_ui.py`, `sr_cli.py`, `trajectory.py`, `ego_controller(s).py`,
`behavior_agent_control.py`); `eval/`, `prompt_ab/`, `fixtures/`, `presentation/`, `ARCHITECTURE.md`,
`docs/plan.md`, `docs/gate-1/`, `docs/guide/`; thư viện `langgraph`. Giữ `worker/follow_hero.py` để
chạy tay `.xosc` bằng ScenarioRunner (CLAUDE.md).

**Sửa:** `describe.py` tự giữ phép kiểm câu mơ hồ; `src/main.py` chỉ còn router xác thực + VehicSim,
không khởi tạo SQLite lúc khởi động; `config.py` bỏ `DATABASE_URL` và thiết lập chống trùng của Forge;
`email.py` bỏ thư duyệt Reviewer; `/profile` vào khung VehicSim và có link ở sidebar (trước chỉ
sidebar Forge có link); trang đăng nhập bỏ nút về `/landing`; `Role` frontend còn
`admin / expert / engineer / guest`; `.dockerignore` không còn loại `docs/` (Meomeo Agent cần đọc lúc
chạy) và loại thêm `data/`, `frontend/`.

## Hệ quả

- **Một database** (MySQL). Deploy cloud không cần ổ đĩa lưu trữ; `data/app.db` cũ trên máy dev không
  còn ai đọc, xoá tay được.
- Gate backend xanh lại (TD-16); coverage đo được tăng vì không còn code Forge ít test.
- **Mất** (còn trong lịch sử git trước commit gỡ): Generator, thư viện kịch bản, duyệt hai cổng,
  campaign, tuning, gán nhãn intent, báo cáo chất lượng, worker ScenarioRunner tự động, trang
  giới thiệu. **Ý tưởng** của tuning và campaign (dò quanh mốc vật lý, điều kiện khả thi, ba trạng thái
  dừng, mục tiêu liên tục, trần ngân sách, không chạy trùng) giữ lại cho FE-13 ở
  [fe13-y-tuong-tu-forge.md](../vehicsim/fe13-y-tuong-tu-forge.md).
- **FE-02 (quản lý user) phải làm mới trên MySQL** — trang `/admin` cũ chưa bao giờ quản lý tài khoản
  thật.
- **Bộ sinh `.xosc` chưa nối API.** Đầu vào là `ScenarioSpec` theo taxonomy của Forge (cut-in, sudden
  brake, …); motif người đi bộ băng ngang của VehicSim **bị bộ sinh từ chối có chủ đích**
  (`jaywalk` — ADR-016, `test_jaywalk_is_refused_as_out_of_scope`). FE-07 cần ánh xạ IR VehicSim →
  `ScenarioSpec` và dạy bộ sinh motif này, kiểm bằng ScenarioRunner thật như ADR-016 đã làm.
- ADR-001 → 022 giữ làm lịch sử; mục lục ADR ghi rõ ADR nào còn hiệu lực.

## Kiểm chứng (04/10)

Ghi ở [exec plan](../exec-plans/completed/2026-10-04-go-scenario-forge.md).

# Worklog — P-130 · Scenario Forge (RAV-03)

> Ghi lại công việc theo ngày: ai làm gì, kết quả gì.
> Nguồn: `git log`, GitHub PR, ADR, test và `.ai-log/`.
> Cột **Time** là thời gian có hoạt động ghi trong `.ai-log/` (khoảng cách giữa
> hai sự kiện < 30 phút mới được tính), làm tròn 0.5h. Nó **không** tính phần
> việc làm trên máy Windows chạy CARLA và phần đọc/viết tài liệu ngoài phiên AI,
> nên là con số sàn, không phải tổng công sức.

---

## 2026-07-27

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Công Nguyễn | Đọc đề RAV-03, chốt phạm vi MVP: input tiếng Việt → `.xosc`, CARLA là tầng kiểm chứng tuỳ chọn | ✅ Done | Khung scope về sau thành `docs/plan.md` §1 | 1h |
| Công Nguyễn | Khởi thảo các ADR nền tảng (tách worker CARLA, hai venv Python) | 🔄 WIP | Bản nháp ADR-001, ADR-002 | — |

**Tổng kết ngày:** Chốt được ranh giới quan trọng nhất ngay từ đầu — backend không
bao giờ `import carla` — vì nó quyết định cả cấu trúc thư mục lẫn cách chia việc.

---

## 2026-07-28

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Công Nguyễn | Viết hợp đồng dữ liệu `ScenarioSpec` trong `src/models/schemas.py` | ✅ Done | → PR #1 | 2h |
| Công Nguyễn | Dựng fixtures: `scenario_specs/sc_001.json`, `execution_results/*`, `xosc/sample_001_cut_in.xosc` viết tay | ✅ Done | `fixtures/` + `fixtures/README.md` | 1.5h |
| Công Nguyễn | Hoàn thiện ADR-001 → ADR-006 và ADR-010 | ✅ Done | `docs/adr/` (7 ADR) | 0.5h |

**Tổng kết ngày:** Có đủ contract + ví dụ thật để mở PR đầu tiên. `.xosc` viết tay
là thứ về sau trở thành golden fixture cho cả smoke test lẫn converter.

---

## 2026-07-29

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Công Nguyễn | Merge PR #1 — hợp đồng dữ liệu `ScenarioSpec` + fixtures + ADR nền tảng | ✅ Done | [PR #1](https://github.com/AI20K-Build-Phase-Cohort-3/P-130/pull/1) · commit `193024c` | 2h |
| TamasTrn | Khởi tạo dự án từ template BTC (src/, tests/, CI, Docker, scripts AI-log) và merge vào main | ✅ Done | commit `0b09b6a`, `a3c2787` | — |
| Công Nguyễn | Sửa trục thứ 4 của ODD: *tình huống* thay vì *thời điểm trong ngày* — breaking change, sửa schema + fixtures + tests cùng PR | ✅ Done | [PR #2](https://github.com/AI20K-Build-Phase-Cohort-3/P-130/pull/2) · commit `bdc1839` | 2h |
| Công Nguyễn | Bỏ khoá đã hết hiệu lực khỏi `.env.example`, chỉ giữ placeholder | ✅ Done | [PR #3](https://github.com/AI20K-Build-Phase-Cohort-3/P-130/pull/3) · commit `eb4e1d2` | 1h |

**Tổng kết ngày:** Ngày nặng nhất về contract (4 phiên làm việc, 477 sự kiện AI-log).
Đổi trục ODD sớm ở đây rẻ hơn nhiều so với đổi sau khi đã có validator và retrieval.

---

## 2026-07-30

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Công Nguyễn | Dựng môi trường CARLA 0.9.15 server (Windows, RTX 4060) + ScenarioRunner client (WSL2, Python 3.10) | ✅ Done | Toolchain chạy được, VRAM ~2.9/8.2 GB | 1.5h |
| Công Nguyễn | Chạy `sample_001_cut_in.xosc` thật, debug 4 bẫy parser của ScenarioRunner | ✅ Done | Kịch bản chạy trọn, xuất criteria JSON | 1.5h |
| Công Nguyễn | Truy vết bẫy hệ toạ độ: xe rơi cách đích 362 m mà không lỗi nào báo | ✅ Done | Quy tắc `xosc_y = -api_y`, `xosc_h = -api_yaw`; lệch còn 6.5 m | 0.5h |
| Công Nguyễn | Soạn ADR-012 — converter dùng thẳng `RelativeLanePosition` | 🔄 WIP | Bản nháp, chờ kết quả đo để Accept | — |

**Tổng kết ngày:** Gỡ được rủi ro dài nhất của dự án. Bẫy `dynamicsDimension="time"`
gây **segfault trong libcarla** (không phải exception) là thứ chắc chắn sẽ nổ ở W4
nếu không chạy thật hôm nay.

---

## 2026-07-31

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Công Nguyễn | Tách `ScenarioDraft` khỏi `ScenarioSpec`, `ValidationIssue` có cấu trúc, thêm 12 fixture sai có chủ đích | ✅ Done | [PR #4](https://github.com/AI20K-Build-Phase-Cohort-3/P-130/pull/4) · commit `27d0168` | 1h |
| Công Nguyễn | Bỏ ChromaDB, dùng Qdrant đúng ADR-003 (`config.py`, `.env.example`, `requirements.txt`) | ✅ Done | [PR #6](https://github.com/AI20K-Build-Phase-Cohort-3/P-130/pull/6) (stacked trên `feat/workflow-routing`) · vào `main` qua #10, commit `9e48927` | 0.5h |
| Công Nguyễn | Tách điều kiện rẽ nhánh sang `src/agents/routing.py` + 4 bất biến kiến trúc ép bằng CI | ✅ Done | [PR #10](https://github.com/AI20K-Build-Phase-Cohort-3/P-130/pull/10) · commit `ab17a59` · `tests/test_architecture.py` | 1h |
| Công Nguyễn | CI đo coverage, kiểm `ruff format`, chạy trên MỌI pull request | ✅ Done | [PR #9](https://github.com/AI20K-Build-Phase-Cohort-3/P-130/pull/9) · commit `db7baa0` | 0.5h |
| Công Nguyễn | ADR-012 Accepted kèm số đo thật + 5 bẫy; cập nhật ADR-002, ADR-010, `fixtures/README.md` | ✅ Done | [PR #11](https://github.com/AI20K-Build-Phase-Cohort-3/P-130/pull/11) · commit `5ffc337` | 0.5h |
| Công Nguyễn | Dựng lại `ARCHITECTURE.md` + sơ đồ, bỏ phân công khỏi plan/overview | ✅ Done | [PR #8](https://github.com/AI20K-Build-Phase-Cohort-3/P-130/pull/8) · commit `e73667a` | 0.5h |

**Tổng kết ngày:** 5 PR vào `main` + 1 PR stacked (#6 → `feat/workflow-routing`).
Kết thúc W1 với 8 PR trên `main`, 8 ADR, 95 test pass,
coverage 94.85%. Hai mục W1 chưa đạt: baseline converter/static-check và deploy `/health`.

---

## 2026-08-01

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Công Nguyễn | Viết lại `README.md` cho khớp code thật: nêu rõ endpoint đang có và phần chưa ship | ✅ Done | `README.md` (chưa commit) | 0.5h |
| Công Nguyễn | Chốt lại chú thích persistence trong `src/config.py`: SQLite là MVP, PostgreSQL chỉ nâng cấp khi cần | ✅ Done | `src/config.py` (chưa commit, chờ ADR-011) | — |
| Công Nguyễn | Chạy test + coverage lấy số cho báo cáo | ✅ Done | 95 passed, coverage 94.85% | — |
| Công Nguyễn | Soạn và nộp Weekly report #2 cho BTC | ✅ Done | `weekly-submit.txt` | 0.5h |

**Tổng kết ngày:** Dọn hết chỗ tài liệu vênh với code trước khi nộp báo cáo tuần —
không để BTC hiểu nhầm là hệ thống đã chạy end-to-end.

---

## 2026-08-02

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Công Nguyễn | Soạn artifact nộp Gate 1: one-page brief, PRD, wireframe & UI flow | ✅ Done | [PR #12](https://github.com/AI20K-Build-Phase-Cohort-3/P-130/pull/12) · commit `79c1cfd` · `docs/gate-1/` | — |

**Tổng kết ngày:** Gate 1 có đủ artifact nộp, trạng thái ghi trung thực: contracts,
fixtures, routing, CI và CARLA smoke test đã có; workflow, converter, RAG, review
API, frontend, worker vẫn đang triển khai.

---

## 2026-08-03

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Công Nguyễn | Tách tài liệu kế hoạch nội bộ (`docs/plan.md`, `docs/overview.html`) khỏi repo public | ✅ Done | commit `97e1375` | 0.5h |
| Công Nguyễn | Điền `JOURNAL.md` và `WORKLOG.md` bằng dữ liệu thật từ git/PR/ADR/`.ai-log` | ✅ Done | Deliverable #8, #9 | — |
| Công Nguyễn | ADR-011 (persistence + state transitions) và ADR-007 (workflow cố định) | ❌ Chưa bắt đầu | Chặn API review/download của W2 | — |

**Tổng kết ngày:** Bắt đầu W2. Việc tiếp theo theo `plan.md` §8: chốt ADR-011,
rồi viết `static_check.py` → `templates.py` → `converter.py` và chạy vertical
slice bằng fixture trước khi nối LLM/RAG.

---

<!-- Format: copy block trên cho mỗi ngày làm việc -->

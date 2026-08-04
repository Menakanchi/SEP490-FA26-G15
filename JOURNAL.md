# Weekly Journal — P-130 · Scenario Forge (RAV-03)

> Ghi lại mỗi tuần: mục tiêu, kết quả, khó khăn, bài học, kế hoạch tiếp.
> Mốc tuần theo lịch W1–W6 của dự án. Bằng chứng là commit, PR, ADR, test và
> `.ai-log/`; việc chưa làm được ghi thẳng là chưa làm được, không ghi bù.

---

## Week 1 · 26/07 – 01/08/2026

*(tương ứng Weekly report #2 đã nộp BTC ngày 01/08/2026)*

### Mục tiêu tuần này

- [x] Chốt hợp đồng dữ liệu `ScenarioSpec` / `ScenarioDraft` + fixtures
- [x] Viết ADR nền tảng cho các quyết định khó đảo ngược
- [x] Chạy được CARLA + ScenarioRunner thật với một file `.xosc`
- [x] CI chạy lint, format, test, coverage trên mọi PR
- [ ] Baseline `converter.py` + `static_check.py` — **chưa đạt**
- [ ] Deploy `/health` lên live URL — **chưa đạt**

### Đã hoàn thành

- **CARLA chạy được thật** (31/07): CARLA 0.9.15 server trên Windows (RTX 4060)
  + ScenarioRunner 0.9.15 client trên WSL2 Python 3.10, map Town04. Fixture
  `fixtures/xosc/sample_001_cut_in.xosc` chạy trọn kịch bản và xuất criteria JSON
  đúng hình dạng `ExecutionResult`. Đo lại vị trí thật: lệch ngang −3.50 m (đúng
  một làn), lệch dọc −25.00 m (khớp `ds=-25.0`) ⇒ `RelativeLanePosition` hoạt
  động, converter **không cần** phân giải offset, **không cần** `import carla`.
- **ADR-012 Accepted** với 4 bẫy parser + 1 bẫy server đã ghi lại bằng số đo, để
  người viết converter không phải trả giá lại (PR #11).
- **Hợp đồng dữ liệu**: tách `ScenarioDraft` (LLM sinh) khỏi `ScenarioSpec`
  (backend cấp ID, promote), `ValidationIssue` có cấu trúc, `extra="forbid"`
  (PR #1, #2, #4). `src/models/schemas.py` là nguồn sự thật duy nhất về data shape.
- **12 fixture sai có chủ đích** trong `fixtures/invalid_drafts/` — người viết
  validator có sẵn cả đề lẫn đáp án, không phải tự nghĩ ca lỗi.
- **Bất biến kiến trúc ép bằng CI** (PR #10): `src/` không import `carla`; HTTP
  layer không query Qdrant trực tiếp; chỉ `parse_intent`/`generate_draft`/
  `repair_draft` được gọi LLM; mọi provider call đi qua `src/services/llm.py`.
  Điều kiện rẽ nhánh tách khỏi graph sang `src/agents/routing.py` để test được.
- **CI đo coverage + kiểm format trên MỌI pull request** (PR #9), sàn 60%.
- **Dọn lệch tài liệu ↔ code**: bỏ ChromaDB khỏi config/requirements cho đúng
  ADR-003 (Qdrant); dựng lại `ARCHITECTURE.md` có bảng *Trạng thái hiện tại*
  tách rõ "kiến trúc mục tiêu" và "đã ship".
- **Số liệu cuối tuần:** 8 PR merge vào `main` (#1–#4, #8–#11) · 8 ADR · 95 test
  pass · coverage 94.85% (427 statements, 22 miss). PR #6 là PR stacked, merge
  vào nhánh `feat/workflow-routing` rồi vào `main` qua #10.

### Khó khăn & Giải pháp

| Khó khăn | Giải pháp | Kết quả |
|----------|-----------|---------|
| Rủi ro dài nhất của dự án — chưa ai biết CARLA + ScenarioRunner có chạy được không; trễ mốc từ 28/07 | Dồn 2 ngày chạy thật thay vì suy luận: server Windows ↔ client WSL2, đo lại toạ độ bằng client API | Toolchain pass, gỡ được rủi ro chặn cả W2–W3 |
| `WorldPosition` dùng hệ toạ độ ngược Python API (UE4 tay trái ↔ OpenSCENARIO tay phải) — xe rơi cách 362 m ra giữa hồ mà **không lỗi nào báo** | Đo trước/sau, đối chiếu tài liệu CARLA, chốt quy tắc `xosc_y = -api_y`, `xosc_h = -api_yaw` | Lệch còn 6.5 m; quy tắc thành ràng buộc bắt buộc của converter (ADR-012) |
| `LaneChangeActionDynamics` dùng `dynamicsDimension="time"` gây **segfault trong libcarla**, không phải exception — client chết câm, không stack trace | Chuyển sang `distance` (mét) | Nếu không chạy thật tuần này, bẫy sẽ nổ ở W4 lúc converter viết xong và không ai biết nhìn vào đâu |
| ADR-010 bắt converter phân giải offset bằng waypoint API ⇒ mâu thuẫn ADR-001 (`src/` không import carla) và phá "validate là điểm rẽ nhánh duy nhất" | Viết ADR-012 supersede một phần ADR-010: dùng thẳng `RelativeLanePosition` | Bỏ được `cache_waypoints.py` và `ResolvedScenario` khỏi MVP; converter thành hàm toàn phần |
| Config/requirements còn ChromaDB trong khi ADR-003 đã chốt Qdrant | Sửa `src/config.py`, `.env.example`, `requirements.txt` theo ADR | Tài liệu và code hết vênh (PR #6) |
| `.env.example` còn chứa khoá đã hết hiệu lực | Bỏ khoá, chỉ giữ placeholder | PR #3 |
| Trục thứ 4 của ODD ban đầu đặt là "thời điểm trong ngày" — không phân biệt được kịch bản nguy hiểm | Đổi thành *tình huống*, sửa schema + fixtures + tests trong cùng PR | PR #2, breaking change có kiểm soát |

### Bài học

1. **Rủi ro toolchain phải trả bằng lần chạy thật, không trả bằng suy luận.**
   Cả 5 bẫy tuần này đều thuộc loại đọc chuẩn OpenSCENARIO xong vẫn sai, vì
   ScenarioRunner không làm đúng chuẩn ở đúng những chỗ đó.
2. **Bug im lặng nguy hiểm hơn bug ồn ào.** Sai dấu toạ độ vẫn cho `success=true`;
   segfault không để lại stack trace Python. Phải đo, không được tin trạng thái trả về.
3. **ADR mâu thuẫn nhau là tín hiệu thiết kế sai, không phải lỗi diễn đạt.** Khi
   ADR-010 đụng ADR-001, sửa câu chữ sẽ giấu vấn đề; viết ADR mới mới giải được.
4. **Tài liệu phải ghi rõ "mục tiêu" và "đã ship" ở hai cột khác nhau,** nếu không
   người đọc (và cả BTC) sẽ hiểu nhầm là hệ thống đã chạy end-to-end.
5. **Fixture sai có chủ đích là cách bàn giao rẻ nhất** cho người viết validator ở
   nhánh song song, không cần chờ nhau.

### Kế hoạch tuần sau (W2 · 03/08 – 09/08)

- [ ] Chốt ADR-011 (persistence + state transitions) và ADR-007 (workflow cố định)
- [ ] `templates.py` (catalog `ScenarioTemplate` từ toạ độ đo được) + `static_check.py` + `converter.py`
- [ ] API tối thiểu: create pending → get → review → download
- [ ] Chạy vertical slice bằng fixture, chưa cần LLM/RAG
- [ ] Worker protocol (pull job / report `ExecutionResult`)
- [ ] Preview 2D tối thiểu

---

## Week 2 · 02/08 – 08/08/2026 *(đang chạy — cập nhật tới 03/08)*

### Mục tiêu tuần này

- [ ] Vertical slice: draft → validate → convert → review → download
- [ ] Nối graph 7 nodes thay cho graph mẫu `analyze → respond`
- [ ] Worker protocol + preview 2D
- [ ] ADR-011 và ADR-007

### Đã hoàn thành

- Gate 1 submission artifacts: one-page brief, PRD, wireframe & UI flow
  (`docs/gate-1/`, PR #12).
- Tách tài liệu lập kế hoạch nội bộ (`docs/plan.md`, `docs/overview.html`) ra
  khỏi repo public, giữ local.
- Điền `JOURNAL.md` và `WORKLOG.md` bằng dữ liệu thật từ git/PR/ADR/`.ai-log`
  (deliverable #8 và #9).

### Khó khăn & Giải pháp

| Khó khăn | Giải pháp | Kết quả |
|----------|-----------|---------|
| Converter/static-check trượt từ W1 sang, trong khi W2 vốn đã nặng | Ưu tiên vertical slice chạy bằng fixture trước, LLM/RAG sau | Đang theo dõi |

### Bài học

- *(cập nhật cuối tuần)*

### Kế hoạch tuần sau (W3 · 10/08 – 16/08)

- [ ] `Retriever` (SQLite BLOB + cosine, ADR-013) + retrieval baseline vector-only, rồi bản cải tiến
- [ ] Batch CARLA qua worker, đối chiếu outcome cut-in thật
- [ ] Dashboard validity / cost / latency

---

## Week 3 · 10/08 – 16/08/2026 *(kế hoạch)*

### Mục tiêu tuần này

- [ ] `Retriever` baseline → improved retrieval (Recall@k, MRR, nDCG trên golden queries)
- [ ] Batch CARLA job qua worker
- [ ] Dashboard validity/cost/latency

---

## Week 4 · 17/08 – 23/08/2026 *(kế hoạch)*

### Mục tiêu tuần này

- [ ] ODD coverage theo `SupportPolicy.denominator()`
- [ ] Model routing + fallback (quyết định sau khi có số cost/latency)
- [ ] User testing 3–5 người

---

## Week 5 · 24/08 – 30/08/2026 *(kế hoạch)*

### Mục tiêu tuần này

- [ ] Failure analysis 20 case
- [ ] Prompt v2
- [ ] Adversarial evaluation (near-miss oracle, ego controller)
- [ ] Feature freeze

---

## Week 6 · 31/08 – 06/09/2026 *(kế hoạch)*

### Mục tiêu tuần này

- [ ] Đủ 10 deliverables
- [ ] Demo video + pitch deck + dry-run
- [ ] Chỉ bug fix, không mở feature mới

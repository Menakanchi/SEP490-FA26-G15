# Kế hoạch thực thi — Scenario Forge (RAV-03)

Tài liệu này chỉ giữ scope, quyết định còn mở, milestones, deliverables, quality
gates, risks và việc tiếp theo. Kiến trúc và contracts nằm ở
[`ARCHITECTURE.md`](../ARCHITECTURE.md); tiến độ và ownership theo ngày nằm trong
GitHub Issues/Project.

## 1. Scope

### MVP

- Nhận mô tả tiếng Việt về một tình huống giao thông nguy hiểm.
- Sinh `ScenarioDraft`, validate và repair tối đa ba vòng.
- Chuyển `ScenarioSpec` thành OpenSCENARIO 1.0 `.xosc`.
- Lưu `pending_review`; reviewer duyệt trước khi vào thư viện/tải file.
- Tìm lại scenario bằng semantic search kết hợp ODD payload filters.
- Tuỳ chọn gửi `.xosc` sang worker CARLA và nhận `ExecutionResult`.
- Có preview 2D và hai vai trò creator/reviewer.

### Ngoài MVP

- Điều khiển xe hoặc thiết bị thật.
- Isaac Sim hoặc simulator thứ hai.
- Multi-agent/ReAct orchestration.
- Sinh trực tiếp XML bằng LLM.
- Tự giải toàn bộ topology của mọi CARLA map.

## 2. Workflow đã chốt

```text
parse_intent
  → retrieve
  → generate_draft
  → validate ↔ repair_draft
  → convert_xosc
  → persist_pending_review
```

- Default và support check là logic nội bộ của `parse_intent`, không phải nodes.
- Promote draft thành spec là hàm backend, không phải node.
- Review, library admission và CARLA job là HTTP transactions sau graph.
- Chỉ ba nodes gọi LLM: parse, generate, repair.

## 3. Quyết định còn mở

| Quyết định | Khi nào cần chốt | Bằng chứng cần có |
|---|---|---|
| ADR-011: persistence schema và tiêu chí SQLite → PostgreSQL | Trước review/job API | state transitions; chỉ migrate khi có concurrent writes hoặc storage constraint |
| `.xosc` durable storage | Trước deploy | restart không mất file, download đúng version |
| Prompt/model/provider policy | Khi graph baseline chạy | validity, cost, p95 latency |
| Có cần index ANN không (đảo ADR-013) | Chỉ khi chạm ngưỡng ở ADR-013 | >10k scenario, hoặc retrieval p95 > 200ms, hoặc cần ghi đồng thời nhiều instance |
| Template support matrix | Sau converter baseline | executable fixtures theo maneuver |
| Ego controller cho adversarial testing | Trước W5 | agent/autopilot contract + reproducible run |
| Near-miss oracle | Trước adversarial eval | TTC/min-distance definition và fixture |

Không điền các ô trên bằng phỏng đoán; quyết định phụ thuộc số đo phải chờ số đo.

## 4. Milestones

| Tuần | Outcome bắt buộc |
|---|---|
| W1 · 27/07–02/08 | Contracts, fixtures, ADR nền tảng, CARLA smoke test, converter/static-check baseline, deploy `/health` |
| W2 · 03/08–09/08 | Vertical slice draft → validate → convert → review → download; graph nodes; worker protocol; preview 2D |
| W3 · 10/08–16/08 | `Retriever` baseline (SQLite BLOB + cosine) rồi improved retrieval; batch CARLA; dashboard validity/cost/latency |
| W4 · 17/08–23/08 | ODD coverage, model routing/fallback, user testing 3–5 người |
| W5 · 24/08–30/08 | Failure analysis 20 cases, prompt v2, adversarial evaluation, feature freeze |
| W6 · 31/08–06/09 | Đủ deliverables, video, pitch, demo dry-runs; chỉ bug fix |

Nếu milestone trước chưa đạt, không mở feature nâng cao của milestone sau.

## 5. Deliverables

| # | Deliverable | Evidence | Trạng thái |
|---|---|---|---|
| 1 | Source code | `src/`, `worker/`, frontend, tests | Có vertical slice + campaign + CARLA metrics |
| 2 | README | `README.md` | Đã cập nhật trạng thái 24/08 |
| 3 | Architecture | `ARCHITECTURE.md`, ADRs | Có bản mục tiêu + trạng thái |
| 4 | AI logs | `.ai-log/`, LangSmith traces | Cần đủ mọi thành viên |
| 5 | Live URL | frontend + backend `/health` | Chưa có |
| 6 | Demo video | `presentation/` | Chưa có |
| 7 | Pitch deck | `presentation/` | Chưa có |
| 8 | Weekly journal | `JOURNAL.md` | Cần ghi thật mỗi tuần |
| 9 | Worklog | `WORKLOG.md` | Cần ghi thật mỗi ngày |
| 10 | Evaluation | `eval/results/report.md` | Có snapshot số thật 24/08; cần mở rộng nhãn người |

## 6. Quality gates

### Pull request

- Issue có owner, output và acceptance criteria.
- Input/output khớp `schemas.py`.
- Có happy-path test và failure-path test.
- Không tự thêm kiến trúc ngoài contract.
- Ruff lint/format và pytest pass.
- PR ghi exact verification command/result.

### Vertical slice

- Draft hợp lệ đi tới `.xosc` tải được.
- Draft lỗi dừng với `ValidationIssue` đúng code/path.
- Backend restart không làm mất pending scenario.
- Worker offline không làm chết static path.

### Evaluation

| Metric | Cách đo |
|---|---|
| Schema-valid rate | draft validate / tổng draft |
| Static-valid rate | không còn blocking issue / tổng draft |
| Simulation validity | `ExecutionResult.success=true` / tổng job |
| Danger trigger rate | oracle theo từng maneuver |
| Retrieval | Recall@k, MRR, nDCG trên golden queries |
| ODD coverage | qualifying distinct cells / `SupportPolicy.denominator()` |
| Cost/latency | tokens, cost/request, p50, p95 theo node và E2E |

Coverage test code ≥60% là sàn CI, không thay thế các metric sản phẩm trên.

## 7. Rủi ro

| Rủi ro | Phản ứng |
|---|---|
| Kiến trúc đi trước implementation | Luôn ghi rõ target vs implemented; ưu tiên vertical slice |
| Scenario chạy nhưng hành vi không xảy ra | Static geometry + maneuver oracle + CARLA evidence |
| ScenarioRunner khác chuẩn OpenSCENARIO | Pin 0.9.15; converter tests theo ADR-012/golden fixture |
| Một GPU là single point of failure | Static mode luôn dùng được; worker pull-based; demo video backup |
| Retrieval bị dùng như DB giao dịch | Truy cập qua `Retriever`; scenario/review/job truth vẫn là bảng giao dịch trong cùng SQLite (ADR-013) |
| Corpus tự nhiễm lỗi | Chỉ scenario qua `BEFORE_LIBRARY` mới làm few-shot |
| LLM quota/cost | Trần ba vòng repair; đo trước khi thêm fallback |
| Tài liệu lệch source | Schema + tests + ADR thắng prose; docs chỉ có một vai trò |

## 8. Thứ tự thực hiện ngay

1. Chốt ADR-011 và state transitions cho scenario/review/job.
2. Viết `static_check.py`, `templates.py`, `converter.py` từ fixtures hiện có.
3. Dựng API tối thiểu: create pending, get, review, download.
4. Chạy vertical slice bằng fixture, chưa cần LLM/RAG.
5. Dựng `Retriever` (embedding BLOB + cosine) và vector-only retrieval baseline.
6. Nối `parse_intent`, `generate_draft`, `repair_draft` vào graph.
7. Dựng worker pull/report và kiểm chứng lại cut-in outcome.
8. Thêm frontend tối thiểu, preview 2D và hai vai trò.
9. Ghi evaluation evidence từ lần chạy đầu tiên, không chờ W6.

## 9. Quy tắc phối hợp

- Một module có một owner; thay đổi contract cần lead review.
- Mỗi task đi theo `Issue → branch → PR → tests → evidence`.
- Không nhân đôi ownership/deadline vào tài liệu này.
- `JOURNAL.md`, `WORKLOG.md` và AI logs ghi đóng góp thật, không ghi bù.
- Quyết định cross-module hoặc khó đảo ngược mới cần ADR.

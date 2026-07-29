# ADR-004: DeepEval cho chất lượng scenario, metric retrieval tự implement thay vì RAGAS

**Ngày:** 2026-07-28
**Trạng thái:** Accepted

## Bối cảnh

Cần đo hai thứ khác hẳn nhau:

1. **Chất lượng scenario sinh ra** — kịch bản có đúng ý câu tiếng Việt người dùng nhập không.
2. **Chất lượng tìm kiếm thư viện** — với một truy vấn, hệ thống có trả về đúng scenario liên quan không, và có **hơn baseline naive** không (yêu cầu PLO3).

Guidebook chương 8 dạy **RAGAS**. Đề bài RAV-03 nêu **DeepEval**.

## Các lựa chọn

### Lựa chọn 1: RAGAS cho cả hai
- Ưu: theo đúng giáo trình; có sẵn ví dụ trong `docs/guide/chapter-08.md`.
- Nhược: bộ metric của RAGAS (`faithfulness`, `answer_relevancy`, `context_precision`, `context_recall`) thiết kế cho **QA trên tài liệu** — có câu hỏi, có ngữ cảnh, có câu trả lời sinh ra từ ngữ cảnh đó. Library search của Forge **không phải QA-RAG**: không có "câu trả lời" nào được sinh từ context; context là few-shot ví dụ, không phải nguồn sự thật. Áp `faithfulness` vào đây là đo một thứ không tồn tại.

### Lựa chọn 2: DeepEval cho cả hai
- Ưu: theo đề bài; **GEval** cho phép định nghĩa tiêu chí bằng tiếng tự nhiên, hợp để chấm "scenario có đúng ý câu tiếng Việt không".
- Nhược: DeepEval không phải công cụ tự nhiên để đo Recall@k / MRR / nDCG trên golden set.

### Lựa chọn 3: DeepEval cho scenario quality + tự implement metric retrieval
- Ưu: mỗi việc dùng đúng công cụ; metric retrieval là công thức chuẩn, tự viết chưa tới 50 dòng và **kiểm soát được hoàn toàn** — quan trọng vì phải chứng minh improved > baseline trên cùng dataset.
- Nhược: thêm code tự viết phải tự test.

## Quyết định

**Lựa chọn 3.**

- **DeepEval là primary** cho chất lượng scenario: validity + `intent_match` bằng GEval, hiệu chỉnh với người chấm trên `eval/datasets/intent_calibration.jsonl`.
- **Recall@5 / MRR@10 / nDCG@10 tự implement** trong `eval/retrieval_eval.py`, chạy trên `eval/datasets/retrieval_golden.jsonl`.
- Giữ **format báo cáo** của template: `eval/results/report.md`.

## Lý do

1. Đề bài yêu cầu DeepEval; và GEval thật sự hợp với việc chấm "kịch bản có khớp ý định không" — đây là phán đoán ngữ nghĩa, không phải so khớp chuỗi.
2. RAGAS bị loại **không phải vì đề bài**, mà vì **bộ metric của nó không mô hình hoá đúng bài toán này**. Đây là lý do kỹ thuật, nói ra được trước mentor.
3. Metric retrieval tự implement cho phép chạy **cùng một script trên cả baseline lẫn improved**, đảm bảo so sánh công bằng. Đây là điều kiện của PLO3 — không có baseline thì không chứng minh được gì.
4. GEval là LLM-as-judge nên **phải hiệu chỉnh với người**; đặt ngưỡng agreement judge-vs-người ≥ 0.8 trước khi tin số của nó.

## Hệ quả

- Cần `intent_calibration.jsonl` (30 cặp người chấm) trước khi số GEval có ý nghĩa. Nếu agreement < 0.8 thì sửa rubric của GEval, không sửa số.
- Cần `retrieval_golden.jsonl` (query → scenario_id liên quan) **xong ở W2**, vì baseline phải chạy ở W3.
- **Baseline phải chạy trước improved**, không được improve rồi mới nghĩ đến baseline. Đây là rủi ro có tên trong `BATTLE_PLAN.md` §11.
- Guidebook chương 8 vẫn là tài liệu đọc, nhưng phần RAGAS đọc để hiểu khái niệm, không để copy code.

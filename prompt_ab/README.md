# Prompt benchmark

Benchmark so sánh prompt bằng đúng schema, structured-output client, model
escalation, token accounting và validator mà production sử dụng.

## Phạm vi

PR này chỉ cung cấp benchmark infrastructure. Kết quả benchmark không tự động
thay prompt trong `src/agents/prompts/`; việc triển khai một winner phải nằm ở
PR riêng và dẫn tới một kết quả tái lập từ framework này.

```text
prompt_ab/
├── holdout/        # dữ liệu đánh giá, không được chép vào prompt
├── prompts/        # variant A/B và few-shot examples
├── results/        # output được sinh tự động
└── runner.py
```

## Chạy benchmark

Benchmark gọi API thật và từ chối chạy nếu thiếu key. Mỗi case bắt buộc chạy ít
nhất ba lần.

```bash
OPENAI_API_KEY=... uv run --locked python prompt_ab/runner.py \
  --repeats 3 --workers 4 --experiment-name 20260827_holdout_v1
```

Có thể giới hạn node trong lúc phát triển:

```bash
OPENAI_API_KEY=... uv run --locked python prompt_ab/runner.py \
  --nodes parse_intent --repeats 3 --experiment-name parse_intent_probe
```

Mỗi thư mục kết quả chứa:

- `results.json`: từng output, lỗi evaluator, token, cost và latency;
- `summary.json`: pass rate, median/p95 latency và tổng cost;
- `REPORT.md`: bảng tóm tắt sinh từ chính summary.

Metadata bao gồm commit SHA, model production/escalation, số lần lặp và SHA-256
của từng prompt/holdout file. Không sửa report hoặc summary bằng tay.

## Cách chấm

- `parse_intent`: validate bằng `ODDQuery` và so cả bảy trường, bao gồm
  `inferred`, `specific_type`, `specific_action`.
- `generate_draft`: validate bằng `ScenarioDraft`, chạy `validate_node`, rồi
  kiểm tra toàn bộ expectation về actor, ego, maneuver, vị trí và trigger.
- `repair_draft`: validate output bằng `ScenarioDraft`, chạy lại
  `validate_node`, và kiểm tra toàn bộ post-condition của case.

Runner dừng ngay nếu một holdout case khai báo expectation mà evaluator chưa hỗ
trợ. Nó cũng chặn input holdout bị chép nguyên văn vào prompt.

## Chọn winner

Winner chỉ được công bố khi:

- pass rate cao hơn ít nhất 5 điểm phần trăm; và
- tổng cost không vượt quá 2 lần variant còn lại.

Nếu không đạt cả hai điều kiện, kết quả là `inconclusive`; không thay prompt
production dựa trên kết quả đó.

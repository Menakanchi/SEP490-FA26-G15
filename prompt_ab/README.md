# Prompt A/B Testing Framework

Framework để so sánh hiệu quả của các prompt variants.

## Cấu trúc

```
prompt_ab/
├── prompts/              # Prompt variants
│   ├── parse_intent/
│   ├── generate_draft/
│   └── repair_draft/
├── test_cases/          # Test cases YAML
├── results/            # Kết quả A/B test
├── runner.py           # Test runner
└── README.md
```

## Tổng kết

| Node | variant_A | variant_B | Winner |
|------|-----------|----------|--------|
| parse_intent | 86% | **98%** | variant_B |
| generate_draft | 92% | **100%** | variant_B |
| repair_draft | 90% | **100%** | variant_B |

## Chi tiết

### parse_intent

**Mục đích:** Trích xuất ODDQuery từ mô tả tiếng Việt

| Khía cạnh | variant_A | variant_B |
|-----------|---------|----------|
| Style | Zero-shot | Few-shot |
| Examples | ❌ Không | ✅ 6 examples |
| Rules | 7 rules | 7 rules + bổ sung |
| Độ dài | 2541 chars | 5708 chars |

| Metrics | variant_A | variant_B | Winner |
|---------|---------|----------|--------|
| Success Rate | 86% (43/50) | **98%** (49/50) | variant_B |
| Latency (avg) | 2223ms | **1988ms** | variant_B |
| Cost | **$0.007** | $0.014 | variant_A |

**Winner: variant_B** - Few-shot giúp LLM hiểu format và rules tốt hơn

---

### generate_draft

**Mục đích:** Sinh ScenarioDraft từ ODDQuery

| Khía cạnh | variant_A | variant_B |
|-----------|---------|----------|
| Style | Zero-shot | Few-shot + CoT |
| Examples | ❌ Không | ✅ 2 examples |
| Chain-of-Thought | ❌ Không | ✅ Có |
| Độ dài | 1797 chars | 3593 chars |

| Metrics | variant_A | variant_B | Winner |
|---------|---------|----------|--------|
| Success Rate | 92% (46/50) | **100%** (50/50) | variant_B |
| Latency (avg) | **2952ms** | 4727ms | variant_A |
| Cost | **$0.006** | $0.012 | variant_A |

**Winner: variant_B** - CoT reasoning giúp LLM suy nghĩ trước khi sinh JSON

---

### repair_draft

**Mục đích:** Sửa lỗi ScenarioDraft

| Khía cạnh | variant_A | variant_B |
|-----------|---------|----------|
| Style | Issue list | Issue list + examples |
| Examples | ❌ Không | ✅ Có |
| Độ dài | 994 chars | 1049 chars |

| Metrics | variant_A | variant_B | Winner |
|---------|---------|----------|--------|
| Success Rate | 90% (27/30) | **100%** (30/30) | variant_B |
| Latency (avg) | **3907ms** | 5214ms | variant_A |
| Cost | **$0.004** | $0.005 | variant_A |

**Winner: variant_B** - Examples giúp LLM hiểu đúng/sai cho từng loại lỗi

---


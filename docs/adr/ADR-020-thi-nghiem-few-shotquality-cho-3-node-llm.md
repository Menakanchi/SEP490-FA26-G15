# ADR-020: System Prompt Tối ưu cho 3 Node LLM

**Ngày:** 2026-08-23
**Trạng thái:** Proposed
**Liên quan:** ADR-016 (DEFAULT_SUPPORT_POLICY)

## Bối cảnh

`parse_intent`, `generate_draft`, và `repair_draft` là 3 node LLM trong workflow. Mỗi node sử dụng structured output và có prompt riêng.

## Các lựa chọn

### 1. A/B Testing nhiều treatments

- **Ưu:** Có data-driven decision
- **Nhược:** Tốn thời gian cho experiment + metrics

### 2. Build 1 prompt tối ưu ✅

- **Ưu:** Tiết kiệm thời gian; đã có cơ sở lý thuyết từ https://www.promptingguide.ai/
- **Nhược:** Dựa trên lý thuyết, không có experiment

## Quyết định

**Chọn lựa chọn 2: Build 1 prompt tối ưu cho mỗi node.**

### Cấu trúc 1 System Prompt

1. Vai trò và Mục tiêu cốt lõi (Role & Instruction)
2. Ngữ cảnh và Ràng buộc (Context & Guardrails)
3. Hướng dẫn Tư duy (Reasoning / Chain-of-Thought Rules)
4. Định dạng Đầu ra (Output Schema)
5. Ví dụ Mẫu (Few-Shot Demonstrations)

## Áp dụng cho 3 Node

| Node | Examples Source | Phương pháp |
|------|---------------|-------------|
| `parse_intent` | Viết tay | Vì input không structured, cần kiểm soát edge cases |
| `generate_draft` | Copy từ library | Vì input + output đều structured |
| `repair_draft` | Viết tay | Vì lỗi + cách sửa không có trong library |

## Ngưỡng đảo ngược

Xem lại khi:
- User report nhiều lỗi từ 1 node cụ thể
- Cần mở rộng supported ODD combinations
- Có thêm anchor mới trong converter (ADR-016)

## Hệ quả

**Cần cập nhật:**
- `parse_intent.py`: Examples viết tay, cover đủ edge cases
- `generate_draft.py`: Copy thêm examples từ library
- `repair_draft.py`: Thêm examples cho 4 lỗi còn thiếu (EGO_HAS_MANEUVER, DANGLING_ACTOR_REF, DUP_ACTOR_NAME, SCHEMA_INVALID)
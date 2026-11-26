# ADR-068 — Phạm vi 4 tham số AEB lấy theo miền tìm của MOBO

**Trạng thái:** Accepted 26/11/2026 — người dùng chốt (hướng B sau khi chạy thử luồng 26/11).
**Liên quan:** [ADR-040](ADR-040-rut-scope-4-tham-so-aeb-7-category.md) (4 tham số chỉnh được), [ADR-067](ADR-067-api-failure-analysis-v3-va-4-bang-fa-json.md) (Failure Analysis ghim source MOBO), [range tham số](../vehicsim/aeb-parameter-ranges.md).

## Bối cảnh

Phạm vi tham số có hai nguồn lệch nhau:

| Tham số | `aeb_parameters` (chỉnh tay, màn `/aeb`) | `ParameterBounds.DEFAULT` (MOBO tìm) |
|---|---|---|
| TTC Threshold | 0,5 – 4,0 s | 0,5 – 3,5 s |
| Brake Activation Delay | 0 – 0,5 s | 0,05 – 0,45 s |
| Max Deceleration | 3 – 10 m/s² | 5 – 10 m/s² |
| Brake Build-up Rate | 5 – 20 m/s³ | 5 – 20 m/s³ |

Người dùng thấy TTC chỉnh được tới 4 s và nghĩ MOBO cũng thử tới đó. Chú thích của `ParameterBounds` ghi "khớp `aeb_parameters`"
nhưng không khớp (lệch từ khi MOBO Python được chuyển sang Java ngày 22/10).

## Các lựa chọn

1. **DB làm chuẩn:** MOBO đọc giới hạn từ DB. Phải sửa `OptimizationService` / `ParameterBounds`, hai file Failure Analysis ghim
   hash (ADR-067), nên phải audit lại; MOBO tìm rộng hơn, đợt mới không so được với đợt cũ.
2. **Miền MOBO làm chuẩn (chọn):** thu hẹp `aeb_parameters`. Không đụng code MOBO.
3. Chỉ hiện cả hai phạm vi trên giao diện: vẫn hai nguồn.

## Quyết định

`aeb_parameters` = miền của MOBO: TTC 0,5–3,5 s, trễ 0,05–0,45 s, giảm tốc 5–10 m/s², build-up 5–20 m/s³; mặc định giữ 1,5 / 0,15 / 8 / 20.
Sửa cùng lúc `01_schema.sql`, `BootstrapService.AEB_PARAMETER_SEED` và [migration 021](../../database/mysql/migrations/021_2026-11-26_pham-vi-tham-so-aeb-theo-mobo.sql).

Lý do: cận trên TTC 4 s vượt 3 s của UN R131; trễ 0 s và giảm tốc 3 m/s² ít ý nghĩa thực tế cho AEB xe con; MOBO giữ nguyên hành vi nên kết quả tối ưu cũ vẫn so được.

## Hệ quả

- Chỉnh tay hẹp lại: candidate mới ngoài miền bị từ chối. Phiên bản đã lưu có giá trị ngoài miền vẫn giữ (migration liệt kê, không sửa).
- `ParameterHintsAndBoundsTest` (Failure Analysis) đọc seed `BootstrapService`: cận trên TTC của miền catalog đổi 4,0 → 3,5. Hash các file MOBO
  không đổi, không cần audit lại phần MOBO.
- MOBO vẫn bỏ qua `search_space` người dùng nhập khi tạo đợt (`CUSTOM_BOUNDS_IGNORED`): việc riêng của phần tối ưu.

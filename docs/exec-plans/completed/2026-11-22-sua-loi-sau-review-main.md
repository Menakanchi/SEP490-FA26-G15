# Sửa lỗi sau review main (22/11/2026)

## Phạm vi và tiêu chí

1. Kẹp phần bù pha ở giới hạn ma sát. Tách profile CARLA v12 và giữ cách chạy của v10–v11.
2. Tải riêng và tải ZIP dùng đúng artifact đã lưu của run CARLA cũ. Báo rõ lượt không còn file gốc.
3. Giữ trạng thái CANCELLED khi người dùng hủy trong lượt cuối. Trial bị hủy không đi vào Pareto.
4. Đồng bộ tài liệu profile. Giữ API, cột và dữ liệu đã lưu. Không cần migration mới.

## Tài liệu đối chiếu

- [Hướng dẫn vận hành](../../../CLAUDE.md) và [CARLA local](../../vehicsim/carla-local.md).
- [ADR-055](../../adr/ADR-055-chot-chi-so-va-che-do-aeb-tat-13-11.md), [ADR-056](../../adr/ADR-056-xosc10-bu-pha-tang-luc-phanh.md),
  [ADR-057](../../adr/ADR-057-hanh-lang-aeb-theo-be-rong-xe.md) và [kế hoạch tích hợp tối ưu](../../vehicsim/ke-hoach-sua-theo-pdf-va-quyet-dinh-2026-10-20.md).
- Hướng dẫn CARLA trước đây chỉ liệt kê backend từ chối đến v8, dù code trên main đã từ chối đến v10.

## Kiểm chứng

- `mvnw.cmd -B test`: 691 test, 0 lỗi, 1 bỏ qua. Test mới kiểm trần ma sát ở v12 và giữ hành vi v11,
  file cũ trong ZIP, file gốc bị thiếu và trường hợp hủy trong lượt cuối.
- `python -m pytest worker/tests -q`: 74 test qua. `python -m ruff check worker`: đạt.
- Trong frontend, `npm run lint` và `npx --no-install tsc --noEmit`: đạt.
- Chưa chạy CARLA thật. Dùng [kế hoạch kiểm CARLA](2026-11-22-kiem-carla-that-nguoi-di-bo.md) để kiểm v12.

# Pitch Deck Demo Day

## Files

- `pitch_deck.pptx` — bản có thể chỉnh sửa, gồm 15 slide
- `pitch_deck.pdf` — bản PDF để nộp link
- Video demo được nộp qua URL riêng theo yêu cầu của Demo Day.

Các câu giải thích dài nằm trong **speaker notes** của PPTX; slide chỉ giữ số,
sơ đồ và kết luận chính.

## Cấu trúc 15 slide

| # | Slide | Vai trò theo template Demo Day |
|---|---|---|
| 1 | Scenario Forge — title + 4 con số chốt | Title |
| 2 | Xe tự lái không hỏng ở đường thẳng | Problem |
| 3 | Vào một câu, ra một file chạy được | Solution |
| 4 | Sáu tình huống đang sinh được | Demo |
| 5 | Bên trong: 7 node, LLM chỉ làm 3 | Architecture |
| 6 | Không có gì tự vào thư viện (hai cổng duyệt) | Architecture |
| 7 | Kiến trúc & tech stack | Tech Stack |
| 8 | Từ một kịch bản đến một chiến dịch đánh giá | **Yêu cầu nâng cao** |
| 9 | M1 — nó chạy được tới đâu (L1–L4) | Traction |
| 10 | M2 — độ phủ ODD (ma trận 72 ô) | Traction |
| 11 | M3 — kích hoạt nguy hiểm + đối chiếu nhãn người | Traction |
| 12 | Cost/request và p50/p95 latency | Traction |
| 13 | A/B model LLM và quyết định giữ nguyên | Traction |
| 14 | Ai dùng, và thay cho việc gì | Market |
| 15 | Làm gì tiếp | Ask |

Số liệu M1/M2/M3 lấy trực tiếp từ database qua `metrics.build_report()`
(snapshot **29/08/2026**); phần cost/latency và A/B model vẫn theo
[`eval/results/report.md`](../eval/results/report.md) (24/08/2026). Đổi số thì
đổi ở cả hai chỗ.

Slide 10 vẽ **hai lớp** có chủ đích: ô nhạt = đã có kịch bản sinh + validate
(72/72), ô đậm = đã có lượt CARLA thật (13/72). `metrics.coverage()` tính một ô
là đã phủ ngay khi có kịch bản, không đợi chạy — gộp một màu là mời người xem
hiểu nhầm "phủ 100%" thành "đã kiểm chứng 100%".

## Dựng lại file

```bash
cd presentation
uv run --with python-pptx python build_deck.py     # -> pitch_deck.pptx
soffice --headless --convert-to pdf --outdir . pitch_deck.pptx
```

## Video Demo Checklist

- [ ] Giới thiệu problem (< 30 giây)
- [ ] Demo live feature chính (2-3 phút)
- [ ] Hiển thị kết quả AI (1 phút)
- [ ] Tóm tắt impact (< 30 giây)

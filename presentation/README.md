# Pitch Deck Demo Day

## Files

- `pitch_deck.pptx` — bản chỉnh sửa, 8 slide.
- `pitch_deck.pdf` — bản PDF dự phòng khi PowerPoint lỗi font/animation.
- `DEMO_RUNBOOK.md` — lời thoại và thao tác live theo quỹ 10 phút.

Các câu giải thích dài nằm trong **speaker notes** của PPTX; slide chỉ giữ bằng
chứng, sơ đồ và kết luận chính.

## Cấu trúc 8 slide

| # | Slide | Vai trò |
|---|---|---|
| 1 | Một câu tiếng Việt → một `.xosc` chạy được | Lời hứa sản phẩm |
| 2 | Xe tự lái hỏng ở tình huống hiếm | Vấn đề |
| 3 | Từ câu vào tới artifact cụ thể | Giải pháp |
| 4 | Sáu maneuver trong phạm vi | Dẫn vào demo |
| 5 | Hai cổng người duyệt + CARLA thật | USP quản trị |
| 6 | Controller thoát được thì dò bản khó hơn | USP closed-loop |
| 7 | M1/M2/M3 và bằng chứng vật lý | Kết quả |
| 8 | Cắm controller của doanh nghiệp | Hướng tiếp theo |

Quỹ thời gian: khoảng 3 phút slide, 4 phút demo, 2 phút kết quả/USP và 1 phút
dự phòng chuyển màn hình hoặc câu hỏi ngắt quãng. Không trình bày kiến trúc hay
tech stack nếu BGK không hỏi.

Số liệu M1/M2/M3 lấy trực tiếp từ database qua `/api/v1/metrics/quality`
(snapshot **03/09/2026**). Cost/latency lấy từ
[`eval/results/report.md`](../eval/results/report.md) (24/08/2026).

Coverage chính thức là **72/72 ô trong phạm vi converter**. Database còn ba ô
lịch sử ngoài phạm vi, nên có 75 ô từng chạy CARLA; không viết `75/75` vì 75
không phải mẫu số của support policy.

## Dựng lại file

```bash
cd presentation
uv run --with python-pptx python build_deck.py
soffice --headless --convert-to pdf --outdir . pitch_deck.pptx
```

Sau khi dựng, mở cả PPTX và PDF để kiểm tra xuống dòng. Trước buổi nói, mở sẵn
các URL trong `DEMO_RUNBOOK.md`; không phụ thuộc vào một lần gọi LLM hoặc một
lượt CARLA mới để hoàn tất câu chuyện chính.

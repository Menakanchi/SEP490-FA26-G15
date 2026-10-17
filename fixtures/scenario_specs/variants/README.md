# Biến thể kịch bản đã chạy thật trên CARLA

Chín `ScenarioSpec` trong phạm vi converter (cao tốc Town04), dựng quanh `sc_001`
nhưng đổi loại xe, thời tiết, thời điểm trong ngày và hành vi. Mỗi file đã đi đúng
đường của kịch bản thật: `ScenarioDraft` → `validate_node` → `promote` →
`convert_spec_to_xosc`. `tests/test_variant_fixtures.py` giữ cho chúng không âm thầm
hỏng khi luật converter siết lại (chuyện đã xảy ra với seed `sc_901`).

`fixtures/xosc/variants/` là `.xosc` biên dịch từ các spec này — tải thẳng lên
`worker/dev_ui.py` được.

## Đưa lên web

```bash
uv run python scripts/submit_fixture.py fixtures/scenario_specs/variants/   # cả thư mục
uv run python scripts/submit_fixture.py fixtures/scenario_specs/variants/sc_105_sudden_brake_car_clear_day.json
```

Script chỉ đẩy vào hàng chờ **Cổng 1**; người duyệt (tài khoản ENGINEER) bấm
Approve ở `/review` thì worker mới chạy CARLA.

## Kết quả chạy CARLA 0.9.16 (17/10/2026)

Ego giữ tốc độ (`constant_speed`, không có AEB). `CollisionTest = FAILURE` là kết quả
mong muốn: kịch bản đã dựng được nguy hiểm.

| Spec | Hành vi | Tác nhân | Thời tiết / giờ | CollisionTest | Khe hở nhỏ nhất | TTC radar nhỏ nhất |
|---|---|---|---|---|---|---|
| sc_101 | cut_in | xe máy | mưa, chạng vạng | FAILURE (va chạm) | 0,00 m | 0,009 s |
| sc_102 | cut_in | ô tô | quang, ngày | FAILURE | 0,00 m | 0,012 s |
| sc_103 | cut_in | xe tải | sương mù, ngày | FAILURE | 0,00 m | 0,054 s |
| sc_104 | cut_in | xe máy | mưa to, đêm | FAILURE | 0,00 m | 0,005 s |
| sc_105 | sudden_brake | ô tô | quang, ngày | FAILURE | 0,00 m | 0,012 s |
| sc_106 | sudden_brake | xe tải | mưa, ngày | FAILURE | 0,00 m | 0,012 s |
| sc_107 | stop_in_lane | ô tô | sương mù, ngày | FAILURE | 0,00 m | 0,007 s |
| sc_108 | lane_drift | xe tải | quang, ngày | SUCCESS (không va chạm) | 0,00 m — suýt quẹt, lấn 4,9 m | — |
| sc_109 | wrong_way | ô tô | quang, đêm | FAILURE | 0,00 m | 0,012 s |

`sc_108`: **cả radar lẫn obstacle sensor đều không bắt được** xe tải lấn làn
(`radar_min_ttc_s` và `obstacle_min_distance_m` đều `null`); chỉ quỹ đạo ground truth
thấy khe hở 0 m và độ lấn 4,9 m. Hai sensor này nhìn thẳng phía trước (radar nón ±4°,
obstacle một tia dọc trục xe) nên mù với xe ép vào từ bên hông — một AEB chỉ dựa vào
chúng sẽ không phản ứng. Đây là ca nên dùng khi đánh giá độ phủ cảm biến.

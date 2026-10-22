# 18/10/2026 — Xuất OpenSCENARIO và chạy CARLA local từ web

## Mục tiêu

Theo yêu cầu người dùng: web hiện tại xuất `.xosc` thay cho JSON dùng để chạy CARLA, và có nút chạy trên CARLA 0.9.16
ở máy Windows này như `origin/feature/carla-0.9.16-local`. Giữ các bản vá CARLA/telemetry đang có trong checkout.

## Phạm vi và thiết kế

- Luồng sản phẩm dùng Spring Boot + Next.js hiện tại, không đưa FastAPI/SQLite/graph Forge trở lại.
- Sinh OpenSCENARIO 1.0 tất định cho CP_CROSSING (motif hiện có của IR). XML có entities, vị trí, thời tiết,
  trigger khoảng cách và chuyển động người đi bộ; seed, AEB, xe và source là ParameterDeclarations để tái lập.
- ScenarioRunner 0.9.16 chạy file XML thật. Adapter controller gọi cùng `AebStack` và builder/evaluator của worker;
  camera bám xe và sensor recorder dùng lại phần có sẵn. Kết quả vẫn ghi vào hợp đồng `result.json` nội bộ.
- Profile `carla-xosc` có simulator identity riêng để không ghép kết quả với runner CARLA trực tiếp cũ.
- Web tải `.xosc`, khởi chạy, theo dõi run, xem kết quả và telemetry đã ghi; quyền/hạn mức áp ở API.
- Cài ScenarioRunner/venv riêng trên máy Windows để kiểm thử. Không sửa DB demo hoặc reset schema.

## Các bước và điều kiện hoàn thành

1. Bộ sinh + đọc XML, schema/golden/round-trip tests; không LLM, không import CARLA trong Java/lõi.
2. Adapter AEB + wrapper ScenarioRunner + dọn tiến trình/actor sau lỗi; chuẩn bị môi trường local.
3. API export/run/status/results nối vào hàng đợi; tests quyền, seed, simulator và lỗi tiến trình.
4. UI theo token hiện có; lint, typecheck, build và nhìn UI sau đăng nhập.
5. Chạy CARLA thật khi môi trường cho phép; ghi bằng chứng, giới hạn thực tế và cập nhật ADR/tài liệu.

## Tiến độ / bằng chứng

Hoàn thành 19/10/2026. Dùng [ScenarioRunner v0.9.16](https://github.com/carla-simulator/scenario_runner/tree/v0.9.16)
(commit `94ff3b8`), CARLA server/client 0.9.16 và Python 3.12 ở `worker/.venv-carla`. Nhánh tham chiếu chỉ dùng
đối chiếu luồng; backend vẫn là Java và không có dependency CARLA.

- `mvnw.cmd clean test`: **121 test đạt**, gồm schema XSD, phân quyền export/run, quota, seed/source và bảo vệ đường dẫn artifact.
- Python 3.11: `python -m pytest worker/tests -q`: **75 test đạt**; `ruff check worker` đạt.
- Frontend: `npm run lint`, `npx tsc --noEmit`, `npx next build` đều đạt (16 routes).
- CARLA thật qua API trên DB sao chép `vehicsim_xosc_check_20261019`: family 15, baseline 1580, replay 1581,
  candidate 1582, regression 8 `PASSED`, seed `48846`. Baseline ghi **73 frame cảm biến, 15 ảnh RGB**; tải ảnh qua
  API trả PNG thật. Replay giữ nguyên seed/IR/AEB/xe; regression không tự Accept.
- CP_CROSSING có va chạm hông xe ở ca này (TD-18), tốc độ va chạm 11,024 m/s. `PASSED` của regression chỉ nói
  candidate không kém baseline theo bộ chấm, không nói xe đã an toàn. TD-17 về phanh chưa hiệu chuẩn vẫn mở.
- Thử CLI thật ở cả hai biên: 10 km/h–5 m–0,5 m/s và 130 km/h–80 m–8 m/s; đều hoàn thành, ghi result/telemetry,
  lần lượt 83 và 71 frame AEB, verdict `FAIL` do va chạm. Đây là kết quả mô phỏng hợp lệ, không phải lỗi thực thi.
- Đã đăng nhập trình duyệt, chọn họ và bấm chạy, quan sát `Đang chờ` → `Đang chạy` → `Hoàn thành`, xem cảm biến/ảnh
  và kéo thanh chọn khung. Lượt bấm cuối #1583 hoàn thành và tự hiện 15 ảnh; ảnh kiểm chứng local nằm ở
  `data/carla-web-proof.png` (gitignore). UI dùng token của repo. Link Figma trong kế hoạch cũ không truy cập được khi kiểm tra,
  nên chưa xác nhận khớp từng pixel với bản Figma riêng tư.
- Đã dừng hai dịch vụ kiểm thử :8002/:3001 và chạy `scripts/dev-carla.ps1 -RestartBackend` cho app chính. Kiểm tra
  `/health` :8001 trả `UP`, `/login` :3000 trả 200, CARLA probe trả client/server 0.9.16 tương thích và có ScenarioRunner.
  Hỗ trợ cả Java classpath qua `@argfile` khi xác minh tiến trình backend trước khi restart. Dữ liệu kiểm thử chỉ ở DB sao chép.

## Quyết định thực tế và giới hạn còn lại

- Chọn LanePosition ở Town04 road 40/lane -4, s khởi đầu 20 m: đoạn thẳng dài 228 m, đủ dải IR hiện có. WorldPosition
  phẳng của anchor Forge cũ lệch cao độ/đường cong khi tăng khoảng cách; LanePosition lấy cao độ từ map thật.
- Mọi artifact được tạo trong thư mục run, tải qua endpoint cần đăng nhập. JSON bundle/result chỉ là hợp đồng nội bộ;
  `.xosc` là file tải xuống và đầu vào ScenarioRunner. Không đổi schema MySQL, không ghi kết quả vào DB gốc khi thử.
- TD-27 được giải quyết cho motif CP_CROSSING bằng exporter worker hiện tại; không hồi sinh taxonomy Forge. Sáu category
  chưa có mô phỏng vẫn thuộc TD-42. TD-01 chỉ còn perception tổng hợp; RGB/sensor đã hiển thị thật.
- Hướng dẫn cài/chạy và API: [carla-local.md](../../vehicsim/carla-local.md). ADR: [ADR-041](../../adr/ADR-041-xosc-va-scenariorunner-tu-web.md).

# Nợ kỹ thuật và khoảng trống đã biết

Mỗi dòng là thứ **đã biết là thiếu hoặc sai** nhưng chưa sửa. Sửa xong thì xoá dòng
trong cùng PR và ghi vào exec plan tương ứng. Thấy nợ mới mà không sửa ngay thì thêm
dòng ở đây — đừng để nó chỉ nằm trong chat.

Mức: **Cao** = chặn demo hoặc có thể sai dữ liệu · **Vừa** = làm chậm nhóm hoặc gây
hiểu nhầm · **Thấp** = thẩm mỹ, dọn dẹp.

| ID | Mức | Vấn đề | Hệ quả | Hướng xử lý đề xuất |
|---|---|---|---|---|
| TD-16 | Cao | Gate CI backend đỏ vì lỗi có sẵn từ trước nhánh `trungdam`: 3 lỗi I001 (`src/api/routes.py:323`, `src/services/db.py:1290`, `:1417`) và 2 file chưa format (`src/services/db.py`, `tests/test_api/test_routes.py`) | `make check` / CI không xanh nên không dùng được làm cổng merge | `uv run ruff check --fix src/ tests/ && uv run ruff format src/ tests/` trong một PR riêng, báo người đang sửa hai file đó trước để tránh xung đột |
| TD-01 | Cao | VehicSim chưa chạy CARLA; mọi run dùng simulator động học | Kết quả chưa có cảm biến/vật lý thật; view camera/LiDAR, Export clip để mờ | Cắm runner CARLA sau hợp đồng `runs.execute_run` (ADR-023); giữ simulator làm đường test nhanh |
| TD-02 | Cao | Không có migration cho MySQL; `01_schema.sql` chỉ chạy khi volume mới tạo | Đổi schema là DB của người khác lệch âm thầm; `down -v` xoá tài khoản | Thêm công cụ migration (vd. Alembic) hoặc thư mục `database/mysql/migrations/` đánh số |
| TD-03 | Vừa | Hai kho dữ liệu: Forge dùng SQLite, VehicSim dùng MySQL; báo cáo ghi PostgreSQL | Người mới không biết dữ liệu nào ở đâu; báo cáo vênh code | Chốt một DB cho bản nộp và cập nhật báo cáo §2.1.3 (ADR-024) |
| TD-04 | Vừa | CI chỉ chạy backend (`ruff`, `pytest`); frontend không có `eslint`/`tsc`/`next build` trong CI | Lỗi build frontend lọt qua PR | Thêm job frontend vào `.github/workflows/ci.yml` |
| TD-05 | Vừa | `ARCHITECTURE.md` ghi "chỉ 3 node được gọi LLM", nhưng test chỉ kiểm trong `src/agents/nodes`; `services/campaign.py` và `services/vehicsim/describe.py` cũng gọi LLM (qua `services/llm.py`) | Tài liệu nói chặt hơn thực tế | Nhóm chốt: sửa câu trong `ARCHITECTURE.md` thành "trong graph" + liệt kê caller ngoài graph, hoặc mở rộng test |
| TD-06 | Vừa | FE-13 (Optimization, Pareto, Robustness) và SHAP/Sensitivity chưa có | Khuyến nghị thiếu 3/4 bằng chứng (`NOT_RUN`); confidence chỉ dựa vào regression | Làm theo kế hoạch Demo 3 (06/12) |
| TD-07 | Vừa | Màn đăng nhập/đăng ký/quên mật khẩu chưa có frame Figma (FE-01) | Giao diện chưa được duyệt thiết kế | Người phụ trách FE-01 vẽ frame; chỉnh code theo |
| TD-08 | Vừa | UI đã tiếng Việt nhưng backend vẫn sinh câu tiếng Anh; frontend dịch bằng mẫu regex trong `components/vehicsimI18n.ts`. Tên trong DB (họ kịch bản, 10 tham số AEB) vẫn tiếng Anh theo quyết định giữ nguyên dữ liệu | Đổi câu chữ backend mà quên sửa mẫu thì câu đó hiện lại tiếng Anh (không mất thông tin); Figma vẫn tiếng Anh | Chuyển backend sang trả mã + tham số có cấu trúc thay vì câu hoàn chỉnh, hoặc thêm test khớp mẫu; cập nhật Figma nếu chốt UI tiếng Việt |
| TD-09 | Thấp | Tên họ kịch bản được trùng (vd. PX và PX2 cùng "Pedestrian Crossing") | Ô lọc trên màn Ca lỗi hai ô giống hệt | Hiện mã họ cạnh tên, hoặc chặn trùng tên trong project |
| TD-10 | Thấp | `.env.example` thiếu `VEHICSIM_RUN_MODE`, `CELERY_BROKER_URL`, `SIMULATION_TIMEOUT_S` | Người mới không biết có công tắc chạy inline | Bổ sung với giá trị mặc định |
| TD-11 | Thấp | `ruff` báo lỗi ở file ngoài phạm vi CI: `scripts/log_hook.py`, `scripts/log_manual.py`, `worker/mock_runner.py`, `test_smtp_direct.py` (thư mục gốc) | `ruff check .` đỏ dù CI xanh | Sửa hoặc đưa vào `exclude`; chuyển/xoá `test_smtp_direct.py` |
| TD-12 | Thấp | Export PDF của Recommendation dùng lệnh in của trình duyệt | Không có file PDF chuẩn hoá để đính kèm báo cáo | Sinh PDF phía server nếu báo cáo cần |
| TD-13 | Thấp | `docker-compose.yml` còn khoá `version` đã lỗi thời | Mỗi lệnh compose in cảnh báo | Xoá khoá `version` |
| TD-14 | Thấp | Scenario IR của bước 1 chỉ có motif người đi bộ băng ngang; chi tiết khác (xe đỗ che khuất, nhiều người) chỉ nằm trong `notes` | Mô tả phong phú bị rút gọn | Mở rộng IR khi simulator/CARLA hỗ trợ thêm yếu tố |
| TD-15 | Thấp | Màn Generator cũ của Forge vẫn ở `/generator` với giao diện cũ; quan hệ với bước 1 VehicSim chưa chốt | Hai lối vào "sinh kịch bản" khác nhau | Nhóm (FE-06) chốt giữ hay gộp |

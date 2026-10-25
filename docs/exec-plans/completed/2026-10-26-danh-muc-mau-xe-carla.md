# 26/10/2026 — Màn "Phương tiện": danh mục mẫu xe CARLA (FE-04-01/02)

Mục "Phương tiện" ở sidebar trước đây khóa ("Chưa có trong đợt MVP"); DB chỉ có Audi e-tron. Phạm vi đã chốt trước khi code:
thêm 4 xe đã đo ở [exec plan 22/10](../active/2026-10-22-chay-baseline-thanh-vien-2.md) mục 6, chỉ làm phần **xem**.

## Quyết định áp dụng

1. **Xe thêm:** Tesla Model 3, Nissan Patrol 2021, Mercedes Sprinter, CarlaMotors European HGV — 4 xe đã có số đo phanh thật trên CARLA.
   Không thêm toàn bộ ~30 xe của CARLA (chưa đo phanh).
2. **`max_brake_decel_mps2` = 9,5 m/s²** như e-tron (giới hạn phanh của bộ động học). Số đo CARLA (1,77–6,01 m/s²) chỉ hiển thị để đối
   chiếu: CARLA phanh yếu hơn xe thật (TD-17), dùng nó làm giới hạn sẽ kéo lỗi đó vào bộ động học. 9,5 là giả định chung, không có
   nguồn riêng từng xe.
3. **Xe tải 6 bánh `is_supported = FALSE`** (chỉ để xem): 9,5 m/s² không đúng với xe tải. Nới `ck_cvm_wheels` thành `(2, 4, 6)`.
4. **Chưa làm "chọn xe cho project"** (TD-52): regression ép baseline và candidate cùng xe, đổi xe giữa chừng làm hỏng so sánh đang dở.
5. **Không sửa dòng e-tron** (run cũ dựa vào nó; khối lượng DB 2100 kg khác mặc định CARLA 2370 kg — giữ nguyên).

## Việc làm

- **`worker/vehicle_catalog.py`** (mới): spawn từng blueprint ở Town04 road 40, đọc physics **mặc định** (`carla_physics.physics_snapshot`)
  và mesh, đổi sang cột `carla_vehicle_models`; `--study` lấy giảm tốc phanh 100% từ `vehicle_study.json`. Ghi JSON + SQL, không ghi DB.
  Chiều dài cơ sở lấy trục trước tới trục sau cùng (xe 6 bánh không lấy trục giữa). Ma sát lốp / mô-men phanh: lấy bánh lớn nhất —
  với 4 xe này mọi bánh bằng nhau nên đúng tuyệt đối. `max_speed_mps` không có trong physics CARLA → NULL.
  Test: `worker/tests/test_vehicle_catalog.py` (5 test, module CARLA không cần).
- **Migration `011_2026-10-26_them-mau-xe-carla.sql`**: nới CHECK số bánh; INSERT bỏ qua blueprint đã có. `01_schema.sql` +
  `database-schema.md` cập nhật cùng.
- **Backend** (chỉ đọc, mọi role đã đăng nhập): `VehicleCatalogService` + `VehicleController`
  - `GET /api/v1/vehicsim/vehicles` — mọi mẫu xe, xe project đang dùng đứng đầu, số run trong project hiện tại (TD-30).
  - `GET /api/v1/vehicsim/vehicles/{id}` — thêm physics, cảm biến (bảng `sensors`), số run theo bộ mô phỏng; id lạ → 404.
  - Test: `VehicleCatalogServiceTest` (4); `VehicSimSecurityTest` nạp thêm controller mới (route mới tự vào phép kiểm "cần đăng nhập")
    và `everyRoleCanBrowseTheVehicleCatalog`.
- **Frontend:** mở khóa mục sidebar; `/vehicles` (bảng) và `/vehicles/[vehicleId]` (kích thước, vật lý CARLA, phanh, cảm biến, lịch sử
  dùng). Số thiếu hiện "—"; ghi chú TD-17 ở cả hai trang. Định dạng số ở `components/vehicleFormat.ts`.

## Bằng chứng

- CARLA 0.9.16 Windows, 26/10: `vehicle_study.py --out data/vehicle-study` — mã thoát 0, giảm tốc 3,56 / 6,01 / 5,69 / 1,77 m/s², trùng
  số đo 22/10. `vehicle_catalog.py --study ...` sinh đúng SQL đưa vào migration.
- Sao lưu DB trước migration (`mysqldump --single-transaction`); chạy migration **hai lần**: vẫn 5 dòng, dòng e-tron không đổi.
- API thật (tài khoản MANAGER): danh sách 5 xe, e-tron `in_use` với 84 run (78 động học, 6 CARLA); `/vehicles/999` → 404; không token → 401.
- `./mvnw test`: 405 test, 0 lỗi (1 skip có từ trước). `pytest worker/tests`: 57 test qua. `tsc --noEmit` và `eslint` sạch.
- Chạy app, đăng nhập ENGINEER qua giao diện, chụp `/vehicles`, `/vehicles/1`, `/vehicles/5`: không lỗi console. Ảnh đầu tiên lộ lỗi
  hiển thị khối lượng (`fmt.num` cắt số 0 cuối: 2100 → "21") — đã sửa bằng `withUnit`.

## Chưa làm / giới hạn

- Chọn xe cho project — TD-52.
- Không truy cập được Figma: chưa đối chiếu thiết kế; giao diện dựng theo component có sẵn (`VehicSimPage`, `StatCard`, bảng như
  màn kiểm thử hồi quy).
- Chưa chạy `npm run build` (dev server đang dùng thư mục `.next`).
- Bảng `sensors` đang trống cho mọi xe: trang hiện "Chưa cấu hình cảm biến", không tự điền cấu hình radar/camera của runner.

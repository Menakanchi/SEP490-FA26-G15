# 25/10/2026 — Màn 1: phiên bản họ kịch bản (task 4) và dọn map Town04 (task 8)

Làm theo quyết định của Trung ở [ghi-chu/thac-mac-con-lai.md](../../../ghi-chu/thac-mac-con-lai.md) mục E (A1 và A5.1). Không đổi schema:
`scenario_versions.version_no` / `parent_version_id` đã đủ. Không chạy CARLA (kiểm bằng bộ động học).

## Quyết định áp dụng

1. Sửa họ = **tạo bản gốc mới** (v2, v3…), không sửa đè — bản cũ, biến thể cũ và run của chúng giữ nguyên (bất biến 4: baseline cũ tái lập được).
2. Bản mới **sinh biến thể mới** (`scenario_version_id` mới) → phải chạy cơ sở lại; không ghép theo IR.
3. Màn 2 mặc định hiện bản mới nhất, có ô chọn bản cũ.
4. Chặn sửa khi họ còn run PENDING / RUNNING / PAUSED.
5. `FamilyService.DEFAULT_MAP` = `Town04` cho dòng mới; dữ liệu cũ giữ nguyên.

## Việc làm

- **`FamilyService`:**
  - `createVersion` (một transaction, `SELECT … FOR UPDATE` dòng `scenarios` để không trùng `version_no`):
    - kiểm spec (gồm luật 12 s);
    - chặn khi còn run chưa xong, hoặc khi không gian tham số không đổi (so theo giá trị — JSON đọc lại trả `40` thay vì `40.0`);
    - thêm bản gốc MANUAL với `version_no` = max + 1, biến thể nối tiếp số;
    - cập nhật mô tả. Tên họ giữ nguyên (UNIQUE theo project).
  - Tách `checkRules` / `insertBase` / `insertVariants` dùng chung với `createFamily`.
  - Thêm `baseVersions` (thứ tự tạo = v1, v2…).
- **`ViewsService`:**
  - `/families`: thêm `version`, `version_count`, `base_version_id`; `runs` chỉ đếm run của bộ biến thể hiện hành (trước đây cộng mọi run của họ).
  - `familyVersions`: lịch sử bản, gồm không gian tham số, số biến thể và lượt chạy của từng bản.
  - `analysisDataset(scenarioId, baseVersionId)`: chỉ lấy biến thể của bản đó (mặc định bản mới nhất), snapshot ghi `scenario.version` /
    `base_version_id`. Trước đây lấy mọi biến thể GENERATED của họ — sẽ trộn bản cũ / mới.
- **API:**
  - `POST /families/{id}/versions` (ENGINEER / EXPERIENCER / ADMIN, `run_baseline` như khi tạo);
  - `GET /families/{id}/versions`;
  - `GET /analysis/dataset?base_version_id=`.
- **Không phải sửa** (đã lấy theo `latestBaseVersionId`):
  - `RunService.runFamily`, `RegressionService`, `OptimizationService`;
  - đếm "lỗi trên bản cơ sở" của `/families`.
- **Frontend `/scenarios`:**
  - nhãn `vN`;
  - ô chọn bản khi họ có nhiều bản — bản cũ hiện không gian / biến thể / lượt chạy của nó, nhãn "bản cũ · chỉ xem";
  - nút "Sửa → bản vN+1" mở `FamilyForm` điền sẵn không gian hiện hành, tên họ khoá. Nút khoá khi còn lượt chạy, kèm lý do.
- **Task 8:**
  - `DEFAULT_MAP` = `Town04`;
  - bỏ comment trỏ `describe.py` / `family.py` đã gỡ (frontend, `DescribeService`, `FamilyService`);
  - `database-schema.md` cập nhật `map_name` / `scenario_versions`.

## Kiểm chứng (25/10/2026)

- `FamilyVersionTest` (5 test, `Db` giả):
  - bản mới thêm bản gốc + biến thể con, `version_no` nối tiếp, map Town04, không UPDATE / DELETE bản cũ;
  - còn run → 400; không gian không đổi (40 / 40.0, khác thứ tự) → 400; luật 12 s và họ lạ.
- `AnalysisDatasetTest` thêm test dataset theo bản (mặc định v2, chọn v1, bản lạ 404, token khác nhau).
- Chạy thật (backend động học, MySQL docker, DB sao lưu trước và khôi phục sau), API 19/19:
  - tạo v1 4 biến thể chạy xong;
  - không gian không đổi / còn run RUNNING / cặp không tới vạch → 400; MANAGER → 403;
  - v2 6 biến thể: `/families` hiện v2, 0 lượt chạy, tên giữ, mô tả mới;
  - lịch sử v1 (4 xong) + v2; biến thể và run v1 còn nguyên; biến thể v2 map Town04, `version_no` nối tiếp;
  - dataset mặc định v2 (6 chưa chạy), v1 (4 đã chạy), bản lạ 404;
  - chạy cơ sở → 6 run của v2, `/families` không cộng run v1.
- UI (Playwright + Chromium, không mock API):
  - ô chọn mặc định v2; chọn v1 → "bản cũ · chỉ xem", 4 đã xong;
  - "Sửa → bản v3" → form điền sẵn `40, 60, 80`, tên khoá → thêm 100 km/h → "Đã tạo … v3 với 8 biến thể và xếp 8 lượt chạy cơ sở" → 8 đã xong.
  - Không có lỗi JS. Lần chụp đầu thấy ô chọn bản tràn sang cột tham số → chuyển xuống dòng riêng dưới tên họ.

## Giới hạn

- `AnalysisService` (dashboard run của màn 3) vẫn liệt kê run của mọi bản — mỗi run có `version_no` biến thể nên truy vết được; muốn lọc
  theo bản thì Chu thêm điều kiện `parent_version_id`.
- "Lưu dataset" (`POST /analysis/datasets`) chỉ chốt bản hiện hành; bản cũ xem được, chưa lưu được.
- Màn 5 / báo cáo chưa ghi số bản (đề xuất A1.5 cho Chu, Tu).

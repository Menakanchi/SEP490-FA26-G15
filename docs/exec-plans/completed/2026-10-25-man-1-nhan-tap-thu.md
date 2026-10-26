# 25/10/2026 — Màn 1: nhãn ca nguy hiểm / an toàn cho biến thể (task 5)

Làm theo đề xuất của Trung ở [ghi-chu/thac-mac-con-lai.md](../../../ghi-chu/thac-mac-con-lai.md) mục E (A2): tự suy làm mặc định, cho sửa tay,
lưu trong `scenario_ir_json`. Không đổi schema, không migration. Câu A2.3 (tỉ lệ ca an toàn tối thiểu, cách màn 3 dùng nhãn) do Chu chốt — chưa làm.

## Quy ước

- `DANGEROUS` = AEB **phải** phanh; `SAFE` = AEB **không nên** phanh.
- Tự suy (`FamilyService.autoRiskLabel`): người đi bộ dừng ở lề → SAFE (phanh là phanh oan), băng qua làn → DANGEROUS. Đúng với cách
  chấm hiện tại (phanh oan đo ở ca dừng ở lề).
- Sửa tay: `scenario_ir_json.risk_label` = `DANGEROUS` / `SAFE`; `AUTO` xoá khoá này để quay về tự suy. Biến thể cũ không có khoá → tự suy,
  nên không cần sửa dữ liệu.
- **Nhãn chỉ để chọn tập dữ liệu**, không đổi cách chấm phanh oan / phanh sót của run. Run tạo sau khi sửa nhãn chép nhãn vào
  `run_config_json` (vì `run_config_json` là bản sao IR biến thể); `Bundle` bỏ qua khoá này nên mô phỏng không đổi.

## Việc làm

- **`FamilyService`:**
  - `autoRiskLabel` / `riskLabel` / `riskLabelManual` / `riskCounts`;
  - `setRiskLabel`: chỉ biến thể GENERATED của họ thuộc project hiện tại, dùng `JSON_SET` / `JSON_REMOVE`.
- **`ViewsService`:**
  - `familyVariants(scenarioId, baseVersionId)` theo bản (mặc định bản hiện hành);
  - `/families` và lịch sử bản có `risk_counts`;
  - dataset phân tích có `risk_label` từng biến thể và `risk_counts`.
- **API:**
  - `GET /families/{id}/variants?base_version_id=`;
  - `PUT /families/{id}/variants/{vid}/risk-label` `{label}` (ENGINEER / EXPERIENCER / ADMIN, hạn mức ghi, ghi audit `scenario.risk_label`).
- **Frontend `/scenarios`:**
  - cột Biến thể hiện "n nguy hiểm / m an toàn" theo bản đang xem;
  - "Gắn nhãn ▾" mở danh sách biến thể của bản đang xem, mỗi dòng có nhãn (kèm "sửa tay") và ô chọn Tự suy / Nguy hiểm / An toàn.
  - Người chỉ có quyền xem thấy ô chọn bị khoá.

## Kiểm chứng (25/10/2026)

- `FamilyRiskLabelTest` (5 test): tự suy, nhãn sửa tay thắng, giá trị rác không tính, đếm đủ hai khoá, `JSON_SET` / `JSON_REMOVE`, nhãn lạ 400,
  biến thể ngoài họ 404. `AnalysisDatasetTest`: nhãn và tổng theo bản.
- Chạy thật (backend động học, DB sao lưu trước và khôi phục sau), API 12/12:
  - họ 4 biến thể tự suy 2/2;
  - sửa tay ca băng qua → SAFE (lưu trong IR, `/families` 1/3, dataset 1/3);
  - AUTO xoá khoá; nhãn lạ 400; biến thể lạ 404; REVIEWER 403;
  - chạy cơ sở sau khi gắn SAFE cho ca băng qua: run không bị chấm phanh oan, `run_config_json` có nhãn.
- UI (Playwright + Chromium, không mock API):
  - cột Biến thể "1 nguy hiểm / 3 an toàn";
  - mở "Gắn nhãn" thấy 4 biến thể, một "An toàn · sửa tay";
  - gắn ca dừng ở lề thành Nguy hiểm → "Nguy hiểm · sửa tay", cột đổi 2/2; chọn Tự suy → trở lại.
  - Không có lỗi JS.

## Giới hạn

- Chưa có ai đọc nhãn để chọn tập: tối ưu / regression vẫn chọn theo `old_critical` / `all_variants`. Nối vào màn 3 / 4 / 5 khi Chu chốt
  tỉ lệ.
- Sửa nhãn không bị khoá khi họ đang chạy (nhãn không ảnh hưởng run).

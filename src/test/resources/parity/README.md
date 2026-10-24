# Fixture parity Python → Java (ADR-042)

Các file `*.json` / `kinematic.json.gz` ở đây là kết quả của lõi **Python cũ** (`worker/vehicsim_core/`, `kinematic_sim.py`,
`openscenario_export.py`), dùng làm sự thật tham chiếu cho port Java `com.vehicsim.core`. Test đối chiếu:
`PyCompatTest`, `KinematicParityTest`, `BundleParityTest`, `FiltersParityTest`, `XoscReadParityTest`, `XoscExportTest`.

**Lõi Python đã xóa ở mốc M5. Commit cuối cùng còn lõi Python: `601280352730146943df37629a62ebf00971e42d`.**

- Không sửa tay fixture. Hành vi Java đổi (có chủ đích) thì đổi định danh simulator, ghi vào exec plan và cập nhật test, đừng
  sửa số cho khớp.
- `generate_from_python.py` chỉ chạy được trên commit trên (hoặc commit cũ hơn còn `worker/vehicsim_core`), không chạy được ở nhánh hiện tại:

  ```bash
  git worktree add ../vsos-python-core 601280352730146943df37629a62ebf00971e42d
  (cd ../vsos-python-core && python src/test/resources/parity/generate_from_python.py)
  ```

  Sau M5 không còn cách sinh lại fixture từ nhánh chính; muốn thêm ca mới phải dựng worktree như trên.
- **Ngoại lệ có chủ đích (23/10/2026, TD-47, `vehicsim.xosc/v4`):** `xosc.json` giữ nguyên là đầu ra Python (v3). Ca băng ngang của
  bộ xuất Java chỉ khác Python ở `vs_format`; ba ca `stops_at_curb` (`export 2`, `5`, `16`) đổi hình học + thêm event `StopAtCurb`, nên
  `XoscReadParityTest` so chúng với `xosc_v4_stops_at_curb.json` — file này **sinh từ bộ xuất Java**, không phải từ Python. Sinh lại bằng
  cách chạy `XoscExport.export` trên đúng `bundle` / `seed_override` / `aeb_override` của các ca đó (đọc spec như `XoscReadParityTest`).
- Hash golden của lưới 1296 ca bộ động học và kết quả đối chiếu rộng (`-Dvsos.parity.full=...`) ghi ở
  [exec plan 21/10](../../../../docs/exec-plans/active/2026-10-21-port-loi-aeb-sang-java.md#nhật-ký-bằng-chứng).

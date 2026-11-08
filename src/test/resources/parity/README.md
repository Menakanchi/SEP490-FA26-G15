# Fixture parity Python → Java (ADR-042)

Các file `*.json` / `kinematic.json.gz` ở đây là kết quả của lõi **Python cũ** (`worker/vehicsim_core/`, `kinematic_sim.py`,
`openscenario_export.py`), dùng làm sự thật tham chiếu cho port Java `com.vsos.core`. Test đối chiếu:
`PyCompatTest`, `KinematicParityTest`, `BundleParityTest`, `FiltersParityTest`, `XoscReadParityTest`, `XoscExportTest`.

**Lõi Python đã xóa ở mốc M5. Commit cuối cùng còn lõi Python: `6af5ed2ad5275eba9c029499711e637ad801448e`.**

- Không sửa tay fixture. Hành vi Java đổi (có chủ đích) thì đổi định danh simulator, ghi vào exec plan và cập nhật test, đừng
  sửa số cho khớp.
- `generate_from_python.py` đã xóa khỏi nhánh hiện tại (26/10/2026); nó chỉ chạy được trên commit trên (hoặc commit cũ hơn còn
  `worker/vehicsim_core`), nơi file vẫn còn:

  ```bash
  git worktree add ../vsos-python-core 6af5ed2ad5275eba9c029499711e637ad801448e
  (cd ../vsos-python-core && python src/test/resources/parity/generate_from_python.py)
  ```

  Sau M5 không còn cách sinh lại fixture từ nhánh chính; muốn thêm ca mới phải dựng worktree như trên.
- **Ngoại lệ có chủ đích (23/10/2026, TD-47, `vehicsim.xosc/v4`):** `xosc.json` giữ nguyên là đầu ra Python (v3). Ca băng ngang của
  bộ xuất Java chỉ khác Python ở `vs_format`; ba ca `stops_at_curb` (`export 2`, `5`, `16`) đổi hình học + thêm event `StopAtCurb`, nên
  `XoscReadParityTest` so chúng với `xosc_v4_stops_at_curb.json` — file này **sinh từ bộ xuất Java**, không phải từ Python. Sinh lại bằng
  cách chạy `XoscExport.export` trên đúng `bundle` / `seed_override` / `aeb_override` của các ca đó (đọc spec như `XoscReadParityTest`).
- **Ngoại lệ có chủ đích (08/11/2026, ADR-051, `vehicsim.xosc/v5`):** test thay `vs_format` của cả hai fixture thành v5 trước khi so.
  `export 5` mang `physics.wheels = {tire_friction, max_brake_torque}`: Python bỏ lặng lẽ, v5 chỉ mang được `{max_brake_torque}` nên
  từ chối ca này — test khẳng định việc từ chối thay vì so từng byte.
- Hash golden của lưới 1296 ca bộ động học và kết quả đối chiếu rộng (`-Dvsos.parity.full=...`) ghi ở
  [exec plan 21/10](../../../../docs/exec-plans/active/2026-10-21-port-loi-aeb-sang-java.md#nhật-ký-bằng-chứng).

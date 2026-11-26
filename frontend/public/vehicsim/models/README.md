# Model 3D minh họa của mẫu xe

Trang chi tiết xe (`/vehicles/[id]`) hiển thị model 3D từ thư mục này. Mesh xe của CARLA nằm trong gói `.pak` của
Unreal nên trình duyệt không đọc được; model ở đây là **ảnh minh họa**, không phải mesh dùng trong mô phỏng — kích thước
và vật lý vẫn lấy từ `carla_vehicle_models`.

## Thêm model cho một xe

1. Tải file **`.glb`** (glTF nhị phân) có giấy phép cho phép dùng lại.
2. Đặt tên theo blueprint CARLA của xe: `vehicle.audi.etron.glb`, `vehicle.tesla.model3.glb`,
   `vehicle.nissan.patrol_2021.glb`, `vehicle.mercedes.sprinter.glb`, `vehicle.carlamotors.european_hgv.glb`.
3. Thêm mục tương ứng vào `VEHICLE_MODELS` trong `frontend/src/components/vehicleModels.ts` (tác giả, link nguồn,
   giấy phép). Trang tự hiện dòng ghi công dưới khung 3D.

## Yêu cầu file

- Giấy phép: CC0, CC BY 4.0 hoặc tương đương cho phép dùng lại. **Không** dùng model "Editorial" / "Non-commercial" /
  không rõ giấy phép. CC BY phải ghi đúng tác giả và link nguồn trong `vehicleModels.ts`.
- Dung lượng: nên ≤ 5 MB mỗi file (file nằm trong repo và tải về trình duyệt mỗi lần xem). 5 file hiện có được nén bằng
  `npx @gltf-transform/cli@4.5.1 optimize in.glb out.glb --compress quantize --texture-compress webp --texture-size 1024 --simplify true --simplify-error 0.001`
  (KHR_mesh_quantization và WebP trình duyệt / three.js đọc thẳng, không cần bộ giải mã).
- Không dùng nén Draco, meshopt hay texture KTX2: `<model-viewer>` sẽ tải bộ giải mã từ CDN, không chạy được khi máy offline.
- Model dùng vật liệu `KHR_materials_pbrSpecularGlossiness` (three.js không còn đọc) phải đổi trước:
  `npx @gltf-transform/cli@4.5.1 metalrough in.glb in-metalrough.glb`, rồi mới `optimize`.
- Mũi xe hướng theo trục +Z hoặc -Z, gốc tọa độ ở giữa xe; model lệch thì xoay/dời lại bằng Blender trước khi đưa vào.

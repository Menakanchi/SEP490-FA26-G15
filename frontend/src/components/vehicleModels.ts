/**
 * Model 3D hiển thị ở trang chi tiết xe (`/vehicles/[id]`). Mesh xe của CARLA nằm trong file .pak của Unreal, trình duyệt
 * không đọc được, nên dùng model .glb có giấy phép mở tải từ nguồn ngoài — chỉ để minh họa, không phải mesh mô phỏng.
 *
 * Thêm model cho một xe:
 * 1. Đặt file vào `frontend/public/vehicsim/models/<carla_blueprint_id>.glb` (vd. `vehicle.audi.etron.glb`).
 * 2. Thêm một mục vào `VEHICLE_MODELS` với khóa là `carla_blueprint_id`, ghi đủ tác giả, nguồn và giấy phép
 *    (CC-BY bắt buộc ghi công; trang tự hiện dòng ghi công này dưới khung 3D).
 * Xe chưa có mục thì trang hiện "Chưa có model 3D". Hướng dẫn chọn file: `public/vehicsim/models/README.md`.
 */
export type VehicleModel3D = {
  /** Đường dẫn công khai, vd. "/vehicsim/models/vehicle.audi.etron.glb". */
  src: string;
  /** Tên model ở trang nguồn. */
  title: string;
  author: string;
  /** Trang của model ở nguồn (Sketchfab, Poly Haven…). */
  sourceUrl: string;
  /** Tên giấy phép, vd. "CC BY 4.0". */
  license: string;
  licenseUrl: string;
};

const CC_BY = { license: "CC BY 4.0", licenseUrl: "https://creativecommons.org/licenses/by/4.0/" };

// Tải từ Sketchfab (24/11/2026); đã giảm lưới + nén texture WebP bằng gltf-transform 4.5.1 (Patrol: thêm đổi vật liệu
// specular-glossiness sang metal-roughness vì three.js không còn đọc được).
export const VEHICLE_MODELS: Record<string, VehicleModel3D> = {
  "vehicle.audi.etron": {
    src: "/vehicsim/models/vehicle.audi.etron.glb",
    title: "2023 Audi e-Tron Sportback",
    author: "DisneyCars",
    sourceUrl: "https://sketchfab.com/3d-models/2023-audi-e-tron-sportback-17c0fd84d10149a09c3c4186877c4096",
    ...CC_BY,
  },
  "vehicle.tesla.model3": {
    src: "/vehicsim/models/vehicle.tesla.model3.glb",
    title: "Tesla M3 model",
    author: "wintrez",
    sourceUrl: "https://sketchfab.com/3d-models/tesla-m3-model-3a602469d7874d1397efa67182198705",
    ...CC_BY,
  },
  "vehicle.nissan.patrol_2021": {
    src: "/vehicsim/models/vehicle.nissan.patrol_2021.glb",
    title: "Nissan Patrol VTC 2019",
    author: "DR1KING100K",
    sourceUrl: "https://sketchfab.com/3d-models/nissan-patrol-vtc-2019-d36a29d57bba4eb1a09077030e7dafa3",
    ...CC_BY,
  },
  "vehicle.mercedes.sprinter": {
    src: "/vehicsim/models/vehicle.mercedes.sprinter.glb",
    title: "Mercedes Sprinter 2021",
    author: "CloudHubOmniTeam",
    sourceUrl: "https://sketchfab.com/3d-models/mercedes--sprinter-2021-15562e65c77a4d6494ea9abca8827d47",
    ...CC_BY,
  },
  "vehicle.carlamotors.european_hgv": {
    src: "/vehicsim/models/vehicle.carlamotors.european_hgv.glb",
    title: "MAN TGX 2010 V8 – High-Detail Semi-Truck",
    author: "DevPoly3D",
    sourceUrl: "https://sketchfab.com/3d-models/man-tgx-2010-v8-high-detail-semi-truck-34ce748d9a4b4de7b035cfe5cb97f5d1",
    ...CC_BY,
  },
};

export function vehicleModel(blueprintId: string): VehicleModel3D | null {
  return VEHICLE_MODELS[blueprintId] ?? null;
}

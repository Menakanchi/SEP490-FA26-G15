"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Cảnh 3D nền của trang giới thiệu: xe là nhân vật chính, camera và xe di chuyển theo vị trí cuộn trang.
 * Mỗi mốc (keyframe) ứng với một đoạn nội dung của trang; giữa hai mốc nội suy mượt, rồi làm trễ (damping) để chuyển
 * động có quán tính như máy quay. Đoạn "Chạy baseline" diễn lại ca AEB người đi bộ: xe tới vạch qua đường, người băng
 * ngang, xe phanh dừng (đèn phanh sáng).
 *
 * `progress` là số thực 0…(KEYFRAMES.length − 1), trang cha cập nhật khi cuộn.
 */

type Vec3 = [number, number, number];
type Keyframe = { cam: Vec3; look: Vec3; carZ: number; carRotY: number; brake: number; pedX: number };

export const KEYFRAMES: Keyframe[] = [
  // 0 — mở đầu: góc 3/4 phía trước, thấp; nhìn lệch sang trái để xe nằm nửa phải, chừa chỗ cho tiêu đề
  { cam: [5.6, 1.3, 6.6], look: [-2.4, 0.8, 0.4], carZ: 0, carRotY: -0.35, brake: 0, pedX: -4.5 },
  // 1 — thiết kế kịch bản: nhìn ngang, xe còn lùi phía sau vạch qua đường
  { cam: [7.5, 1.6, -2.2], look: [0, 0.7, -3], carZ: -5, carRotY: 0, brake: 0, pedX: -3.4 },
  // 2 — chạy baseline: xe tới vạch, người băng ngang, xe phanh dừng (camera lùi xa để thấy cả xe lẫn người)
  { cam: [-6.2, 1.7, 9.6], look: [0.6, 0.6, 1.6], carZ: 0, carRotY: 0, brake: 1, pedX: -0.3 },
  // 3 — phân tích lỗi: nhìn từ trên xuống
  { cam: [0.01, 12, 1.2], look: [0, 0, 0.9], carZ: 0, carRotY: 0, brake: 0.6, pedX: 0.9 },
  // 4 — tối ưu AEB: cận cảnh bánh trước và cụm phanh (chủ đề tham số phanh)
  { cam: [3.1, 0.55, 2.9], look: [0.8, 0.45, 1.3], carZ: 0, carRotY: 0, brake: 0, pedX: 3.2 },
  // 5 — kiểm chứng & phê duyệt: 3/4 phía sau
  { cam: [-5, 2.2, -5.6], look: [0, 0.7, 0], carZ: 0, carRotY: 0, brake: 0, pedX: 4.5 },
  // 6 — lời mời: lùi xa, nhìn cao hơn xe để xe nằm dưới khối chữ, xe xoay nhẹ
  { cam: [0, 3.4, 11], look: [0, 2.4, 0], carZ: 0, carRotY: 0.6, brake: 0, pedX: 4.5 },
];

const CROSSING_Z = 3.1;

const smooth = (t: number) => t * t * (3 - 2 * t);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

function sample(progress: number): Keyframe {
  const max = KEYFRAMES.length - 1;
  const p = Math.min(Math.max(progress, 0), max);
  const i = Math.min(Math.floor(p), max - 1);
  const t = smooth(p - i);
  const a = KEYFRAMES[i];
  const b = KEYFRAMES[i + 1];
  const v = (x: Vec3, y: Vec3): Vec3 => [mix(x[0], y[0], t), mix(x[1], y[1], t), mix(x[2], y[2], t)];
  return {
    cam: v(a.cam, b.cam),
    look: v(a.look, b.look),
    carZ: mix(a.carZ, b.carZ, t),
    carRotY: mix(a.carRotY, b.carRotY, t),
    brake: mix(a.brake, b.brake, t),
    pedX: mix(a.pedX, b.pedX, t),
  };
}

export function CinematicCarScene({ progress, modelSrc, carLengthM }: { progress: React.RefObject<number>; modelSrc: string; carLengthM: number }) {
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;
    let frame = 0;
    /** Bắt vẽ lại một khung dù cảnh đứng yên (model vừa tải xong, đổi kích thước, vừa hạ chất lượng). */
    let needsRender = true;
    let cleanup = () => {};

    (async () => {
      const THREE = await import("three");
      const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
      const { RoomEnvironment } = await import("three/examples/jsm/environments/RoomEnvironment.js");
      if (disposed) return;

      let renderer: import("three").WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
      } catch {
        setFailed(true);
        return;
      }
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      // Máy không có tăng tốc đồ họa (WebGL vẽ bằng CPU) thì mỗi khung hình chiếm luồng chính rất lâu, trang không bấm được:
      // hạ chất lượng ngay từ đầu (không bóng đổ, độ phân giải 0,6×) và chỉ vẽ khi cảnh đang chuyển động.
      const gl = renderer.getContext();
      const info = gl.getExtension("WEBGL_debug_renderer_info");
      const gpuName = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
      let lowQuality = /swiftshader|llvmpipe|software|basic render/i.test(gpuName);
      const LOW_PIXEL_RATIO = 0.6;
      renderer.setPixelRatio(lowQuality ? LOW_PIXEL_RATIO : Math.min(window.devicePixelRatio, 2));
      renderer.setSize(el.clientWidth, el.clientHeight);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      renderer.shadowMap.enabled = !lowQuality;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      el.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color("#07090d");
      scene.fog = new THREE.Fog("#07090d", 14, 34);
      // Phản chiếu trên thân xe: môi trường dựng sẵn trong three, không tải HDR từ CDN.
      const pmrem = new THREE.PMREMGenerator(renderer);
      const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environment = envTexture;
      // Thấp vì sơn đen bóng phản chiếu rõ các mảng sáng của môi trường (nhìn như loang lổ).
      scene.environmentIntensity = 0.18;

      const camera = new THREE.PerspectiveCamera(36, el.clientWidth / el.clientHeight, 0.1, 100);

      // Ánh sáng kiểu studio: đèn chính phía trên trước, hai đèn viền lạnh / ấm tách xe khỏi nền tối.
      scene.add(new THREE.HemisphereLight("#9fb4d8", "#0b0d12", 0.35));
      const key = new THREE.SpotLight("#ffffff", 260, 30, Math.PI / 6, 0.55, 1.6);
      key.position.set(3, 9, 6);
      key.castShadow = !lowQuality;
      key.shadow.mapSize.set(2048, 2048);
      key.shadow.bias = -0.0004;
      scene.add(key, key.target);
      const rimCool = new THREE.SpotLight("#4fb3ff", 160, 26, Math.PI / 5, 0.7, 1.8);
      rimCool.position.set(-7, 3, -4);
      const rimWarm = new THREE.SpotLight("#ff9b5c", 110, 26, Math.PI / 5, 0.7, 1.8);
      rimWarm.position.set(7, 2.5, -6);
      scene.add(rimCool, rimCool.target, rimWarm, rimWarm.target);

      // Mặt đường bóng, vạch làn và vạch qua đường cho người đi bộ.
      const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(80, 80),
        new THREE.MeshStandardMaterial({ color: "#0d1016", roughness: 0.38, metalness: 0.35 }),
      );
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      scene.add(ground);
      const paint = new THREE.MeshStandardMaterial({ color: "#d9dee8", roughness: 0.6, emissive: "#2a3140", emissiveIntensity: 0.4 });
      for (const x of [-2.1, 2.1]) {
        const line = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.005, 60), paint);
        line.position.set(x, 0.003, 0);
        scene.add(line);
      }
      for (let i = -6; i <= 6; i++) {
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.006, 1.6), paint);
        stripe.position.set(i * 0.8, 0.004, CROSSING_Z + 0.9);
        stripe.receiveShadow = true;
        scene.add(stripe);
      }

      // Người đi bộ giản lược (khối trụ + đầu) băng ngang vạch.
      const pedestrian = new THREE.Group();
      const pedMat = new THREE.MeshStandardMaterial({ color: "#7d8799", roughness: 0.55 });
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.9, 6, 12), pedMat);
      body.position.y = 0.75;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 16), pedMat);
      head.position.y = 1.52;
      body.castShadow = head.castShadow = true;
      pedestrian.add(body, head);
      pedestrian.position.set(-4.5, 0, CROSSING_Z + 0.9);
      scene.add(pedestrian);

      // Xe: nạp .glb, đưa về đúng chiều dài thật, đặt bánh trên mặt đường, đầu xe hướng +Z.
      const car = new THREE.Group();
      scene.add(car);
      const brakeLights = new THREE.PointLight("#ff2a2a", 0, 4, 2);
      car.add(brakeLights);
      new GLTFLoader().load(
        modelSrc,
        (gltf) => {
          if (disposed) return;
          const model = gltf.scene;
          const box = new THREE.Box3().setFromObject(model);
          const size = box.getSize(new THREE.Vector3());
          if (size.x > size.z) model.rotation.y = Math.PI / 2;
          box.setFromObject(model);
          box.getSize(size);
          const scale = carLengthM / Math.max(size.x, size.z);
          model.scale.setScalar(scale);
          box.setFromObject(model);
          const center = box.getCenter(new THREE.Vector3());
          model.position.sub(new THREE.Vector3(center.x, box.min.y, center.z));
          model.traverse((o) => {
            const mesh = o as import("three").Mesh;
            if (mesh.isMesh) {
              mesh.castShadow = true;
              mesh.receiveShadow = true;
            }
          });
          brakeLights.position.set(0, 0.85, -carLengthM / 2 - 0.15);
          car.add(model);
          needsRender = true;
        },
        undefined,
        () => setFailed(true),
      );

      const look = new THREE.Vector3();
      const camPos = new THREE.Vector3();
      const first = sample(reduceMotion ? 0 : progress.current ?? 0);
      camera.position.set(...first.cam);
      look.set(...first.look);
      // Đặt sẵn mọi thứ đúng mốc đầu tiên: cảnh đứng yên ngay từ đầu, máy yếu không phải vẽ liên tục để "tới nơi".
      car.position.z = first.carZ;
      car.rotation.y = first.carRotY;
      pedestrian.position.x = first.pedX;
      brakeLights.intensity = first.brake * 6;
      let time = 0;
      let last = performance.now();
      let slowFrames = 0;
      let sampledFrames = 0;
      needsRender = true;

      const degrade = () => {
        lowQuality = true;
        renderer.shadowMap.enabled = false;
        key.castShadow = false;
        renderer.setPixelRatio(LOW_PIXEL_RATIO);
        renderer.setSize(el.clientWidth, el.clientHeight);
        needsRender = true;
      };

      const render = (now: number) => {
        frame = requestAnimationFrame(render);
        if (document.hidden) return;
        const rawDt = (now - last) / 1000;
        const dt = Math.min(rawDt, 0.05);
        last = now;
        time += dt;
        // 40 khung hình đầu: quá nửa số khung chậm hơn 45 ms thì tự hạ chất lượng.
        if (!lowQuality && sampledFrames < 40) {
          sampledFrames++;
          if (rawDt > 0.045) slowFrames++;
          if (sampledFrames === 40 && slowFrames > 20) degrade();
        }
        const target = sample(reduceMotion ? 0 : progress.current ?? 0);
        // Làm trễ theo thời gian thực để chuyển động có quán tính như máy quay, không giật theo bánh xe chuột.
        // Máy yếu: bỏ quán tính, mỗi lần cuộn chỉ vẽ một khung tới thẳng vị trí mới.
        const k = reduceMotion || lowQuality ? 1 : 1 - Math.exp(-dt * 3.2);
        // Màn dọc (điện thoại): không nhìn lệch ngang và lùi máy ra xa để cả xe nằm trong khung hẹp.
        const portrait = camera.aspect < 1;
        const lookTarget = new THREE.Vector3(...target.look);
        if (portrait) lookTarget.x *= 0.15;
        camPos.set(...target.cam);
        if (portrait) camPos.sub(lookTarget).multiplyScalar(1.6).add(lookTarget);
        // Cảnh đứng yên (máy yếu / giảm chuyển động) thì không vẽ lại, nhường luồng chính cho thao tác của người dùng.
        const moving =
          camera.position.distanceTo(camPos) + look.distanceTo(lookTarget) + Math.abs(car.position.z - target.carZ) +
          Math.abs(car.rotation.y - target.carRotY) + Math.abs(pedestrian.position.x - target.pedX) +
          Math.abs(brakeLights.intensity - target.brake * 6) * 0.1;
        const animateIdle = !lowQuality && !reduceMotion;
        if (!animateIdle && !needsRender && moving < 0.004) return;
        needsRender = false;
        camera.position.lerp(camPos, k);
        look.lerp(lookTarget, k);
        // Máy quay "thở" nhẹ để cảnh không đứng im (chỉ máy đủ mạnh).
        const sway = animateIdle ? Math.sin(time * 0.6) * 0.06 : 0;
        camera.position.y += sway * k;
        camera.lookAt(look);
        car.position.z = mix(car.position.z, target.carZ, k);
        car.rotation.y = mix(car.rotation.y, target.carRotY, k);
        brakeLights.intensity = mix(brakeLights.intensity, target.brake * 6, k);
        pedestrian.position.x = mix(pedestrian.position.x, target.pedX, k);
        pedestrian.visible = Math.abs(pedestrian.position.x) < 4.3;
        key.target.position.set(0, 0, car.position.z);
        renderer.render(scene, camera);
      };
      frame = requestAnimationFrame(render);

      const onResize = () => {
        camera.aspect = el.clientWidth / el.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(el.clientWidth, el.clientHeight);
        needsRender = true;
      };
      window.addEventListener("resize", onResize);

      cleanup = () => {
        cancelAnimationFrame(frame);
        window.removeEventListener("resize", onResize);
        scene.traverse((o) => {
          const mesh = o as import("three").Mesh;
          mesh.geometry?.dispose();
          const mat = mesh.material as import("three").Material | import("three").Material[] | undefined;
          (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((m) => m.dispose());
        });
        envTexture.dispose();
        pmrem.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    })().catch(() => setFailed(true));

    return () => {
      disposed = true;
      cleanup();
    };
  }, [modelSrc, progress, carLengthM]);

  return (
    <div ref={host} aria-hidden className="fixed inset-0 -z-10 bg-[#07090d]">
      {failed && <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,#1b2433_0%,#07090d_70%)]" />}
    </div>
  );
}

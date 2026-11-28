"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { VehicSimPage } from "@/components/VehicSimPage";
import { Card, CardTitle, EmptyState, ErrorNote, StatCard, Tag, fmt, simulatorLabel } from "@/components/VehicSimUi";
import { decel, dimensions, withUnit } from "@/components/vehicleFormat";
import { VehicleModelViewer } from "@/components/VehicleModelViewer";
import { vehicsimApi } from "@/services/vehicsim";
import { useAuth } from "@/context/AuthContext";
import type { VehicleDetail, VehicleSensor } from "@/types/vehicsim";

/** Một dòng "tên — giá trị" trong khối thông số. */
function Spec({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-solid border-vehicsim-line py-[10px] last:border-b-0">
      <span className="text-[13px] text-vehicsim-muted" title={hint}>
        {label}
      </span>
      <span className="text-right text-[13px] font-semibold text-vehicsim-ink">{value}</span>
    </div>
  );
}

/** Một cảm biến: tên + loại, vị trí (tọa độ cố định hoặc quy tắc gắn theo bounding box), mục đích và thuộc tính blueprint. */
function SensorRow({ sensor: s }: { sensor: VehicleSensor }) {
  const where = s.location_m
    ? `(${s.location_m.x.toFixed(2)}, ${s.location_m.y.toFixed(2)}, ${s.location_m.z.toFixed(2)}) m`
    : s.mount ?? "—";
  const attributes = Object.entries(s.attributes ?? {});
  return (
    <li className="flex flex-col gap-1 border-b border-solid border-vehicsim-line py-3 last:border-b-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="flex flex-wrap items-center gap-2 text-[13.5px] font-semibold text-vehicsim-ink">
          {s.name}
          <Tag tone="neutral">{s.sensor_type}</Tag>
          {s.condition && <Tag tone="info">{s.condition}</Tag>}
          {!s.is_enabled && <Tag tone="warn">Tắt</Tag>}
        </span>
        <span className="text-[13px] text-vehicsim-ink sm:text-right">{where}</span>
      </div>
      {s.purpose && <p className="text-[12.5px] leading-relaxed text-vehicsim-muted">{s.purpose}</p>}
      <p className="break-words font-mono text-[11.5px] text-vehicsim-muted">
        {s.carla_blueprint_id}
        {attributes.length > 0 && ` · ${attributes.map(([k, value]) => `${k}=${String(value)}`).join(", ")}`}
      </p>
    </li>
  );
}

export default function VehicleDetailPage() {
  const { user } = useAuth();
  const catalogOnly = user?.roleCode === "MANAGER";
  const { vehicleId } = useParams<{ vehicleId: string }>();
  const [v, setV] = useState<VehicleDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    vehicsimApi
      .vehicle(Number(vehicleId))
      .then(setV)
      .catch((err) => setError(err instanceof Error ? err.message : "Không tải được thông tin xe"));
  }, [vehicleId]);

  const com = v?.physics.center_of_mass_m;

  return (
    <VehicSimPage
      crumbs={[{ label: "Phương tiện", href: "/vehicles" }, { label: v?.name ?? "…" }]}
      title={v ? `Cấu hình động lực học ${v.name}` : "Cấu hình phương tiện"}
      badges={
        v && (
          <>
            {v.in_use && !catalogOnly && <Tag tone="info">Project đang dùng</Tag>}
            {!v.is_supported && <Tag tone="neutral">Chỉ để xem</Tag>}
          </>
        )
      }
      subtitle={
        v && (
          <span className="text-[13.5px] text-vehicsim-muted">
            Blueprint CARLA: <span className="font-mono font-semibold text-vehicsim-ink">{v.carla_blueprint_id}</span> · Khối lượng {v.mass_kg} kg · Giảm tốc cực đại {v.max_brake_decel_mps2} m/s²
          </span>
        )
      }
    >
      <ErrorNote message={error} />

      {v && (
        <>
          {/* 4 thẻ: 2 × 2 khi hẹp, 1 hàng 4 thẻ từ xl — không để thẻ lẻ một mình ở hàng sau. */}
          <div className={catalogOnly ? "grid w-full grid-cols-2 gap-3 xl:grid-cols-3" : "grid w-full grid-cols-2 gap-3 xl:grid-cols-4"}>
            <StatCard label="Khối lượng" value={withUnit(v.mass_kg, 0, "kg")} note={`${v.num_wheels} bánh`} />
            {/* Giới hạn = min(phanh xe thật, phanh 100% đo trên CARLA) theo migration 017, nên có thể thấp hơn số CARLA. */}
            <StatCard label="Phanh động học" value={decel(v.max_brake_decel_mps2)} tone="info" note="giới hạn AEB = min(xe thật, CARLA)" />
            {/* Xe hỗ trợ mô phỏng đều đã hiệu chuẩn mô-men phanh (e-tron: migration 014; Model 3 / Patrol / Sprinter: migration 016).
                Xe chỉ để xem (xe tải HGV) chưa hiệu chuẩn được: CARLA không phanh được như xe thật. */}
            <StatCard
              label="Phanh đo trên CARLA"
              value={decel(v.carla_full_brake_decel_mps2)}
              tone={v.carla_full_brake_decel_mps2 === null || !v.is_supported ? "warn" : "ok"}
              note={v.carla_full_brake_decel_mps2 === null ? "chưa đo" : v.is_supported ? "phanh 100%, đã hiệu chuẩn" : "phanh 100%, chưa hiệu chuẩn được"}
            />
            {!catalogOnly && <StatCard label="Lượt chạy" value={v.run_count} note="trong project hiện tại" />}
          </div>

          {!v.is_supported && (
            <p className="rounded-[16px] bg-vehicsim-soft px-4 py-3 text-[13px] text-vehicsim-muted">
              Mẫu xe này chỉ để xem, chưa dùng cho mô phỏng: giới hạn phanh của bộ động học chưa phù hợp với loại xe này.
            </p>
          )}

          <VehicleModelViewer blueprintId={v.carla_blueprint_id} name={v.name} />

          <div className="grid grid-cols-2 gap-4">
            <Card className="flex flex-col gap-3 p-5">
              <CardTitle>Kích thước</CardTitle>
              <div>
                <Spec label="Dài × rộng × cao" value={dimensions(v)} hint="Từ bounding box của mesh CARLA" />
                <Spec label="Chiều dài cơ sở" value={withUnit(v.physics.wheelbase_m, 3, "m")} hint="Trục trước tới trục sau cùng" />
                <Spec label="Số bánh" value={v.num_wheels} />
              </div>
            </Card>

            <Card className="flex flex-col gap-3 p-5">
              <CardTitle>Vật lý CARLA</CardTitle>
              <div>
                <Spec label="Khối lượng" value={withUnit(v.mass_kg, 0, "kg")} hint="VehiclePhysicsControl.mass — runner luôn ép" />
                <Spec label="Hệ số cản gió" value={withUnit(v.physics.drag_coefficient, 2, "")} />
                <Spec
                  label="Trọng tâm (x, y, z)"
                  value={com ? `${com.x.toFixed(2)}, ${com.y.toFixed(2)}, ${com.z.toFixed(2)} m` : "—"}
                  hint="So với gốc actor"
                />
                <Spec label="Ma sát lốp" value={withUnit(v.physics.tire_friction, 2, "")} />
                <Spec label="Mô-men phanh tối đa / bánh" value={withUnit(v.physics.max_brake_torque_nm, 0, "N·m")} />
                <Spec label="Tốc độ tối đa" value={withUnit(v.physics.max_speed_mps, 1, "m/s")} />
              </div>
            </Card>
          </div>

          <Card className="flex flex-col gap-3 p-5">
            <CardTitle>Phanh</CardTitle>
            <div>
              <Spec
                label="Giới hạn phanh của bộ động học"
                value={decel(v.max_brake_decel_mps2)}
                hint="AEB không xin quá mức này; mặt đường còn chặn ở μ·g"
              />
              <Spec
                label="Giảm tốc phanh 100% đo trên CARLA"
                value={decel(v.carla_full_brake_decel_mps2)}
                hint="Runner dùng để đổi giảm tốc AEB ra bàn đạp"
              />
            </div>
          </Card>

          <Card className="flex flex-col gap-3 p-5">
            <CardTitle aside={<Tag>{v.sensors.length}</Tag>}>Cảm biến</CardTitle>
            {v.sensor_source === "CARLA_ADAPTER_CODE" && (
              <p className="text-[12.5px] leading-relaxed text-vehicsim-muted">
                Bộ cảm biến adapter CARLA gắn lên xe ở mỗi lượt chạy, giống nhau cho mọi mẫu xe. Bộ động học không dùng cảm biến: AEB nhận
                perception lý tưởng trong 80 m.
              </p>
            )}
            {v.sensors.length === 0 ? (
              <EmptyState title="Chưa cấu hình cảm biến">Mẫu xe này chưa có cảm biến nào trong danh mục.</EmptyState>
            ) : (
              <ul className="flex flex-col">
                {v.sensors.map((s) => (
                  <SensorRow key={s.id ?? s.name} sensor={s} />
                ))}
              </ul>
            )}
          </Card>

          {!catalogOnly && <div className="grid grid-cols-2 gap-4">
            <Card className="col-span-2 flex flex-col gap-3 p-5">
              <CardTitle aside={<Tag>{v.run_count} lượt</Tag>}>Lịch sử sử dụng</CardTitle>
              {v.usage.length === 0 ? (
                <EmptyState title="Chưa có lượt chạy nào">Project hiện tại chưa chạy mô phỏng với xe này.</EmptyState>
              ) : (
                <div>
                  {v.usage.map((u) => (
                    <Spec
                      key={u.simulator_version}
                      label={simulatorLabel(u.simulator_version)}
                      value={`${u.runs} lượt · gần nhất ${fmt.date(u.last_run_at)}`}
                    />
                  ))}
                </div>
              )}
            </Card>
          </div>}
        </>
      )}
    </VehicSimPage>
  );
}

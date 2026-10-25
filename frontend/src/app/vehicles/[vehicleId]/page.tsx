"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { VehicSimPage } from "@/components/VehicSimPage";
import { Card, CardTitle, EmptyState, ErrorNote, StatCard, Tag, fmt, simulatorLabel } from "@/components/VehicSimUi";
import { decel, dimensions, withUnit } from "@/components/vehicleFormat";
import { vehicsimApi } from "@/services/vehicsim";
import type { VehicleDetail } from "@/types/vehicsim";

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

export default function VehicleDetailPage() {
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
      title={v?.name ?? "…"}
      badges={
        v && (
          <>
            {v.in_use && <Tag tone="info">Project đang dùng</Tag>}
            {!v.is_supported && <Tag tone="neutral">Chỉ để xem</Tag>}
          </>
        )
      }
      subtitle={v && <span className="font-mono text-[13px]">{v.carla_blueprint_id}</span>}
    >
      <ErrorNote message={error} />

      {v && (
        <>
          <div className="flex w-full items-stretch gap-4">
            <StatCard label="Khối lượng" value={withUnit(v.mass_kg, 0, "kg")} note={`${v.num_wheels} bánh`} />
            <StatCard label="Phanh động học" value={decel(v.max_brake_decel_mps2)} tone="info" note="giới hạn bộ động học dùng" />
            <StatCard
              label="Phanh đo trên CARLA"
              value={decel(v.carla_full_brake_decel_mps2)}
              tone="warn"
              note={v.carla_full_brake_decel_mps2 === null ? "chưa đo" : "phanh 100%, chưa hiệu chuẩn"}
            />
            <StatCard label="Lượt chạy" value={v.run_count} note="trong project hiện tại" />
          </div>

          {!v.is_supported && (
            <p className="rounded-[16px] bg-vehicsim-soft px-4 py-3 text-[13px] text-vehicsim-muted">
              Mẫu xe này chỉ để xem, chưa dùng cho mô phỏng: giới hạn phanh của bộ động học chưa phù hợp với loại xe này.
            </p>
          )}

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
            <p className="text-[12px] leading-[1.6] text-vehicsim-faint">
              CARLA phanh yếu hơn xe thật vì chưa hiệu chuẩn (TD-17): số đo trên CARLA chỉ để quan sát và đối chiếu, không dùng làm bằng
              chứng regression hay chứng nhận an toàn.
            </p>
          </Card>

          <div className="grid grid-cols-2 gap-4">
            <Card className="flex flex-col gap-3 p-5">
              <CardTitle aside={<Tag>{v.sensors.length}</Tag>}>Cảm biến</CardTitle>
              {v.sensors.length === 0 ? (
                <EmptyState title="Chưa cấu hình cảm biến">Mẫu xe này chưa có cảm biến nào trong danh mục.</EmptyState>
              ) : (
                <div>
                  {v.sensors.map((s) => (
                    <Spec
                      key={s.id}
                      label={`${s.name} · ${s.sensor_type}`}
                      value={`(${s.location_m.x.toFixed(2)}, ${s.location_m.y.toFixed(2)}, ${s.location_m.z.toFixed(2)}) m${s.is_enabled ? "" : " · tắt"}`}
                      hint={s.carla_blueprint_id}
                    />
                  ))}
                </div>
              )}
            </Card>

            <Card className="flex flex-col gap-3 p-5">
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
          </div>
        </>
      )}
    </VehicSimPage>
  );
}

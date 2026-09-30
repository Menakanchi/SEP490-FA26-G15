"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { VehicSimPage } from "@/components/VehicSimPage";
import { useVehicSimContext } from "@/components/VehicSimContext";
import { FamilyForm } from "@/components/FamilyForm";
import { EmptyState, ErrorNote, PillButton, Tag, cx, fmt } from "@/components/VehicSimUi";
import { vehicsimApi } from "@/services/vehicsim";
import type { FamilyItem } from "@/types/vehicsim";

export default function ScenarioFamiliesPage() {
  const { refresh, canWrite } = useVehicSimContext();
  const [items, setItems] = useState<FamilyItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState<number | "create" | null>(null);

  const load = useCallback(() => {
    vehicsimApi.families()
      .then(setItems)
      .catch((err) => setError(err instanceof Error ? err.message : "Không tải được họ kịch bản"));
  }, []);
  useEffect(load, [load]);

  // Bước 1 của vòng MVP (Tổng quan → /scenarios?new=1) mở sẵn form tạo họ kịch bản.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- đọc query một lần sau khi mount
    if (q.get("new") === "1") setFormOpen(true);
    // Vừa tạo họ từ màn "Sinh từ mô tả" (/scenarios/new).
    if (q.get("created")) {
      const queued = Number(q.get("queued") || 0);
      setNotice(`Đã tạo ${q.get("created")} từ mô tả với ${q.get("variants")} biến thể${queued ? `, đã xếp ${queued} lượt chạy cơ sở` : ""}.`);
    }
  }, []);

  // Có run đang xếp hàng/chạy → tải lại định kỳ để số liệu tự cập nhật.
  const active = (items ?? []).some((f) => (f.runs.QUEUED ?? 0) + (f.runs.RUNNING ?? 0) > 0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, [active, load]);

  const runBaseline = async (f: FamilyItem) => {
    setBusy(f.id);
    setError(null);
    try {
      const res = await vehicsimApi.runFamily(f.id);
      setNotice(`${f.code}: đã xếp ${res.queued_runs} lượt chạy cơ sở.`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không chạy được cơ sở");
    } finally {
      setBusy(null);
    }
  };

  return (
    <VehicSimPage
      step={[1, 2, 3]}
      crumbs={[{ label: "Kịch bản" }, { label: "Họ kịch bản" }]}
      title="Họ kịch bản"
      subtitle="Một họ là một không gian tham số, không phải một file đơn lẻ. Mọi biến thể đều chạy với bản cơ sở để phân tích lỗi và kiểm thử hồi quy ứng viên trên cùng seed."
      actions={
        <>
          <PillButton onClick={() => setFormOpen((o) => !o)} disabled={!canWrite} title={canWrite ? undefined : "Tài khoản người xem chỉ có quyền xem"}>
            {formOpen ? "Đóng form" : "+ Nhập tay"}
          </PillButton>
          <PillButton variant="dark" href={canWrite ? "/scenarios/new" : undefined} disabled={!canWrite}>
            Sinh từ mô tả →
          </PillButton>
        </>
      }
    >
      <ErrorNote message={error} />
      {notice && <p className="rounded-[16px] bg-vehicsim-ok-bg px-4 py-3 text-[13px] text-vehicsim-ok">{notice}</p>}
      {formOpen && (
        <FamilyForm
          busy={busy === "create"}
          onSubmit={async (body) => {
            setBusy("create");
            setError(null);
            try {
              const res = await vehicsimApi.createFamily(body);
              setNotice(
                `Đã tạo ${res.code} với ${res.variants} biến thể${res.queued_runs ? ` và xếp ${res.queued_runs} lượt chạy cơ sở` : ""}.`,
              );
              setFormOpen(false);
              load();
              await refresh();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Không tạo được họ kịch bản");
            } finally {
              setBusy(null);
            }
          }}
        />
      )}

      <section className="overflow-hidden rounded-[20px] border border-solid border-vehicsim-line bg-white shadow-vehicsim-card">
        <div className="flex items-center px-5 py-4">
          <span className="text-[15px] font-bold text-vehicsim-ink">{items ? `${items.length} ${items.length === 1 ? "family" : "families"}` : "…"}</span>
        </div>
        <div className="flex h-10 items-center border-y border-solid border-vehicsim-line bg-vehicsim-soft px-5 text-[11px] font-semibold uppercase text-vehicsim-faint">
          <span className="min-w-0 flex-1">Họ kịch bản</span>
          <span className="w-[310px]">Không gian tham số</span>
          <span className="w-[90px]">Biến thể</span>
          <span className="w-[160px]">Lượt chạy</span>
          <span className="w-[110px]">Lỗi trên bản cơ sở</span>
          <span className="w-[110px]">Ngày tạo</span>
          <span className="w-[180px]" />
        </div>
        {items && items.length === 0 && (
          <EmptyState title="Chưa có họ kịch bản nào">Tạo họ đầu tiên (ví dụ người đi bộ băng ngang) rồi chạy cơ sở để có ca lỗi.</EmptyState>
        )}
        {items?.map((f) => {
          const pending = (f.runs.QUEUED ?? 0) + (f.runs.RUNNING ?? 0);
          return (
            <div key={f.id} className="flex min-h-[64px] items-center border-b border-solid border-vehicsim-line px-5 py-2">
              <span className="flex min-w-0 flex-1 flex-col gap-[2px] pr-3">
                <span className="text-[13px] font-bold text-vehicsim-ink">
                  {f.code} <span className="font-semibold">· {f.name}</span>
                </span>
                {f.description && <span className="truncate text-[12px] text-vehicsim-faint">{f.description}</span>}
              </span>
              <span className="flex w-[310px] flex-wrap gap-1 pr-3">
                {Object.entries(f.parameter_space).map(([axis, values]) => (
                  <Tag key={axis} className="px-2 py-[3px] text-[10px]">
                    {axisLabel(axis)}: {values.map((v) => (typeof v === "boolean" ? (v ? "dừng" : "băng qua") : String(v))).join(" / ")}
                  </Tag>
                ))}
              </span>
              <span className="w-[90px] text-[13px] font-semibold text-vehicsim-ink">{f.variants}</span>
              <span className="flex w-[160px] flex-col text-[12px] text-vehicsim-muted">
                <span>
                  <b className="text-vehicsim-ink">{f.runs.COMPLETED ?? 0}</b> đã xong
                </span>
                {pending > 0 && <span className="font-semibold text-vehicsim-decision">{pending} đang chờ / đang chạy…</span>}
                {(f.runs.FAILED ?? 0) > 0 && <span className="text-vehicsim-danger">{f.runs.FAILED} lỗi</span>}
              </span>
              <span className="flex w-[110px] flex-col">
                <span className={cx("text-[13px] font-semibold", f.failures ? "text-vehicsim-danger" : "text-vehicsim-faint")}>
                  {f.failures} / {f.variants}
                </span>
                {f.baseline && <span className="text-[11px] text-vehicsim-faint">AEB {f.baseline}</span>}
              </span>
              <span className="w-[110px] text-[12px] text-vehicsim-faint">{fmt.date(f.created_at)}</span>
              <span className="flex w-[180px] items-center justify-end gap-3">
                {f.failures > 0 && (
                  <Link href="/analysis/failures" className="text-[12px] font-semibold text-vehicsim-decision hover:underline">
                    Failures
                  </Link>
                )}
                <PillButton
                  className="px-3 py-[6px] text-[12px]"
                  onClick={() => runBaseline(f)}
                  disabled={!canWrite || busy === f.id || pending > 0}
                  title="Chạy mọi biến thể với bản cơ sở AEB hiện hành"
                >
                  {busy === f.id ? "Đang xếp hàng…" : "Chạy cơ sở"}
                </PillButton>
              </span>
            </div>
          );
        })}
      </section>
    </VehicSimPage>
  );
}

function axisLabel(axis: string): string {
  const map: Record<string, string> = {
    ego_speed_kmh: "km/h",
    ego_speeds_kmh: "km/h",
    trigger_distance_m: "khoảng cách m",
    trigger_distances_m: "khoảng cách m",
    pedestrian_speed_mps: "người đi bộ m/s",
    pedestrian_speeds_mps: "người đi bộ m/s",
    stops_at_curb: "hành vi",
    weather: "thời tiết",
    weathers: "thời tiết",
    time_of_day: "thời điểm",
    times_of_day: "thời điểm",
  };
  return map[axis] ?? axis;
}

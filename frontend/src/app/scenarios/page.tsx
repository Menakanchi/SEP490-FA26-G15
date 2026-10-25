"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { VehicSimPage } from "@/components/VehicSimPage";
import { useVehicSimContext } from "@/components/VehicSimContext";
import { FamilyForm } from "@/components/FamilyForm";
import { EmptyState, ErrorNote, PillButton, Tag, cx, fmt, simulatorLabel } from "@/components/VehicSimUi";
import { vi } from "@/components/vehicsimI18n";
import { vehicsimApi } from "@/services/vehicsim";
import type { FamilyItem, FamilyVersion, TimeOfDay, Weather } from "@/types/vehicsim";

export default function ScenarioFamiliesPage() {
  const { ctx, refresh, canWrite } = useVehicSimContext();
  const [items, setItems] = useState<FamilyItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState<number | "create" | null>(null);
  // Họ vừa được bàn giao từ màn thiết kế (?family=<id>) hoặc vừa tạo bằng form: tô sáng và cuộn tới dòng của nó.
  const [focusId, setFocusId] = useState<number | null>(null);
  // Sửa họ = tạo bản gốc mới (task 4): họ đang sửa, lịch sử bản đã tải, bản cũ đang xem của từng họ (chỉ xem).
  const [editing, setEditing] = useState<FamilyItem | null>(null);
  const [versions, setVersions] = useState<Record<number, FamilyVersion[]>>({});
  const [viewing, setViewing] = useState<Record<number, number>>({});

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
    const family = Number(q.get("family"));
    if (Number.isInteger(family) && family > 0) setFocusId(family);
  }, []);

  const focused = focusId ? (items ?? []).find((f) => f.id === focusId) : undefined;
  useEffect(() => {
    if (!focused) return;
    document.getElementById(`family-${focused.id}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focused]);

  // Có run đang xếp hàng/chạy → tải lại định kỳ để số liệu tự cập nhật.
  const active = (items ?? []).some((f) => (f.runs.PENDING ?? f.runs.QUEUED ?? 0) + (f.runs.RUNNING ?? 0) > 0);
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

  const pickVersion = async (f: FamilyItem, version: number) => {
    if (version === f.version) {
      setViewing((prev) => without(prev, f.id));
      return;
    }
    setError(null);
    try {
      if (!versions[f.id]) {
        const list = await vehicsimApi.familyVersions(f.id);
        setVersions((prev) => ({ ...prev, [f.id]: list }));
      }
      setViewing((prev) => ({ ...prev, [f.id]: version }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được lịch sử bản");
    }
  };

  const startEdit = (f: FamilyItem) => {
    setFormOpen(false);
    setEditing(f);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelFamily = async (f: FamilyItem) => {
    setBusy(f.id);
    setError(null);
    try {
      const res = await vehicsimApi.cancelFamily(f.id);
      setNotice(`${f.code}: đã hủy ${res.stopped} lượt đang chờ${res.stopping ? `, đang dừng ${res.stopping} lượt đang chạy` : ""}.`);
      load();
    } catch (err) {
      setError(err instanceof Error ? vi(err.message) : "Không hủy được lượt chạy");
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
      {focused && !notice && (
        <p className="rounded-[16px] bg-vehicsim-decision-bg px-4 py-3 text-[13px] text-vehicsim-decision">
          {focused.code} · {focused.name}:{" "}
          {(focused.runs.PENDING ?? 0) + (focused.runs.RUNNING ?? 0) > 0
            ? "các lượt chạy cơ sở đang chạy — số liệu tự cập nhật bên dưới."
            : (focused.runs.COMPLETED ?? 0) > 0
              ? "đã có kết quả chạy cơ sở — bấm “Tiếp tục: Phân tích kết quả”."
              : "chưa chạy cơ sở — bấm “Chạy cơ sở” ở dòng được tô sáng."}
        </p>
      )}
      {focusId && items && !focused && (
        <ErrorNote message={`Không tìm thấy họ kịch bản #${focusId} trong project hiện tại.`} />
      )}
      {editing && (
        <div className="flex flex-col gap-2">
          <FamilyForm
            key={`${editing.id}-v${editing.version}`}
            busy={busy === "create"}
            title={`Sửa ${editing.code} · tạo bản v${editing.version + 1}`}
            hint={
              <>
                Bản v{editing.version} cùng các lượt chạy của nó giữ nguyên để baseline cũ vẫn tái lập được. Bản v{editing.version + 1} có
                bộ biến thể mới và cần chạy cơ sở lại; từ đây chạy cơ sở, regression và tối ưu dùng bản mới.
              </>
            }
            submitLabel={`Tạo bản v${editing.version + 1}`}
            lockName
            initial={initialFrom(editing)}
            onSubmit={async (body) => {
              const f = editing;
              setBusy("create");
              setError(null);
              try {
                const res = await vehicsimApi.createFamilyVersion(f.id, body);
                setNotice(
                  `Đã tạo ${res.code} v${res.version} với ${res.variants} biến thể${res.queued_runs ? ` và xếp ${res.queued_runs} lượt chạy cơ sở` : ""}.`,
                );
                setEditing(null);
                setFocusId(f.id);
                setVersions((prev) => without(prev, f.id));
                setViewing((prev) => without(prev, f.id));
                load();
                await refresh();
              } catch (err) {
                setError(err instanceof Error ? err.message : "Không tạo được bản mới");
              } finally {
                setBusy(null);
              }
            }}
          />
          <button type="button" onClick={() => setEditing(null)} className="self-end text-[12px] font-semibold text-vehicsim-muted hover:underline">
            Huỷ sửa
          </button>
        </div>
      )}
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
              setFocusId(res.scenario_id);
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

      {ctx && (
        <p className="flex flex-wrap gap-x-5 gap-y-1 rounded-[16px] border border-solid border-vehicsim-line bg-white px-4 py-3 text-[13px] text-vehicsim-muted">
          <span className="font-semibold text-vehicsim-ink">Chạy cơ sở sẽ dùng:</span>
          <span>Xe <b className="text-vehicsim-ink">{ctx.vehicle?.name ?? "—"}</b></span>
          <span>AEB <b className="text-vehicsim-ink">{ctx.system.baseline?.label ?? "chưa có bản cơ sở"}</b></span>
          <span>Bộ mô phỏng <b className="text-vehicsim-ink">{simulatorLabel(ctx.simulator)}</b></span>
        </p>
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
          const pending = (f.runs.PENDING ?? f.runs.QUEUED ?? 0) + (f.runs.RUNNING ?? 0) + (f.runs.PAUSED ?? 0);
          // Đang xem bản cũ: cột tham số / biến thể / lượt chạy lấy của bản đó, chỉ xem.
          const old = viewing[f.id] ? versions[f.id]?.find((v) => v.version === viewing[f.id]) : undefined;
          const shown = old ?? f;
          return (
            <div
              key={f.id}
              id={`family-${f.id}`}
              className={cx(
                "flex min-h-[64px] items-center border-b border-solid border-vehicsim-line px-5 py-2",
                f.id === focusId && "bg-vehicsim-decision-bg/50 ring-2 ring-inset ring-vehicsim-decision/40",
              )}
            >
              <span className="flex min-w-0 flex-1 flex-col gap-[2px] pr-3">
                <span className="text-[13px] font-bold text-vehicsim-ink">
                  {f.code} <span className="font-semibold">· {f.name}</span>
                </span>
                <span className="flex flex-wrap items-center gap-1">
                  {f.version_count > 1 ? (
                    <select
                      value={viewing[f.id] ?? f.version}
                      onChange={(e) => pickVersion(f, Number(e.target.value))}
                      aria-label={`Bản của ${f.code}`}
                      className="rounded-full border border-solid border-vehicsim-line-strong bg-white px-2 py-[2px] text-[11px] font-semibold text-vehicsim-ink"
                    >
                      {Array.from({ length: f.version_count }, (_, i) => f.version_count - i).map((v) => (
                        <option key={v} value={v}>
                          v{v}
                          {v === f.version ? " · hiện hành" : ""}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Tag className="px-2 py-[2px] text-[10px]">v{f.version}</Tag>
                  )}
                  {old && <Tag tone="warn" className="px-2 py-[2px] text-[10px]">bản cũ · chỉ xem</Tag>}
                </span>
                {f.description && <span className="truncate text-[12px] text-vehicsim-faint">{f.description}</span>}
              </span>
              <span className="flex w-[310px] flex-wrap gap-1 pr-3">
                {Object.entries(shown.parameter_space).map(([axis, values]) => (
                  <Tag key={axis} className="px-2 py-[3px] text-[10px]">
                    {axisLabel(axis)}: {values.map((v) => (typeof v === "boolean" ? (v ? "dừng" : "băng qua") : String(v))).join(" / ")}
                  </Tag>
                ))}
              </span>
              <span className="w-[90px] text-[13px] font-semibold text-vehicsim-ink">{shown.variants}</span>
              <span className="flex w-[160px] flex-col text-[12px] text-vehicsim-muted">
                <span>
                  <b className="text-vehicsim-ink">{shown.runs.COMPLETED ?? 0}</b> đã xong
                </span>
                {!old && pending > 0 && <span className="font-semibold text-vehicsim-decision">{pending} đang chờ / đang chạy…</span>}
                {(shown.runs.FAILED ?? 0) > 0 && <span className="text-vehicsim-danger">{shown.runs.FAILED} lỗi</span>}
                {(shown.runs.STOPPED ?? 0) > 0 && <span>{shown.runs.STOPPED} đã hủy</span>}
              </span>
              <span className="flex w-[110px] flex-col">
                {old ? (
                  <span className="text-[12px] text-vehicsim-faint" title="Lỗi trên bản cơ sở chỉ tính cho bản hiện hành">—</span>
                ) : (
                  <>
                    <span className={cx("text-[13px] font-semibold", f.failures ? "text-vehicsim-danger" : "text-vehicsim-faint")}>
                      {f.failures} / {f.variants}
                    </span>
                    {f.baseline && <span className="text-[11px] text-vehicsim-faint">AEB {f.baseline}</span>}
                  </>
                )}
              </span>
              <span className="w-[110px] text-[12px] text-vehicsim-faint">{fmt.date(old ? old.created_at : f.created_at)}</span>
              <span className="flex w-[180px] flex-col items-end gap-1">
                {pending > 0 ? (
                  <PillButton
                    className="px-3 py-[6px] text-[12px] text-vehicsim-danger"
                    onClick={() => cancelFamily(f)}
                    disabled={!canWrite || busy === f.id}
                    title="Hủy mọi lượt đang chờ/đang chạy của họ này (lượt của regression không bị đụng)"
                  >
                    {busy === f.id ? "Đang hủy…" : `Hủy ${pending} lượt`}
                  </PillButton>
                ) : (
                  <PillButton
                    className="px-3 py-[6px] text-[12px]"
                    onClick={() => runBaseline(f)}
                    disabled={!canWrite || busy === f.id}
                    title="Chạy mọi biến thể với bản cơ sở AEB hiện hành"
                  >
                    {busy === f.id ? "Đang xếp hàng…" : "Chạy cơ sở"}
                  </PillButton>
                )}
                <button
                  type="button"
                  onClick={() => startEdit(f)}
                  disabled={!canWrite || pending > 0 || busy !== null}
                  title={
                    !canWrite
                      ? "Tài khoản người xem chỉ có quyền xem"
                      : pending > 0
                        ? "Họ còn lượt chạy đang chờ / đang chạy — đợi xong hoặc hủy rồi mới sửa"
                        : `Tạo bản v${f.version + 1}; bản v${f.version} và lượt chạy của nó giữ nguyên`
                  }
                  className="text-[12px] font-semibold text-vehicsim-ink hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline"
                >
                  Sửa → bản v{f.version + 1}
                </button>
                <Link href={`/analysis/failures?scenario_id=${f.id}`} className="text-[12px] font-semibold text-vehicsim-decision hover:underline">
                  Tiếp tục: Phân tích kết quả →
                </Link>
              </span>
            </div>
          );
        })}
      </section>
    </VehicSimPage>
  );
}

function without<T>(map: Record<number, T>, key: number): Record<number, T> {
  const next = { ...map };
  delete next[key];
  return next;
}

/** Không gian tham số hiện hành của họ → giá trị ban đầu của form sửa. */
function initialFrom(f: FamilyItem) {
  const ps = f.parameter_space;
  return {
    name: f.name,
    description: f.description ?? "",
    ego_speeds_kmh: (ps.ego_speed_kmh ?? []) as number[],
    trigger_distances_m: (ps.trigger_distance_m ?? []) as number[],
    pedestrian_speeds_mps: (ps.pedestrian_speed_mps ?? []) as number[],
    stops_at_curb: (ps.stops_at_curb ?? []) as boolean[],
    weathers: (ps.weather ?? []) as Weather[],
    times_of_day: (ps.time_of_day ?? []) as TimeOfDay[],
  };
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

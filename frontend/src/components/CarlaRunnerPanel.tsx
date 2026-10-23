"use client";

import React, { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useVehicSimContext } from "@/components/VehicSimContext";
import { Card, CardTitle, ErrorNote, PillButton, StatCard, Tag, runCode, simulatorLabel } from "@/components/VehicSimUi";
import { vi } from "@/components/vehicsimI18n";
import { vehicsimApi } from "@/services/vehicsim";
import type { CarlaData, CarlaRun, CarlaStatus } from "@/types/vehicsim";

const statusLabel = { PENDING: "Đang chờ", RUNNING: "Đang chạy", COMPLETED: "Hoàn thành", FAILED: "Lỗi thực thi", STOPPED: "Đã hủy" };

export function CarlaRunnerPanel() {
  const { ctx, canWrite } = useVehicSimContext();
  const [connection, setConnection] = useState<CarlaStatus | null>(null);
  const [runs, setRuns] = useState<CarlaRun[] | null>(null);
  const [family, setFamily] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [data, setData] = useState<CarlaData | null>(null);
  const [frame, setFrame] = useState(0);
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const loadRuns = useCallback(() => vehicsimApi.carlaRuns().then(rows => { setRuns(rows); return rows; }), []);
  const checkConnection = useCallback(() => vehicsimApi.carlaStatus().then(setConnection), []);
  useEffect(() => {
    const run = Number(new URLSearchParams(window.location.search).get("run"));
    void Promise.all([loadRuns(), checkConnection()]).then(() => {
      if (Number.isSafeInteger(run) && run > 0) setSelected(run);
    }).catch(e => setError(e.message));
  }, [loadRuns, checkConnection]);
  const active = runs?.some(r => r.status === "PENDING" || r.status === "RUNNING") ?? false;
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => void loadRuns().catch(e => setError(e.message)), 3000);
    return () => clearInterval(timer);
  }, [active, loadRuns]);
  const selectedRun = runs?.find(r => r.id === selected);
  useEffect(() => {
    if (selected === null || selectedRun?.status !== "COMPLETED") return;
    let current = true;
    void vehicsimApi.carlaData(selected).then(result => {
      if (current) { setData(result); setFrame(0); }
    }).catch(e => { if (current) setError(e.message); });
    return () => { current = false; };
  }, [selected, selectedRun?.status]);
  const cameraFrame = data?.camera_frames[frame];
  useEffect(() => {
    if (!data || !cameraFrame) return;
    let current = true;
    let url: string | undefined;
    void vehicsimApi.carlaImage(data.run_id, cameraFrame).then(blob => {
      if (current) { url = URL.createObjectURL(blob); setImage(url); }
    }).catch(e => { if (current) setError(e.message); });
    return () => { current = false; if (url) URL.revokeObjectURL(url); };
  }, [data, cameraFrame]);
  const ready = connection?.connected && connection.compatible && connection.scenario_runner;
  // Backend chỉ cấu hình profile .xosc hiện hành cho run mới (hiện -xosc4); không gắn số phiên bản ở đây để đổi profile không khoá nút.
  const xoscProfile = /-xosc\d+$/.test(connection?.simulator ?? "");
  const familyId = family || String(ctx?.families[0]?.id ?? "");

  const start = async () => {
    if (!familyId) return;
    setBusy(true); setError(null);
    try {
      await vehicsimApi.runFamily(Number(familyId));
      const latest = await loadRuns();
      const queued = latest.find(run => run.scenario_id === Number(familyId));
      if (queued) { setSelected(queued.id); setData(null); setImage(null); }
    } catch (e) { setError(e instanceof Error ? e.message : "Không chạy được CARLA"); }
    finally { setBusy(false); }
  };

  const familyRuns = runs?.filter(run => run.scenario_id === Number(familyId)) ?? [];
  const familyActive = familyRuns.filter(run => run.status === "PENDING" || run.status === "RUNNING").length;
  const familyDone = familyRuns.some(run => run.status === "COMPLETED");

  const cancelFamily = async () => {
    setBusy(true); setError(null);
    try {
      await vehicsimApi.cancelFamily(Number(familyId));
      await loadRuns();
    } catch (e) { setError(e instanceof Error ? vi(e.message) : "Không hủy được lượt chạy"); }
    finally { setBusy(false); }
  };

  const cancel = async (runId: number) => {
    setCancelling(prev => new Set(prev).add(runId)); setError(null);
    try {
      await vehicsimApi.cancelRun(runId);
      await loadRuns();
    } catch (e) { setError(e instanceof Error ? vi(e.message) : "Không hủy được lượt chạy"); }
    finally { setCancelling(prev => { const next = new Set(prev); next.delete(runId); return next; }); }
  };

  return (
    <Card className="flex flex-col gap-4 p-6">
      <CardTitle aside={<Tag tone={ready ? "ok" : "neutral"}>{connection === null ? "Đang kiểm tra CARLA…" : ready ? `CARLA ${connection?.version} đã kết nối` : "CARLA chưa sẵn sàng"}</Tag>}>
        Chạy CARLA từ web
      </CardTitle>
      <p className="text-[13px] leading-relaxed text-vehicsim-muted">
        Chọn họ kịch bản để chạy từng biến thể bằng OpenSCENARIO và bản cơ sở AEB. Cửa sổ CARLA bám theo xe;
        dữ liệu radar, IMU, va chạm và ảnh RGB được ghi tự động để xem sau khi hoàn thành.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <select aria-label="Họ kịch bản chạy CARLA" value={familyId} onChange={e => setFamily(e.target.value)}
          className="min-w-[220px] rounded-full border border-vehicsim-line bg-white px-4 py-3 text-[13px]">
          {!ctx?.families.length && <option value="">{ctx === null ? "Đang tải họ kịch bản…" : "Chưa có họ kịch bản"}</option>}
          {ctx?.families.map(f => <option key={f.id} value={f.id}>{f.code} · {f.name}</option>)}
        </select>
        <PillButton variant="dark" disabled={!canWrite || !ready || !xoscProfile || !familyId || busy} onClick={() => void start()}>
          {busy ? "Đang xếp hàng…" : "Chạy trên CARLA"}
        </PillButton>
        <PillButton onClick={() => void Promise.all([checkConnection(), loadRuns()]).catch(e => setError(e.message))}>Kiểm tra kết nối</PillButton>
        {familyActive > 0 && (
          <PillButton className="text-vehicsim-danger" disabled={!canWrite || busy} onClick={() => void cancelFamily()}
            title="Hủy mọi lượt đang chờ/đang chạy của họ này">
            Hủy {familyActive} lượt của họ
          </PillButton>
        )}
        {familyDone && (
          <PillButton href={`/analysis/failures?scenario_id=${familyId}`}>Tiếp tục: Phân tích kết quả →</PillButton>
        )}
      </div>
      {connection?.simulator && (
        <p className="text-[12px] text-vehicsim-muted">
          Lượt mới chạy bằng <b className="text-vehicsim-ink">{simulatorLabel(connection.simulator)}</b>
          {ctx?.vehicle && <> · xe <b className="text-vehicsim-ink">{ctx.vehicle.name}</b></>}
          {ctx?.system.baseline && <> · AEB <b className="text-vehicsim-ink">{ctx.system.baseline.label}</b></>}
        </p>
      )}
      {connection && !connection.configured && <p className="text-[12px] text-vehicsim-warn">Máy chủ chưa cấu hình CARLA local. Dùng cấu hình khởi động CARLA của dự án.</p>}
      {connection?.configured && !xoscProfile && <p className="text-[12px] text-vehicsim-warn">Hệ thống chưa chọn chế độ OpenSCENARIO cho các lượt chạy mới.</p>}
      {connection?.connected && connection.compatible === false && <ErrorNote message="Phiên bản Python client và CARLA server chưa khớp." />}
      <ErrorNote message={error} />
      <div className="divide-y divide-vehicsim-line rounded-[16px] border border-vehicsim-line">
        {runs === null && <p className="p-4 text-[13px] text-vehicsim-muted">Đang tải lượt chạy…</p>}
        {runs?.length === 0 && <p className="p-4 text-[13px] text-vehicsim-muted">Chưa có lượt CARLA. Tạo họ kịch bản rồi chạy để có kết quả thực.</p>}
        {runs?.map(run => (
          <div key={run.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-[13px]">
            <span className="font-semibold">{runCode(run.id)}</span>
            <Tag tone={run.status === "FAILED" ? "danger" : run.status === "COMPLETED" ? "ok" : "neutral"}>{statusLabel[run.status]}</Tag>
            <span className="flex gap-3">
              <button className="font-semibold text-vehicsim-decision" onClick={() => void vehicsimApi.downloadRunXosc(run.id).catch(e => setError(e.message))}>Tải .xosc</button>
              <button className="font-semibold text-vehicsim-decision" disabled={run.status !== "COMPLETED"}
                onClick={() => { if (selected !== run.id) { setSelected(run.id); setData(null); setImage(null); setError(null); } }}>Xem cảm biến</button>
              {run.status === "COMPLETED" && <Link href={`/analysis/failures/${run.id}/playback`}>Phát lại</Link>}
              {(run.status === "PENDING" || run.status === "RUNNING") && (
                <button className="font-semibold text-vehicsim-danger" disabled={!canWrite || cancelling.has(run.id)}
                  aria-label={`Hủy lượt chạy ${runCode(run.id)}`} onClick={() => void cancel(run.id)}>
                  {cancelling.has(run.id) ? "Đang hủy…" : "Hủy"}
                </button>
              )}
            </span>
            {run.error_message && <p className="w-full break-words text-vehicsim-danger">{vi(run.error_message)}</p>}
          </div>
        ))}
      </div>
      {selectedRun?.status === "COMPLETED" && !data && !error && <p className="text-[13px] text-vehicsim-muted">Đang đọc cảm biến {runCode(selectedRun.id)}…</p>}
      {data && <>
        <h3 className="text-[14px] font-semibold text-vehicsim-ink">Cảm biến lượt {runCode(data.run_id)}</h3>
        <div className="grid gap-3 md:grid-cols-3">
          <StatCard label="RMS jerk lúc phanh" value={data.summary.rms_jerk_mps3?.toFixed(2) ?? "—"} note="m/s³" tone="info" />
          <StatCard label="Tốc độ lúc va chạm" value={data.summary.impact_speed_mps?.toFixed(2) ?? "—"}
            note={data.summary.collisions ? "m/s" : "Không ghi nhận va chạm"} tone={data.summary.collisions ? "danger" : "info"} />
          <StatCard label="Quãng phanh ước tính" value={data.summary.stopping_distance_m?.toFixed(2) ?? "—"} note="m · phanh CARLA chưa hiệu chuẩn" tone="info" />
        </div>
        <div className="flex gap-3">
          <PillButton onClick={() => void vehicsimApi.downloadCarlaFile(data.run_id, "frames.csv").catch(e => setError(e.message))}>Tải frames.csv</PillButton>
          <PillButton onClick={() => void vehicsimApi.downloadCarlaFile(data.run_id, "collisions.json").catch(e => setError(e.message))}>Tải va chạm</PillButton>
        </div>
        {image && <Image src={image} alt={`Ảnh camera CARLA ${runCode(data.run_id)}`} width={800} height={450} unoptimized className="w-full rounded-[16px]" />}
        {data.camera_frames.length > 1 && <label className="text-[12px] text-vehicsim-muted">Ảnh {frame + 1} / {data.camera_frames.length}
          <input aria-label="Khung camera CARLA" type="range" min={0} max={data.camera_frames.length - 1} value={frame}
            onChange={e => setFrame(Number(e.target.value))} className="w-full" />
        </label>}
        {!data.camera_frames.length && <p className="text-[12px] text-vehicsim-muted">Lượt này không ghi ảnh RGB.</p>}
      </>}
    </Card>
  );
}

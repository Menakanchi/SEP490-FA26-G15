"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { CarlaRunVideo } from "@/components/CarlaRunVideo";
import { useVehicSimContext } from "@/components/VehicSimContext";
import { Card, ErrorNote, PillButton, StatCard, Tag, cx, runCode, simulatorLabel } from "@/components/VehicSimUi";
import { vi } from "@/components/vehicsimI18n";
import { useAuth } from "@/context/AuthContext";
import { vehicsimApi } from "@/services/vehicsim";
import type { CarlaData, CarlaRun, CarlaStatus } from "@/types/vehicsim";

import { formatObjective } from "./analysis/analysisMetricFormat";

const statusLabel = { PENDING: "Đang chờ", RUNNING: "Đang chạy", COMPLETED: "Hoàn thành", FAILED: "Lỗi thực thi", STOPPED: "Đã hủy" };

export function CarlaRunnerPanel({ tab, onViewRuns }: { tab: "run" | "history" | "result" | "telemetry"; onViewRuns: () => void }) {
  const { ctx, canWrite } = useVehicSimContext();
  const { user } = useAuth();
  const archivedWorkspace = ctx?.reviewer_can_decide === false
    && (user?.roleCode === "ENGINEER" || (user?.roleCode === "ADMIN" && ctx.workspace !== null));
  const canEditRuns = ctx !== null && canWrite && !archivedWorkspace;
  const [connection, setConnection] = useState<CarlaStatus | null>(null);
  const [runs, setRuns] = useState<CarlaRun[] | null>(null);
  const [family, setFamily] = useState("");
  // Được bàn giao từ màn thiết kế (/analysis/carla?family=<id>): chọn sẵn đúng họ.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("family");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- đọc query một lần sau khi mount
    if (id && /^\d+$/.test(id)) setFamily(id);
  }, []);
  const [selected, setSelected] = useState<number | null>(null);
  const [data, setData] = useState<CarlaData | null>(null);
  const [frame, setFrame] = useState(0);
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sensorError, setSensorError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [sensorAttempt, setSensorAttempt] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
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
    }).catch(e => { if (current) setSensorError(e instanceof Error ? e.message : "Không tải được cảm biến"); });
    return () => { current = false; };
  }, [selected, selectedRun?.status, sensorAttempt]);
  const cameraFrame = data?.camera_frames[frame];
  useEffect(() => {
    if (!data || !cameraFrame) return;
    let current = true;
    let url: string | undefined;
    void vehicsimApi.carlaImage(data.run_id, cameraFrame).then(blob => {
      if (current) { url = URL.createObjectURL(blob); setImage(url); }
    }).catch(e => { if (current) setSensorError(e instanceof Error ? e.message : "Không tải được ảnh camera"); });
    return () => { current = false; if (url) URL.revokeObjectURL(url); };
  }, [data, cameraFrame]);
  const ready = connection?.connected && connection.compatible && connection.scenario_runner;
  // Backend chỉ cấu hình profile .xosc hiện hành cho run mới (hiện -xosc15); không gắn số phiên bản ở đây để đổi profile không khoá nút.
  const xoscProfile = /-xosc\d+$/.test(connection?.simulator ?? "");
  const familyId = family || String(ctx?.families[0]?.id ?? "");
  const familyName = ctx?.families.find(f => f.id === Number(familyId))?.name ?? `#${familyId}`;

  const start = async () => {
    if (!familyId) return;
    setBusy(true); setError(null);
    try {
      await vehicsimApi.runFamily(Number(familyId));
      const latest = await loadRuns();
      const queued = latest.find(run => run.scenario_id === Number(familyId));
      if (queued) { setSelected(queued.id); setData(null); setImage(null); }
      onViewRuns();
    } catch (e) { setError(e instanceof Error ? e.message : "Không chạy được CARLA"); }
    finally { setBusy(false); }
  };

  const familyRuns = runs?.filter(run => run.scenario_id === Number(familyId)) ?? [];
  const familyDone = familyRuns.some(run => run.status === "COMPLETED");

  const cancelFamily = async () => {
    if (!window.confirm(`Hủy tất cả lượt CARLA độc lập đang chờ hoặc đang chạy của họ “${familyName}”, kể cả lượt chạy lại? Các lượt thuộc hồi quy hoặc tối ưu sẽ không bị hủy.`)) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const result = await vehicsimApi.cancelFamily(Number(familyId), "CARLA");
      setNotice(`Đã hủy ${result.stopped} lượt đang chờ; ${result.stopping} lượt đang chạy đã nhận yêu cầu dừng.`);
      await loadRuns();
    } catch (e) { setError(e instanceof Error ? vi(e.message) : "Không hủy được lượt chạy"); }
    finally { setBusy(false); }
  };

  // Chỉ kết quả baseline đã kết thúc và không thuộc regression mới xoá được (backend kiểm lại; mốc của regression bị từ chối ở đó).
  const deletable = (run: CarlaRun) => canEditRuns && run.purpose === "BASELINE" && !run.regression_test_id && !run.optimization_trial_id
    && (run.status === "COMPLETED" || run.status === "FAILED" || run.status === "STOPPED");

  const removeRun = async (run: CarlaRun) => {
    if (!window.confirm(`Xóa kết quả lượt ${runCode(run.id)}? Số đo, video và file cảm biến của lượt này bị xóa vĩnh viễn, không khôi phục được.`)) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      await vehicsimApi.deleteRun(run.id);
      if (selected === run.id) { setSelected(null); setData(null); setImage(null); }
      setNotice(`Đã xóa kết quả lượt ${runCode(run.id)}.`);
      await loadRuns();
    } catch (e) { setError(e instanceof Error ? vi(e.message) : "Không xóa được kết quả"); }
    finally { setBusy(false); }
  };

  const removeFamilyResults = async () => {
    if (!window.confirm(`Xóa tất cả kết quả baseline CARLA đã kết thúc của họ “${familyName}”, kể cả các lượt không hiển thị trong danh sách? Số đo, video và file cảm biến bị xóa vĩnh viễn. `
      + "Các lượt đang chờ/chạy, thuộc hồi quy hoặc tối ưu, và các lượt đang được tham chiếu sẽ được giữ lại.")) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const r = await vehicsimApi.deleteFamilyBaseline(Number(familyId), "CARLA");
      if (selected !== null && familyRuns.some(run => run.id === selected) && r.deleted > 0) { setSelected(null); setData(null); setImage(null); }
      const kept = [r.skipped_active ? `${r.skipped_active} lượt đang chờ/chạy` : "", r.skipped_in_use ? `${r.skipped_in_use} lượt là mốc của hồi quy` : ""].filter(Boolean);
      setNotice(`Đã xóa ${r.deleted} lượt.${kept.length ? ` Giữ lại ${kept.join(", ")}.` : ""}`);
      await loadRuns();
    } catch (e) { setError(e instanceof Error ? vi(e.message) : "Không xóa được kết quả"); }
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
    <div hidden={tab !== "run" && tab !== "history"}>
    <Card className="flex flex-col gap-6 p-5 sm:p-6">
      <div id="carla-panel-run" role="tabpanel" aria-labelledby="carla-tab-run" tabIndex={0} hidden={tab !== "run"}>
      <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h2 className="text-[17px] font-bold text-vehicsim-ink">Chạy mô phỏng CARLA</h2>
          <p className="mt-1 max-w-[70ch] text-[13px] leading-relaxed text-vehicsim-muted">
            Chọn một họ kịch bản để chạy các biến thể với cấu hình AEB cơ sở. Dữ liệu cảm biến và hình ảnh được lưu theo từng lượt.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tag tone={ready ? "ok" : "neutral"}>{connection === null ? "Đang kiểm tra CARLA…" : ready ? `CARLA ${connection?.version} đã kết nối` : "CARLA chưa sẵn sàng"}</Tag>
          <button type="button" className="rounded-md px-2 py-1 text-[12px] font-semibold text-vehicsim-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vehicsim-primary"
            onClick={() => void Promise.all([checkConnection(), loadRuns()]).catch(e => setError(e.message))}>Kiểm tra lại</button>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-0 flex-1 basis-[260px] flex-col gap-1.5 text-[13px] font-semibold text-vehicsim-ink">
          Họ kịch bản
          <select aria-label="Họ kịch bản chạy CARLA" value={familyId} onChange={e => setFamily(e.target.value)}
            className="min-h-11 w-full min-w-0 rounded-lg border border-vehicsim-line bg-vehicsim-surface px-3 text-[13px] font-normal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vehicsim-primary">
            {!ctx?.families.length && <option value="">{ctx === null ? "Đang tải họ kịch bản…" : "Chưa có họ kịch bản"}</option>}
            {ctx?.families.map(f => <option key={f.id} value={f.id}>{f.code} · {f.name}</option>)}
          </select>
        </label>
        <PillButton variant="dark" disabled={!canEditRuns || !ready || !xoscProfile || !familyId || busy} onClick={() => void start()}>
          {busy ? "Đang xử lý…" : "Chạy trên CARLA"}
        </PillButton>
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
      {archivedWorkspace && <p className="text-[12px] text-vehicsim-muted">Project hoặc workspace đã lưu trữ. Bạn chỉ có thể xem lịch sử CARLA.</p>}
      {ctx && !canWrite && <p className="text-[12px] text-vehicsim-muted">Tài khoản của bạn chỉ xem được lượt chạy CARLA; thao tác chạy, hủy và xóa cần quyền phù hợp.</p>}
      <div><PillButton onClick={onViewRuns}>Xem lượt chạy</PillButton></div>
      </div>
      </div>
      <ErrorNote message={error} />
      {notice && <p role="status" className="text-[13px] text-vehicsim-ink">{notice}</p>}
      <div id="carla-panel-history" role="tabpanel" aria-labelledby="carla-tab-history" tabIndex={0} hidden={tab !== "history"}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-bold text-vehicsim-ink">Lượt chạy gần đây</h3>
            <p className="mt-1 text-[12px] text-vehicsim-muted">Tối đa 30 lượt CARLA gần nhất trong project.</p>
          </div>
          {familyDone && <PillButton href={`/analysis/failures?scenario_id=${familyId}`}>Phân tích kết quả</PillButton>}
        </div>
        <label className="mt-4 flex max-w-lg flex-col gap-1.5 text-[13px] font-semibold text-vehicsim-ink">
          Họ kịch bản để quản lý
          <select aria-label="Họ kịch bản để quản lý" value={familyId} onChange={e => setFamily(e.target.value)}
            className="min-h-11 w-full min-w-0 rounded-lg border border-vehicsim-line bg-vehicsim-surface px-3 text-[13px] font-normal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vehicsim-primary">
            {!ctx?.families.length && <option value="">{ctx === null ? "Đang tải họ kịch bản…" : "Chưa có họ kịch bản"}</option>}
            {ctx?.families.map(f => <option key={f.id} value={f.id}>{f.code} · {f.name}</option>)}
          </select>
        </label>
        {(familyId && canEditRuns || familyRuns.length > 0) && (
          <details className="mt-4 rounded-lg bg-vehicsim-soft px-4 py-3 text-[13px]">
            <summary className="cursor-pointer font-semibold text-vehicsim-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vehicsim-primary">Quản lý họ kịch bản</summary>
            <p className="mt-2 max-w-[75ch] text-[12px] leading-relaxed text-vehicsim-muted">Hủy hoặc xóa áp dụng cho mọi lượt phù hợp của họ {familyName}, kể cả lượt không hiển thị trong danh sách.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {familyRuns.length > 0 && <PillButton onClick={() => { setError(null); void vehicsimApi.downloadFamilyXosc(Number(familyId)).catch(e => setError(vi(e.message))); }} title="Tải .zip chứa một .xosc cho mỗi lượt chạy của họ này">Tải tất cả .xosc</PillButton>}
              {familyId && canEditRuns && <>
                <PillButton className="text-vehicsim-danger" disabled={busy} onClick={() => void cancelFamily()} title="Hủy các lượt CARLA độc lập đang chờ hoặc đang chạy của họ này">Hủy lượt đang chạy</PillButton>
                <PillButton className="text-vehicsim-danger" disabled={busy} onClick={() => void removeFamilyResults()} title="Xóa kết quả baseline CARLA đã kết thúc của họ này, kể cả các lượt không hiển thị">Xóa kết quả baseline</PillButton>
              </>}
            </div>
          </details>
        )}
      <div className="mt-4 max-h-[420px] divide-y divide-vehicsim-line overflow-y-auto rounded-lg border border-vehicsim-line">
        {runs === null && <p role="status" className="p-4 text-[13px] text-vehicsim-muted">Đang tải lượt chạy…</p>}
        {runs?.length === 0 && <p className="p-4 text-[13px] text-vehicsim-muted">Chưa có lượt CARLA. Tạo họ kịch bản rồi chạy để xem dữ liệu tại đây.</p>}
        {runs?.map(run => (
          <div key={run.id} className={cx("flex flex-wrap items-center justify-between gap-x-5 gap-y-2 px-4 py-3.5 text-[13px]", selected === run.id && "bg-vehicsim-soft")}>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="mr-1 font-bold tabular-nums text-vehicsim-ink">{runCode(run.id)}</span>
              <Tag tone={run.status === "FAILED" ? "danger" : run.status === "COMPLETED" ? "ok" : "neutral"}>{statusLabel[run.status]}</Tag>
              {run.aeb_mode === "OFF" && <Tag tone="neutral">AEB tắt</Tag>}
              {run.regression_test_id != null && <Tag tone="neutral">Hồi quy</Tag>}
              {run.optimization_trial_id != null && <Tag tone="neutral">Tối ưu</Tag>}
            </div>
            <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <button className="font-semibold text-vehicsim-decision" onClick={() => void vehicsimApi.downloadRunXosc(run.id).catch(e => setError(e.message))}>Tải .xosc</button>
              <button className="font-semibold text-vehicsim-decision" disabled={run.status !== "COMPLETED"} aria-haspopup="dialog"
                onClick={() => {
                  setSelected(run.id); setData(null); setImage(null); setSensorError(null);
                  setSensorAttempt(n => n + 1); setModalOpen(true); dialogRef.current?.showModal();
                }}>Xem cảm biến</button>
              {run.status === "COMPLETED" && <Link href={`/analysis/failures/${run.id}/playback`}>Phát lại</Link>}
              {deletable(run) && (
                <button className="font-semibold text-vehicsim-danger" disabled={busy} aria-label={`Xóa kết quả lượt ${runCode(run.id)}`}
                  onClick={() => void removeRun(run)}>Xóa</button>
              )}
              {(run.status === "PENDING" || run.status === "RUNNING") && run.regression_test_id == null && run.optimization_trial_id == null && (
                <button className="font-semibold text-vehicsim-danger" disabled={!canEditRuns || cancelling.has(run.id)}
                  aria-label={`Hủy lượt chạy ${runCode(run.id)}`} onClick={() => void cancel(run.id)}>
                  {cancelling.has(run.id) ? "Đang hủy…" : "Hủy"}
                </button>
              )}
            </span>
            {run.error_message && <p className="w-full break-words text-vehicsim-danger">{vi(run.error_message)}</p>}
          </div>
        ))}
      </div>
      <dialog ref={dialogRef} aria-labelledby="carla-sensor-title" onClose={() => setModalOpen(false)}
        className="m-auto max-h-[90dvh] w-[min(960px,calc(100%-2rem))] overflow-y-auto rounded-xl border-0 bg-vehicsim-surface p-0 text-vehicsim-ink shadow-xl backdrop:bg-black/55">
        {modalOpen && <div className="flex flex-col gap-5 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div><h3 id="carla-sensor-title" className="text-lg font-bold">Cảm biến lượt {selected === null ? "" : runCode(selected)}</h3>
            <p className="mt-1 text-[13px] text-vehicsim-muted">Xem video và tải dữ liệu đã ghi của lượt chạy này.</p></div>
          <button autoFocus type="button" onClick={() => dialogRef.current?.close()} aria-label="Đóng cửa sổ cảm biến" className="min-h-11 min-w-11 rounded-lg border border-vehicsim-line text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vehicsim-primary">Đóng</button>
        </div>
        <ErrorNote message={sensorError} />
      {!data && !sensorError && <p role="status" className="text-[13px] text-vehicsim-muted">Đang đọc dữ liệu cảm biến…</p>}
      {data && data.run_id === selected && <>
        {data.has_video && <CarlaRunVideo key={data.run_id} runId={data.run_id} onError={setSensorError} />}
        {image && <Image src={image} alt={`Ảnh camera CARLA ${runCode(data.run_id)}`} width={1280} height={720} unoptimized className="w-full rounded-xl" />}
        {data.camera_frames.length > 1 && <label className="text-[12px] text-vehicsim-muted">Ảnh {frame + 1} / {data.camera_frames.length}
          <input aria-label="Khung camera CARLA" type="range" min={0} max={data.camera_frames.length - 1} value={frame}
            onChange={e => setFrame(Number(e.target.value))} className="w-full" />
        </label>}
        {!data.camera_frames.length && !data.has_video && <p className="text-[13px] text-vehicsim-muted">Lượt này không ghi camera (không có video và không có ảnh RGB).</p>}
        {data.camera_frames.length > 0 && !data.has_video && <p className="text-[13px] text-vehicsim-muted">Lượt này chưa có video (chỉ có ảnh từng khung). Máy chạy CARLA cần cài ffmpeg: <code>pip install imageio-ffmpeg</code>.</p>}
        <h4 className="text-[14px] font-semibold text-vehicsim-ink">Số đo cảm biến</h4>
        <div className="grid gap-3 md:grid-cols-3">
          <StatCard label="RMS jerk lúc phanh" value={formatObjective(data.summary.rms_jerk_mps3)} note="m/s³ · tính lại từ cảm biến; không thay số đã lưu" tone="info" />
          <StatCard label="Vận tốc va chạm tương đối" value={data.summary.collisions > 0 ? formatObjective(data.summary.impact_speed_mps) : "—"}
            note={data.summary.collisions ? "m/s" : "Không có sự kiện va chạm trong dữ liệu cảm biến"} tone={data.summary.collisions ? "danger" : "info"} />
          <StatCard label="Quãng phanh ước tính" value={formatObjective(data.summary.stopping_distance_m)} note="m · có thể gồm ngoại suy; hiệu chuẩn phụ thuộc xe/profile" tone="info" />
        </div>
        <div className="flex flex-wrap gap-3">
          <PillButton onClick={() => void vehicsimApi.downloadRunXosc(data.run_id).catch(e => setSensorError(e.message))}>Tải .xosc</PillButton>
          <PillButton onClick={() => void vehicsimApi.downloadCarlaFile(data.run_id, "frames.csv").catch(e => setSensorError(e.message))}>Tải frames.csv</PillButton>
          <PillButton onClick={() => void vehicsimApi.downloadCarlaFile(data.run_id, "collisions.json").catch(e => setSensorError(e.message))}>Tải va chạm</PillButton>
          <PillButton onClick={() => void vehicsimApi.downloadCarlaFile(data.run_id, "ground_truth.csv").catch(e => setSensorError(e.message))}>Tải ground truth</PillButton>
        </div>
      </>}
      </div>}
      </dialog>
      </div>
    </Card>
    </div>
  );
}

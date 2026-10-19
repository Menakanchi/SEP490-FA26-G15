"use client";

/**
 * Dữ liệu CARLA chạy ngoài backend:
 *  1. Nộp `result.json` của `worker/run_variant.py` cho một run CARLA đang chờ / lỗi (`POST /runs/{id}/carla-result`).
 *  2. Đánh giá `frames.csv` + `collisions.json` của `worker/sensor_recorder.py` (`POST /telemetry/evaluate`, ADR-040).
 * Backend kiểm mọi luật (đúng simulator, run chưa có kết quả, regression chưa chốt); trang chỉ đọc file và hiện kết quả.
 */

import React, { useState } from "react";
import Link from "next/link";
import { VehicSimPage } from "@/components/VehicSimPage";
import { useVehicSimContext } from "@/components/VehicSimContext";
import { Card, CardTitle, ErrorNote, PillButton, StatCard, Tag, cx, fmt, runCode } from "@/components/VehicSimUi";
import { vi } from "@/components/vehicsimI18n";
import { vehicsimApi } from "@/services/vehicsim";
import type { TelemetrySummary } from "@/types/vehicsim";
import { CarlaRunnerPanel } from "@/components/CarlaRunnerPanel";

const RESULT_FORMAT = "vehicsim.result/v1";
/** Khớp giới hạn của `TelemetryRequest` ở backend. */
const MAX_CSV_CHARS = 5_000_000;
const MAX_COLLISIONS = 1000;

const READ_ONLY_NOTE = "Tài khoản của bạn chỉ có quyền xem";

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error ? vi(err.message) : fallback;
}

export default function CarlaDataPage() {
  const { canWrite } = useVehicSimContext();
  return (
    <VehicSimPage
      crumbs={[{ label: "Phân tích" }, { label: "Dữ liệu CARLA" }]}
      title="Dữ liệu CARLA"
      subtitle="Chạy OpenSCENARIO trên CARLA local, xem dữ liệu cảm biến hoặc nộp kết quả chạy từ máy khác"
    >
      <div className="flex items-start gap-[10px] rounded-[16px] bg-vehicsim-warn-bg px-4 py-3 text-[13px] text-vehicsim-ink">
        <span className="font-bold text-vehicsim-warn">!</span>
        <p>
          Phanh xe trong CARLA chưa được hiệu chuẩn (TD-17), nên số đo ở đây chỉ để quan sát và đối chiếu, không dùng làm
          bằng chứng regression. Kết quả CARLA không bao giờ được ghép với kết quả bộ động học.
        </p>
      </div>
      <CarlaRunnerPanel />
      <SubmitResultCard canWrite={canWrite} />
      <TelemetryCard canWrite={canWrite} />
    </VehicSimPage>
  );
}

// ---------------------------------------------------------------------------
// 1 · Nộp result.json
// ---------------------------------------------------------------------------

interface ResultDoc {
  format?: unknown;
  simulator?: unknown;
  seed?: unknown;
  source?: { run_id?: unknown } | null;
  outcome?: { end_reason?: unknown; duration_s?: unknown; metrics?: { collision?: unknown } } | null;
  evaluation?: unknown;
}

function SubmitResultCard({ canWrite }: { canWrite: boolean }) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [doc, setDoc] = useState<ResultDoc | null>(null);
  const [runId, setRunId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<number | null>(null);

  const pick = async (file: File) => {
    setFileName(file.name);
    setDoc(null);
    setDone(null);
    setError(null);
    try {
      const parsed = JSON.parse(await file.text()) as ResultDoc;
      if (!parsed || typeof parsed !== "object" || parsed.format !== RESULT_FORMAT) {
        setError(`File không phải result.json của VehicSim (cần "format": "${RESULT_FORMAT}").`);
        return;
      }
      setDoc(parsed);
      const id = parsed.source?.run_id;
      setRunId(typeof id === "number" ? String(id) : "");
    } catch {
      setError("Không đọc được file: nội dung không phải JSON hợp lệ.");
    }
  };

  const id = /^\d+$/.test(runId.trim()) ? Number(runId.trim()) : null;

  const submit = async () => {
    if (!doc || id === null) return;
    setBusy(true);
    setError(null);
    try {
      const reply = await vehicsimApi.submitCarlaResult(id, doc);
      setDone(reply.run_id);
    } catch (err) {
      setError(errorText(err, "Không nộp được kết quả"));
    } finally {
      setBusy(false);
    }
  };

  const collision = doc?.outcome?.metrics?.collision;
  const hasArtifacts = !!doc && "artifacts" in doc && JSON.stringify((doc as { artifacts?: unknown }).artifacts ?? {}) !== "{}";

  return (
    <Card className="flex flex-col gap-4 p-6">
      <CardTitle aside={<Tag tone="info">Run CARLA đang chờ hoặc lỗi</Tag>}>Nộp kết quả CARLA</CardTitle>
      <p className="text-[13px] leading-[1.6] text-vehicsim-muted">
        Tải OpenSCENARIO của lượt chạy (nút &quot;Tải .xosc&quot;), chạy{" "}
        <code className="rounded bg-vehicsim-soft px-1">python worker/run_xosc.py vehicsim-run-&lt;id&gt;.xosc</code> trên máy có
        CARLA, rồi chọn file <code className="rounded bg-vehicsim-soft px-1">result.json</code> vừa ghi ra. Chỉ nhận run CARLA đang
        chờ chạy hoặc đã lỗi, đúng phiên bản CARLA của run, và không thuộc regression test đã có kết luận.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <FilePick accept=".json,application/json" label="Chọn result.json" disabled={!canWrite} onPick={pick} />
        {fileName && <span className="text-[13px] font-medium text-vehicsim-ink">{fileName}</span>}
      </div>

      {doc && (
        <div className="grid grid-cols-2 gap-[10px] md:grid-cols-4">
          <Fact label="Bộ mô phỏng" value={typeof doc.simulator === "string" ? doc.simulator : "—"} />
          <Fact label="Seed" value={typeof doc.seed === "number" ? String(doc.seed) : "—"} />
          <Fact label="Kết thúc" value={typeof doc.outcome?.end_reason === "string" ? doc.outcome.end_reason : "—"} />
          <Fact
            label="Va chạm"
            value={collision === true ? "Có" : collision === false ? "Không" : "—"}
            danger={collision === true}
          />
        </div>
      )}
      {doc && !doc.evaluation && <ErrorNote message="File thiếu kết quả chấm (evaluation): worker đã quá cũ, hãy cập nhật repo rồi chạy lại." />}
      {hasArtifacts && (
        <p className="text-[12px] text-vehicsim-muted">
          Đường dẫn video/ảnh trong file chỉ có trên máy đã chạy CARLA nên sẽ không được lưu.
        </p>
      )}

      {doc && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-[12px] font-medium text-vehicsim-muted">
            Mã lượt chạy
            <input
              value={runId}
              onChange={(e) => setRunId(e.target.value)}
              inputMode="numeric"
              placeholder="vd. 42"
              className="w-[140px] rounded-full border border-solid border-vehicsim-line-strong bg-white px-4 py-[10px] text-[13px] font-semibold text-vehicsim-ink"
            />
          </label>
          <PillButton variant="dark" disabled={!canWrite || busy || id === null || !doc.evaluation} onClick={() => void submit()}>
            {busy ? "Đang nộp…" : id === null ? "Nộp kết quả" : `Nộp vào lượt ${runCode(id)}`}
          </PillButton>
          {doc.source?.run_id === undefined && (
            <span className="text-[12px] text-vehicsim-warn">File không ghi mã lượt chạy, hãy nhập tay.</span>
          )}
        </div>
      )}

      {!canWrite && <p className="text-[12px] text-vehicsim-muted">{READ_ONLY_NOTE}.</p>}
      <ErrorNote message={error} />
      {done !== null && (
        <div className="flex items-center gap-3 rounded-[16px] bg-vehicsim-ok-bg px-4 py-3 text-[13px] text-vehicsim-ok">
          <span className="font-semibold">Đã lưu kết quả CARLA cho lượt {runCode(done)}.</span>
          <Link href={`/analysis/failures/${done}`} className="font-semibold text-vehicsim-decision hover:underline">
            Xem chi tiết →
          </Link>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 2 · Đánh giá telemetry
// ---------------------------------------------------------------------------

function TelemetryCard({ canWrite }: { canWrite: boolean }) {
  const [csv, setCsv] = useState<{ name: string; text: string } | null>(null);
  const [collisions, setCollisions] = useState<{ name: string; items: unknown[] } | null>(null);
  const [decel, setDecel] = useState("8");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<TelemetrySummary | null>(null);

  const pickCsv = async (file: File) => {
    setSummary(null);
    setError(null);
    const text = await file.text();
    if (text.length > MAX_CSV_CHARS) {
      setCsv(null);
      setError("frames.csv lớn hơn 5 MB. Hãy rút ngắn lượt chạy hoặc giảm tần số ghi.");
      return;
    }
    setCsv({ name: file.name, text });
  };

  const pickCollisions = async (file: File) => {
    setSummary(null);
    setError(null);
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!Array.isArray(parsed)) throw new Error("not a list");
      if (parsed.length > MAX_COLLISIONS) {
        setError(`collisions.json có hơn ${MAX_COLLISIONS} va chạm.`);
        return;
      }
      setCollisions({ name: file.name, items: parsed });
    } catch {
      setCollisions(null);
      setError("collisions.json phải là một danh sách JSON (file sensor_recorder.py ghi ra).");
    }
  };

  const decelValue = Number(decel);
  const decelOk = decel.trim() !== "" && Number.isFinite(decelValue) && decelValue > 0 && decelValue <= 15;

  const evaluate = async () => {
    if (!csv || !decelOk) return;
    setBusy(true);
    setError(null);
    try {
      setSummary(
        await vehicsimApi.evaluateTelemetry({ csv: csv.text, collisions: collisions?.items ?? [], decel_available: decelValue }),
      );
    } catch (err) {
      setError(errorText(err, "Không tính được số đo"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="flex flex-col gap-4 p-6">
      <CardTitle aside={<Tag tone="neutral">3 mục tiêu MOBO</Tag>}>Đánh giá dữ liệu cảm biến</CardTitle>
      <p className="text-[13px] leading-[1.6] text-vehicsim-muted">
        Chọn <code className="rounded bg-vehicsim-soft px-1">frames.csv</code> và (nếu có va chạm){" "}
        <code className="rounded bg-vehicsim-soft px-1">collisions.json</code> trong thư mục mà{" "}
        <code className="rounded bg-vehicsim-soft px-1">worker/sensor_recorder.py</code> ghi ra. Nửa giây đầu (lúc ScenarioRunner đặt
        lại tốc độ) và xung lực lúc đâm xe được loại khỏi số đo phanh. Kết quả không được lưu vào cơ sở dữ liệu.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <FilePick accept=".csv,text/csv" label="Chọn frames.csv" disabled={!canWrite} onPick={pickCsv} />
          <span className="min-h-[16px] text-[12px] text-vehicsim-muted">{csv?.name ?? "Bắt buộc"}</span>
        </div>
        <div className="flex flex-col gap-1">
          <FilePick accept=".json,application/json" label="Chọn collisions.json" disabled={!canWrite} onPick={pickCollisions} />
          <span className="min-h-[16px] text-[12px] text-vehicsim-muted">
            {collisions ? `${collisions.name} · ${collisions.items.length} va chạm` : "Bỏ trống = không va chạm"}
          </span>
        </div>
        <label className="flex flex-col gap-1 text-[12px] font-medium text-vehicsim-muted">
          Giảm tốc khả dụng (m/s²)
          <input
            value={decel}
            onChange={(e) => setDecel(e.target.value)}
            inputMode="decimal"
            title="Dùng để ước phần quãng phanh còn lại nếu lượt chạy kết thúc khi xe chưa dừng; mặc định 8 = MAX_DECELERATION mặc định"
            className={cx(
              "w-[150px] rounded-full border border-solid bg-white px-4 py-[10px] text-[13px] font-semibold text-vehicsim-ink",
              decelOk ? "border-vehicsim-line-strong" : "border-vehicsim-danger",
            )}
          />
          <span className="min-h-[16px]">{decelOk ? "" : "Trong khoảng (0, 15]"}</span>
        </label>
        <div className="flex flex-col gap-1">
          <PillButton variant="dark" disabled={!canWrite || busy || !csv || !decelOk} onClick={() => void evaluate()}>
            {busy ? "Đang tính…" : "Tính số đo"}
          </PillButton>
          <span className="min-h-[16px]" />
        </div>
      </div>

      {!canWrite && <p className="text-[12px] text-vehicsim-muted">{READ_ONLY_NOTE}.</p>}
      <ErrorNote message={error} />
      {summary && <SummaryView s={summary} />}
    </Card>
  );
}

function SummaryView({ s }: { s: TelemetrySummary }) {
  const n = (v: number | null, unit: string, digits = 2) => (v === null ? "—" : `${v.toFixed(digits)} ${unit}`);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex w-full flex-col gap-4 md:flex-row">
        <StatCard
          label="RMS jerk lúc phanh"
          value={s.rms_jerk_mps3 === null ? "—" : s.rms_jerk_mps3.toFixed(2)}
          note={s.rms_jerk_mps3 === null ? "Không phanh" : "m/s³ · càng thấp càng êm"}
          tone="info"
        />
        <StatCard
          label="Tốc độ ego lúc va chạm"
          value={s.impact_speed_mps === null ? "0" : s.impact_speed_mps.toFixed(2)}
          valueClass={s.collisions > 0 ? "text-vehicsim-danger" : undefined}
          note={s.impact_speed_mps === null ? "Không va chạm · tính là 0" : `m/s · ${fmt.kmh(s.impact_speed_mps * 3.6)}`}
          tone={s.collisions > 0 ? "danger" : "ok"}
        />
        <StatCard
          label="Quãng đường phanh"
          value={s.stopping_distance_m === null ? "—" : s.stopping_distance_m.toFixed(2)}
          note={s.stopping_distance_m === null ? "Không phanh" : "m · từ lúc phanh tới khi dừng"}
          tone="info"
        />
      </div>
      <div className="grid grid-cols-1 gap-x-8 md:grid-cols-2">
        <Row label="Số khung · thời lượng" value={`${s.total_frames} · ${fmt.s(s.duration_s)}`} />
        <Row label="Phanh lần đầu" value={s.first_brake_time_s === null ? "Không phanh" : `t ${fmt.s(s.first_brake_time_s, 2)}`} />
        <Row label="TTC radar nhỏ nhất" value={fmt.s(s.radar_min_ttc_s, 2)} />
        <Row label="Khoảng cách vật cản nhỏ nhất" value={fmt.m(s.obstacle_min_distance_m, 2)} />
        <Row label="Giảm tốc lớn nhất · trung bình" value={`${n(s.max_deceleration_ms2, "m/s²")} · ${n(s.mean_deceleration_ms2, "m/s²")}`} />
        <Row label="|Jerk| lớn nhất" value={n(s.max_abs_jerk_mps3, "m/s³")} />
        <Row
          label="Va chạm"
          value={s.collisions === 0 ? "Không" : `${s.collisions} lần · đầu tiên t ${fmt.s(s.first_collision_time_s, 2)}`}
          danger={s.collisions > 0}
        />
        <Row label="Tốc độ va chạm tương đối (ISO 22733)" value={n(s.relative_impact_speed_mps, "m/s")} />
        <Row label="Gia tốc đỉnh lúc đâm" value={n(s.impact_peak_accel_ms2, "m/s²")} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phần nhỏ
// ---------------------------------------------------------------------------

function FilePick({
  accept,
  label,
  disabled,
  onPick,
}: {
  accept: string;
  label: string;
  disabled?: boolean;
  onPick: (file: File) => void | Promise<void>;
}) {
  return (
    <label
      className={cx(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full border border-solid border-vehicsim-line-strong bg-white px-5 py-3 text-[13px] font-semibold text-vehicsim-ink transition",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-vehicsim-soft",
      )}
      title={disabled ? READ_ONLY_NOTE : undefined}
    >
      {label}
      <input
        type="file"
        accept={accept}
        disabled={disabled}
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ""; // chọn lại cùng file vẫn kích hoạt onChange
          if (file) void onPick(file);
        }}
      />
    </label>
  );
}

function Fact({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="flex flex-col gap-1 rounded-[14px] bg-vehicsim-soft px-[14px] py-3">
      <span className="text-[12px] font-medium text-vehicsim-faint">{label}</span>
      <span className={cx("truncate text-[15px] font-bold", danger ? "text-vehicsim-danger" : "text-vehicsim-ink")}>{value}</span>
    </div>
  );
}

function Row({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-solid border-vehicsim-line py-[7px] text-[13px]">
      <span className="font-medium text-vehicsim-muted">{label}</span>
      <span className={cx("text-right font-semibold", danger ? "text-vehicsim-danger" : "text-vehicsim-ink")}>{value}</span>
    </div>
  );
}

"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { VehicSimPage } from "@/components/VehicSimPage";
import { useVehicSimContext } from "@/components/VehicSimContext";
import { AXES, FamilyForm, TIMES, WEATHERS, type FamilyInitial } from "@/components/FamilyForm";
import { ErrorNote, PillButton, Tag, cx } from "@/components/VehicSimUi";
import { vehicsimApi } from "@/services/vehicsim";
import type { DescribeKey, DescribeResult, DescribedIr, FieldOrigin, TimeOfDay, Weather } from "@/types/vehicsim";

const EXAMPLES = [
  "Xe VF8 chạy 60 km/h ban đêm trời mưa, một người đi bộ lao ra từ lề phải khi xe còn cách 25 m",
  "Ban ngày trời quang, xe chạy 40 km/h, người đi bộ đi chậm sang đường khi xe cách khoảng 20 m",
  "Lúc chạng vạng, xe chạy 50 km/h, người đi bộ đứng ở mép đường rồi dừng lại, không sang đường",
];
const MAX_TEXT = 2000;

/** Khớp BOUNDS trong src/services/vehicsim/describe.py (và FamilySpec.validate). */
const NUMERIC: { key: Extract<DescribeKey, "ego_speed_kmh" | "trigger_distance_m" | "pedestrian_speed_mps">; min: number; max: number; step: number }[] = [
  { key: "ego_speed_kmh", min: 10, max: 130, step: 1 },
  { key: "trigger_distance_m", min: 5, max: 80, step: 1 },
  { key: "pedestrian_speed_mps", min: 0.5, max: 8, step: 0.1 },
];

const ORIGIN_TAG: Record<FieldOrigin, { label: string; tone: "ok" | "info" | "warn" | "dark" }> = {
  stated: { label: "Có trong câu", tone: "ok" },
  inferred: { label: "Suy luận", tone: "info" },
  assumed: { label: "Giả định", tone: "warn" },
  edited: { label: "Đã sửa", tone: "dark" },
};

export default function DescribeScenarioPage() {
  const router = useRouter();
  const { refresh, canWrite } = useVehicSimContext();
  const [text, setText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DescribeResult | null>(null);
  const [sourceText, setSourceText] = useState("");
  const [ir, setIr] = useState<DescribedIr | null>(null);
  const [origins, setOrigins] = useState<Partial<Record<DescribeKey, FieldOrigin>>>({});
  const [grid, setGrid] = useState<{ key: number; initial: FamilyInitial } | null>(null);
  const [irDirty, setIrDirty] = useState(false);

  const extract = async () => {
    setExtracting(true);
    setError(null);
    try {
      const res = await vehicsimApi.describe(text.trim());
      const nextOrigins = Object.fromEntries(res.fields.map((f) => [f.key, f.origin])) as Record<DescribeKey, FieldOrigin>;
      setResult(res);
      setSourceText(text.trim());
      setIr(res.ir);
      setOrigins(nextOrigins);
      setGrid({ key: Date.now(), initial: gridFromIr(res.ir, nextOrigins, res.title, text.trim()) });
      setIrDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không trích xuất được Scenario IR");
    } finally {
      setExtracting(false);
    }
  };

  const edit = <K extends keyof DescribedIr>(key: K, value: DescribedIr[K]) => {
    setIr((prev) => (prev ? { ...prev, [key]: value } : prev));
    setOrigins((prev) => ({ ...prev, [key]: "edited" }));
    setIrDirty(true);
  };

  const irErrors = ir
    ? NUMERIC.filter((n) => Number.isNaN(ir[n.key]) || ir[n.key] < n.min || ir[n.key] > n.max).map((n) => n.key)
    : [];

  return (
    <VehicSimPage
      step={[1, 2]}
      crumbs={[{ label: "Kịch bản", href: "/scenarios" }, { label: "Sinh từ mô tả" }]}
      title="Sinh kịch bản từ mô tả"
      subtitle="Mô tả tình huống bằng tiếng Việt. LLM trích xuất Scenario IR, hệ thống kiểm tra và cho LLM tự sửa tối đa 3 lần, rồi dựng lưới biến thể quanh IR."
      actions={<PillButton href="/scenarios?new=1">Nhập tay</PillButton>}
    >
      <ErrorNote message={error} />

      <section className="flex flex-col gap-4 rounded-[20px] border border-solid border-vehicsim-line bg-white p-6 shadow-vehicsim-card">
        <div className="flex items-center justify-between">
          <h2 className="text-[17px] font-bold text-vehicsim-ink">1 · Mô tả tình huống</h2>
          <span className="text-[12px] text-vehicsim-faint">
            {text.length} / {MAX_TEXT} ký tự
          </span>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_TEXT))}
          rows={4}
          placeholder="vd. Xe chạy 60 km/h ban đêm trời mưa, một người đi bộ lao ra từ lề phải khi xe còn cách 25 m"
          className="rounded-[14px] border border-solid border-vehicsim-line-strong px-4 py-3 text-[15px] leading-[1.55] text-vehicsim-ink placeholder:text-vehicsim-faint focus:border-vehicsim-ink focus:outline-none focus:ring-2 focus:ring-vehicsim-line"
        />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] font-medium text-vehicsim-faint">Ví dụ:</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setText(ex)}
              className="max-w-[420px] truncate rounded-full border border-solid border-vehicsim-line bg-vehicsim-soft px-3 py-[6px] text-left text-[12px] text-vehicsim-muted hover:bg-vehicsim-line"
              title={ex}
            >
              {ex}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-solid border-vehicsim-line pt-4">
          <p className="text-[12px] leading-[1.5] text-vehicsim-muted">
            MVP hỗ trợ motif người đi bộ băng ngang. Chưa lưu gì cho tới khi bạn bấm “Tạo họ kịch bản” ở bước 2.
          </p>
          <PillButton
            variant="dark"
            onClick={extract}
            disabled={!canWrite || extracting || text.trim().length < 10}
            title={canWrite ? undefined : "Tài khoản người xem chỉ có quyền xem"}
          >
            {extracting ? "Đang trích xuất…" : result ? "Trích xuất lại" : "Trích xuất Scenario IR"}
          </PillButton>
        </div>
      </section>

      {result && ir && (
        <div className="flex w-full items-start gap-4">
          <section className="flex min-w-0 flex-1 flex-col gap-4 rounded-[20px] border border-solid border-vehicsim-line bg-white p-6 shadow-vehicsim-card">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[17px] font-bold text-vehicsim-ink">Scenario IR · {result.title}</h2>
              <SourceBadge result={result} />
            </div>
            {result.issues.length > 0 && (
              <ErrorNote message={`LLM chưa tự sửa hết sau ${result.repairs} lần: ${result.issues.join("; ")}. Hãy sửa tay bên dưới.`} />
            )}
            <div className="flex flex-col">
              {NUMERIC.map((n) => {
                const f = result.fields.find((x) => x.key === n.key);
                return (
                  <IrRow key={n.key} label={f?.label ?? n.key} origin={origins[n.key]} error={irErrors.includes(n.key) ? `${n.min}–${n.max}` : null}>
                    <input
                      type="number"
                      min={n.min}
                      max={n.max}
                      step={n.step}
                      value={Number.isNaN(ir[n.key]) ? "" : ir[n.key]}
                      onChange={(e) => edit(n.key, e.target.value === "" ? Number.NaN : Number(e.target.value))}
                      className="h-9 w-[110px] rounded-[10px] border border-solid border-vehicsim-line-strong px-3 text-right text-[14px] font-semibold text-vehicsim-ink focus:border-vehicsim-ink focus:outline-none"
                    />
                    <span className="w-10 text-[12px] text-vehicsim-muted">{f?.unit}</span>
                  </IrRow>
                );
              })}
              <IrRow label="Người đi bộ dừng ở lề" origin={origins.stops_at_curb}>
                <Segmented
                  value={ir.stops_at_curb ? "yes" : "no"}
                  options={[
                    { value: "no", label: "Băng qua" },
                    { value: "yes", label: "Dừng ở lề" },
                  ]}
                  onChange={(v) => edit("stops_at_curb", v === "yes")}
                />
              </IrRow>
              <IrRow label="Thời tiết" origin={origins.weather}>
                <Select value={ir.weather} options={WEATHERS} onChange={(v) => edit("weather", v as Weather)} />
              </IrRow>
              <IrRow label="Thời điểm" origin={origins.time_of_day}>
                <Select value={ir.time_of_day} options={TIMES} onChange={(v) => edit("time_of_day", v as TimeOfDay)} />
              </IrRow>
            </div>
            {result.notes && (
              <p className="rounded-[14px] bg-vehicsim-soft px-4 py-3 text-[12px] leading-[1.5] text-vehicsim-muted">
                <b className="text-vehicsim-ink">Chưa biểu diễn được trong IR của MVP:</b> {result.notes}
              </p>
            )}
            {irDirty && (
              <div className="flex items-center justify-between gap-3 rounded-[14px] bg-vehicsim-decision-bg px-4 py-3 text-[12px] text-vehicsim-decision">
                <span>IR đã sửa. Dựng lại lưới biến thể để áp dụng (các chỉnh sửa trong form bên dưới sẽ bị thay).</span>
                <PillButton
                  className="px-4 py-2 text-[12px]"
                  disabled={irErrors.length > 0}
                  onClick={() => {
                    setGrid({ key: Date.now(), initial: gridFromIr(ir, origins, result.title, sourceText) });
                    setIrDirty(false);
                  }}
                >
                  Dựng lại lưới từ IR
                </PillButton>
              </div>
            )}
          </section>

          <aside className="flex w-[330px] shrink-0 flex-col gap-3 rounded-[20px] border border-solid border-vehicsim-line bg-white p-5 shadow-vehicsim-card">
            <span className="text-[11px] font-semibold uppercase tracking-[0.6px] text-vehicsim-faint">Scenario IR (JSON)</span>
            <pre className="overflow-x-auto rounded-[12px] bg-vehicsim-ink px-4 py-3 font-mono text-[12px] leading-[1.6] text-white">
              {JSON.stringify(ir, null, 2)}
            </pre>
            <div className="flex flex-col gap-2 text-[12px] text-vehicsim-muted">
              {(Object.keys(ORIGIN_TAG) as FieldOrigin[]).map((o) => (
                <span key={o} className="flex items-center gap-2">
                  <Tag tone={ORIGIN_TAG[o].tone}>{ORIGIN_TAG[o].label}</Tag>
                  {o === "stated"
                    ? "giá trị nêu rõ trong câu"
                    : o === "inferred"
                      ? "suy từ từ ngữ (vd. “lao ra” ≈ 3 m/s)"
                      : o === "assumed"
                        ? "câu không nhắc — dùng mặc định"
                        : "bạn đã sửa tay"}
                </span>
              ))}
            </div>
          </aside>
        </div>
      )}

      {result && grid && (
        <FamilyForm
          key={grid.key}
          title="2 · Không gian biến thể"
          initial={grid.initial}
          busy={creating}
          hint="Lưới dựng quanh giá trị IR (±1 bước); trường giả định dùng dải mặc định. Luôn gồm cả ca người đi bộ dừng ở lề để đo phanh oan (quy tắc MVP)."
          onSubmit={async (body) => {
            setCreating(true);
            setError(null);
            try {
              const res = await vehicsimApi.createFamily({
                ...body,
                origin: {
                  natural_language_input: sourceText,
                  llm_model: result.source === "llm" ? result.model : null,
                  described: {
                    ir,
                    origins,
                    source: result.source,
                    repairs: result.repairs,
                    notes: result.notes,
                    llm_error: result.llm_error,
                  },
                },
              });
              await refresh();
              router.push(`/scenarios?created=${res.code}&variants=${res.variants}&queued=${res.queued_runs ?? 0}`);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Không tạo được họ kịch bản");
              setCreating(false);
            }
          }}
        />
      )}
    </VehicSimPage>
  );
}

/** Lưới quanh giá trị IR: trường nêu rõ/suy luận lấy ±1 bước, trường giả định dùng dải mặc định. */
function gridFromIr(ir: DescribedIr, origins: Partial<Record<DescribeKey, FieldOrigin>>, title: string, text: string): FamilyInitial {
  const around = (v: number, step: number, lo: number, hi: number, digits: number) =>
    [...new Set([v - step, v, v + step].map((x) => Number(x.toFixed(digits))).filter((x) => x >= lo && x <= hi))].sort((a, b) => a - b);
  const pick = (key: DescribeKey, axis: number, step: number, digits: number, value: number) => {
    const a = AXES[axis];
    return origins[key] === "assumed" ? [...a.fallback] : around(value, step, a.min, a.max, digits);
  };
  return {
    name: title,
    description: text.slice(0, 2000),
    ego_speeds_kmh: pick("ego_speed_kmh", 0, 10, 0, ir.ego_speed_kmh),
    trigger_distances_m: pick("trigger_distance_m", 1, 10, 0, ir.trigger_distance_m),
    pedestrian_speeds_mps: pick("pedestrian_speed_mps", 2, 0.5, 1, ir.pedestrian_speed_mps),
    stops_at_curb: [false, true],
    weathers: [ir.weather],
    times_of_day: [ir.time_of_day],
  };
}

function SourceBadge({ result }: { result: DescribeResult }) {
  if (result.source === "rules") {
    return (
      <span title={result.llm_error ?? undefined}>
        <Tag tone="warn">Trích bằng luật — LLM không dùng được</Tag>
      </span>
    );
  }
  return (
    <Tag tone="neutral">
      LLM {result.model ?? ""} · {result.llm_calls} lượt gọi{result.repairs ? ` · sửa ${result.repairs} lần` : ""} · ${result.cost_usd.toFixed(4)}
    </Tag>
  );
}

function IrRow({ label, origin, error, children }: { label: string; origin?: FieldOrigin; error?: string | null; children: React.ReactNode }) {
  const tag = origin ? ORIGIN_TAG[origin] : null;
  return (
    <div className="flex min-h-[54px] items-center gap-3 border-b border-solid border-vehicsim-line py-2 last:border-b-0">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[14px] font-medium text-vehicsim-ink">{label}</span>
        {error && <span className="text-[11px] text-vehicsim-danger">Phải trong khoảng {error}</span>}
      </span>
      {children}
      <span className="w-[110px] text-right">{tag && <Tag tone={tag.tone}>{tag.label}</Tag>}</span>
    </div>
  );
}

function Select<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="h-9 w-[160px] rounded-[10px] border border-solid border-vehicsim-line-strong bg-white px-3 text-[14px] font-medium text-vehicsim-ink focus:border-vehicsim-ink focus:outline-none"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function Segmented({ value, options, onChange }: { value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-1 rounded-full bg-vehicsim-soft p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx("rounded-full px-3 py-[6px] text-[12px] font-semibold", o.value === value ? "bg-vehicsim-ink text-white" : "text-vehicsim-muted")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

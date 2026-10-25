"use client";

import React, { useState } from "react";
import { PillButton, Toggle, cx } from "@/components/VehicSimUi";
import type { FamilyRequest, TimeOfDay, Weather } from "@/types/vehicsim";

/** Khớp `FamilyService.MAX_VARIANTS` (backend Java). */
export const MAX_VARIANTS = 300;
/** Khớp `Simulator.MAX_DURATION_S` / `Simulator.LEAD_TIME_S` của lõi Java (dùng chung bộ động học và `.xosc`). */
const MAX_DURATION_S = 12;
const LEAD_TIME_S = 1.5;

/**
 * Cặp (tốc độ, khoảng cách kích hoạt) mà xe chạy đều không tới vạch băng ngang trước khi hết thời gian mô phỏng — run sẽ TIMEOUT mà xe
 * chưa gặp người đi bộ. Cùng công thức với `FamilySpec.unreachablePairs`; backend cũng từ chối.
 */
export function unreachablePairs(speedsKmh: number[], distancesM: number[]): { speed: number; distance: number; arrival: number }[] {
  const out: { speed: number; distance: number; arrival: number }[] = [];
  for (const speed of [...speedsKmh].sort((a, b) => a - b)) {
    for (const distance of [...distancesM].sort((a, b) => a - b)) {
      const arrival = distance / (speed / 3.6) + LEAD_TIME_S;
      if (arrival >= MAX_DURATION_S) out.push({ speed, distance, arrival });
    }
  }
  return out;
}
export const AXES = [
  { key: "ego_speeds_kmh", label: "Tốc độ xe ego", unit: "km/h", min: 10, max: 130, fallback: [40, 50, 60, 70] },
  { key: "trigger_distances_m", label: "Khoảng cách kích hoạt", unit: "m", min: 5, max: 80, fallback: [20, 30, 40] },
  // 6 m/s: tốc độ lớn nhất đã đo hành vi trên CARLA (FamilyService.MAX_PEDESTRIAN_SPEED_MPS).
  { key: "pedestrian_speeds_mps", label: "Tốc độ người đi bộ", unit: "m/s", min: 0.5, max: 6, fallback: [1.5, 3] },
] as const;
export type AxisKey = (typeof AXES)[number]["key"];
export const WEATHERS: { value: Weather; label: string }[] = [
  { value: "CLEAR", label: "Trời quang" },
  { value: "CLOUDY", label: "Nhiều mây" },
  { value: "RAIN", label: "Mưa" },
  { value: "HEAVY_RAIN", label: "Mưa to" },
  { value: "FOG", label: "Sương mù" },
];
export const TIMES: { value: TimeOfDay; label: string }[] = [
  { value: "DAY", label: "Ban ngày" },
  { value: "DUSK", label: "Chạng vạng" },
  { value: "NIGHT", label: "Ban đêm" },
];

export type FamilyBody = Omit<FamilyRequest, "origin">;
export type FamilyInitial = Partial<Omit<FamilyBody, "run_baseline">>;

function parseAxis(text: string): number[] {
  return [
    ...new Set(
      text
        .split(/[,;\s]+/)
        .filter(Boolean)
        .map(Number),
    ),
  ];
}

/**
 * Form không gian biến thể (bước 2 của vòng MVP). Giá trị ban đầu chỉ đọc lúc
 * mount — muốn nạp lại từ IR mới thì đổi `key` của component.
 */
export function FamilyForm({
  busy,
  onSubmit,
  initial,
  title = "Họ kịch bản mới · Người đi bộ băng ngang",
  hint,
  submitLabel = "Tạo họ kịch bản",
  lockName = false,
}: {
  busy: boolean;
  onSubmit: (body: FamilyBody) => void;
  initial?: FamilyInitial;
  title?: string;
  hint?: React.ReactNode;
  submitLabel?: string;
  /** Sửa họ (tạo bản mới): tên họ giữ nguyên, chỉ đổi không gian tham số và mô tả. */
  lockName?: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "Người đi bộ băng ngang");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [axes, setAxes] = useState<Record<AxisKey, string>>(
    () => Object.fromEntries(AXES.map((a) => [a.key, (initial?.[a.key] ?? a.fallback).join(", ")])) as Record<AxisKey, string>,
  );
  const [stops, setStops] = useState<boolean[]>(initial?.stops_at_curb ?? [false, true]);
  const [weathers, setWeathers] = useState<Weather[]>(initial?.weathers ?? ["CLEAR"]);
  const [times, setTimes] = useState<TimeOfDay[]>(initial?.times_of_day ?? ["DAY", "NIGHT"]);
  const [runBaseline, setRunBaseline] = useState(true);

  const parsed = Object.fromEntries(AXES.map((a) => [a.key, parseAxis(axes[a.key])])) as Record<AxisKey, number[]>;
  const axisError = (a: (typeof AXES)[number]) => {
    const values = parsed[a.key];
    if (!values.length) return "cần ít nhất một giá trị";
    if (values.some((v) => Number.isNaN(v))) return "chỉ nhập số, cách nhau bởi dấu phẩy";
    const bad = values.filter((v) => v < a.min || v > a.max);
    return bad.length ? `ngoài khoảng [${a.min}, ${a.max}]: ${bad.join(", ")}` : null;
  };
  const errors = AXES.map(axisError);
  const count = AXES.reduce((n, a) => n * parsed[a.key].length, 1) * stops.length * weathers.length * times.length;
  const late =
    errors[0] || errors[1] ? [] : unreachablePairs(parsed.ego_speeds_kmh, parsed.trigger_distances_m);
  const valid =
    name.trim() && errors.every((e) => !e) && !late.length && stops.length && weathers.length && times.length && count <= MAX_VARIANTS;

  const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);

  return (
    <section className="flex flex-col gap-5 rounded-[20px] border border-solid border-vehicsim-line bg-white p-6 shadow-vehicsim-card">
      <div className="flex items-center justify-between">
        <h2 className="text-[17px] font-bold text-vehicsim-ink">{title}</h2>
        <span className={cx("rounded-full px-3 py-[6px] text-[12px] font-semibold", count > MAX_VARIANTS ? "bg-vehicsim-danger-bg text-vehicsim-danger" : "bg-vehicsim-soft text-vehicsim-ink")}>
          {count} biến thể {count > MAX_VARIANTS ? `(tối đa ${MAX_VARIANTS})` : ""}
        </span>
      </div>
      {hint && <p className="-mt-2 text-[12px] leading-[1.5] text-vehicsim-muted">{hint}</p>}
      <div className="grid grid-cols-2 gap-4">
        <TextField label="Tên họ kịch bản" value={name} onChange={setName} disabled={lockName} />
        <TextField label="Mô tả (không bắt buộc)" value={description} onChange={setDescription} placeholder="vd. Trẻ em lao ra giữa hai xe đỗ" />
        {AXES.map((a, i) => (
          <TextField
            key={a.key}
            label={`${a.label} (${a.unit}) · ${a.min}–${a.max}`}
            value={axes[a.key]}
            onChange={(v) => setAxes((prev) => ({ ...prev, [a.key]: v }))}
            error={errors[i]}
          />
        ))}
        <ChipGroup
          label="Hành vi người đi bộ"
          options={[
            { value: false, label: "Băng qua làn" },
            { value: true, label: "Dừng ở lề" },
          ]}
          selected={stops}
          onToggle={(v) => setStops((prev) => toggle(prev, v))}
        />
        <ChipGroup label="Thời tiết" options={WEATHERS} selected={weathers} onToggle={(v) => setWeathers((prev) => toggle(prev, v))} />
        <ChipGroup label="Thời điểm" options={TIMES} selected={times} onToggle={(v) => setTimes((prev) => toggle(prev, v))} />
      </div>
      {late.length > 0 && (
        <div role="alert" className="rounded-[14px] border border-solid border-vehicsim-danger/30 bg-vehicsim-danger-bg px-4 py-3 text-[12px] leading-[1.5] text-vehicsim-danger">
          <b>{late.length} cặp tốc độ / khoảng cách không chạy được:</b> xe tới vạch băng ngang sau {MAX_DURATION_S} s mô phỏng nên run sẽ hết
          giờ trước khi gặp người đi bộ —{" "}
          {late
            .slice(0, 5)
            .map((p) => `${p.speed} km/h + ${p.distance} m (${p.arrival.toFixed(1)} s)`)
            .join("; ")}
          {late.length > 5 ? ` và ${late.length - 5} cặp khác` : ""}. Tăng tốc độ xe hoặc giảm khoảng cách kích hoạt.
        </div>
      )}
      <div className="flex items-center justify-between gap-4 border-t border-solid border-vehicsim-line pt-4">
        <label className="flex items-center gap-3 text-[13px] text-vehicsim-ink">
          <Toggle on={runBaseline} onChange={setRunBaseline} label="Chạy cơ sở" />
          Chạy ngay mọi biến thể với bản cơ sở AEB hiện hành
        </label>
        <PillButton
          variant="dark"
          disabled={!valid || busy}
          onClick={() =>
            onSubmit({
              name: name.trim(),
              description: description.trim(),
              ego_speeds_kmh: parsed.ego_speeds_kmh,
              trigger_distances_m: parsed.trigger_distances_m,
              pedestrian_speeds_mps: parsed.pedestrian_speeds_mps,
              stops_at_curb: stops,
              weathers,
              times_of_day: times,
              run_baseline: runBaseline,
            })
          }
        >
          {busy ? "Đang tạo…" : submitLabel}
        </PillButton>
      </div>
    </section>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  error,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string | null;
  disabled?: boolean;
}) {
  return (
    <label className="flex flex-col gap-[6px]">
      <span className="text-[13px] font-medium text-vehicsim-muted">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={cx(
          "h-[42px] rounded-[12px] border border-solid px-[14px] text-[14px] text-vehicsim-ink placeholder:text-vehicsim-faint focus:outline-none focus:ring-2 focus:ring-vehicsim-line-strong disabled:bg-vehicsim-soft disabled:text-vehicsim-muted",
          error ? "border-vehicsim-danger" : "border-vehicsim-line-strong",
        )}
      />
      {error && <span className="text-[12px] text-vehicsim-danger">{error}</span>}
    </label>
  );
}

function ChipGroup<T extends string | boolean>({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: { value: T; label: string }[];
  selected: T[];
  onToggle: (v: T) => void;
}) {
  return (
    <div className="flex flex-col gap-[6px]">
      <span className="text-[13px] font-medium text-vehicsim-muted">{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = selected.includes(o.value);
          return (
            <button
              key={String(o.value)}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(o.value)}
              className={cx(
                "rounded-full border border-solid px-3 py-[7px] text-[12px] font-semibold",
                on ? "border-vehicsim-ink bg-vehicsim-ink text-white" : "border-vehicsim-line-strong bg-white text-vehicsim-muted hover:bg-vehicsim-soft",
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

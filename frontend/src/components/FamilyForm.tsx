"use client";

import React, { useState } from "react";
import { PillButton, Toggle, cx } from "@/components/VehicSimUi";
import type { FamilyRequest, TimeOfDay, Weather } from "@/types/vehicsim";

/** Khớp `FamilySpec.validate` / `MAX_VARIANTS` trong src/services/vehicsim/family.py. */
export const MAX_VARIANTS = 300;
export const AXES = [
  { key: "ego_speeds_kmh", label: "Tốc độ xe ego", unit: "km/h", min: 10, max: 130, fallback: [40, 50, 60, 70] },
  { key: "trigger_distances_m", label: "Khoảng cách kích hoạt", unit: "m", min: 5, max: 80, fallback: [20, 30, 40] },
  { key: "pedestrian_speeds_mps", label: "Tốc độ người đi bộ", unit: "m/s", min: 0.5, max: 8, fallback: [1.5, 3] },
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
}: {
  busy: boolean;
  onSubmit: (body: FamilyBody) => void;
  initial?: FamilyInitial;
  title?: string;
  hint?: React.ReactNode;
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
  const valid = name.trim() && errors.every((e) => !e) && stops.length && weathers.length && times.length && count <= MAX_VARIANTS;

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
        <TextField label="Tên họ kịch bản" value={name} onChange={setName} />
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
          {busy ? "Đang tạo…" : "Tạo họ kịch bản"}
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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string | null;
}) {
  return (
    <label className="flex flex-col gap-[6px]">
      <span className="text-[13px] font-medium text-vehicsim-muted">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cx(
          "h-[42px] rounded-[12px] border border-solid px-[14px] text-[14px] text-vehicsim-ink placeholder:text-vehicsim-faint focus:outline-none focus:ring-2 focus:ring-vehicsim-line-strong",
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

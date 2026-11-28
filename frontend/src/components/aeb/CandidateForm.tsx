"use client";

import React, { useState } from "react";
import { CLASS_STYLE, ErrorNote, cx } from "@/components/VehicSimUi";
import { vehicsimApi } from "@/services/vehicsim";
import type { AebVersion, ParameterDef } from "@/types/vehicsim";
import { VehicSimSelect } from "@/components/VehicSimSelect";
import { KEY_PARAMS, STATUS_LABEL } from "./aebTypes";

function stepFor(p: ParameterDef): string {
  if (p.code === "BRAKE_ACTIVATION_DELAY") return "0.01";
  if (p.code === "TTC_THRESHOLD") return "0.05";
  if (p.code === "MAX_DECELERATION") return "0.1";
  if (p.code === "BRAKE_BUILDUP_RATE") return "0.5";
  return p.unit === "s" ? "0.05" : "0.1";
}

function parseVal(str: string): number {
  const s = String(str).replace(",", ".").trim();
  return s === "" ? NaN : Number(s);
}

export function CandidateForm({
  versions,
  parameters,
  onCreated,
}: {
  versions: AebVersion[];
  parameters: ParameterDef[];
  onCreated: (id: number, label: string) => void;
}) {
  const parents = versions.filter((v) => v.status !== "REJECTED");
  const [parentId, setParentId] = useState<number>(() => (versions.find((v) => v.status === "BASELINE") ?? versions[0]).id);
  const parent = versions.find((v) => v.id === parentId) ?? versions[0];
  const [values, setValues] = useState<Record<string, string>>({});
  const [label, setLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = (p: ParameterDef) => values[p.code] ?? String(parent.parameters[p.code] ?? p.default_value);
  const changed = parameters.filter((p) => {
    const n = parseVal(current(p));
    return !Number.isNaN(n) && n !== parent.parameters[p.code];
  });
  const invalid = parameters.filter((p) => {
    const n = parseVal(current(p));
    return current(p).trim() === "" || Number.isNaN(n) || n < p.min_value || n > p.max_value;
  });

  const orderedParameters = [...parameters].sort((a, b) => {
    const ia = KEY_PARAMS.indexOf(a.code as typeof KEY_PARAMS[number]);
    const ib = KEY_PARAMS.indexOf(b.code as typeof KEY_PARAMS[number]);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  const handleInputChange = (p: ParameterDef, raw: string) => {
    setValues((prev) => ({ ...prev, [p.code]: raw }));
  };

  const handleBlur = (p: ParameterDef) => {
    const raw = current(p).trim();
    if (raw === "") {
      setValues((prev) => ({ ...prev, [p.code]: String(parent.parameters[p.code] ?? p.default_value) }));
      return;
    }
    const n = parseVal(raw);
    if (Number.isNaN(n)) {
      setValues((prev) => ({ ...prev, [p.code]: String(parent.parameters[p.code] ?? p.default_value) }));
    } else if (n < p.min_value) {
      setValues((prev) => ({ ...prev, [p.code]: String(p.min_value) }));
    } else if (n > p.max_value) {
      setValues((prev) => ({ ...prev, [p.code]: String(p.max_value) }));
    } else {
      setValues((prev) => ({ ...prev, [p.code]: String(n) }));
    }
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await vehicsimApi.createCandidate({
        parent_version_id: parent.id,
        label: label.trim() || undefined,
        notes: notes.trim() || undefined,
        values: Object.fromEntries(changed.map((p) => [p.code, parseVal(current(p))])),
      });
      const fresh = await vehicsimApi.aebVersions();
      setValues({});
      setLabel("");
      setNotes("");
      onCreated(res.id, fresh.find((v) => v.id === res.id)?.label ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tạo được ứng viên");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-solid border-vehicsim-line bg-vehicsim-surface p-5 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-solid border-vehicsim-line pb-3">
        <h2 className="text-[16px] font-black text-vehicsim-ink">Cấu hình ứng viên mới</h2>
        <span className="rounded-md border border-solid border-vehicsim-line bg-vehicsim-soft px-2 py-0.5 text-[11.5px] font-bold text-vehicsim-ink">
          {changed.length} tham số đã đổi
        </span>
      </div>

      <ErrorNote message={error} />

      {/* 3 trường cấu hình cơ sở */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="select-parent-aeb" className="text-[13px] font-bold text-vehicsim-ink">
            Dựa trên
          </label>
          <VehicSimSelect
            id="select-parent-aeb"
            aria-label="Chọn phiên bản gốc"
            value={parentId}
            onChange={(newVal) => {
              setParentId(Number(newVal));
              setValues({});
            }}
            options={parents.map((v) => ({
              value: v.id,
              label: `AEB ${v.label}`,
              sublabel: STATUS_LABEL[v.status],
            }))}
            buttonClassName="h-9 rounded-md"
          />
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-bold text-vehicsim-ink">
            Nhãn <span className="font-normal text-[12px] text-vehicsim-muted">(không bắt buộc, mặc định v&#123;n&#125;)</span>
          </span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Ví dụ: Cấu hình thử nghiệm"
            className="h-9 rounded-md border border-solid border-vehicsim-line-strong bg-vehicsim-surface px-3 text-[13.5px] font-medium text-vehicsim-ink placeholder:text-vehicsim-faint focus:border-vehicsim-primary focus:outline-none focus:ring-2 focus:ring-vehicsim-primary/20"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-bold text-vehicsim-ink">
            Ghi chú <span className="font-normal text-[12px] text-vehicsim-muted">(không bắt buộc)</span>
          </span>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="vd. phanh sớm hơn khi người đi bộ lao ra"
            className="h-9 rounded-md border border-solid border-vehicsim-line-strong bg-vehicsim-surface px-3 text-[13.5px] font-medium text-vehicsim-ink placeholder:text-vehicsim-faint focus:border-vehicsim-primary focus:outline-none focus:ring-2 focus:ring-vehicsim-primary/20"
          />
        </label>
      </div>

      {/* Lưới 4 tham số AEB: 2x2 gọn gàng, không thừa khoảng trắng */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {orderedParameters.map((p) => {
          const isChanged = changed.includes(p);
          const isInvalid = invalid.includes(p);
          const numVal = parseVal(current(p));
          const cat = p.category;
          const catStyle = CLASS_STYLE[cat] ?? { label: cat, cls: "bg-slate-100 text-slate-800" };

          return (
            <div
              key={p.code}
              className={cx(
                "flex items-center justify-between gap-3 rounded-lg border border-solid p-3 transition",
                isChanged
                  ? "border-vehicsim-decision/50 bg-vehicsim-decision-bg/25"
                  : "border-vehicsim-line bg-vehicsim-surface hover:border-vehicsim-line-strong"
              )}
            >
              <div className="flex flex-col gap-1 min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-bold text-vehicsim-ink truncate">{p.name}</span>
                  <span className={cx("rounded px-1.5 py-0.5 text-[11px] font-semibold shrink-0", catStyle.cls)}>
                    {catStyle.label}
                  </span>
                </div>
                <span className="text-[12px] text-vehicsim-muted">
                  Phạm vi: <strong className="font-semibold text-vehicsim-ink">{p.min_value} – {p.max_value}</strong> {p.unit === "ratio" ? "" : p.unit}
                </span>
                {isInvalid && (
                  <span className="text-[11px] font-semibold text-vehicsim-danger">
                    {current(p).trim() === "" || Number.isNaN(numVal)
                      ? "Giá trị không hợp lệ"
                      : `Phải từ ${p.min_value} đến ${p.max_value} ${p.unit === "ratio" ? "" : p.unit}`}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <input
                  type="number"
                  min={p.min_value}
                  max={p.max_value}
                  step={stepFor(p)}
                  value={current(p)}
                  aria-label={p.name}
                  onChange={(e) => handleInputChange(p, e.target.value)}
                  onBlur={() => handleBlur(p)}
                  className={cx(
                    "h-9 w-24 rounded-md border border-solid px-2.5 text-right text-[14.5px] font-bold focus:outline-none focus:ring-2",
                    isInvalid
                      ? "border-vehicsim-danger bg-red-50 dark:bg-red-950/30 text-vehicsim-danger focus:ring-red-400"
                      : isChanged
                      ? "border-vehicsim-decision bg-vehicsim-surface text-vehicsim-decision focus:ring-vehicsim-decision"
                      : "border-vehicsim-line-strong bg-vehicsim-surface text-vehicsim-ink focus:border-vehicsim-primary focus:ring-vehicsim-primary/20",
                  )}
                />
                <span className="min-w-[42px] text-[15px] font-bold text-vehicsim-ink">
                  {p.unit === "ratio" ? "" : p.unit === "m/s2" ? "m/s²" : p.unit === "m/s3" ? "m/s³" : p.unit}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer bar: Tóm tắt & Nút Tạo ứng viên */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-solid border-vehicsim-line pt-3">
        {changed.length > 0 ? (
          <span className="text-[12.5px] font-medium text-vehicsim-muted">
            Đang chỉnh sửa <strong className="font-bold text-vehicsim-ink">{changed.length}</strong> tham số so với AEB {parent.label}.
          </span>
        ) : (
          <span className="text-[13px] font-semibold text-vehicsim-danger">
            Chưa có tham số nào thay đổi so với bản gốc.
          </span>
        )}
        <button
          type="button"
          className="inline-flex h-9 items-center justify-center rounded-lg bg-vehicsim-primary px-5 text-[13px] font-bold text-white transition hover:bg-vehicsim-primary-hover disabled:opacity-40 shadow-xs"
          onClick={submit}
          disabled={busy || changed.length === 0 || invalid.length > 0}
        >
          {busy ? "Đang tạo ứng viên…" : "Tạo ứng viên"}
        </button>
      </div>
    </section>
  );
}

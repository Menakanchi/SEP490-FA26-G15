"use client";

import React, { useState } from "react";
import { CLASS_STYLE, ErrorNote, PillButton, cx } from "@/components/VehicSimUi";
import { vehicsimApi } from "@/services/vehicsim";
import type { AebVersion, ParameterDef } from "@/types/vehicsim";
import { KEY_PARAMS, STATUS_LABEL } from "./aebTypes";

const PARAM_DESC: Record<string, string> = {
  TTC_THRESHOLD: "Thời gian chạm trán dự tính để phát lệnh phanh khẩn cấp",
  BRAKE_ACTIVATION_DELAY: "Thời gian trễ từ khi phát tín hiệu đến khi cơ cấu phanh tác động",
  BRAKE_BUILDUP_RATE: "Tốc độ gia tăng áp lực phanh đạt tới mức hãm tối đa",
  MAX_DECELERATION: "Gia tốc giảm tốc tối đa mà xe có thể tạo ra khi phanh gấp",
};

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
    <section className="flex flex-col gap-6 rounded-2xl border border-solid border-vehicsim-line bg-vehicsim-surface p-6 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-solid border-vehicsim-line pb-4">
        <div>
          <h2 className="text-[18px] font-black text-vehicsim-ink">Cấu hình ứng viên mới</h2>
        </div>
        <span className="rounded-full bg-vehicsim-soft px-3 py-1 text-[12.5px] font-bold text-vehicsim-ink">
          {changed.length} tham số đã đổi
        </span>
      </div>

      <ErrorNote message={error} />

      {/* 3 trường cấu hình cơ sở */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <label className="flex flex-col gap-2">
          <span className="text-[14px] font-bold text-vehicsim-ink">Dựa trên</span>
          <select
            aria-label="Chọn phiên bản gốc"
            value={parentId}
            onChange={(e) => {
              setParentId(Number(e.target.value));
              setValues({});
            }}
            className="h-11 rounded-xl border border-solid border-vehicsim-line-strong bg-vehicsim-surface px-3.5 text-[14.5px] font-semibold text-vehicsim-ink focus:border-vehicsim-primary focus:outline-none focus:ring-2 focus:ring-vehicsim-primary/20"
          >
            {parents.map((v) => (
              <option key={v.id} value={v.id}>
                AEB {v.label} · {STATUS_LABEL[v.status]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-[14px] font-bold text-vehicsim-ink">
            Nhãn <span className="font-normal text-[13px] text-vehicsim-muted">(không bắt buộc, mặc định v&#123;n&#125;)</span>
          </span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="vd. v1.1"
            className="h-11 rounded-xl border border-solid border-vehicsim-line-strong bg-vehicsim-surface px-3.5 text-[14.5px] font-medium text-vehicsim-ink placeholder:text-vehicsim-faint focus:border-vehicsim-primary focus:outline-none focus:ring-2 focus:ring-vehicsim-primary/20"
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-[14px] font-bold text-vehicsim-ink">
            Ghi chú <span className="font-normal text-[13px] text-vehicsim-muted">(không bắt buộc)</span>
          </span>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="vd. phanh sớm hơn khi người đi bộ lao ra"
            className="h-11 rounded-xl border border-solid border-vehicsim-line-strong bg-vehicsim-surface px-3.5 text-[14.5px] font-medium text-vehicsim-ink placeholder:text-vehicsim-faint focus:border-vehicsim-primary focus:outline-none focus:ring-2 focus:ring-vehicsim-primary/20"
          />
        </label>
      </div>

      {/* Lưới 4 tham số AEB: 2x2 cân đối, chữ lớn, rõ ràng */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {orderedParameters.map((p) => {
          const isChanged = changed.includes(p);
          const isInvalid = invalid.includes(p);
          const numVal = parseVal(current(p));
          const cat = p.category;
          const catStyle = CLASS_STYLE[cat] ?? { label: cat, cls: "bg-slate-100 text-slate-800" };
          const baseVal = parent.parameters[p.code];

          return (
            <div
              key={p.code}
              className={cx(
                "flex flex-col justify-between gap-4 rounded-2xl border border-solid p-5 transition shadow-2xs",
                isChanged
                  ? "border-vehicsim-decision/60 bg-vehicsim-decision-bg/30"
                  : "border-vehicsim-line bg-vehicsim-surface hover:border-vehicsim-line-strong"
              )}
            >
              {/* Header card: Nhóm phân loại + Trạng thái đổi */}
              <div className="flex items-center justify-between gap-2">
                <span className={cx("rounded-full px-2.5 py-0.5 text-[11.5px] font-bold", catStyle.cls)}>
                  {catStyle.label}
                </span>
                {isChanged ? (
                  <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11.5px] font-bold text-emerald-700 dark:text-emerald-400">
                    Đã đổi (gốc: {baseVal})
                  </span>
                ) : (
                  <span className="text-[12px] font-medium text-vehicsim-faint">
                    Gốc: {baseVal} {p.unit === "ratio" ? "" : p.unit}
                  </span>
                )}
              </div>

              {/* Thông tin tham số & Giải thích */}
              <div>
                <h3 className="text-[16px] font-black text-vehicsim-ink">
                  {p.name}
                </h3>
                {PARAM_DESC[p.code] && (
                  <p className="mt-1 text-[12.5px] font-medium leading-relaxed text-vehicsim-muted">
                    {PARAM_DESC[p.code]}
                  </p>
                )}
              </div>

              {/* Dải giá trị và Ô nhập liệu */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-solid border-vehicsim-line/70 pt-3">
                <div className="flex flex-col text-[13px] text-vehicsim-muted">
                  <span>Phạm vi:</span>
                  <span className="text-[14px] font-black text-vehicsim-ink">
                    {p.min_value} – {p.max_value} {p.unit === "ratio" ? "" : p.unit}
                  </span>
                </div>

                <div className="flex items-center gap-2">
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
                      "h-11 w-32 rounded-xl border border-solid px-3.5 text-right text-[17px] font-black tracking-tight focus:outline-none focus:ring-2",
                      isInvalid
                        ? "border-vehicsim-danger bg-red-50 dark:bg-red-950/30 text-vehicsim-danger focus:ring-red-400"
                        : isChanged
                        ? "border-vehicsim-decision bg-vehicsim-surface text-vehicsim-decision focus:ring-vehicsim-decision"
                        : "border-vehicsim-line-strong bg-vehicsim-surface text-vehicsim-ink focus:border-vehicsim-primary focus:ring-vehicsim-primary/20",
                    )}
                  />
                  <span className="w-10 text-[13.5px] font-bold text-vehicsim-muted">
                    {p.unit === "ratio" ? "" : p.unit}
                  </span>
                </div>
              </div>

              {/* Cảnh báo lỗi phạm vi */}
              {isInvalid && (
                <div className="rounded-lg bg-red-500/10 px-3 py-1.5 text-[12px] font-semibold text-vehicsim-danger">
                  {current(p).trim() === "" || Number.isNaN(numVal)
                    ? "Vui lòng nhập giá trị số hợp lệ"
                    : `Giá trị phải nằm trong khoảng ${p.min_value} đến ${p.max_value} ${p.unit === "ratio" ? "" : p.unit}`}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer bar: Tóm tắt & Nút Tạo ứng viên */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-solid border-vehicsim-line pt-5">
        <span className="text-[13px] font-medium text-vehicsim-muted">
          {changed.length > 0 ? (
            <>
              Đang chỉnh sửa <strong className="font-bold text-vehicsim-ink">{changed.length}</strong> tham số so với AEB {parent.label}.
            </>
          ) : (
            <>Chưa có tham số nào thay đổi so với bản gốc.</>
          )}
        </span>
        <PillButton
          variant="dark"
          className="px-6 py-2.5 text-[14px] font-bold"
          onClick={submit}
          disabled={busy || changed.length === 0 || invalid.length > 0}
        >
          {busy ? "Đang tạo ứng viên…" : "Tạo ứng viên"}
        </PillButton>
      </div>
    </section>
  );
}

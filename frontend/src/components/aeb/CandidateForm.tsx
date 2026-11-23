"use client";

import React, { useState } from "react";
import { useVehicSimContext } from "@/components/VehicSimContext";
import { CLASS_STYLE, ErrorNote, PillButton, cx } from "@/components/VehicSimUi";
import { vehicsimApi } from "@/services/vehicsim";
import type { AebVersion, ParameterDef } from "@/types/vehicsim";
import { CATEGORY_ORDER, STATUS_LABEL } from "./aebTypes";

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
  const { isExperiencer } = useVehicSimContext();
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
      // Giữ số sạch (nếu người dùng gõ dấu phẩy thì chuẩn hóa)
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
    <section className="flex flex-col gap-5 rounded-xl border border-solid border-vehicsim-line bg-vehicsim-surface p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-[17px] font-bold text-vehicsim-ink">Cấu hình ứng viên mới</h2>
        <span className="rounded-full bg-vehicsim-soft px-3 py-[6px] text-[12px] font-semibold text-vehicsim-ink">
          {changed.length} tham số đã đổi
        </span>
      </div>
      <ErrorNote message={error} />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <label className="flex flex-col gap-[6px]">
          <span className="text-[13px] font-medium text-vehicsim-muted">Dựa trên</span>
          <select
            aria-label="Chọn phiên bản gốc"
            value={parentId}
            onChange={(e) => {
              setParentId(Number(e.target.value));
              setValues({});
            }}
            className="h-[42px] rounded-[12px] border border-solid border-vehicsim-line-strong bg-vehicsim-surface px-[14px] text-[14px] text-vehicsim-ink"
          >
            {parents.map((v) => (
              <option key={v.id} value={v.id}>
                AEB {v.label} · {STATUS_LABEL[v.status]}
              </option>
            ))}
          </select>
        </label>
        <Input label="Nhãn (không bắt buộc, mặc định v{n})" value={label} onChange={setLabel} placeholder="vd. v1.1" />
        <Input label="Ghi chú (không bắt buộc)" value={notes} onChange={setNotes} placeholder="vd. phanh sớm hơn khi người đi bộ lao ra" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {CATEGORY_ORDER.map((cat) => {
          const params = parameters.filter((p) => p.category === cat);
          if (!params.length) return null;
          return (
            <div key={cat} className="flex flex-col gap-3 rounded-[16px] border border-solid border-vehicsim-line p-4">
              <span className={cx("w-fit rounded-full px-[10px] py-[4px] text-[11px] font-semibold", CLASS_STYLE[cat].cls)}>
                {CLASS_STYLE[cat].label}
              </span>
              {params.map((p) => {
                const isChanged = changed.includes(p);
                const isInvalid = invalid.includes(p);
                const numVal = parseVal(current(p));
                return (
                  <div key={p.code} className="flex flex-col gap-1 rounded-xl bg-vehicsim-soft/50 p-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="text-[13.5px] font-bold text-vehicsim-ink">{p.name}</span>
                        <span className="text-[11.5px] text-vehicsim-muted">
                          Phạm vi: <strong className="text-vehicsim-ink">{p.min_value} – {p.max_value}</strong> {p.unit === "ratio" ? "" : p.unit}
                        </span>
                      </span>
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
                            "h-9 w-[110px] rounded-[10px] border border-solid px-3 text-right text-[13.5px] font-bold focus:outline-none focus:ring-2",
                            isInvalid
                              ? "border-vehicsim-danger bg-red-50 text-vehicsim-danger focus:ring-red-400"
                              : isChanged
                              ? "border-vehicsim-decision bg-vehicsim-decision-bg text-vehicsim-decision focus:ring-vehicsim-decision"
                              : "border-vehicsim-line-strong bg-vehicsim-surface text-vehicsim-ink focus:ring-vehicsim-line-strong",
                          )}
                        />
                      </div>
                    </div>
                    {isInvalid && (
                      <span className="text-[11px] font-semibold text-vehicsim-danger">
                        {current(p).trim() === "" || Number.isNaN(numVal)
                          ? "Vui lòng nhập giá trị số hợp lệ"
                          : `Giá trị phải nằm trong khoảng ${p.min_value} đến ${p.max_value} ${p.unit === "ratio" ? "" : p.unit}`}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-4 border-t border-solid border-vehicsim-line pt-4">
        <p className="text-[12px] text-vehicsim-muted">
          {isExperiencer
            ? "Ứng viên mới chưa ảnh hưởng bản cơ sở cho tới khi qua kiểm thử hồi quy và bạn chọn dùng nó làm baseline."
            : "Ứng viên mới chưa ảnh hưởng bản cơ sở cho tới khi qua kiểm thử hồi quy và được kỹ sư chấp nhận."}
        </p>
        <PillButton variant="dark" onClick={submit} disabled={busy || changed.length === 0 || invalid.length > 0}>
          {busy ? "Đang tạo…" : "Tạo ứng viên"}
        </PillButton>
      </div>
    </section>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-[6px]">
      <span className="text-[13px] font-medium text-vehicsim-muted">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-[42px] rounded-[12px] border border-solid border-vehicsim-line-strong px-[14px] text-[14px] text-vehicsim-ink placeholder:text-vehicsim-faint focus:outline-none focus:ring-2 focus:ring-vehicsim-line-strong"
      />
    </label>
  );
}

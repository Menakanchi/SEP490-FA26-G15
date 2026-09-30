"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { VehicSimPage } from "@/components/VehicSimPage";
import { useVehicSimContext } from "@/components/VehicSimContext";
import { CLASS_STYLE, ErrorNote, PillButton, Tag, cx, fmt, paramValue } from "@/components/VehicSimUi";
import { vehicsimApi } from "@/services/vehicsim";
import type { AebVersion, FailureClass, ParameterDef, VersionBrief } from "@/types/vehicsim";

const STATUS_TONE: Record<VersionBrief["status"], "dark" | "info" | "ok" | "danger" | "neutral"> = {
  BASELINE: "dark",
  CANDIDATE: "info",
  ACCEPTED: "ok",
  REJECTED: "danger",
  ARCHIVED: "neutral",
};
const STATUS_LABEL: Record<VersionBrief["status"], string> = {
  BASELINE: "cơ sở",
  CANDIDATE: "ứng viên",
  ACCEPTED: "đã chấp nhận",
  REJECTED: "đã từ chối",
  ARCHIVED: "lưu trữ",
};
const SOURCE_LABEL: Record<string, string> = { MANUAL: "thủ công", OPTIMIZATION: "tối ưu hoá" };
const KEY_PARAMS = ["TTC_THRESHOLD", "BRAKE_ACTIVATION_DELAY", "DETECTION_CONFIDENCE_THRESHOLD", "MAX_DECELERATION"];
const CATEGORY_ORDER: FailureClass[] = ["PERCEPTION", "DECISION", "CONTROL", "VEHICLE_DYNAMICS"];

export default function AebConfigPage() {
  const { ctx, refresh, canWrite } = useVehicSimContext();
  const [versions, setVersions] = useState<AebVersion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: number; label: string } | null>(null);

  const load = useCallback(() => {
    vehicsimApi.aebVersions()
      .then(setVersions)
      .catch((err) => setError(err instanceof Error ? err.message : "Không tải được danh sách phiên bản AEB"));
  }, []);
  useEffect(load, [load]);

  const catalog = useMemo(() => new Map((ctx?.parameters ?? []).map((p) => [p.code, p])), [ctx]);
  const baseline = versions?.find((v) => v.status === "BASELINE") ?? null;

  return (
    <VehicSimPage
      step={5}
      crumbs={[{ label: "Phanh khẩn cấp" }, { label: "Cấu hình" }]}
      title="Cấu hình AEB"
      subtitle="Các phiên bản bộ tham số AEB. Bản cơ sở là cấu hình mọi kịch bản đang chạy; ứng viên chỉ thay được bản cơ sở sau khi qua kiểm thử hồi quy và được kỹ sư quyết định."
    >
      <ErrorNote message={error} />
      {created && (
        <div className="flex items-center justify-between gap-4 rounded-[16px] bg-vehicsim-ok-bg px-4 py-3 text-[13px] text-vehicsim-ok">
          <span>Đã tạo ứng viên AEB {created.label}. Bước tiếp theo: chạy kiểm thử hồi quy so với bản cơ sở.</span>
          <PillButton variant="dark" className="px-4 py-2 text-[12px]" href={`/validation/regression/new?candidate=${created.id}`}>
            Chạy kiểm thử hồi quy →
          </PillButton>
        </div>
      )}

      <section className="overflow-hidden rounded-[20px] border border-solid border-vehicsim-line bg-white shadow-vehicsim-card">
        <div className="flex items-center px-5 py-4">
          <span className="text-[15px] font-bold text-vehicsim-ink">{versions ? `${versions.length} phiên bản` : "…"}</span>
        </div>
        <div className="flex h-10 items-center border-y border-solid border-vehicsim-line bg-vehicsim-soft px-5 text-[11px] font-semibold uppercase text-vehicsim-faint">
          <span className="w-[120px]">Phiên bản</span>
          <span className="w-[120px]">Trạng thái</span>
          {KEY_PARAMS.map((code) => (
            <span key={code} className="w-[120px] truncate pr-2">
              {catalog.get(code)?.name ?? code}
            </span>
          ))}
          <span className="min-w-0 flex-1">Ghi chú</span>
          <span className="w-[96px]">Ngày tạo</span>
          <span className="w-[110px]" />
        </div>
        {versions?.map((v) => (
          <div key={v.id} className={cx("flex min-h-[56px] items-center border-b border-solid border-vehicsim-line px-5 py-2", v.status === "BASELINE" && "bg-vehicsim-row")}>
            <span className="flex w-[120px] flex-col">
              <span className="text-[13px] font-bold text-vehicsim-ink">AEB {v.label}</span>
              <span className="text-[11px] text-vehicsim-faint">{changedNote(v, baseline)}</span>
            </span>
            <span className="w-[120px]">
              <Tag tone={STATUS_TONE[v.status]}>{STATUS_LABEL[v.status]}</Tag>
            </span>
            {KEY_PARAMS.map((code) => {
              const differs = baseline && v.id !== baseline.id && v.parameters[code] !== baseline.parameters[code];
              return (
                <span key={code} className={cx("w-[120px] text-[13px]", differs ? "font-bold text-vehicsim-decision" : "text-vehicsim-ink")}>
                  {paramValue(v.parameters[code], catalog.get(code)?.unit ?? "")}
                </span>
              );
            })}
            <span className="min-w-0 flex-1 truncate pr-3 text-[12px] text-vehicsim-muted">{v.notes ?? "—"}</span>
            <span className="w-[96px] text-[12px] text-vehicsim-faint">{fmt.date(v.created_at)}</span>
            <span className="flex w-[110px] justify-end">
              {v.status === "CANDIDATE" && canWrite && (
                <Link href={`/validation/regression/new?candidate=${v.id}`} className="text-[12px] font-semibold text-vehicsim-decision hover:underline">
                  Kiểm thử hồi quy →
                </Link>
              )}
            </span>
          </div>
        ))}
      </section>

      {versions && ctx && canWrite && (
        <CandidateForm
          versions={versions}
          parameters={ctx.parameters}
          onCreated={async (id, label) => {
            setCreated({ id, label });
            load();
            await refresh();
          }}
        />
      )}
    </VehicSimPage>
  );
}

/** Dòng phụ dưới tên version: số tham số khác baseline (bảng chỉ hiện 4 tham số chính). */
function changedNote(v: AebVersion, baseline: AebVersion | null): string {
  if (!baseline || v.id === baseline.id) return SOURCE_LABEL[v.source] ?? v.source;
  const n = Object.keys({ ...v.parameters, ...baseline.parameters }).filter((k) => v.parameters[k] !== baseline.parameters[k]).length;
  return `${n} tham số khác bản cơ sở`;
}

function CandidateForm({
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
  const changed = parameters.filter((p) => Number(current(p)) !== parent.parameters[p.code]);
  const invalid = parameters.filter((p) => {
    const n = Number(current(p));
    return current(p).trim() === "" || Number.isNaN(n) || n < p.min_value || n > p.max_value;
  });

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await vehicsimApi.createCandidate({
        parent_version_id: parent.id,
        label: label.trim() || undefined,
        notes: notes.trim() || undefined,
        values: Object.fromEntries(changed.map((p) => [p.code, Number(current(p))])),
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
    <section className="flex flex-col gap-5 rounded-[20px] border border-solid border-vehicsim-line bg-white p-6 shadow-vehicsim-card">
      <div className="flex items-center justify-between">
        <h2 className="text-[17px] font-bold text-vehicsim-ink">Cấu hình ứng viên mới</h2>
        <span className="rounded-full bg-vehicsim-soft px-3 py-[6px] text-[12px] font-semibold text-vehicsim-ink">{changed.length} tham số đã đổi</span>
      </div>
      <ErrorNote message={error} />
      <div className="grid grid-cols-3 gap-4">
        <label className="flex flex-col gap-[6px]">
          <span className="text-[13px] font-medium text-vehicsim-muted">Dựa trên</span>
          <select
            value={parentId}
            onChange={(e) => {
              setParentId(Number(e.target.value));
              setValues({});
            }}
            className="h-[42px] rounded-[12px] border border-solid border-vehicsim-line-strong bg-white px-[14px] text-[14px] text-vehicsim-ink"
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

      <div className="grid grid-cols-2 gap-4">
        {CATEGORY_ORDER.map((cat) => {
          const params = parameters.filter((p) => p.category === cat);
          if (!params.length) return null;
          return (
            <div key={cat} className="flex flex-col gap-2 rounded-[16px] border border-solid border-vehicsim-line p-4">
              <span className={cx("w-fit rounded-full px-[10px] py-[4px] text-[11px] font-semibold", CLASS_STYLE[cat].cls)}>{CLASS_STYLE[cat].label}</span>
              {params.map((p) => {
                const isChanged = changed.includes(p);
                const isInvalid = invalid.includes(p);
                return (
                  <div key={p.code} className="flex items-center gap-3">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-[13px] font-medium text-vehicsim-ink">{p.name}</span>
                      <span className="text-[11px] text-vehicsim-faint">
                        {p.min_value}–{p.max_value} {p.unit === "ratio" ? "" : p.unit} · hiện tại {paramValue(parent.parameters[p.code], p.unit)}
                      </span>
                    </span>
                    <input
                      type="number"
                      step="any"
                      value={current(p)}
                      aria-label={p.name}
                      onChange={(e) => setValues((prev) => ({ ...prev, [p.code]: e.target.value }))}
                      className={cx(
                        "h-9 w-[110px] rounded-[10px] border border-solid px-3 text-right text-[13px] font-semibold focus:outline-none focus:ring-2 focus:ring-vehicsim-line-strong",
                        isInvalid ? "border-vehicsim-danger text-vehicsim-danger" : isChanged ? "border-vehicsim-decision bg-vehicsim-decision-bg text-vehicsim-decision" : "border-vehicsim-line-strong text-vehicsim-ink",
                      )}
                    />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-4 border-t border-solid border-vehicsim-line pt-4">
        <p className="text-[12px] text-vehicsim-muted">
          Ứng viên mới chưa ảnh hưởng bản cơ sở cho tới khi qua kiểm thử hồi quy và được kỹ sư chấp nhận.
        </p>
        <PillButton variant="dark" onClick={submit} disabled={busy || changed.length === 0 || invalid.length > 0}>
          {busy ? "Đang tạo…" : "Tạo ứng viên"}
        </PillButton>
      </div>
    </section>
  );
}

function Input({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
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

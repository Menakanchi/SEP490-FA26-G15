"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, GitCompare, Sparkles } from "lucide-react";
import { VehicSimPage } from "@/components/VehicSimPage";
import { useVehicSimContext } from "@/components/VehicSimContext";
import { Card, ErrorNote, PillButton, Tag, cx, fmt, paramValue } from "@/components/VehicSimUi";
import { vehicsimApi } from "@/services/vehicsim";
import type { AebVersion } from "@/types/vehicsim";
import { VehicSimSelect } from "@/components/VehicSimSelect";
import { KEY_PARAMS, STATUS_LABEL, STATUS_TONE } from "@/components/aeb/aebTypes";

export default function AebComparePage() {
  const { ctx, canWrite } = useVehicSimContext();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [versions, setVersions] = useState<AebVersion[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [idA, setIdA] = useState<number | null>(null);
  const [idB, setIdB] = useState<number | null>(null);

  useEffect(() => {
    vehicsimApi
      .aebVersions()
      .then((data) => {
        setVersions(data);
        const queryA = Number(searchParams.get("a"));
        const queryB = Number(searchParams.get("b"));

        const defaultBaseline = data.find((v) => v.status === "BASELINE") ?? data[0];
        const defaultCandidate = data.find((v) => v.status === "CANDIDATE") ?? data[data.length - 1];

        setIdA(Number.isInteger(queryA) && data.some((v) => v.id === queryA) ? queryA : defaultBaseline?.id ?? null);
        setIdB(Number.isInteger(queryB) && data.some((v) => v.id === queryB) ? queryB : defaultCandidate?.id ?? null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Không tải được danh sách phiên bản AEB"));
  }, [searchParams]);

  const versionA = (versions ?? []).find((v) => v.id === idA) ?? null;
  const versionB = (versions ?? []).find((v) => v.id === idB) ?? null;
  const catalog = new Map((ctx?.parameters ?? []).map((p) => [p.code, p]));

  const pickA = (id: number) => {
    setIdA(id);
    const params = new URLSearchParams(searchParams.toString());
    params.set("a", String(id));
    if (idB) params.set("b", String(idB));
    router.replace(`/aeb/compare?${params.toString()}`);
  };

  const pickB = (id: number) => {
    setIdB(id);
    const params = new URLSearchParams(searchParams.toString());
    if (idA) params.set("a", String(idA));
    params.set("b", String(id));
    router.replace(`/aeb/compare?${params.toString()}`);
  };

  const swap = () => {
    if (!idA || !idB) return;
    const tempA = idA;
    const tempB = idB;
    setIdA(tempB);
    setIdB(tempA);
    const params = new URLSearchParams(searchParams.toString());
    params.set("a", String(tempB));
    params.set("b", String(tempA));
    router.replace(`/aeb/compare?${params.toString()}`);
  };

  return (
    <VehicSimPage
      step={4}
      crumbs={[{ label: "Cải tiến AEB", href: "/aeb" }, { label: "So sánh 2 phiên bản" }]}
      actions={
        <div className="flex items-center gap-2">
          {versionB?.status === "CANDIDATE" && canWrite && (
            <PillButton variant="dark" href={`/validation/regression/new?candidate=${versionB.id}`}>
              Kiểm thử hồi quy ứng viên này
            </PillButton>
          )}
        </div>
      }
    >
      <ErrorNote message={error} />

      {/* Selector chọn 2 phiên bản */}
      <div className="rounded-xl border border-solid border-vehicsim-line bg-vehicsim-surface px-5 py-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-solid border-vehicsim-line">
          <h2 className="text-[15px] font-bold text-vehicsim-ink">So sánh 2 phiên bản AEB</h2>
          <button
            type="button"
            onClick={swap}
            className="flex items-center gap-1.5 rounded-lg border border-solid border-vehicsim-line px-3 py-1.5 text-[12px] font-bold text-vehicsim-ink hover:bg-vehicsim-soft transition"
          >
            <GitCompare className="size-3.5" />
            Hoán vị A ⇄ B
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-3">
          {/* Phiên bản A */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-[13px]">
              <span className="font-bold text-vehicsim-ink">Phiên bản Mốc chuẩn (A)</span>
              {versionA && (
                <span className="text-[12px] text-vehicsim-muted">
                  {STATUS_LABEL[versionA.status]} · {fmt.date(versionA.created_at)}
                </span>
              )}
            </div>
            <VehicSimSelect
              aria-label="Chọn Phiên bản Mốc chuẩn (A)"
              value={idA}
              onChange={(newVal) => pickA(Number(newVal))}
              options={(versions ?? []).map((v) => ({
                value: v.id,
                label: `AEB ${v.label}`,
                sublabel: `${STATUS_LABEL[v.status]} (${v.source === "OPTIMIZATION" ? "MOBO" : "Thủ công"})`,
              }))}
            />
          </div>

          {/* Phiên bản B */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-[13px]">
              <span className="font-bold text-vehicsim-ink">Phiên bản So sánh (B)</span>
              {versionB && (
                <span className="text-[12px] text-vehicsim-muted">
                  {STATUS_LABEL[versionB.status]} · {fmt.date(versionB.created_at)}
                </span>
              )}
            </div>
            <VehicSimSelect
              aria-label="Chọn Phiên bản So sánh (B)"
              value={idB}
              onChange={(newVal) => pickB(Number(newVal))}
              options={(versions ?? []).map((v) => ({
                value: v.id,
                label: `AEB ${v.label}`,
                sublabel: `${STATUS_LABEL[v.status]} (${v.source === "OPTIMIZATION" ? "MOBO" : "Thủ công"})`,
              }))}
            />
          </div>
        </div>
      </div>

      {/* Bảng so sánh 4 tham số chi tiết */}
      {versionA && versionB && (
        <section className="overflow-hidden rounded-xl border border-solid border-vehicsim-line bg-vehicsim-surface shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-solid border-vehicsim-line">
            <h3 className="text-[16px] font-bold text-vehicsim-ink">Bảng so sánh 4 tham số điều khiển phanh</h3>
            <span className="text-[12px] text-vehicsim-muted">
              So sánh AEB {versionA.label} → AEB {versionB.label}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-[13px]">
              <thead className="border-b border-solid border-slate-700 bg-slate-800 text-[12.5px] font-black uppercase tracking-wider text-white">
                <tr className="h-12">
                  <th className="px-5 py-3.5">Tham số</th>
                  <th className="px-5 py-3.5">Tầng điều khiển</th>
                  <th className="px-5 py-3.5 text-center">Bản A ({versionA.label})</th>
                  <th className="px-5 py-3.5 text-center">Bản B ({versionB.label})</th>
                  <th className="px-5 py-3.5 text-center">Chênh lệch tuyệt đối (Δ)</th>
                  <th className="px-5 py-3.5 text-center">Mức thay đổi (%)</th>
                  <th className="px-5 py-3.5">Đánh giá kỹ thuật</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-solid divide-vehicsim-line bg-vehicsim-surface">
                {KEY_PARAMS.map((code) => {
                  const def = catalog.get(code);
                  const valA = versionA.parameters[code];
                  const valB = versionB.parameters[code];
                  const diff = valB !== undefined && valA !== undefined ? valB - valA : 0;
                  const pct = valA && valA !== 0 ? (diff / valA) * 100 : 0;
                  const isDiff = Math.abs(diff) > 0.0001;

                  let note = "Giữ nguyên";
                  if (code === "TTC_THRESHOLD") {
                    note = diff > 0 ? "Phanh sớm hơn (ưu tiên tránh đâm)" : diff < 0 ? "Phanh muộn hơn (giảm phanh oan)" : "Giữ nguyên";
                  } else if (code === "BRAKE_ACTIVATION_DELAY") {
                    note = diff < 0 ? "Phản ứng nhanh hơn (giảm trễ)" : diff > 0 ? "Tăng độ trễ cảm biến/chấp hành" : "Giữ nguyên";
                  } else if (code === "MAX_DECELERATION") {
                    note = diff > 0 ? "Phanh gắt hơn (tăng lực kẹp)" : diff < 0 ? "Phanh nhẹ hơn (êm ái hơn)" : "Giữ nguyên";
                  } else if (code === "BRAKE_BUILDUP_RATE") {
                    note = diff > 0 ? "Tăng áp nhanh hơn (tăng jerk)" : diff < 0 ? "Tăng áp từ từ (giảm jerk)" : "Giữ nguyên";
                  }

                  const layerLabel =
                    code === "TTC_THRESHOLD"
                      ? "Decision (Quyết định)"
                      : code === "MAX_DECELERATION"
                      ? "Dynamics (Động lực học)"
                      : "Control (Điều khiển)";

                  return (
                    <tr key={code} className={cx(isDiff && "bg-vehicsim-row/40")}>
                      <td className="px-5 py-4 font-bold text-vehicsim-ink">
                        <div>{def?.name ?? code}</div>
                        <div className="font-mono text-[11px] font-normal text-vehicsim-faint">{code}</div>
                      </td>
                      <td className="px-5 py-4 text-[12px] text-vehicsim-muted">{layerLabel}</td>
                      <td className="px-5 py-4 text-center font-semibold text-vehicsim-ink">
                        {paramValue(valA, def?.unit ?? "")}
                      </td>
                      <td className="px-5 py-4 text-center font-bold text-vehicsim-ink">
                        {paramValue(valB, def?.unit ?? "")}
                      </td>
                      <td className="px-5 py-4 text-center">
                        <span
                          className={cx(
                            "rounded-full px-2.5 py-1 text-[11px] font-bold",
                            !isDiff
                              ? "text-vehicsim-faint bg-vehicsim-soft"
                              : diff > 0
                              ? "bg-vehicsim-ok-bg text-vehicsim-ok"
                              : "bg-vehicsim-danger-bg text-vehicsim-danger",
                          )}
                        >
                          {diff > 0 ? `+${diff.toFixed(2)}` : diff.toFixed(2)} {def?.unit === "ratio" ? "" : def?.unit}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <span
                          className={cx(
                            "text-[12px] font-bold",
                            !isDiff ? "text-vehicsim-faint" : diff > 0 ? "text-vehicsim-ok" : "text-vehicsim-danger",
                          )}
                        >
                          {pct > 0 ? `+${pct.toFixed(1)}%` : `${pct.toFixed(1)}%`}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-[12px] font-medium text-vehicsim-ink">{note}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Footer điều hướng */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-solid border-vehicsim-line pt-4">
        <PillButton href="/aeb/versions" variant="light">
          ← Danh mục phiên bản
        </PillButton>
        <div className="flex items-center gap-3">
          <PillButton href="/aeb/mobo" variant="light">
            <Sparkles className="size-4 shrink-0" />
            Tối ưu tiếp bằng MOBO
          </PillButton>
          {versionB?.status === "CANDIDATE" && canWrite && (
            <PillButton href={`/validation/regression/new?candidate=${versionB.id}`} variant="dark">
              Kiểm thử hồi quy ứng viên này <ArrowRight className="size-4" />
            </PillButton>
          )}
        </div>
      </div>
    </VehicSimPage>
  );
}

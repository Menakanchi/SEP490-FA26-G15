"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Pagination, Tag, cx, fmt, paramValue } from "@/components/VehicSimUi";
import type { AebVersion, ParameterDef } from "@/types/vehicsim";
import { KEY_PARAMS, STATUS_LABEL, STATUS_TONE, changedNote } from "./aebTypes";

export function VersionTable({
  versions,
  catalog,
  baseline,
  canWrite,
}: {
  versions: AebVersion[] | null;
  catalog: Map<string, ParameterDef>;
  baseline: AebVersion | null;
  canWrite: boolean;
}) {
  const [versionPage, setVersionPage] = useState(1);

  const vTotal = versions?.length ?? 0;
  const vPageSize = 8;
  const vPages = Math.max(1, Math.ceil(vTotal / vPageSize));
  const vCurrent = Math.min(versionPage, vPages);
  const vOffset = (vCurrent - 1) * vPageSize;
  const shownVersions = versions?.slice(vOffset, vOffset + vPageSize) ?? [];

  return (
    <section className="overflow-hidden rounded-xl border border-solid border-vehicsim-line bg-vehicsim-surface">
      <div className="flex items-center justify-between px-5 py-4">
        <span className="text-[15px] font-bold text-vehicsim-ink">
          {versions ? `${versions.length} phiên bản AEB đã lưu` : "Đang tải phiên bản…"}
        </span>
        <Link
          href="/aeb/compare"
          className="text-[12px] font-bold text-vehicsim-decision hover:underline"
        >
          So sánh chi tiết 2 phiên bản →
        </Link>
      </div>

      <div className="overflow-x-auto">
        <div className="flex h-11 min-w-[1080px] items-center border-y border-solid border-slate-700 bg-slate-800 px-5 text-[12.5px] font-black uppercase tracking-wider text-white">
          <span className="w-[45px] shrink-0 pr-2 text-center font-bold">STT</span>
          <span className="w-[135px] shrink-0 pr-3">Phiên bản</span>
          <span className="w-[125px] shrink-0 pr-3">Trạng thái</span>
          {KEY_PARAMS.map((code) => (
            <span key={code} className="w-[120px] shrink-0 truncate pr-2">
              {catalog.get(code)?.name ?? code}
            </span>
          ))}
          <span className="w-[215px] shrink-0 pr-3">Ghi chú</span>
          <span className="w-[95px] shrink-0">Ngày tạo</span>
          <span className="w-[160px] shrink-0 text-right pr-2">Thao tác</span>
        </div>

        {shownVersions.map((v, idx) => (
          <div
            key={v.id}
            className={cx(
              "flex min-h-[56px] min-w-[1080px] items-center border-b border-solid border-vehicsim-line px-5 py-2",
              v.status === "BASELINE" && "bg-vehicsim-row",
            )}
          >
            <span className="w-[45px] shrink-0 pr-2 text-center text-[12px] font-bold text-vehicsim-faint tabular-nums">
              {vOffset + idx + 1}
            </span>
            <span className="flex w-[135px] shrink-0 flex-col pr-3">
              <span className="text-[13px] font-bold text-vehicsim-ink">AEB {v.label}</span>
              <span className="text-[11px] text-vehicsim-faint">{changedNote(v, baseline)}</span>
            </span>
            <span className="w-[130px] shrink-0 pr-3">
              <Tag tone={STATUS_TONE[v.status]}>{STATUS_LABEL[v.status]}</Tag>
            </span>
            {KEY_PARAMS.map((code) => {
              const differs = baseline && v.id !== baseline.id && v.parameters[code] !== baseline.parameters[code];
              return (
                <span
                  key={code}
                  className={cx("w-[120px] shrink-0 text-[13px]", differs ? "font-bold text-vehicsim-decision" : "text-vehicsim-ink")}
                >
                  {paramValue(v.parameters[code], catalog.get(code)?.unit ?? "")}
                </span>
              );
            })}
            <span className="w-[220px] shrink-0 truncate pr-3 text-[12px] text-vehicsim-muted">{v.notes ?? "—"}</span>
            <span className="w-[100px] shrink-0 text-[12px] text-vehicsim-faint">{fmt.date(v.created_at)}</span>
            <span className="flex w-[170px] shrink-0 justify-end" onClick={(e) => e.stopPropagation()}>
              {v.status === "CANDIDATE" && canWrite && (
                <Link
                  href={`/validation/regression/new?candidate=${v.id}`}
                  className="inline-flex h-8 items-center justify-center rounded-full border border-solid border-vehicsim-line-strong bg-vehicsim-surface px-3 text-[12px] font-bold text-vehicsim-decision hover:border-vehicsim-decision hover:bg-vehicsim-decision hover:text-white transition shadow-sm"
                >
                  Kiểm thử hồi quy
                </Link>
              )}
            </span>
          </div>
        ))}
      </div>

      {vTotal > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-t border-solid border-vehicsim-line">
          <span className="text-[12px] text-vehicsim-muted">
            Hiển thị {vOffset + 1}–{Math.min(vOffset + vPageSize, vTotal)} trên {vTotal} phiên bản
          </span>
          {vPages > 1 && <Pagination page={vCurrent} pages={vPages} onPage={setVersionPage} />}
        </div>
      )}
    </section>
  );
}

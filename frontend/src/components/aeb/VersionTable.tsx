"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
import { Pagination, Tag, cx, fmt, paramValue } from "@/components/VehicSimUi";
import type { AebVersion, ParameterDef } from "@/types/vehicsim";
import { KEY_PARAMS, PARAM_NAMES, STATUS_LABEL, STATUS_TONE, changedNote } from "./aebTypes";

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
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [query, setQuery] = useState("");
  const [versionPage, setVersionPage] = useState(1);

  const allCount = versions?.length ?? 0;
  const candidateCount = useMemo(
    () => versions?.filter((v) => v.status === "CANDIDATE").length ?? 0,
    [versions],
  );
  const baselineCount = useMemo(
    () => versions?.filter((v) => v.status === "BASELINE").length ?? 0,
    [versions],
  );

  const filteredVersions = useMemo(() => {
    if (!versions) return [];
    return versions.filter((v) => {
      if (filterStatus !== "ALL" && v.status !== filterStatus) return false;
      if (query.trim()) {
        const q = query.trim().toLowerCase();
        const matchLabel = v.label.toLowerCase().includes(q);
        const matchNotes = (v.notes ?? "").toLowerCase().includes(q);
        const matchId = String(v.id) === q || `#${v.id}` === q;
        if (!matchLabel && !matchNotes && !matchId) return false;
      }
      return true;
    });
  }, [versions, filterStatus, query]);

  const vTotal = filteredVersions.length;
  const vPageSize = 8;
  const vPages = Math.max(1, Math.ceil(vTotal / vPageSize));
  const vCurrent = Math.min(versionPage, vPages);
  const vOffset = (vCurrent - 1) * vPageSize;
  const shownVersions = filteredVersions.slice(vOffset, vOffset + vPageSize);

  return (
    <section className="overflow-hidden rounded-xl border border-solid border-vehicsim-line bg-vehicsim-surface shadow-sm">
      {/* THANH BỘ LỌC VÀ TÌM KIẾM */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-solid border-vehicsim-line bg-vehicsim-surface px-5 py-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setFilterStatus("ALL");
              setVersionPage(1);
            }}
            className={cx(
              "rounded-lg px-3 py-1.5 text-[12.5px] font-bold transition",
              filterStatus === "ALL"
                ? "bg-slate-900 text-white shadow-sm"
                : "bg-vehicsim-soft text-vehicsim-muted hover:bg-slate-200 hover:text-vehicsim-ink dark:hover:bg-slate-800",
            )}
          >
            Tất cả ({allCount})
          </button>
          <button
            type="button"
            onClick={() => {
              setFilterStatus("CANDIDATE");
              setVersionPage(1);
            }}
            className={cx(
              "rounded-lg px-3 py-1.5 text-[12.5px] font-bold transition",
              filterStatus === "CANDIDATE"
                ? "bg-emerald-600 text-white shadow-sm"
                : "bg-vehicsim-soft text-vehicsim-muted hover:bg-slate-200 hover:text-vehicsim-ink dark:hover:bg-slate-800",
            )}
          >
            Ứng viên ({candidateCount})
          </button>
          <button
            type="button"
            onClick={() => {
              setFilterStatus("BASELINE");
              setVersionPage(1);
            }}
            className={cx(
              "rounded-lg px-3 py-1.5 text-[12.5px] font-bold transition",
              filterStatus === "BASELINE"
                ? "bg-slate-800 text-white shadow-sm"
                : "bg-vehicsim-soft text-vehicsim-muted hover:bg-slate-200 hover:text-vehicsim-ink dark:hover:bg-slate-800",
            )}
          >
            Bản cơ sở ({baselineCount})
          </button>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-vehicsim-faint" />
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setVersionPage(1);
              }}
              placeholder="Tìm theo tên/ghi chú..."
              className="h-9 w-48 rounded-lg border border-solid border-vehicsim-line bg-vehicsim-surface pl-8 pr-3 text-[12.5px] text-vehicsim-ink placeholder:text-vehicsim-faint focus:border-vehicsim-decision focus:outline-none sm:w-60"
            />
          </div>
          <Link
            href="/aeb/compare"
            className="hidden sm:inline-flex h-9 items-center rounded-lg border border-solid border-vehicsim-line px-3 text-[12px] font-bold text-vehicsim-decision hover:bg-vehicsim-soft transition"
          >
            So sánh 2 phiên bản →
          </Link>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="flex h-11 min-w-[1260px] items-center border-b border-solid border-slate-700 bg-slate-800 px-5 text-[12.5px] font-black uppercase tracking-wider text-white">
          <span className="w-[45px] shrink-0 pr-2 text-center font-bold">STT</span>
          <span className="w-[140px] shrink-0 pr-3">Phiên bản</span>
          <span className="w-[120px] shrink-0 pr-3">Trạng thái</span>
          {KEY_PARAMS.map((code) => (
            <span key={code} className="w-[125px] shrink-0 truncate pr-2">
              {PARAM_NAMES[code] ?? catalog.get(code)?.name ?? code}
            </span>
          ))}
          <span className="w-[200px] shrink-0 pr-3">Ghi chú</span>
          <span className="w-[95px] shrink-0">Ngày tạo</span>
          <span className="w-[260px] shrink-0 pr-2 text-right">Thao tác</span>
        </div>

        {shownVersions.length === 0 ? (
          <div className="p-8 text-center text-[13px] text-vehicsim-muted">
            Không tìm thấy phiên bản nào phù hợp với bộ lọc.
          </div>
        ) : (
          shownVersions.map((v, idx) => (
            <div
              key={v.id}
              className={cx(
                "flex min-h-[56px] min-w-[1260px] items-center border-b border-solid border-vehicsim-line px-5 py-2 hover:bg-vehicsim-row transition-colors",
                v.status === "BASELINE" && "bg-vehicsim-row/60 font-semibold",
              )}
            >
              <span className="w-[45px] shrink-0 pr-2 text-center text-[12px] font-bold text-vehicsim-faint tabular-nums">
                {vOffset + idx + 1}
              </span>
              <span className="flex w-[140px] shrink-0 flex-col pr-3">
                <span className="text-[13px] font-bold text-vehicsim-ink">AEB {v.label}</span>
                <span className="text-[11px] text-vehicsim-faint">{changedNote(v, baseline)}</span>
              </span>
              <span className="w-[120px] shrink-0 pr-3">
                <Tag tone={STATUS_TONE[v.status]}>{STATUS_LABEL[v.status]}</Tag>
              </span>
              {KEY_PARAMS.map((code) => {
                const differs = baseline && v.id !== baseline.id && v.parameters[code] !== baseline.parameters[code];
                return (
                  <span
                    key={code}
                    className={cx("w-[125px] shrink-0 text-[13px]", differs ? "font-bold text-vehicsim-decision" : "text-vehicsim-ink")}
                  >
                    {paramValue(v.parameters[code], catalog.get(code)?.unit ?? "")}
                  </span>
                );
              })}
              <span className="w-[200px] shrink-0 truncate pr-3 text-[12px] text-vehicsim-muted" title={v.notes ?? ""}>
                {v.notes ?? "—"}
              </span>
              <span className="w-[95px] shrink-0 text-[12px] text-vehicsim-faint">{fmt.date(v.created_at)}</span>
              <span className="flex w-[260px] shrink-0 items-center justify-end gap-2 pr-2" onClick={(e) => e.stopPropagation()}>
                {v.status === "CANDIDATE" && (
                  <>
                    {baseline && (
                      <Link
                        href={`/aeb/compare?a=${baseline.id}&b=${v.id}`}
                        className="inline-flex h-7 items-center justify-center rounded-lg border border-solid border-vehicsim-line bg-vehicsim-surface px-2.5 text-[11.5px] font-bold text-vehicsim-ink hover:bg-vehicsim-soft transition"
                      >
                        So với Baseline
                      </Link>
                    )}
                    {canWrite && (
                      <Link
                        href={`/validation/regression/new?candidate=${v.id}`}
                        className="inline-flex h-7 items-center justify-center gap-1 rounded-lg bg-emerald-600 px-3 text-[11.5px] font-bold text-white hover:bg-emerald-700 transition shadow-sm"
                      >
                        <span>Hồi quy (B5)</span>
                        <ArrowRight className="size-3" />
                      </Link>
                    )}
                  </>
                )}
                {v.status === "BASELINE" && (
                  <span className="rounded-md bg-emerald-500/15 px-2.5 py-1 text-[11.5px] font-bold text-emerald-700 dark:text-emerald-300">
                    Bản cơ sở mốc
                  </span>
                )}
              </span>
            </div>
          ))
        )}
      </div>

      {vTotal > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-solid border-vehicsim-line px-5 py-4">
          <span className="text-[12px] text-vehicsim-muted">
            Hiển thị {vOffset + 1}–{Math.min(vOffset + vPageSize, vTotal)} trên {vTotal} phiên bản {filterStatus !== "ALL" ? `(đã lọc)` : ""}
          </span>
          {vPages > 1 && <Pagination page={vCurrent} pages={vPages} onPage={setVersionPage} />}
        </div>
      )}
    </section>
  );
}

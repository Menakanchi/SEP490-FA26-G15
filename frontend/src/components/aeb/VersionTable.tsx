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
              "rounded-lg px-3.5 py-1.5 text-[12.5px] font-bold transition-all duration-150 border border-solid",
              filterStatus === "ALL"
                ? "bg-slate-900 border-slate-900 text-white shadow-xs hover:bg-slate-800 hover:text-white dark:bg-slate-100 dark:border-slate-100 dark:text-slate-900 dark:hover:bg-white"
                : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-200 hover:text-slate-950 hover:border-slate-300 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white dark:hover:border-slate-600",
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
              "rounded-lg px-3.5 py-1.5 text-[12.5px] font-bold transition-all duration-150 border border-solid",
              filterStatus === "CANDIDATE"
                ? "bg-emerald-600 border-emerald-600 text-white shadow-xs hover:bg-emerald-700 hover:text-white"
                : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-emerald-50 hover:text-emerald-900 hover:border-emerald-300 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-emerald-950/60 dark:hover:text-emerald-300 dark:hover:border-emerald-700",
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
              "rounded-lg px-3.5 py-1.5 text-[12.5px] font-bold transition-all duration-150 border border-solid",
              filterStatus === "BASELINE"
                ? "bg-slate-800 border-slate-800 text-white shadow-xs hover:bg-slate-900 hover:text-white dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-200 hover:text-slate-950 hover:border-slate-300 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white dark:hover:border-slate-600",
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
        <table className="w-full min-w-[1180px] border-collapse text-left text-[13px]">
          <thead className="border-b border-solid border-slate-700 bg-slate-800 text-[12px] font-black uppercase tracking-wider text-white">
            <tr className="min-h-[50px]">
              <th className="w-12 px-3 py-3.5 text-center font-bold">STT</th>
              <th className="px-4 py-3.5 min-w-[140px]">Phiên bản</th>
              <th className="px-3 py-3.5 min-w-[110px]">Trạng thái</th>
              {KEY_PARAMS.map((code) => (
                <th key={code} className="px-3.5 py-3.5 min-w-[125px] leading-snug whitespace-normal">
                  {PARAM_NAMES[code] ?? catalog.get(code)?.name ?? code}
                </th>
              ))}
              <th className="px-4 py-3.5 min-w-[160px]">Ghi chú</th>
              <th className="px-3 py-3.5 whitespace-nowrap min-w-[95px]">Ngày tạo</th>
              <th className="px-4 py-3.5 text-right whitespace-nowrap min-w-[240px]">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-solid divide-vehicsim-line bg-vehicsim-surface">
            {shownVersions.length === 0 ? (
              <tr>
                <td colSpan={10} className="p-8 text-center text-[13px] text-vehicsim-muted">
                  Không tìm thấy phiên bản nào phù hợp với bộ lọc.
                </td>
              </tr>
            ) : (
              shownVersions.map((v, idx) => (
                <tr
                  key={v.id}
                  className={cx(
                    "hover:bg-vehicsim-row transition-colors",
                    v.status === "BASELINE" && "bg-vehicsim-row/60 font-semibold",
                  )}
                >
                  <td className="px-3 py-3.5 text-center text-[12px] font-bold text-vehicsim-faint tabular-nums">
                    {vOffset + idx + 1}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex flex-col">
                      <span className="text-[13px] font-bold text-vehicsim-ink">AEB {v.label}</span>
                      <span className="text-[11px] text-vehicsim-faint">{changedNote(v, baseline)}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3.5">
                    <Tag tone={STATUS_TONE[v.status]}>{STATUS_LABEL[v.status]}</Tag>
                  </td>
                  {KEY_PARAMS.map((code) => {
                    const differs = baseline && v.id !== baseline.id && v.parameters[code] !== baseline.parameters[code];
                    return (
                      <td
                        key={code}
                        className={cx("px-3.5 py-3.5 text-[13px]", differs ? "font-bold text-vehicsim-decision" : "text-vehicsim-ink")}
                      >
                        {paramValue(v.parameters[code], catalog.get(code)?.unit ?? "")}
                      </td>
                    );
                  })}
                  <td className="px-4 py-3.5 text-[12px] text-vehicsim-muted max-w-[200px] truncate" title={v.notes ?? ""}>
                    {v.notes ?? "—"}
                  </td>
                  <td className="px-3 py-3.5 text-[12px] text-vehicsim-faint whitespace-nowrap">
                    {fmt.date(v.created_at)}
                  </td>
                  <td className="px-4 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-2">
                      {v.status === "CANDIDATE" && (
                        <>
                          {baseline && (
                            <Link
                              href={`/aeb/compare?a=${baseline.id}&b=${v.id}`}
                              className="inline-flex h-7 items-center justify-center rounded-lg border border-solid border-vehicsim-line bg-vehicsim-surface px-2.5 text-[11.5px] font-bold text-vehicsim-ink hover:bg-vehicsim-soft transition whitespace-nowrap"
                            >
                              So với Baseline
                            </Link>
                          )}
                          {canWrite && (
                            <Link
                              href={`/validation/regression/new?candidate=${v.id}`}
                              className="inline-flex h-7 items-center justify-center gap-1 rounded-lg bg-emerald-600 px-3 text-[11.5px] font-bold text-white hover:bg-emerald-700 transition shadow-xs whitespace-nowrap"
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
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
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

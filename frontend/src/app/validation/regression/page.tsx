"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { VehicSimPage } from "@/components/VehicSimPage";
import { useVehicSimContext } from "@/components/VehicSimContext";
import { EmptyState, ErrorNote, FilterSelect, Pagination, PillButton, REGRESSION_STATUS, StatCard, StatusBadge, cx, fmt } from "@/components/VehicSimUi";
import { vehicsimApi } from "@/services/vehicsim";
import type { RegressionList, RegressionStatus } from "@/types/vehicsim";

const POLL_MS = 3000;
const PAGE_SIZE = 10;

export default function RegressionListPage() {
  const router = useRouter();
  const { canWrite, canRunRegression, ctx, isExperiencer } = useVehicSimContext();
  const createCandidateHref = isExperiencer && ctx ? `/projects/${ctx.project.id}/improve` : "/aeb";
  const conclusion = (testId: number) => (isExperiencer && ctx ? `/projects/${ctx.project.id}/rounds/${testId}` : `/validation/recommendations/${testId}`);
  const [data, setData] = useState<RegressionList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<RegressionStatus | "">("");
  const [baseline, setBaseline] = useState("");
  const [author, setAuthor] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(() => {
    vehicsimApi.regressions()
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Không tải được danh sách kiểm thử hồi quy"));
  }, []);

  useEffect(load, [load]);

  const running = data?.kpis.running ?? 0;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [running, load]);

  const items = useMemo(
    () =>
      (data?.items ?? []).filter(
        (i) => (!status || i.status === status) && (!baseline || i.baseline === baseline) && (!author || i.created_by === author),
      ),
    [data, status, baseline, author],
  );
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const offset = (current - 1) * PAGE_SIZE;
  const shown = items.slice(offset, offset + PAGE_SIZE);
  const filtered = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };
  const uniq = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))].map((x) => ({ value: x, label: x }));
  const passedRegressions = (data?.items ?? []).filter((i) => i.status === "PASSED").reduce((n, i) => n + (i.regressed ?? 0), 0);
  const rp = data?.kpis.running_progress;

  return (
    <VehicSimPage
      step={6}
      crumbs={[{ label: "Kiểm định" }, { label: "Kiểm thử hồi quy" }]}
      title="Kiểm thử hồi quy"
      subtitle={
        isExperiencer
          ? "Mọi ứng viên đều được chạy lại và so với baseline trước khi được dùng làm baseline mới."
          : "Mọi cấu hình ứng viên đều được chạy lại và so với bản cơ sở trước khi trở thành khuyến nghị."
      }
      actions={
        <PillButton
          variant="dark"
          href={canRunRegression ? "/validation/regression/new" : undefined}
          disabled={!canRunRegression}
          title={canRunRegression ? undefined : "Project hiện tại không cho phép chạy kiểm thử hồi quy"}
        >
          + Tạo kiểm thử hồi quy
        </PillButton>
      }
    >
      <ErrorNote message={error} />

      <div className="flex w-full items-stretch gap-4">
        <StatCard
          label="Tổng số"
          value={data?.kpis.total ?? "…"}
          note={<span className="font-medium">{data?.kpis.since ? `từ ${fmt.date(data.kpis.since)}` : "chưa có kiểm thử"}</span>}
        />
        <StatCard
          label="Đạt"
          value={data?.kpis.passed ?? "…"}
          valueClass="text-vehicsim-ok"
          tone="ok"
          note={`${passedRegressions} ca xấu đi`}
        />
        <StatCard label="Không đạt" value={data?.kpis.failed ?? "…"} valueClass="text-vehicsim-danger" tone="danger" note="ứng viên bị chặn" />
        <StatCard
          label="Đang chạy"
          value={data?.kpis.running ?? "…"}
          valueClass="text-vehicsim-decision"
          tone="info"
          note={rp ? `${rp.code} · ${rp.done} / ${rp.total}` : "không có"}
        />
      </div>

      <section className="overflow-hidden rounded-[20px] border border-solid border-vehicsim-line bg-white shadow-vehicsim-card">
        <div className="flex items-center gap-2 px-5 py-4">
          <span className="mr-2 text-[15px] font-bold text-vehicsim-ink">{data ? `${items.length} kiểm thử` : "…"}</span>
          <FilterSelect<RegressionStatus>
            label="Trạng thái"
            value={status}
            options={(Object.keys(REGRESSION_STATUS) as RegressionStatus[]).map((s) => ({ value: s, label: REGRESSION_STATUS[s].label }))}
            onChange={filtered(setStatus)}
          />
          <FilterSelect<string> label="Bản cơ sở" value={baseline} options={uniq((data?.items ?? []).map((i) => i.baseline))} onChange={filtered(setBaseline)} />
          <FilterSelect<string> label="Người tạo" value={author} options={uniq((data?.items ?? []).map((i) => i.created_by))} onChange={filtered(setAuthor)} />
        </div>

        <div className="flex h-10 items-center border-y border-solid border-vehicsim-line bg-vehicsim-soft px-5 text-[11px] font-semibold uppercase text-vehicsim-faint">
          <span className="min-w-0 flex-1">Kiểm thử</span>
          <span className="w-[156px]">Phiên bản</span>
          <span className="w-[98px]">Kịch bản</span>
          <span className="w-[116px]">Trạng thái</span>
          <span className="w-[136px]">Sửa / Xấu đi</span>
          <span className="w-[106px]">Người tạo</span>
          <span className="w-[96px]">Ngày</span>
          <span className="w-[112px]" />
        </div>

        {data && items.length === 0 && (
          data.items.length ? (
            <EmptyState
              title="Không có kiểm thử nào khớp bộ lọc"
              action={
                <PillButton onClick={() => [setStatus, setBaseline, setAuthor].forEach((set) => set(""))}>Xoá bộ lọc</PillButton>
              }
            />
          ) : (
            <EmptyState
              title="Chưa có kiểm thử hồi quy"
              action={canWrite && <PillButton href={createCandidateHref}>Tạo ứng viên</PillButton>}
            >
              Tạo một cấu hình AEB ứng viên, rồi chạy kiểm thử hồi quy để so với bản cơ sở trên cùng bộ biến thể và cùng seed.
            </EmptyState>
          )
        )}

        {shown.map((i) => {
          const running = i.status === "RUNNING" || i.status === "PENDING";
          return (
            <div
              key={i.id}
              onClick={() => router.push(`/validation/regression/${i.id}`)}
              className={cx("flex h-[58px] cursor-pointer items-center border-b border-solid border-vehicsim-line px-5 hover:bg-vehicsim-row", running && "bg-vehicsim-row")}
            >
              <span className="flex min-w-0 flex-1 flex-col gap-[2px] pr-3">
                <span className="text-[13px] font-bold text-vehicsim-ink">{i.code}</span>
                <span className="truncate text-[12px] text-vehicsim-faint">{i.name}</span>
              </span>
              <span className="w-[156px] text-[13px] font-semibold text-vehicsim-ink">
                {i.baseline} → {i.candidate}
              </span>
              <span className="w-[98px] text-[13px] text-vehicsim-ink">
                {running ? `${i.progress.done} / ${i.progress.total}` : i.scenarios ?? i.progress.total}
              </span>
              <span className="w-[116px]">
                <StatusBadge status={i.status} />
              </span>
              <span className="flex w-[136px] items-center gap-[6px]">
                {i.fixed === null ? (
                  <span className="text-[13px] text-vehicsim-faint">—</span>
                ) : (
                  <>
                    <span className="rounded-full bg-vehicsim-ok-bg px-2 py-[3px] text-[11px] font-semibold text-vehicsim-ok">+{i.fixed}</span>
                    <span
                      className={cx(
                        "rounded-full px-2 py-[3px] text-[11px] font-semibold",
                        i.regressed ? "bg-vehicsim-danger-bg text-vehicsim-danger" : "bg-vehicsim-soft text-vehicsim-muted",
                      )}
                    >
                      {i.regressed ? `−${i.regressed}` : "0"}
                    </span>
                  </>
                )}
              </span>
              <span className="w-[106px] truncate text-[13px] text-vehicsim-ink">{i.created_by ?? "—"}</span>
              <span className="w-[96px] text-[13px] text-vehicsim-faint">{fmt.date(i.created_at)}</span>
              <span className="flex w-[112px] items-center justify-end gap-3 text-[12px] font-semibold" onClick={(e) => e.stopPropagation()}>
                <Link href={`/validation/regression/${i.id}`} className="text-vehicsim-decision hover:underline">
                  Xem
                </Link>
                {i.status === "PASSED" && (
                  <Link href={conclusion(i.id)} className="text-vehicsim-decision hover:underline">
                    {isExperiencer ? "Kết luận" : "Khuyến nghị"}
                  </Link>
                )}
              </span>
            </div>
          );
        })}

        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <p className="text-[12px] text-vehicsim-muted">
            <span className="tabular-nums">
              {items.length ? `${offset + 1}–${offset + shown.length}` : "0"} trong {items.length} kiểm thử
              {data && items.length !== data.items.length && ` (lọc từ ${data.items.length})`}
            </span>
            {" · "}Kiểm thử chạy ngay khi được tạo nên không sửa hay xoá được sau đó.
          </p>
          {pages > 1 && <Pagination page={current} pages={pages} onPage={setPage} />}
        </div>
      </section>
    </VehicSimPage>
  );
}

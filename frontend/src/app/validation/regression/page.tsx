"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { VehicSimPage } from "@/components/VehicSimPage";
import { useVehicSimContext } from "@/components/VehicSimContext";
import { EmptyState, ErrorNote, FilterSelect, PillButton, REGRESSION_STATUS, StatCard, StatusBadge, cx, fmt } from "@/components/VehicSimUi";
import { vehicsimApi } from "@/services/vehicsim";
import type { RegressionList, RegressionStatus } from "@/types/vehicsim";

const POLL_MS = 3000;

export default function RegressionListPage() {
  const router = useRouter();
  const { canWrite } = useVehicSimContext();
  const [data, setData] = useState<RegressionList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<RegressionStatus | "">("");
  const [baseline, setBaseline] = useState("");
  const [author, setAuthor] = useState("");

  const load = useCallback(() => {
    vehicsimApi.regressions()
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Không tải được danh sách kiểm thử hồi quy"));
  }, []);

  useEffect(load, [load]);

  // Test đang chạy → hỏi lại định kỳ để thanh tiến độ và KPI tự cập nhật.
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
  const uniq = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))].map((x) => ({ value: x, label: x }));
  const passedRegressions = (data?.items ?? []).filter((i) => i.status === "PASSED").reduce((n, i) => n + (i.regressed ?? 0), 0);
  const rp = data?.kpis.running_progress;

  return (
    <VehicSimPage
      step={6}
      crumbs={[{ label: "Kiểm định" }, { label: "Kiểm thử hồi quy" }]}
      title="Kiểm thử hồi quy"
      subtitle="Mọi cấu hình ứng viên đều được chạy lại và so với bản cơ sở trước khi trở thành khuyến nghị."
      actions={
        <PillButton
          variant="dark"
          href={canWrite ? "/validation/regression/new" : undefined}
          disabled={!canWrite}
          title={canWrite ? undefined : "Tài khoản người xem chỉ có quyền xem"}
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
            onChange={setStatus}
          />
          <FilterSelect<string> label="Bản cơ sở" value={baseline} options={uniq((data?.items ?? []).map((i) => i.baseline))} onChange={setBaseline} />
          <FilterSelect<string> label="Người tạo" value={author} options={uniq((data?.items ?? []).map((i) => i.created_by))} onChange={setAuthor} />
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
          <EmptyState title={data.items.length ? "Không có kiểm thử nào khớp bộ lọc" : "Chưa có kiểm thử hồi quy"}>
            Tạo một cấu hình AEB ứng viên ở mục <Link href="/aeb" className="font-semibold underline">AEB</Link>, rồi chạy kiểm thử hồi quy
            để so với bản cơ sở trên cùng bộ biến thể và cùng seed.
          </EmptyState>
        )}

        {items.map((i) => {
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
                  <Link href={`/validation/recommendations/${i.id}`} className="text-vehicsim-decision hover:underline">
                    Khuyến nghị
                  </Link>
                )}
              </span>
            </div>
          );
        })}

        <p className="px-5 py-4 text-[12px] text-vehicsim-faint">
          Hiển thị {items.length} / {data?.items.length ?? 0} · Kiểm thử chạy ngay khi được tạo nên không sửa hay xoá được
          sau đó.
        </p>
      </section>
    </VehicSimPage>
  );
}

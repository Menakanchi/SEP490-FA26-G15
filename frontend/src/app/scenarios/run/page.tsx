"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, ChevronDown, Play, RefreshCw, X } from "lucide-react";
import { VehicSimPage } from "@/components/VehicSimPage";
import { useVehicSimContext } from "@/components/VehicSimContext";
import { useAuth } from "@/context/AuthContext";
import { Card, EmptyState, ErrorNote, PillButton, cx, simulatorLabel } from "@/components/VehicSimUi";
import { vi } from "@/components/vehicsimI18n";
import { vehicsimApi } from "@/services/vehicsim";
import type { FamilyItem } from "@/types/vehicsim";
import { VehicSimSelect } from "@/components/VehicSimSelect";

const axisLabels: Record<string, string> = {
  ego_speed_kmh: "Tốc độ xe thử (km/h)",
  trigger_distance_m: "Khoảng cách kích hoạt (m)",
  pedestrian_speed_mps: "Tốc độ người đi bộ (m/s)",
  stops_at_curb: "Hành vi người đi bộ",
  target_speed_kmh: "Tốc độ xe phía trước (km/h)",
  initial_distance_m: "Khoảng cách ban đầu (m)",
  target_decel_mps2: "Giảm tốc xe phía trước (m/s²)",
  lateral_overlap_pct: "Độ chồng lấn (%)",
  weather: "Thời tiết",
  time_of_day: "Thời điểm",
};

const valueLabels: Record<string, string> = {
  CLEAR: "Trời quang", CLOUDY: "Nhiều mây", RAIN: "Mưa", HEAVY_RAIN: "Mưa to", FOG: "Sương mù",
  DAY: "Ban ngày", DUSK: "Chạng vạng", NIGHT: "Ban đêm",
};

export default function ScenarioRunPage() {
  const { ctx, error: contextError, refresh, canWrite } = useVehicSimContext();
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [families, setFamilies] = useState<FamilyItem[] | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [withAebOff, setWithAebOff] = useState(true);

  const paramId = Number(searchParams.get("scenario_id") || searchParams.get("family"));
  const requestedId = activeId ?? (Number.isInteger(paramId) && paramId > 0 ? paramId : null);
  const selectedId = families?.some((family) => family.id === requestedId) ? requestedId : (families?.[0]?.id ?? null);

  // Tải danh sách họ kịch bản
  const load = useCallback(() => {
    vehicsimApi
      .families()
      .then(setFamilies)
      .catch((err) => setError(err instanceof Error ? err.message : "Không tải được họ kịch bản"));
  }, []);

  useEffect(load, [load]);

  const selectedFamily = (families ?? []).find((f) => f.id === selectedId) ?? null;

  // Tự động làm mới khi có lượt đang chờ / đang chạy
  const progressAvailable = !!ctx?.vehicle && !!ctx.system.baseline && selectedFamily?.baseline_progress != null;
  const archived = !!ctx && (ctx.workspace != null || user?.roleCode === "ENGINEER") && !ctx.reviewer_can_decide;
  const canOperate = canWrite && !!ctx && !contextError && !archived;
  const progress = ctx ? selectedFamily?.baseline_progress?.[ctx.simulator] : undefined;
  const pending = progress?.active_runs ?? 0;

  useEffect(() => {
    if (pending === 0) return;
    const timer = setInterval(() => {
      load();
      refresh().catch(() => {});
    }, 2500);
    return () => clearInterval(timer);
  }, [pending, load, refresh]);

  const handleRun = async () => {
    if (!selectedFamily) return;
    setBusy(true);
    setError(null);
    try {
      const res = await vehicsimApi.runFamily(selectedFamily.id, undefined, withAebOff);
      setNotice(
        `${selectedFamily.code}: đã xếp ${res.queued_runs} lượt chạy cơ sở${
          withAebOff ? " (một nửa là lượt AEB tắt để đối chiếu mốc an toàn)" : ""
        }.`,
      );
      load();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? vi(err.message) : "Không khởi chạy được kịch bản");
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    if (!selectedFamily) return;
    setBusy(true);
    setError(null);
    try {
      const res = await vehicsimApi.cancelFamily(selectedFamily.id, ctx?.simulator.startsWith("carla-") ? "CARLA" : "KINEMATIC");
      setNotice(
        `${selectedFamily.code}: đã hủy ${res.stopped} lượt đang chờ${
          res.stopping ? `, đang dừng ${res.stopping} lượt đang chạy` : ""
        }.`,
      );
      load();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? vi(err.message) : "Không hủy được lượt chạy");
    } finally {
      setBusy(false);
    }
  };

  const pickFamily = (id: number) => {
    setActiveId(id);
    const params = new URLSearchParams(searchParams.toString());
    params.set("scenario_id", String(id));
    router.replace(`/scenarios/run?${params.toString()}`);
  };

  const completed = progress?.completed_variants ?? 0;
  const failed = progress?.failed_runs ?? 0;

  return (
    <VehicSimPage
      step={2}
      crumbs={[{ label: "Mô phỏng", href: "/scenarios/run" }, { label: "Chạy baseline" }]}
      actions={
        <PillButton href="/scenarios" variant="light">
          <ArrowLeft aria-hidden className="size-4" /> Danh sách kịch bản
        </PillButton>
      }
    >
      <ErrorNote message={error} />
      {notice && (
        <div role="status" className="flex items-center gap-3 rounded-xl bg-vehicsim-ok-bg px-4 py-3 text-[13px] text-vehicsim-ok">
          <CheckCircle2 className="size-4 shrink-0 text-vehicsim-ok" />
          <span>{notice}</span>
        </div>
      )}

      <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.75fr)]">
      <div className="flex min-w-0 flex-col gap-5">
      <Card className="flex min-w-0 flex-col gap-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-solid border-vehicsim-line pb-3">
          <div>
            <h2 className="text-[17px] font-bold text-vehicsim-ink">Họ kịch bản</h2>
            <p className="mt-1 text-[13px] text-vehicsim-muted">Chọn họ có các biến thể bạn muốn chạy.</p>
          </div>
          {families && families.length > 0 && (
            <VehicSimSelect
              aria-label="Chọn họ kịch bản kiểm thử"
              value={selectedId}
              onChange={(val) => pickFamily(Number(val))}
              options={families.map((f) => ({
                value: f.id,
                label: `${f.code} · ${f.name}`,
                sublabel: `v${f.version} — ${f.variants} biến thể`,
              }))}
              className="w-auto min-w-[300px]"
            />
          )}
        </div>

        {selectedFamily ? (
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="min-w-0 break-words text-[15px] font-bold text-vehicsim-ink">
                {selectedFamily.code} · {selectedFamily.name}
                <span className="ml-2 text-[12px] font-medium text-vehicsim-muted">v{selectedFamily.version}</span>
              </span>
              <span className="text-[13px] font-semibold text-vehicsim-muted">
                {selectedFamily.variants} biến thể ({selectedFamily.risk_counts?.DANGEROUS ?? 0} nguy hiểm,{" "}
                {selectedFamily.risk_counts?.SAFE ?? 0} an toàn)
              </span>
            </div>
            {selectedFamily.description && (
              <p className="text-[13px] leading-[1.5] text-vehicsim-muted">{selectedFamily.description}</p>
            )}
            <details className="group border-t border-vehicsim-line pt-3">
              <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 text-[13px] font-semibold text-vehicsim-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vehicsim-primary [&::-webkit-details-marker]:hidden">
                Xem không gian tham số <ChevronDown aria-hidden className="size-4 transition-transform group-open:rotate-180" />
              </summary>
              <dl className="grid gap-x-5 gap-y-3 pb-1 pt-2 sm:grid-cols-2">
              {Object.entries(selectedFamily.parameter_space).map(([axis, values]) => (
                <div key={axis} className="min-w-0 text-[13px]">
                  <dt className="text-vehicsim-muted">{axisLabels[axis] ?? axis}</dt>
                  <dd className="mt-0.5 break-words font-semibold text-vehicsim-ink">{values.map((v) => typeof v === "boolean" ? (v ? "Dừng ở lề" : "Băng qua") : valueLabels[String(v)] ?? String(v)).join(" / ")}</dd>
                </div>
              ))}
              </dl>
            </details>
          </div>
        ) : families === null ? (
          <p className="text-[13px] text-vehicsim-muted">{error ? "Không thể tải danh sách họ kịch bản." : "Đang tải họ kịch bản…"}</p>
        ) : (
          <EmptyState title="Chưa có họ kịch bản nào">
            Vui lòng vào mục <Link href="/scenarios/new" className="text-vehicsim-primary font-bold underline">Thiết kế kịch bản</Link> để tạo kịch bản trước.
          </EmptyState>
        )}
      </Card>

      {selectedFamily && (
        <Card className="flex min-w-0 flex-col gap-4 p-5 sm:p-6">
          <div>
            <h2 className="text-[17px] font-bold text-vehicsim-ink">Cấu hình chạy</h2>
            <p className="mt-1 text-[13px] text-vehicsim-muted">Các lượt mới sử dụng cấu hình hiện tại của project.</p>
          </div>
          {ctx && (
            <div className="grid grid-cols-1 gap-4 border-y border-vehicsim-line py-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1">
                <span className="text-[12px] font-semibold text-vehicsim-muted">Phương tiện thử nghiệm</span>
                <span className="text-[14px] font-bold text-vehicsim-ink">{ctx.vehicle?.name ?? "—"}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[12px] font-semibold text-vehicsim-muted">Bộ AEB cơ sở</span>
                <span className="text-[14px] font-bold text-vehicsim-ink">
                  {ctx.system.baseline?.label ?? "chưa có bản cơ sở"}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[12px] font-semibold text-vehicsim-muted">Môi trường mô phỏng</span>
                <span className="text-[14px] font-bold text-vehicsim-ink">{simulatorLabel(ctx.simulator)}</span>
              </div>
            </div>
          )}

          <label className="flex cursor-pointer items-start gap-3 text-[13px] leading-relaxed text-vehicsim-ink">
            <input
              type="checkbox"
              checked={withAebOff}
              onChange={(e) => setWithAebOff(e.target.checked)}
              disabled={!canOperate || pending > 0 || busy}
              className="mt-1 size-4 shrink-0 accent-vehicsim-primary"
            />
            <span><span className="font-semibold">Chạy thêm lượt AEB tắt</span><span className="mt-0.5 block text-vehicsim-muted">Thêm một lượt cho mỗi biến thể để đối chiếu; không dùng làm cơ sở kiểm chứng.</span></span>
          </label>
        </Card>
      )}
      </div>

      {selectedFamily && (
        <Card className="flex min-w-0 flex-col gap-5 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[17px] font-bold text-vehicsim-ink">Tiến độ baseline</h2>
              <p className="mt-1 text-[13px] leading-relaxed text-vehicsim-muted">
                {!progressAvailable
                  ? "Chưa tải được tiến độ cho cấu hình hiện tại."
                  : pending > 0
                  ? "Hệ thống đang thực thi mô phỏng trong hàng đợi nền..."
                  : completed > 0
                  ? "Đã có kết quả baseline. Bạn có thể xem phân tích hoặc chạy lại nếu cần."
                  : "Chưa có lượt chạy nào. Bấm nút bên dưới để bắt đầu."}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={load}
                className="flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-[13px] font-semibold text-vehicsim-primary hover:bg-vehicsim-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vehicsim-primary"
              >
                <RefreshCw className={cx("size-3.5", pending > 0 && "motion-safe:animate-spin text-vehicsim-primary")} />
                Làm mới
              </button>
            </div>
          </div>

          <div className="border-y border-vehicsim-line py-4">
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-[13px] font-semibold text-vehicsim-ink">Biến thể hoàn thành</span>
              <span className="text-[20px] font-bold tabular-nums text-vehicsim-ink">{progressAvailable ? completed : "—"}<span className="text-[14px] font-medium text-vehicsim-muted"> / {selectedFamily.variants}</span></span>
            </div>
            {progressAvailable && selectedFamily.variants > 0 && (
              <progress aria-label="Biến thể đã hoàn thành" value={completed} max={selectedFamily.variants} className="mt-3 h-2 w-full appearance-none overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-vehicsim-soft [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-vehicsim-primary [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-vehicsim-primary" />
            )}
            <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-3 text-[13px]">
              <div><dt className="text-vehicsim-muted">Lượt chờ / chạy</dt><dd className={cx("mt-1 font-bold tabular-nums", pending > 0 ? "text-vehicsim-decision" : "text-vehicsim-ink")}>{progressAvailable ? pending : "—"}</dd></div>
              <div><dt className="text-vehicsim-muted">Lượt lỗi</dt><dd className={cx("mt-1 font-bold tabular-nums", failed > 0 ? "text-vehicsim-danger" : "text-vehicsim-ink")}>{progressAvailable ? failed : "—"}</dd></div>
            </dl>
          </div>

          <p className="text-[12px] leading-relaxed text-vehicsim-muted">Theo xe, bản AEB và phiên bản mô phỏng hiện tại. Biến thể hoàn thành được tính một lần với AEB bật; lượt chờ và lỗi bao gồm cả AEB tắt.</p>
          {archived && <p className="text-[13px] text-vehicsim-muted">Project hoặc workspace đã lưu trữ; bạn chỉ có thể xem lịch sử mô phỏng.</p>}
          {!canWrite && !archived && <p className="text-[13px] text-vehicsim-muted">Tài khoản của bạn chỉ có quyền xem, không thể khởi chạy hoặc hủy mô phỏng.</p>}
          {ctx && !ctx.vehicle && <p className="text-[13px] text-vehicsim-muted">Hãy chọn phương tiện cho project trước khi chạy mô phỏng.</p>}
          {ctx && !ctx.system.baseline && <p className="text-[13px] text-vehicsim-muted">Project cần có cấu hình AEB cơ sở trước khi chạy mô phỏng.</p>}
          {pending > 0 && canOperate && <p className="text-[13px] text-vehicsim-muted">Hủy sẽ dừng các lượt độc lập đang chờ hoặc chạy của họ trong cùng loại mô phỏng, kể cả các cấu hình cũ.</p>}

          <div className="flex flex-col gap-3 border-t border-solid border-vehicsim-line pt-4">
            {completed > 0 && (
              <PillButton href={`/analysis/failures?scenario_id=${selectedFamily.id}`} variant="dark" className="w-full">
                Xem phân tích kết quả <ArrowRight aria-hidden className="size-4 shrink-0" />
              </PillButton>
            )}
            {pending > 0 ? (
              <button
                type="button"
                onClick={handleCancel}
                disabled={!canOperate || busy}
                className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-vehicsim-danger/30 px-4 py-2.5 text-[13px] font-semibold text-vehicsim-danger transition-colors hover:bg-vehicsim-danger-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vehicsim-danger disabled:cursor-not-allowed disabled:opacity-50"
              >
                <X className="size-4 shrink-0" />
                {busy ? "Đang hủy..." : "Hủy lượt đang xử lý"}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleRun}
                disabled={!canOperate || busy || !progressAvailable}
                className={cx("flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vehicsim-primary disabled:cursor-not-allowed disabled:opacity-50", completed > 0 ? "border border-vehicsim-line-strong text-vehicsim-ink hover:bg-vehicsim-soft" : "bg-vehicsim-primary text-white hover:bg-vehicsim-primary-hover")}
              >
                <Play className="size-4 fill-current shrink-0" />
                {busy ? "Đang khởi chạy..." : completed > 0 ? "Chạy lại toàn bộ baseline" : "Khởi chạy baseline"}
              </button>
            )}

            <Link href="/analysis/carla" className="min-h-11 content-center text-center text-[13px] font-semibold text-vehicsim-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vehicsim-primary">Xem dữ liệu CARLA</Link>
          </div>
        </Card>
      )}
      </div>
    </VehicSimPage>
  );
}

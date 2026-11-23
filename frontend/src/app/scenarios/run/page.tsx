"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, CheckCircle2, Play, RefreshCw, X } from "lucide-react";
import { VehicSimPage } from "@/components/VehicSimPage";
import { useVehicSimContext } from "@/components/VehicSimContext";
import { Card, EmptyState, ErrorNote, PillButton, Tag, cx, simulatorLabel } from "@/components/VehicSimUi";
import { vi } from "@/components/vehicsimI18n";
import { vehicsimApi } from "@/services/vehicsim";
import type { FamilyItem } from "@/types/vehicsim";
import { VehicSimSelect } from "@/components/VehicSimSelect";

export default function ScenarioRunPage() {
  const { ctx, refresh, canWrite } = useVehicSimContext();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [families, setFamilies] = useState<FamilyItem[] | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [withAebOff, setWithAebOff] = useState(true);

  const paramId = Number(searchParams.get("scenario_id") || searchParams.get("family"));
  const selectedId = activeId ?? (Number.isInteger(paramId) && paramId > 0 ? paramId : (families?.[0]?.id ?? null));

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
  const pending = selectedFamily
    ? (selectedFamily.runs.PENDING ?? selectedFamily.runs.QUEUED ?? 0) +
      (selectedFamily.runs.RUNNING ?? 0) +
      (selectedFamily.runs.PAUSED ?? 0)
    : 0;

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
      const res = await vehicsimApi.cancelFamily(selectedFamily.id);
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

  const completed = selectedFamily?.runs.COMPLETED ?? 0;
  const failed = selectedFamily?.runs.FAILED ?? 0;

  return (
    <VehicSimPage
      step={2}
      crumbs={[{ label: "Mô phỏng", href: "/scenarios/run" }, { label: "Chạy baseline" }]}
      actions={
        <PillButton href="/scenarios" variant="light">
          ← Danh sách họ kịch bản
        </PillButton>
      }
    >
      <ErrorNote message={error} />
      {notice && (
        <div className="flex items-center gap-3 rounded-[16px] bg-vehicsim-ok-bg px-4 py-3 text-[13px] text-vehicsim-ok shadow-sm">
          <CheckCircle2 className="size-4 shrink-0 text-vehicsim-ok" />
          <span>{notice}</span>
        </div>
      )}

      {/* 1. Chọn họ kịch bản */}
      <Card className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-solid border-vehicsim-line pb-3">
          <div>
            <h2 className="text-[16px] font-bold text-vehicsim-ink">1. Chọn họ kịch bản kiểm thử</h2>
            <p className="text-[13px] text-vehicsim-muted">Chọn kịch bản từ mục Thiết kế kịch bản để chạy thử nghiệm.</p>
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
          <div className="flex flex-col gap-3 rounded-[12px] bg-vehicsim-soft p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[15px] font-bold text-vehicsim-ink">
                {selectedFamily.code} · {selectedFamily.name}
                <Tag className="ml-2 px-2 py-0.5 text-[11px]">v{selectedFamily.version}</Tag>
              </span>
              <span className="text-[13px] font-semibold text-vehicsim-muted">
                {selectedFamily.variants} biến thể ({selectedFamily.risk_counts?.DANGEROUS ?? 0} nguy hiểm,{" "}
                {selectedFamily.risk_counts?.SAFE ?? 0} an toàn)
              </span>
            </div>
            {selectedFamily.description && (
              <p className="text-[13px] leading-[1.5] text-vehicsim-muted">{selectedFamily.description}</p>
            )}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {Object.entries(selectedFamily.parameter_space).map(([axis, values]) => (
                <Tag key={axis} className="px-2 py-1 text-[11px]">
                  <strong>{axis}:</strong> {values.map((v) => (typeof v === "boolean" ? (v ? "dừng" : "băng qua") : String(v))).join(" / ")}
                </Tag>
              ))}
            </div>
          </div>
        ) : (
          <EmptyState title="Chưa có họ kịch bản nào">
            Vui lòng vào mục <Link href="/scenarios/new" className="text-vehicsim-primary font-bold underline">Thiết kế kịch bản</Link> để tạo kịch bản trước.
          </EmptyState>
        )}
      </Card>

      {/* 2. Cấu hình môi trường chạy */}
      {selectedFamily && (
        <Card className="flex flex-col gap-4 p-5">
          <h2 className="text-[16px] font-bold text-vehicsim-ink">2. Cấu hình thực thi Baseline</h2>
          {ctx && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-1 rounded-[12px] border border-solid border-vehicsim-line bg-vehicsim-surface p-3">
                <span className="text-[12px] font-semibold text-vehicsim-muted">Phương tiện thử nghiệm</span>
                <span className="text-[14px] font-bold text-vehicsim-ink">{ctx.vehicle?.name ?? "—"}</span>
              </div>
              <div className="flex flex-col gap-1 rounded-[12px] border border-solid border-vehicsim-line bg-vehicsim-surface p-3">
                <span className="text-[12px] font-semibold text-vehicsim-muted">Bộ AEB cơ sở</span>
                <span className="text-[14px] font-bold text-vehicsim-ink">
                  {ctx.system.baseline?.label ?? "chưa có bản cơ sở"}
                </span>
              </div>
              <div className="flex flex-col gap-1 rounded-[12px] border border-solid border-vehicsim-line bg-vehicsim-surface p-3">
                <span className="text-[12px] font-semibold text-vehicsim-muted">Môi trường mô phỏng</span>
                <span className="text-[14px] font-bold text-vehicsim-ink">{simulatorLabel(ctx.simulator)}</span>
              </div>
            </div>
          )}

          <label className="flex items-center gap-2 pt-1 text-[13px] text-vehicsim-muted">
            <input
              type="checkbox"
              checked={withAebOff}
              onChange={(e) => setWithAebOff(e.target.checked)}
              disabled={!canWrite || pending > 0}
            />
            Khi chạy cơ sở, chạy thêm mỗi biến thể một lượt AEB tắt (mốc đối chiếu &quot;không có AEB&quot;, không dùng làm cơ sở kiểm chứng)
          </label>
        </Card>
      )}

      {/* 3. Tiến trình & Khởi chạy */}
      {selectedFamily && (
        <Card className="flex flex-col gap-5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[16px] font-bold text-vehicsim-ink">3. Điều khiển & Tiến độ mô phỏng</h2>
              <p className="text-[13px] text-vehicsim-muted">
                {pending > 0
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
                className="flex items-center gap-1.5 rounded-full border border-solid border-vehicsim-line-strong bg-vehicsim-surface px-3 py-1.5 text-[12px] font-semibold text-vehicsim-muted hover:text-vehicsim-ink"
              >
                <RefreshCw className={cx("size-3.5", pending > 0 && "animate-spin text-vehicsim-primary")} />
                Làm mới
              </button>
            </div>
          </div>

          {/* Cards tiến trình */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="flex flex-col items-center justify-center rounded-[14px] border border-solid border-vehicsim-line bg-vehicsim-soft p-4 text-center">
              <span className="text-[24px] font-black text-vehicsim-ink">{selectedFamily.variants}</span>
              <span className="text-[12px] font-semibold text-vehicsim-muted">Tổng biến thể</span>
            </div>
            <div className="flex flex-col items-center justify-center rounded-[14px] border border-solid border-vehicsim-line bg-vehicsim-soft p-4 text-center">
              <span className={cx("text-[24px] font-black", pending > 0 ? "text-vehicsim-decision" : "text-vehicsim-ink")}>
                {pending}
              </span>
              <span className="text-[12px] font-semibold text-vehicsim-muted">Đang chờ / chạy</span>
            </div>
            <div className="flex flex-col items-center justify-center rounded-[14px] border border-solid border-vehicsim-line bg-vehicsim-soft p-4 text-center">
              <span className={cx("text-[24px] font-black", completed > 0 ? "text-vehicsim-ok" : "text-vehicsim-ink")}>
                {completed}
              </span>
              <span className="text-[12px] font-semibold text-vehicsim-muted">Đã xong</span>
            </div>
            <div className="flex flex-col items-center justify-center rounded-[14px] border border-solid border-vehicsim-line bg-vehicsim-soft p-4 text-center">
              <span className={cx("text-[24px] font-black", failed > 0 ? "text-vehicsim-danger" : "text-vehicsim-ink")}>
                {failed}
              </span>
              <span className="text-[12px] font-semibold text-vehicsim-muted">Lỗi</span>
            </div>
          </div>

          {/* Nút hành động */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-solid border-vehicsim-line pt-4">
            {pending > 0 ? (
              <button
                type="button"
                onClick={handleCancel}
                disabled={!canWrite || busy}
                className="flex items-center gap-2 rounded-full bg-vehicsim-danger px-6 py-3 text-[14px] font-bold text-white shadow-md hover:bg-red-700 transition disabled:opacity-50"
              >
                <X className="size-4 shrink-0" />
                {busy ? "Đang hủy..." : `Hủy ${pending} lượt đang xử lý`}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleRun}
                disabled={!canWrite || busy}
                className="flex items-center gap-2 rounded-full bg-vehicsim-primary px-6 py-3 text-[14px] font-bold text-white shadow-md hover:bg-vehicsim-primary-hover transition disabled:opacity-50"
              >
                <Play className="size-4 fill-current shrink-0" />
                {busy ? "Đang khởi chạy..." : completed > 0 ? "▶ Chạy lại toàn bộ Baseline" : "▶ Khởi chạy Baseline"}
              </button>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <PillButton href="/analysis/carla" variant="light">
                Dữ liệu CARLA 3D
              </PillButton>
              {completed > 0 && (
                <PillButton href={`/analysis/failures?scenario_id=${selectedFamily.id}`} variant="dark">
                  Tiếp tục: Phân tích kết quả
                  <ArrowRight className="size-4 shrink-0" />
                </PillButton>
              )}
            </div>
          </div>
        </Card>
      )}
    </VehicSimPage>
  );
}

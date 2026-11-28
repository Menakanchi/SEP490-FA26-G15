"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Tag } from "@/components/VehicSimUi";
import { vehicsimApi } from "@/services/vehicsim";
import type { OptimizationTrial } from "@/types/vehicsim";

const testCode = (id: number) => `RT-${String(id).padStart(3, "0")}`;

export interface TrialSelections {
  /** Trạng thái phiên bản AEB theo id (CANDIDATE / BASELINE / ARCHIVED / REJECTED). */
  versionStatus: Record<number, string>;
  /** Kiểm thử hồi quy mới nhất theo id phiên bản ứng viên. */
  latestTest: Record<number, number>;
}

/**
 * Trial nào đã được chọn: dựng từ danh sách phiên bản AEB và kiểm thử hồi quy sẵn có, không thêm trường vào API tối ưu
 * (source {@code OptimizationService} được Failure Analysis ghim hash để audit). Tải lại mỗi khi danh sách trial đổi (sau khi chọn).
 */
export function useTrialSelections(trials: unknown): TrialSelections {
  const [state, setState] = useState<TrialSelections>({ versionStatus: {}, latestTest: {} });
  useEffect(() => {
    let alive = true;
    Promise.all([vehicsimApi.aebVersions(), vehicsimApi.regressions()])
      .then(([versions, tests]) => {
        if (!alive) return;
        const versionStatus: Record<number, string> = {};
        versions.forEach((v) => { versionStatus[v.id] = v.status; });
        const latestTest: Record<number, number> = {};
        tests.items.forEach((t) => { latestTest[t.candidate_version_id] = Math.max(latestTest[t.candidate_version_id] ?? 0, t.id); });
        setState({ versionStatus, latestTest });
      })
      .catch(() => { /* Không tải được thì giữ nút chọn như cũ; backend vẫn kiểm khi tạo kiểm thử. */ });
    return () => { alive = false; };
  }, [trials]);
  return state;
}

/**
 * Ô thao tác của một trial Pareto. Trial đã được chọn (đã có kiểm thử hồi quy), đã thành bản cơ sở hoặc đã bị từ chối thì hiện trạng thái
 * và liên kết tới kiểm thử thay vì mời "Chọn làm ứng viên" lần nữa (chọn lại chỉ tạo thêm một kiểm thử trùng).
 */
export function TrialSelectAction({ trial, selections, selecting, canWrite, onSelect, disabled = false }: {
  trial: OptimizationTrial;
  selections: TrialSelections;
  selecting: number | null;
  canWrite: boolean;
  onSelect: (trialId: number) => void;
  /** Điều kiện riêng của trang (ví dụ trial vi phạm ràng buộc thì không cho chọn). */
  disabled?: boolean;
}) {
  const status = selections.versionStatus[trial.candidate_aeb_version_id];
  const test = selections.latestTest[trial.candidate_aeb_version_id] ?? null;
  const testLink = test !== null && (
    <Link href={`/validation/regression/${test}`} className="whitespace-nowrap text-[12px] font-semibold text-vehicsim-decision hover:underline">
      {testCode(test)} →
    </Link>
  );
  if (status === "BASELINE" || status === "ARCHIVED" || status === "REJECTED") {
    const label = status === "BASELINE" ? "Đang là bản cơ sở" : status === "ARCHIVED" ? "Từng là bản cơ sở" : "Đã bị từ chối";
    return (
      <span className="inline-flex flex-wrap items-center justify-end gap-2">
        <Tag tone={status === "BASELINE" ? "ok" : "neutral"}>{label}</Tag>
        {testLink}
      </span>
    );
  }
  if (test !== null) {
    return (
      <span className="inline-flex flex-wrap items-center justify-end gap-2" title="Ứng viên này đã có kiểm thử hồi quy, đang chờ Người duyệt">
        <Tag tone="info">Đã chọn</Tag>
        {testLink}
      </span>
    );
  }
  return (
    <button
      type="button"
      disabled={selecting !== null || !canWrite || disabled}
      onClick={() => onSelect(trial.id)}
      className="inline-flex h-8 items-center justify-center whitespace-nowrap rounded-lg bg-vehicsim-primary px-3 text-[12px] font-bold text-white shadow-xs transition hover:bg-vehicsim-primary-hover disabled:opacity-40"
    >
      {selecting === trial.id ? "Đang lưu…" : "Chọn làm ứng viên"}
    </button>
  );
}

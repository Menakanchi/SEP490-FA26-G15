"use client";

import React, { useEffect, useState } from "react";
import { VehicSimPage } from "@/components/VehicSimPage";
import { useVehicSimContext } from "@/components/VehicSimContext";
import { ErrorNote, PillButton } from "@/components/VehicSimUi";
import { vehicsimApi } from "@/services/vehicsim";
import type { AebVersion } from "@/types/vehicsim";
import { CandidateForm } from "@/components/aeb/CandidateForm";
import { useAuth } from "@/context/AuthContext";

export default function AebManualPage() {
  const { ctx, refresh, canWrite } = useVehicSimContext();
  const { user } = useAuth();
  const [versions, setVersions] = useState<AebVersion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: number; label: string } | null>(null);

  const load = () => {
    vehicsimApi
      .aebVersions()
      .then(setVersions)
      .catch((err) => setError(err instanceof Error ? err.message : "Không tải được danh sách phiên bản AEB"));
  };

  useEffect(load, []);

  return (
    <VehicSimPage
      step={4}
      crumbs={[{ label: "Cải tiến AEB", href: "/aeb" }, { label: "Chỉnh tay" }]}
      actions={
        <div className="flex items-center gap-2">
          <PillButton href="/aeb/mobo" variant="dark">
            Danh sách đợt tối ưu
          </PillButton>
        </div>
      }
    >
      <ErrorNote message={error} />

      {created && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-[16px] bg-vehicsim-ok-bg px-4 py-3 text-[13px] text-vehicsim-ok shadow-sm">
          <span>Đã tạo ứng viên AEB {created.label}. Bước tiếp theo: chạy kiểm thử hồi quy so với bản cơ sở.</span>
          <PillButton variant="dark" className="px-4 py-2 text-[12px]" href={`/validation/regression/new?candidate=${created.id}`}>
            Chạy kiểm thử hồi quy
          </PillButton>
        </div>
      )}

      {user && !canWrite ? (
        <div className="rounded-xl border border-solid border-vehicsim-line bg-vehicsim-surface p-6 text-[13px] text-vehicsim-muted">
          Tài khoản của bạn chỉ có quyền xem, không thể chỉnh tay tham số.
        </div>
      ) : error && !versions ? null : !versions || !ctx ? (
        <div role="status" className="rounded-xl border border-solid border-vehicsim-line bg-vehicsim-surface p-6 text-[13px] text-vehicsim-muted">
          Đang tải phiên bản và tham số AEB…
        </div>
      ) : !canWrite ? (
        <div className="rounded-xl border border-solid border-vehicsim-line bg-vehicsim-surface p-6 text-[13px] text-vehicsim-muted">
          Tài khoản này chỉ có quyền xem, không thể tạo ứng viên AEB.
        </div>
      ) : !versions.some((version) => version.status !== "REJECTED") ? (
        <div className="rounded-xl border border-solid border-vehicsim-line bg-vehicsim-surface p-6 text-[13px] text-vehicsim-muted">
          Chưa có phiên bản AEB hợp lệ để làm bản gốc. Hãy kiểm tra danh sách phiên bản trước khi tạo ứng viên.
          <div className="mt-3"><PillButton href="/aeb/versions">Xem phiên bản AEB</PillButton></div>
        </div>
      ) : (
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

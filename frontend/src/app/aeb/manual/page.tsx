"use client";

import React, { useEffect, useState } from "react";
import { VehicSimPage } from "@/components/VehicSimPage";
import { useVehicSimContext } from "@/components/VehicSimContext";
import { ErrorNote, PillButton } from "@/components/VehicSimUi";
import { vehicsimApi } from "@/services/vehicsim";
import type { AebVersion } from "@/types/vehicsim";
import { CandidateForm } from "@/components/aeb/CandidateForm";

export default function AebManualPage() {
  const { ctx, refresh, canWrite } = useVehicSimContext();
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
            Chạy tối ưu tự động MOBO
          </PillButton>
        </div>
      }
    >
      <ErrorNote message={error} />

      {created && (
        <div className="flex items-center justify-between gap-4 rounded-[16px] bg-vehicsim-ok-bg px-4 py-3 text-[13px] text-vehicsim-ok shadow-sm">
          <span>Đã tạo ứng viên AEB {created.label}. Bước tiếp theo: chạy kiểm thử hồi quy so với bản cơ sở.</span>
          <PillButton variant="dark" className="px-4 py-2 text-[12px]" href={`/validation/regression/new?candidate=${created.id}`}>
            Chạy kiểm thử hồi quy
          </PillButton>
        </div>
      )}

      {versions && ctx && canWrite ? (
        <CandidateForm
          versions={versions}
          parameters={ctx.parameters}
          onCreated={async (id, label) => {
            setCreated({ id, label });
            load();
            await refresh();
          }}
        />
      ) : (
        <div className="rounded-xl border border-solid border-vehicsim-line bg-vehicsim-surface p-6 text-[13px] text-vehicsim-muted">
          Bạn chỉ có quyền xem hoặc dữ liệu tham số đang được tải.
        </div>
      )}
    </VehicSimPage>
  );
}

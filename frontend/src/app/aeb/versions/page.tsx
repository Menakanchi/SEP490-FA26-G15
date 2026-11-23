"use client";

import React, { useEffect, useState } from "react";
import { VehicSimPage } from "@/components/VehicSimPage";
import { useVehicSimContext } from "@/components/VehicSimContext";
import { ErrorNote, PillButton } from "@/components/VehicSimUi";
import { vehicsimApi } from "@/services/vehicsim";
import type { AebVersion } from "@/types/vehicsim";
import { VersionTable } from "@/components/aeb/VersionTable";

export default function AebVersionsPage() {
  const { ctx, canWrite } = useVehicSimContext();
  const [versions, setVersions] = useState<AebVersion[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    vehicsimApi
      .aebVersions()
      .then(setVersions)
      .catch((err) => setError(err instanceof Error ? err.message : "Không tải được danh sách phiên bản AEB"));
  }, []);

  const baseline = versions?.find((v) => v.status === "BASELINE") ?? null;
  const catalog = new Map((ctx?.parameters ?? []).map((p) => [p.code, p]));

  return (
    <VehicSimPage
      step={4}
      crumbs={[{ label: "Cải tiến AEB", href: "/aeb" }, { label: "Danh sách phiên bản" }]}
      actions={
        <div className="flex items-center gap-2">
          <PillButton href="/aeb/compare" variant="light">
            So sánh 2 phiên bản
          </PillButton>
          <PillButton href="/aeb/manual" variant="dark">
            + Tạo ứng viên mới
          </PillButton>
        </div>
      }
    >
      <ErrorNote message={error} />

      <VersionTable
        versions={versions}
        catalog={catalog}
        baseline={baseline}
        canWrite={canWrite}
      />
    </VehicSimPage>
  );
}

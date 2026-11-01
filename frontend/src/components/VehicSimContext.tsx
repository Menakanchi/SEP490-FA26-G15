"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { ApiError, setSelectedProjectId } from "@/services/api";
import { vehicsimApi } from "@/services/vehicsim";
import type { VehicSimContextData as Ctx } from "@/types/vehicsim";

interface VehicSimContextValue {
  ctx: Ctx | null;
  error: string | null;
  refresh: () => Promise<void>;
  /** ENGINEER, EXPERIENCER (người tự đăng ký) và ADMIN được tạo / chạy / regression (backend cũng trả 403). */
  canWrite: boolean;
  /** Chỉ REVIEWER được Accept / Reject recommendation (ADR-035). */
  canDecide: boolean;
  isExperiencer: boolean;
  needsProject: boolean;
  projectNotice: string | null;
  clearProjectNotice: () => void;
  openProject: (id: number | null, target?: string) => void;
}

const WRITE_ROLES = ["ADMIN", "ENGINEER", "EXPERIENCER"];
const LOST_PROJECT = ["PROJECT_NOT_FOUND", "PROJECT_NOT_YOURS", "PROJECT_ARCHIVED"];

async function loadContext(): Promise<{ ctx: Ctx; notice: string | null }> {
  try {
    return { ctx: await vehicsimApi.context(), notice: null };
  } catch (err) {
    if (!(err instanceof ApiError) || !LOST_PROJECT.includes(err.code ?? "")) throw err;
    setSelectedProjectId(null);
    return { ctx: await vehicsimApi.context(), notice: err.message };
  }
}

const VehicSimCtx = createContext<VehicSimContextValue>({
  ctx: null,
  error: null,
  refresh: async () => {},
  canWrite: false,
  canDecide: false,
  isExperiencer: false,
  needsProject: false,
  projectNotice: null,
  clearProjectNotice: () => {},
  openProject: () => {},
});

/** Ngữ cảnh chung cho mọi trang VehicSim: project, xe, hệ thống AEB, baseline, các họ kịch bản. */
export function VehicSimContextProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsProject, setNeedsProject] = useState(false);
  const [projectNotice, setProjectNotice] = useState<string | null>(null);
  const latest = useRef(0);
  const { user } = useAuth();
  const isExperiencer = user?.roleCode === "EXPERIENCER";
  const canWrite = WRITE_ROLES.includes(user?.roleCode ?? "");
  const canDecide = user?.roleCode === "REVIEWER";

  const refresh = useCallback(async () => {
    const call = ++latest.current;
    try {
      const loaded = await loadContext();
      if (call !== latest.current) return;
      if (isExperiencer) setSelectedProjectId(loaded.ctx.project.id);
      if (loaded.notice) setProjectNotice(loaded.notice);
      setCtx(loaded.ctx);
      setNeedsProject(false);
      setError(null);
    } catch (err) {
      if (call !== latest.current) return;
      const noProject = err instanceof ApiError && err.code === "NO_PROJECT_OPEN";
      if (noProject) setCtx(null);
      setNeedsProject(noProject);
      setError(noProject ? null : err instanceof Error ? err.message : "Không tải được ngữ cảnh VehicSim");
    }
  }, [isExperiencer]);

  const openProject = useCallback(
    (id: number | null, target?: string) => {
      setSelectedProjectId(id);
      setCtx(null);
      setProjectNotice(null);
      if (target) router.push(target);
      void refresh();
    },
    [refresh, router],
  );

  const clearProjectNotice = useCallback(() => setProjectNotice(null), []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- tải ngữ cảnh một lần khi vào khu VehicSim
    void refresh();
  }, [refresh]);

  return (
    <VehicSimCtx.Provider
      value={{ ctx, error, refresh, canWrite, canDecide, isExperiencer, needsProject, projectNotice, clearProjectNotice, openProject }}
    >
      {children}
    </VehicSimCtx.Provider>
  );
}

export function useVehicSimContext(): VehicSimContextValue {
  return useContext(VehicSimCtx);
}

"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { ApiError, getSelectedProjectId, setSelectedProjectId } from "@/services/api";
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
  choosing: boolean;
  projectNotice: string | null;
  clearProjectNotice: () => void;
  openProject: (id: number | null, target?: string) => void;
}

const WRITE_ROLES = ["ADMIN", "ENGINEER", "EXPERIENCER"];
const LOST_PROJECT = ["PROJECT_NOT_FOUND", "PROJECT_NOT_YOURS", "PROJECT_ARCHIVED", "NO_PROJECT_OPEN"];

const VehicSimCtx = createContext<VehicSimContextValue>({
  ctx: null,
  error: null,
  refresh: async () => {},
  canWrite: false,
  canDecide: false,
  isExperiencer: false,
  choosing: false,
  projectNotice: null,
  clearProjectNotice: () => {},
  openProject: () => {},
});

/** Ngữ cảnh chung cho mọi trang VehicSim: project, xe, hệ thống AEB, baseline, các họ kịch bản. */
export function VehicSimContextProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [projectNotice, setProjectNotice] = useState<string | null>(null);
  const latest = useRef(0);
  const { user } = useAuth();
  const role = user?.roleCode;
  const isExperiencer = role === "EXPERIENCER";
  const canWrite = WRITE_ROLES.includes(user?.roleCode ?? "");
  const canDecide = user?.roleCode === "REVIEWER";

  const refresh = useCallback(async () => {
    const call = ++latest.current;
    if (isExperiencer && !getSelectedProjectId()) {
      setCtx(null);
      setChoosing(true);
      setError(null);
      return;
    }
    try {
      const loaded = await vehicsimApi.context();
      if (call !== latest.current) return;
      setCtx(loaded);
      setChoosing(false);
      setError(null);
    } catch (err) {
      if (call !== latest.current) return;
      if (isExperiencer && err instanceof ApiError && LOST_PROJECT.includes(err.code ?? "")) {
        setSelectedProjectId(null);
        setCtx(null);
        setChoosing(true);
        setProjectNotice(err.message);
        return;
      }
      setError(err instanceof Error ? err.message : "Không tải được ngữ cảnh VehicSim");
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
    if (role) void refresh();
  }, [refresh, role]);

  return (
    <VehicSimCtx.Provider
      value={{ ctx, error, refresh, canWrite, canDecide, isExperiencer, choosing, projectNotice, clearProjectNotice, openProject }}
    >
      {children}
    </VehicSimCtx.Provider>
  );
}

export function useVehicSimContext(): VehicSimContextValue {
  return useContext(VehicSimCtx);
}

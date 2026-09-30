"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { vehicsimApi } from "@/services/vehicsim";
import type { VehicSimContextData as Ctx } from "@/types/vehicsim";

interface VehicSimContextValue {
  ctx: Ctx | null;
  error: string | null;
  refresh: () => Promise<void>;
  /** ENGINEER/ADMIN được tạo và quyết định; VIEWER chỉ xem (backend cũng trả 403). */
  canWrite: boolean;
}

const VehicSimCtx = createContext<VehicSimContextValue>({ ctx: null, error: null, refresh: async () => {}, canWrite: false });

/** Ngữ cảnh chung cho mọi trang VehicSim: project, xe, hệ thống AEB, baseline, các họ kịch bản. */
export function VehicSimContextProvider({ children }: { children: React.ReactNode }) {
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const canWrite = !!user?.roles?.some((r) => r === "ENGINEER" || r === "ADMIN");

  const refresh = useCallback(async () => {
    try {
      setCtx(await vehicsimApi.context());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được ngữ cảnh VehicSim");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- tải ngữ cảnh một lần khi vào khu VehicSim
    void refresh();
  }, [refresh]);

  return <VehicSimCtx.Provider value={{ ctx, error, refresh, canWrite }}>{children}</VehicSimCtx.Provider>;
}

export function useVehicSimContext(): VehicSimContextValue {
  return useContext(VehicSimCtx);
}

"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { vehicsimApi } from "@/services/vehicsim";
import { ApiError, selectReviewerProject } from "@/services/api";
import type { VehicSimContextData as Ctx } from "@/types/vehicsim";
import { useRouter } from "next/navigation";

interface VehicSimContextValue {
  ctx: Ctx | null;
  error: string | null;
  canResetProject: boolean;
  refresh: () => Promise<void>;
  selectProject: (id: number | null) => void;
  /** ENGINEER, EXPERIENCER (người tự đăng ký) và ADMIN được tạo / chạy / regression (backend cũng trả 403). */
  canWrite: boolean;
  /** Quyền chạy regression riêng; Reviewer cần project/workspace ACTIVE trong phạm vi membership. */
  canRunRegression: boolean;
  /** REVIEWER được duyệt khi project và workspace còn ACTIVE; backend kiểm lại trong transaction. */
  canDecide: boolean;
}

const WRITE_ROLES = ["ADMIN", "ENGINEER", "EXPERIENCER"];

const VehicSimCtx = createContext<VehicSimContextValue>({
  ctx: null,
  error: null,
  canResetProject: false,
  refresh: async () => {},
  selectProject: () => {},
  canWrite: false,
  canRunRegression: false,
  canDecide: false,
});

/** Ngữ cảnh chung cho mọi trang VehicSim: project, xe, hệ thống AEB, baseline, các họ kịch bản. */
export function VehicSimContextProvider({ children }: { children: React.ReactNode }) {
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [canResetProject, setCanResetProject] = useState(false);
  const [ready, setReady] = useState(false);
  const requestVersion = useRef(0);
  const router = useRouter();
  const { user } = useAuth();
  const isReviewer = user?.roleCode === "REVIEWER";
  const canWrite = WRITE_ROLES.includes(user?.roleCode ?? "");
  const canDecide = isReviewer && !error && ready && ctx?.reviewer_can_decide === true;
  const canRunRegression = canWrite || canDecide;

  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    try {
      const context = await vehicsimApi.context();
      if (version !== requestVersion.current) return;
      // Chốt đúng ID vừa hiển thị trước khi cho các màn con tải dữ liệu hoặc gửi quyết định.
      if (isReviewer) selectReviewerProject(context.project.id);
      setCtx(context);
      setError(null);
      setCanResetProject(false);
    } catch (err) {
      if (version !== requestVersion.current) return;
      // Giữ lựa chọn cũ khi lỗi: không âm thầm đổi project trong lúc người dùng đang duyệt.
      if (isReviewer) setCtx(null);
      setCanResetProject(false);
      setError(err instanceof Error ? err.message : "Không tải được ngữ cảnh VehicSim");
      if (isReviewer && err instanceof ApiError && err.status === 404) {
        try {
          const available = await vehicsimApi.reviewerProjects();
          if (version === requestVersion.current) setCanResetProject(available.length > 0);
        } catch { /* Không hiện nút chọn lại khi chưa biết còn project có thể chọn. */ }
      }
    } finally {
      if (version === requestVersion.current) setReady(true);
    }
  }, [isReviewer]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- tải ngữ cảnh một lần khi vào khu VehicSim
    void refresh();
  }, [refresh]);

  const selectProject = (id: number | null) => {
    selectReviewerProject(id);
    setCtx(null);
    router.replace("/");
    // Bỏ dữ liệu các màn con; chỉ mount lại khi context mới đã được chốt.
    setReady(false);
    void refresh();
  };

  return (
    <VehicSimCtx.Provider value={{ ctx, error, canResetProject, refresh, selectProject, canWrite, canRunRegression, canDecide }}>
      {ready ? children : <div role="status" className="flex flex-1 items-center justify-center p-8 text-[14px]">Đang tải project…</div>}
    </VehicSimCtx.Provider>
  );
}

export function useVehicSimContext(): VehicSimContextValue {
  return useContext(VehicSimCtx);
}

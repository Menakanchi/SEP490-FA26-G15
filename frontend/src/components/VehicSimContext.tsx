"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { ApiError, getSelectedProjectId, selectReviewerProject, setSelectedProjectId } from "@/services/api";
import { vehicsimApi } from "@/services/vehicsim";
import type { VehicSimContextData as Ctx } from "@/types/vehicsim";

interface VehicSimContextValue {
  ctx: Ctx | null;
  error: string | null;
  canResetProject: boolean;
  refresh: () => Promise<void>;
  /** Reviewer chọn project trong workspace của mình. */
  selectProject: (id: number | null) => void;
  /** ENGINEER, EXPERIENCER (người tự đăng ký) và ADMIN được tạo / chạy / regression (backend cũng trả 403). */
  canWrite: boolean;
  /** Quyền chạy regression riêng; Reviewer cần project/workspace ACTIVE trong phạm vi membership. */
  canRunRegression: boolean;
  /** REVIEWER được duyệt khi project và workspace còn ACTIVE; backend kiểm lại trong transaction. */
  canDecide: boolean;
  isExperiencer: boolean;
  choosing: boolean;
  projectNotice: string | null;
  clearProjectNotice: () => void;
  /** EXPERIENCER mở project cá nhân. */
  openProject: (id: number | null, target?: string) => void;
}

const WRITE_ROLES = ["ADMIN", "ENGINEER", "EXPERIENCER"];
const LOST_PROJECT = ["PROJECT_NOT_FOUND", "PROJECT_NOT_YOURS", "PROJECT_ARCHIVED", "NO_PROJECT_OPEN"];

const VehicSimCtx = createContext<VehicSimContextValue>({
  ctx: null,
  error: null,
  canResetProject: false,
  refresh: async () => {},
  selectProject: () => {},
  canWrite: false,
  canRunRegression: false,
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
  const [canResetProject, setCanResetProject] = useState(false);
  const [ready, setReady] = useState(false);
  const latest = useRef(0);
  const { user } = useAuth();
  const role = user?.roleCode;
  const isExperiencer = role === "EXPERIENCER";
  const isReviewer = role === "REVIEWER";
  const adminPage = usePathname().startsWith("/admin");
  const canWrite = WRITE_ROLES.includes(role ?? "");
  const canDecide = isReviewer && !error && ready && ctx?.reviewer_can_decide === true;
  const canRunRegression = canWrite || canDecide;

  const refresh = useCallback(async () => {
    const call = ++latest.current;
    if (isExperiencer && !getSelectedProjectId()) {
      setCtx(null);
      setChoosing(true);
      setError(null);
      return;
    }
    // Project cá nhân của EXPERIENCER không thuộc phạm vi Reviewer: Reviewer chỉ gửi project đã chốt của mình.
    if (isReviewer) setSelectedProjectId(null);
    try {
      const loaded = await vehicsimApi.context();
      if (call !== latest.current) return;
      // Chốt đúng ID vừa hiển thị trước khi cho các màn con tải dữ liệu hoặc gửi quyết định.
      if (isReviewer) selectReviewerProject(loaded.project.id);
      setCtx(loaded);
      setChoosing(false);
      setError(null);
      setCanResetProject(false);
    } catch (err) {
      if (call !== latest.current) return;
      if (isExperiencer && err instanceof ApiError && LOST_PROJECT.includes(err.code ?? "")) {
        setSelectedProjectId(null);
        setCtx(null);
        setChoosing(true);
        setProjectNotice(err.message);
        return;
      }
      // Giữ lựa chọn cũ khi lỗi: không âm thầm đổi project trong lúc người dùng đang duyệt.
      if (isReviewer) setCtx(null);
      setCanResetProject(false);
      setError(err instanceof Error ? err.message : "Không tải được ngữ cảnh VehicSim");
      if (isReviewer && err instanceof ApiError && err.status === 404) {
        try {
          const available = await vehicsimApi.reviewerProjects();
          if (call === latest.current) setCanResetProject(available.length > 0);
        } catch { /* Không hiện nút chọn lại khi chưa biết còn project có thể chọn. */ }
      }
    } finally {
      if (call === latest.current) setReady(true);
    }
  }, [isExperiencer, isReviewer]);

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

  const selectProject = useCallback(
    (id: number | null) => {
      selectReviewerProject(id);
      setCtx(null);
      router.replace("/");
      // Bỏ dữ liệu các màn con; chỉ mount lại khi context mới đã được chốt.
      setReady(false);
      void refresh();
    },
    [refresh, router],
  );

  const clearProjectNotice = useCallback(() => setProjectNotice(null), []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- tải ngữ cảnh một lần khi vào khu VehicSim
    if (role && !adminPage) void refresh();
  }, [refresh, role, adminPage]);

  // Reviewer chờ project được chốt rồi mới mount màn con; role khác giữ hành vi cũ (màn con tự xử lý ctx = null).
  const waiting = isReviewer && !adminPage && !ready;

  return (
    <VehicSimCtx.Provider
      value={{
        ctx, error, canResetProject, refresh, selectProject, canWrite, canRunRegression, canDecide,
        isExperiencer, choosing, projectNotice, clearProjectNotice, openProject,
      }}
    >
      {waiting ? <div role="status" className="flex flex-1 items-center justify-center p-8 text-[14px]">Đang tải project…</div> : children}
    </VehicSimCtx.Provider>
  );
}

export function useVehicSimContext(): VehicSimContextValue {
  return useContext(VehicSimCtx);
}

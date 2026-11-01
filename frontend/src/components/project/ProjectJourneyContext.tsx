"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useVehicSimContext } from "@/components/VehicSimContext";
import { newlyDone } from "@/components/project/journey";
import { vehicsimApi } from "@/services/vehicsim";
import type { JourneyStepKey, ProjectItem, ProjectJourney } from "@/types/vehicsim";

const POLL_MS = 3000;

interface JourneyState {
  journey: ProjectJourney | null;
  error: string | null;
  refresh: () => Promise<void>;
}

/** Hành trình của một project; thăm dò lại khi còn bước đang chạy. `onLoaded` nhận bản cũ và bản mới. */
export function useProjectJourney(
  projectId: number | null,
  onLoaded?: (before: ProjectJourney | null, after: ProjectJourney) => void,
): JourneyState {
  const [loaded, setLoaded] = useState<ProjectJourney | null>(null);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef<ProjectJourney | null>(null);
  const callback = useRef(onLoaded);

  useEffect(() => {
    callback.current = onLoaded;
  }, [onLoaded]);

  const refresh = useCallback((): Promise<void> => {
    if (projectId === null) return Promise.resolve();
    return vehicsimApi
      .projectJourney(projectId)
      .then((next) => {
        callback.current?.(latest.current, next);
        latest.current = next;
        setLoaded(next);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Không tải được hành trình của project"));
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const journey = loaded && loaded.project_id === projectId ? loaded : null;
  const running = !!journey?.steps.some((s) => s.status === "RUNNING");

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [running, refresh]);

  return { journey, error, refresh };
}

export function useProjectItem(projectId: number) {
  const { ctx } = useVehicSimContext();
  const [project, setProject] = useState<ProjectItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(
    () =>
      vehicsimApi
        .project(projectId)
        .then(setProject)
        .catch((err) => setError(err instanceof Error ? err.message : "Không tải được project")),
    [projectId],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  return { project, error, reload, opened: ctx?.project.id === projectId };
}

interface JourneyContextValue extends JourneyState {
  milestone: JourneyStepKey | null;
  clearMilestone: () => void;
}

const JourneyCtx = createContext<JourneyContextValue>({
  journey: null,
  error: null,
  refresh: async () => {},
  milestone: null,
  clearMilestone: () => {},
});

/** Hành trình của project đang mở, dùng chung cho sidebar, thanh hành trình và trang chủ project. Chỉ tải với EXPERIENCER. */
export function ProjectJourneyProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { ctx, isExperiencer } = useVehicSimContext();
  const [milestone, setMilestone] = useState<JourneyStepKey | null>(null);
  const projectId = isExperiencer && ctx ? ctx.project.id : null;
  const onLoaded = useCallback((before: ProjectJourney | null, after: ProjectJourney) => {
    const done = newlyDone(before, after);
    if (done) setMilestone(done);
  }, []);
  const state = useProjectJourney(projectId, onLoaded);
  const { refresh } = state;

  useEffect(() => {
    void refresh();
  }, [pathname, refresh]);

  const clearMilestone = useCallback(() => setMilestone(null), []);

  return <JourneyCtx.Provider value={{ ...state, milestone, clearMilestone }}>{children}</JourneyCtx.Provider>;
}

export function useJourney(): JourneyContextValue {
  return useContext(JourneyCtx);
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { VehicSimPage } from "@/components/VehicSimPage";
import { useVehicSimContext } from "@/components/VehicSimContext";
import { ErrorNote } from "@/components/VehicSimUi";
import { composeDescription } from "@/components/project/journey";
import { ProjectWizard, type ProjectValues } from "@/components/project/ProjectForms";
import { vehicsimApi } from "@/services/vehicsim";
import { useAuth } from "@/context/AuthContext";
import type { VehicleOption, WorkspaceSummary } from "@/types/vehicsim";

/** Tạo project (M1). Tạo xong mở project đó và sang đầu bước ① Thiết kế kịch bản (M2). */
export default function AddProjectPage() {
  const router = useRouter();
  const { openProject } = useVehicSimContext();
  const { user } = useAuth();
  const engineer = user?.roleCode === "ENGINEER";
  const [vehicles, setVehicles] = useState<VehicleOption[] | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[] | null>(null);
  const [workspaceId, setWorkspaceId] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    vehicsimApi
      .projectVehicles()
      .then(setVehicles)
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Không tải được dữ liệu để tạo project"));
  }, []);

  useEffect(() => {
    if (!engineer) return;
    vehicsimApi.myWorkspaces().then((items) => {
      const active = items.filter((item) => item.status === "ACTIVE");
      setWorkspaces(active);
      if (active.length === 1) setWorkspaceId(String(active[0].id));
    }).catch((err) => setLoadError(err instanceof Error ? err.message : "Không tải được workspace"));
  }, [engineer]);

  const create = async (values: ProjectValues) => {
    setBusy(true);
    setError(null);
    if (engineer && !workspaceId) {
      setError(new Error("Hãy chọn workspace đang hoạt động trước khi tạo project."));
      setBusy(false);
      return;
    }
    try {
      const created = await vehicsimApi.createProject({
        name: values.name.trim(),
        description: composeDescription(values),
        carla_vehicle_model_id: values.vehicleId ?? undefined,
        workspace_id: engineer ? Number(workspaceId) : undefined,
      });
      openProject(created.id, engineer ? "/scenarios" : `/projects/${created.id}/start?created=1`);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <VehicSimPage
      crumbs={[{ label: "Project của tôi", href: "/projects" }, { label: "Tạo project" }]}
      title="Khởi tạo dự án kiểm thử mới"
      subtitle="Thiết lập không gian làm việc, đặt tên dự án và chỉ định mẫu xe áp dụng thuật toán AEB."
      hideMissingProjectError
    >
      <ErrorNote message={loadError} />
      {engineer && workspaces && (
        <div className="rounded-xl border border-vehicsim-line bg-vehicsim-surface p-5">
          <label htmlFor="project-workspace" className="block text-sm font-semibold">Workspace của project</label>
          {workspaces.length ? (
            <select id="project-workspace" value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)}
              className="mt-2 w-full max-w-md rounded-lg border border-vehicsim-line-strong bg-white p-2.5 text-sm">
              <option value="">Chọn workspace</option>
              {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
            </select>
          ) : <p className="mt-2 text-sm">Bạn cần tham gia một workspace đang hoạt động để tạo project. Liên hệ quản lý workspace.</p>}
        </div>
      )}
      {vehicles && (!engineer || workspaces?.length) ? (
        <ProjectWizard
          vehicles={vehicles}
          busy={busy}
          error={error}
          onSubmit={(values) => void create(values)}
          onCancel={() => router.push("/projects")}
        />
      ) : (
        !loadError && (!vehicles || (engineer && !workspaces)) && (
          <div className="flex justify-center py-16">
            <Loader2 aria-label="Đang tải" className="size-6 animate-spin text-vehicsim-muted" />
          </div>
        )
      )}
    </VehicSimPage>
  );
}

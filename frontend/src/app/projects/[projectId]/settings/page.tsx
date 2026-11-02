"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { VehicSimPage } from "@/components/VehicSimPage";
import { useVehicSimContext } from "@/components/VehicSimContext";
import { Card, ErrorNote } from "@/components/VehicSimUi";
import { composeDescription, splitDescription } from "@/components/project/journey";
import { ProjectSettingsForm, type ProjectValues } from "@/components/project/ProjectForms";
import { useProjectActions, type ProjectAction } from "@/components/project/ProjectUi";
import { vehicsimApi } from "@/services/vehicsim";
import type { ProjectItem, VehicleOption } from "@/types/vehicsim";

export default function ProjectSettingsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const id = Number(projectId);
  const router = useRouter();
  const { ctx, refresh } = useVehicSimContext();
  const [loaded, setLoaded] = useState<{ project: ProjectItem; vehicles: VehicleOption[] } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(
    () =>
      Promise.all([vehicsimApi.project(id), vehicsimApi.projectVehicles()])
        .then(([project, vehicles]) => setLoaded({ project, vehicles }))
        .catch((err) => setLoadError(err instanceof Error ? err.message : "Không tải được project")),
    [id],
  );
  const actions = useProjectActions(
    useCallback((kind: ProjectAction) => (kind === "delete" ? router.push("/projects") : load()), [load, router]),
  );

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (values: ProjectValues) => {
    setBusy(true);
    setError(null);
    try {
      await vehicsimApi.updateProject(id, {
        name: values.name.trim(),
        description: composeDescription(values),
        carla_vehicle_model_id: values.vehicleId ?? undefined,
      });
      if (ctx?.project.id === id) await refresh();
      router.push(`/projects/${id}`);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  const project = loaded?.project;
  const active = project?.status === "ACTIVE";
  const busyReason = project?.has_running_work ? "Còn việc đang chạy trong project. Đợi xong hoặc huỷ trước." : undefined;

  return (
    <VehicSimPage
      crumbs={[
        { label: "Project của tôi", href: "/projects" },
        { label: project?.name ?? "…", href: `/projects/${id}` },
        { label: "Cài đặt" },
      ]}
      title="Cài đặt project"
      subtitle="Đổi tên, mục tiêu thử nghiệm, ghi chú hoặc xe của project."
    >
      <ErrorNote message={loadError} />
      {actions.view}
      {loaded && project && (
        <>
          <ProjectSettingsForm
            initial={{ name: project.name, ...splitDescription(project.description), vehicleId: project.vehicle_id }}
            vehicles={loaded.vehicles}
            vehicleLocked={project.run_count > 0 ? `Đã có ${project.run_count} lượt chạy với ${project.vehicle_name} nên không đổi được xe.` : null}
            busy={busy}
            error={error}
            onSubmit={(values) => void save(values)}
            onCancel={() => router.push(`/projects/${id}`)}
          />
          <Card className="flex w-full max-w-[880px] flex-col gap-4 p-7">
            <h2 className="text-[17px] font-bold text-vehicsim-danger">Vùng nguy hiểm</h2>
            <DangerRow
              title={active ? "Lưu trữ project" : "Bỏ lưu trữ project"}
              detail={active ? "Project lưu trữ chuyển sang tab Lưu trữ và không mở để làm việc được cho tới khi bỏ lưu trữ." : "Mở lại project để tiếp tục hành trình."}
              action={active ? "Lưu trữ" : "Bỏ lưu trữ"}
              disabled={active ? busyReason : undefined}
              onClick={() => actions.start(active ? "archive" : "unarchive", project)}
            />
            <DangerRow
              title="Xoá vĩnh viễn"
              detail="Xoá project cùng mọi kịch bản, lượt chạy, ứng viên và kết quả kiểm chứng. Không hoàn tác được."
              action="Xoá vĩnh viễn"
              disabled={busyReason}
              onClick={() => actions.start("delete", project)}
            />
          </Card>
        </>
      )}
    </VehicSimPage>
  );
}

function DangerRow({ title, detail, action, disabled, onClick }: { title: string; detail: string; action: string; disabled?: string; onClick: () => void }) {
  return (
    <div className="flex items-center justify-between gap-6 border-t border-solid border-vehicsim-line pt-4">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-[15px] font-semibold text-vehicsim-ink">{title}</span>
        <span className="text-[14px] leading-[1.5] text-vehicsim-muted">{disabled ?? detail}</span>
      </div>
      <button
        type="button"
        onClick={onClick}
        disabled={!!disabled}
        title={disabled}
        className="shrink-0 rounded-full border border-solid border-vehicsim-danger/40 px-5 py-3 text-[13px] font-semibold text-vehicsim-danger hover:bg-vehicsim-danger-bg disabled:cursor-not-allowed disabled:opacity-50"
      >
        {action}
      </button>
    </div>
  );
}

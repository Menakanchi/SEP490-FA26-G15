"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { VehicSimPage } from "@/components/VehicSimPage";
import { useVehicSimContext } from "@/components/VehicSimContext";
import { ErrorNote } from "@/components/VehicSimUi";
import { composeDescription, splitDescription } from "@/components/project/journey";
import { ProjectSettingsForm, type ProjectValues } from "@/components/project/ProjectForms";
import { vehicsimApi } from "@/services/vehicsim";
import type { ProjectItem, VehicleOption } from "@/types/vehicsim";

/** Cài đặt project (M8): tên, mục tiêu, ghi chú và xe (xe khoá khi đã có lượt chạy). */
export default function EditProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const id = Number(projectId);
  const router = useRouter();
  const { ctx, refresh } = useVehicSimContext();
  const [loaded, setLoaded] = useState<{ project: ProjectItem; vehicles: VehicleOption[] } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    Promise.all([vehicsimApi.project(id), vehicsimApi.projectVehicles()])
      .then(([project, vehicles]) => setLoaded({ project, vehicles }))
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Không tải được project"));
  }, [id]);

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
      {loaded && project && (
        <ProjectSettingsForm
          initial={{ name: project.name, ...splitDescription(project.description), vehicleId: project.vehicle_id }}
          vehicles={loaded.vehicles}
          vehicleLocked={project.run_count > 0 ? `Đã có ${project.run_count} lượt chạy với ${project.vehicle_name} nên không đổi được xe.` : null}
          busy={busy}
          error={error}
          onSubmit={(values) => void save(values)}
          onCancel={() => router.push(`/projects/${id}`)}
        />
      )}
    </VehicSimPage>
  );
}

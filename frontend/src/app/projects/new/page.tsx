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
import type { VehicleOption } from "@/types/vehicsim";

/** Tạo project (M1). Tạo xong mở project đó và sang đầu bước ① Thiết kế kịch bản (M2). */
export default function AddProjectPage() {
  const router = useRouter();
  const { openProject } = useVehicSimContext();
  const [vehicles, setVehicles] = useState<VehicleOption[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    vehicsimApi
      .projectVehicles()
      .then(setVehicles)
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Không tải được dữ liệu để tạo project"));
  }, []);

  const create = async (values: ProjectValues) => {
    setBusy(true);
    setError(null);
    try {
      const created = await vehicsimApi.createProject({
        name: values.name.trim(),
        description: composeDescription(values),
        carla_vehicle_model_id: values.vehicleId ?? undefined,
      });
      openProject(created.id, `/projects/${created.id}/start?created=1`);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <VehicSimPage
      crumbs={[{ label: "Project của tôi", href: "/projects" }, { label: "Tạo project" }]}
      title="Tạo project"
      subtitle="Khai báo project này để thử điều gì và dùng xe nào. Tạo xong bạn sẽ thiết kế kịch bản đầu tiên."
    >
      <ErrorNote message={loadError} />
      {vehicles ? (
        <ProjectWizard
          vehicles={vehicles}
          busy={busy}
          error={error}
          onSubmit={(values) => void create(values)}
          onCancel={() => router.push("/projects")}
        />
      ) : (
        !loadError && (
          <div className="flex justify-center py-16">
            <Loader2 aria-label="Đang tải" className="size-6 animate-spin text-vehicsim-muted" />
          </div>
        )
      )}
    </VehicSimPage>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { VehicSimPage } from "@/components/VehicSimPage";
import { useVehicSimContext } from "@/components/VehicSimContext";
import { ErrorNote, PillButton, Tag, cx, fmt } from "@/components/VehicSimUi";
import { composeDescription, splitDescription } from "@/components/project/journey";
import { ProjectSettingsForm, SettingsSection, type ProjectValues } from "@/components/project/ProjectForms";
import { ProjectAvatar, useProjectActions, type ProjectAction } from "@/components/project/ProjectUi";
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
      subtitle="Đổi tên, mục tiêu, ghi chú hoặc xe của project. Lưu trữ và xoá nằm ở cuối trang."
    >
      <div className="flex w-full max-w-[1040px] flex-col gap-5">
        <ErrorNote message={loadError} />
        {actions.view}
        {!loaded && !loadError && (
          <div className="flex justify-center py-16">
            <Loader2 aria-label="Đang tải cài đặt project" className="size-6 animate-spin text-vehicsim-muted" />
          </div>
        )}
        {loaded && project && (
          <>
            <ProjectSummary project={project} />
            <ProjectSettingsForm
              initial={{ name: project.name, ...splitDescription(project.description), vehicleId: project.vehicle_id }}
              vehicles={loaded.vehicles}
              vehicleLocked={project.run_count > 0 ? `Đã có ${project.run_count} lượt chạy với ${project.vehicle_name} nên không đổi được xe.` : null}
              busy={busy}
              error={error}
              onSubmit={(values) => void save(values)}
              onCancel={() => router.push(`/projects/${id}`)}
            />
            <SettingsSection
              tone="danger"
              title="Vùng nguy hiểm"
              description="Các thao tác áp dụng cho cả project. Lưu trữ đảo ngược được; xoá vĩnh viễn thì không."
            >
              <div className="flex flex-col divide-y divide-solid divide-vehicsim-line rounded-[14px] border border-solid border-vehicsim-line">
                <DangerRow
                  title={active ? "Lưu trữ project" : "Bỏ lưu trữ project"}
                  detail={active ? "Project chuyển sang mục Lưu trữ và không mở để làm việc được cho tới khi bỏ lưu trữ." : "Mở lại project để tiếp tục hành trình."}
                  action={active ? "Lưu trữ" : "Bỏ lưu trữ"}
                  disabled={active ? busyReason : undefined}
                  onClick={() => actions.start(active ? "archive" : "unarchive", project)}
                />
                <DangerRow
                  destructive
                  title="Xoá vĩnh viễn"
                  detail="Xoá project cùng mọi kịch bản, lượt chạy, ứng viên và kết quả kiểm chứng. Không hoàn tác được."
                  action="Xoá vĩnh viễn"
                  disabled={busyReason}
                  onClick={() => actions.start("delete", project)}
                />
              </div>
            </SettingsSection>
          </>
        )}
      </div>
    </VehicSimPage>
  );
}

/** Đầu trang: project đang chỉnh là project nào, trạng thái và quy mô dữ liệu (quyết định xe còn đổi được không). */
function ProjectSummary({ project }: { project: ProjectItem }) {
  const stats = [
    { label: "họ kịch bản", value: project.family_count },
    { label: "lượt chạy", value: project.run_count },
    { label: "kiểm thử", value: project.regression_count },
  ];
  return (
    <section aria-label="Tóm tắt project" className="flex flex-wrap items-center gap-x-8 gap-y-4 rounded-[20px] border border-solid border-vehicsim-line bg-white p-6 shadow-vehicsim-card">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <ProjectAvatar id={project.id} name={project.name} size="lg" />
        <div className="flex min-w-0 flex-col gap-[6px]">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span title={project.name} className="line-clamp-2 break-words text-[18px] font-bold leading-[1.3] text-vehicsim-ink">
              {project.name}
            </span>
            {project.status === "ACTIVE" ? <Tag tone="ok">Đang hoạt động</Tag> : <Tag>Lưu trữ</Tag>}
            {project.has_running_work && <Tag tone="warn">Đang chạy</Tag>}
          </div>
          <span className="text-[13px] text-vehicsim-muted">
            {project.vehicle_name ?? "Chưa chọn xe"} · tạo ngày {fmt.date(project.created_date)}
          </span>
        </div>
      </div>
      <dl className="flex items-center gap-6">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col-reverse gap-[2px]">
            <dt className="text-[12px] text-vehicsim-muted">{s.label}</dt>
            <dd className="text-[20px] font-extrabold leading-[1.1] tabular-nums text-vehicsim-ink">{s.value}</dd>
          </div>
        ))}
      </dl>
      <PillButton href={`/projects/${project.id}`}>
        Trang chủ project <ArrowRight aria-hidden className="size-4" />
      </PillButton>
    </section>
  );
}

function DangerRow({
  title,
  detail,
  action,
  disabled,
  destructive,
  onClick,
}: {
  title: string;
  detail: string;
  action: string;
  disabled?: string;
  destructive?: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 p-4">
      <div className="flex min-w-0 flex-1 basis-[280px] flex-col gap-1">
        <span className="text-[15px] font-semibold text-vehicsim-ink">{title}</span>
        <span className="text-[14px] leading-[1.5] text-vehicsim-muted">{detail}</span>
        {disabled && <span className="text-[13px] font-medium text-vehicsim-warn">{disabled}</span>}
      </div>
      <button
        type="button"
        onClick={onClick}
        disabled={!!disabled}
        className={cx(
          "shrink-0 rounded-full border border-solid px-5 py-3 text-[13px] font-semibold transition-[background-color] duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-50",
          destructive
            ? "border-vehicsim-danger/40 text-vehicsim-danger hover:bg-vehicsim-danger-bg"
            : "border-vehicsim-line-strong text-vehicsim-ink hover:bg-vehicsim-soft",
        )}
      >
        {action}
      </button>
    </div>
  );
}

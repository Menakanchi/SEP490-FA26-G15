"use client";

import React, { useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { VehicSimPage } from "@/components/VehicSimPage";
import { useVehicSimContext } from "@/components/VehicSimContext";
import { Card, ErrorNote, PillButton, Tag, fmt } from "@/components/VehicSimUi";
import { splitDescription, timeAgo } from "@/components/project/journey";
import { JourneyTimeline, NextStepCard } from "@/components/project/ProjectHome";
import { useJourney, useProjectItem, useProjectJourney } from "@/components/project/ProjectJourneyContext";
import { ProjectAvatar, ProjectMenu, useProjectActions, type ProjectAction } from "@/components/project/ProjectUi";

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-6 border-b border-solid border-vehicsim-line py-3 text-[14px] last:border-b-0">
      <span className="text-vehicsim-muted">{label}</span>
      <span className="text-right font-semibold text-vehicsim-ink">{children}</span>
    </div>
  );
}

/** Trang chủ project (M3): bước tiếp theo, hành trình 5 bước và thông tin project. Là nơi quay về từ mọi màn. */
export default function ViewProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const id = Number(projectId);
  const router = useRouter();
  const { openProject, isExperiencer } = useVehicSimContext();
  const { project, opened, error, reload } = useProjectItem(id);
  const shared = useJourney();
  const own = useProjectJourney(opened ? null : id);
  const journey = opened ? shared.journey : own.journey;
  const journeyError = opened ? shared.error : own.error;
  const actions = useProjectActions(
    useCallback((kind: ProjectAction) => (kind === "delete" ? router.push("/projects") : reload()), [reload, router]),
  );

  const active = project?.status === "ACTIVE";
  const workable = active && isExperiencer;
  const brief = splitDescription(project?.description);
  const go = (href: string) => (opened ? router.push(href) : openProject(id, href));

  return (
    <VehicSimPage
      crumbs={[{ label: "Project của tôi", href: "/projects" }, { label: project?.name ?? "…" }]}
      title={
        project ? (
          <span className="flex items-center gap-4">
            <ProjectAvatar id={project.id} name={project.name} size="lg" />
            {project.name}
          </span>
        ) : (
          "Project"
        )
      }
      badges={
        project && (
          <>
            <Tag tone={active ? "ok" : "neutral"}>{active ? "Đang hoạt động" : "Lưu trữ"}</Tag>
            {opened && <Tag tone="info">Đang mở</Tag>}
          </>
        )
      }
      subtitle={project ? (brief.goal ? `Mục tiêu: ${brief.goal}` : "Chưa ghi mục tiêu thử nghiệm — thêm trong Cài đặt project.") : undefined}
      actions={
        project && (
          <>
            {workable && !opened && (
              <PillButton variant="dark" onClick={() => openProject(project.id, `/projects/${project.id}`)}>
                Mở project
              </PillButton>
            )}
            {isExperiencer && <ProjectMenu project={project} onAction={(kind) => actions.start(kind, project)} />}
          </>
        )
      }
    >
      <ErrorNote message={error ?? journeyError} />
      {actions.view}

      {project && !isExperiencer && (
        <Card className="p-5">
          <p className="text-[14px] leading-[1.55] text-vehicsim-muted">Tài khoản đã đổi role nên project cá nhân chỉ xem được, không mở để làm việc.</p>
        </Card>
      )}

      {project && isExperiencer && !active && (
        <Card className="flex items-center justify-between gap-4 p-5">
          <p className="text-[14px] leading-[1.55] text-vehicsim-muted">
            Project đang lưu trữ nên không mở để làm việc được. Bỏ lưu trữ để tiếp tục hành trình.
          </p>
          <PillButton variant="dark" onClick={() => actions.start("unarchive", project)}>
            Bỏ lưu trữ
          </PillButton>
        </Card>
      )}

      {project && journey ? (
        <>
          {workable && <NextStepCard journey={journey} opened={opened} onGo={go} />}
          <div className="flex w-full items-start gap-5">
            <JourneyTimeline
              journey={journey}
              onGo={go}
              disabled={!isExperiencer ? "Chỉ xem: tài khoản không còn là Experiencer" : active ? undefined : "Bỏ lưu trữ để mở các bước"}
            />
            <Card className="flex w-[340px] shrink-0 flex-col gap-2 p-6">
              <h2 className="text-[17px] font-bold text-vehicsim-ink">Thông tin</h2>
              <div className="flex flex-col">
                <InfoRow label="Phương tiện">{project.vehicle_name ?? "—"}</InfoRow>
                <InfoRow label="Cấu hình AEB gốc">{journey.baseline_label ?? project.baseline_label ?? "—"}</InfoRow>
                <InfoRow label="Hoạt động gần nhất">{timeAgo(journey.last_activity_at)}</InfoRow>
                <InfoRow label="Ngày tạo">{fmt.date(project.created_date)}</InfoRow>
              </div>
              {brief.note && (
                <div className="flex flex-col gap-1 pt-2">
                  <span className="text-[14px] text-vehicsim-muted">Ghi chú</span>
                  <p className="whitespace-pre-line text-[14px] leading-[1.55] text-vehicsim-ink">{brief.note}</p>
                </div>
              )}
            </Card>
          </div>
        </>
      ) : (
        !error && (
          <div className="flex justify-center py-16">
            <Loader2 aria-label="Đang tải hành trình" className="size-6 animate-spin text-vehicsim-muted" />
          </div>
        )
      )}
    </VehicSimPage>
  );
}

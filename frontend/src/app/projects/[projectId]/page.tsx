"use client";

import React, { useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { VehicSimPage } from "@/components/VehicSimPage";
import { useVehicSimContext } from "@/components/VehicSimContext";
import { Card, CardTitle, ErrorNote, PillButton, Tag, fmt } from "@/components/VehicSimUi";
import { splitDescription, timeAgo } from "@/components/project/journey";
import { JourneyTimeline, NextStepCard } from "@/components/project/ProjectHome";
import { useJourney, useProjectItem, useProjectJourney } from "@/components/project/ProjectJourneyContext";
import { ProjectMenu, useProjectActions, type ProjectAction } from "@/components/project/ProjectUi";

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
      title={project?.name ?? "Dự án"}
      badges={
        project && (
          <>
            {!active && <Tag>Lưu trữ</Tag>}
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
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-4">
            <Card className="flex flex-col gap-4 p-5">
              <CardTitle aside={<Link href={`/projects/${id}/results`} className="text-right text-[13px] font-semibold text-vehicsim-primary hover:underline">Xem kết quả</Link>}>
                Kết quả bản cơ sở
              </CardTitle>
              {journey.counts.baseline_completed > 0 ? (
                <dl className="grid grid-cols-2 gap-4 border-t border-vehicsim-line pt-4 sm:grid-cols-4">
                  {[
                    { label: "An toàn", value: journey.counts.safe },
                    { label: "Suýt va chạm", value: journey.counts.near_misses },
                    { label: "Va chạm", value: journey.counts.collisions },
                    { label: "Phanh oan", value: journey.counts.false_activations },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex flex-col gap-1">
                      <dt className="text-[13px] text-vehicsim-muted">{label}</dt>
                      <dd className="text-2xl font-bold tabular-nums">{value}</dd>
                    </div>
                  ))}
                </dl>
              ) : <p className="text-sm text-vehicsim-muted">Chưa có lượt chạy bản cơ sở hoàn thành.</p>}
            </Card>
            <Card className="flex w-full flex-col gap-2 p-5">
              <CardTitle>Thông tin dự án</CardTitle>
              <div className="flex flex-col">
                <InfoRow label="Phương tiện">{project.vehicle_name ?? "—"}</InfoRow>
                <InfoRow label="Cấu hình AEB gốc">{journey.baseline_label ?? project.baseline_label ?? "—"}</InfoRow>
                <InfoRow label="Hoạt động gần nhất">{timeAgo(journey.last_activity_at)}</InfoRow>
                <InfoRow label="Ngày tạo">{fmt.date(project.created_date)}</InfoRow>
              </div>
              {brief.note && (
                <div className="flex flex-col gap-1 pt-2">
                  <span className="text-sm text-vehicsim-muted">Ghi chú</span>
                  <p className="whitespace-pre-line text-sm leading-relaxed text-vehicsim-ink">{brief.note}</p>
                </div>
              )}
            </Card>
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            <JourneyTimeline
              journey={journey}
              onGo={go}
              showNextAction={workable}
              disabled={!isExperiencer ? "Chỉ xem: tài khoản không còn là Experiencer" : active ? undefined : "Bỏ lưu trữ để mở các bước"}
            />
            {workable && <NextStepCard journey={journey} opened={opened} onGo={go} />}
          </div>
        </div>
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

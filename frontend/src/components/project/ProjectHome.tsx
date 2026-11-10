"use client";

import Link from "next/link";
import { Card, PillButton, Tag, cx } from "@/components/VehicSimUi";
import { JOURNEY_STEPS, STEP_NUMBER, nextAction, splitDescription, stepDefinition, stepHref, stepSummary, statusOf, timeAgo } from "@/components/project/journey";
import { ProjectAvatar, ProjectMenu, StepStatusIcon, type ProjectAction } from "@/components/project/ProjectUi";
import type { ReactNode } from "react";
import type { JourneyStatus, JourneyStepKey, ProjectItem, ProjectJourney } from "@/types/vehicsim";

/* Khối hiển thị project: thẻ project trong "Project của tôi", thẻ gợi ý tiếp theo và dòng thời gian 5 bước của trang chủ project. */

/** Thẻ một project: mục tiêu, tiến độ 5 bước và nút đi tiếp đúng bước đang dở. */
export function ProjectCard({
  project,
  opened,
  readOnly,
  onContinue,
  onAction,
}: {
  project: ProjectItem;
  opened: boolean;
  readOnly?: boolean;
  onContinue: (href: string) => void;
  onAction: (kind: ProjectAction) => void;
}) {
  const journey = project.journey;
  const active = project.status === "ACTIVE";
  const next = nextAction(journey);
  const goal = splitDescription(project.description).goal;

  return (
    <Card className={cx("flex flex-col gap-4 p-5", opened && "ring-2 ring-vehicsim-decision/40")}>
      <div className="flex items-start gap-3">
        <ProjectAvatar name={project.name} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Link href={`/projects/${project.id}`} className="truncate text-[16px] font-bold text-vehicsim-ink hover:underline">
            {project.name}
          </Link>
          <span className="flex flex-wrap items-center gap-2 text-[13px] text-vehicsim-muted">
            {project.vehicle_name ?? "Chưa chọn xe"}
            {opened && <Tag tone="info">Đang mở</Tag>}
            {project.has_running_work && <Tag tone="warn">Đang chạy</Tag>}
          </span>
        </div>
        {!readOnly && <ProjectMenu project={project} onAction={onAction} />}
      </div>

      <p className="line-clamp-2 min-h-[42px] text-[14px] leading-[1.5] text-vehicsim-muted">{goal || "Chưa ghi mục tiêu thử nghiệm."}</p>

      <div className="flex flex-col gap-1">
        <span className="text-[13px] font-semibold text-vehicsim-ink">
          {next.key ? `Gợi ý: ${STEP_NUMBER[stepDefinition(next.key).n - 1]} ${stepDefinition(next.key).title}` : "Đã có kết quả kiểm chứng"} · vòng {journey.round}
        </span>
        <span className="truncate text-[13px] text-vehicsim-muted">
          {next.key ? stepSummary(next.key, journey) : stepSummary("VERIFY", journey)} · {timeAgo(journey.last_activity_at)}
        </span>
      </div>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-solid border-vehicsim-line pt-4">
        {readOnly ? (
          <span className="text-[13px] font-semibold text-vehicsim-muted">Chỉ xem</span>
        ) : active ? (
          <button
            type="button"
            onClick={() => onContinue(next.href)}
            className="flex min-h-11 items-center gap-2 rounded-lg bg-vehicsim-primary px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-vehicsim-primary-hover"
          >
            {next.key ? `Tiếp tục: ${next.cta}` : next.cta}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onAction("unarchive")}
            className="rounded-full border border-solid border-vehicsim-line-strong px-4 py-[10px] text-[13px] font-semibold text-vehicsim-ink hover:bg-vehicsim-soft disabled:cursor-not-allowed disabled:opacity-50"
          >
            Bỏ lưu trữ
          </button>
        )}
        <Link href={`/projects/${project.id}`} className="text-[13px] font-semibold text-vehicsim-muted hover:text-vehicsim-ink hover:underline">
          Trang chủ project
        </Link>
      </div>
    </Card>
  );
}

type NextAction = { label: string } & ({ href: string; onClick?: never } | { href?: never; onClick: () => void });

export function NextActionCard({ title, detail, action, children }: {
  title: string;
  detail: string;
  action: NextAction;
  children?: ReactNode;
}) {
  return (
    <section aria-labelledby="next-step-title" className="flex w-full flex-col items-start gap-4 rounded-xl border border-vehicsim-line bg-vehicsim-primary-bg p-5">
      <div className="flex w-full min-w-0 flex-col gap-2">
        <h2 id="next-step-title" className="text-[17px] font-bold text-vehicsim-ink">{title}</h2>
        <p className="max-w-[640px] text-sm leading-relaxed text-vehicsim-muted">{detail}</p>
        {children}
      </div>
      <PillButton variant="dark" href={action.href} onClick={action.onClick} className="max-w-full">
        <span className="whitespace-normal">{action.label}</span>
      </PillButton>
    </section>
  );
}

/** Thẻ nổi nhất của trang chủ project: đúng một việc nên làm tiếp, kèm tiến độ khi baseline đang chạy. */
export function NextStepCard({ journey, opened, onGo }: { journey: ProjectJourney; opened: boolean; onGo: (href: string) => void }) {
  const action = nextAction(journey);
  const c = journey.counts;
  const running = action.key === "BASELINE" && statusOf(journey, "BASELINE") === "RUNNING" && c.variants > 0;
  const progress = running ? Math.round((c.baseline_completed / c.variants) * 100) : null;
  const pending = action.key !== "BASELINE" && c.families_baseline_pending > 0;

  return (
    <NextActionCard
      title={action.key ? stepDefinition(action.key).title : action.title}
      detail={action.detail}
      action={{ label: opened ? action.cta : "Mở project và tiếp tục", onClick: () => onGo(action.href) }}
    >
        {progress !== null && (
          <div className="mt-2 flex max-w-[480px] items-center gap-3">
            <div
              role="progressbar"
              aria-label="Tiến độ chạy baseline"
              aria-valuenow={c.baseline_completed}
              aria-valuemin={0}
              aria-valuemax={c.variants}
              className="h-2 flex-1 overflow-hidden rounded-full bg-vehicsim-line-strong"
            >
              <div className="h-full rounded-full bg-vehicsim-primary motion-safe:transition-[width] motion-safe:duration-500" style={{ width: `${progress}%` }} />
            </div>
            <span className="text-[13px] font-semibold tabular-nums">
              {c.baseline_completed}/{c.variants}
            </span>
          </div>
        )}
        {pending && (
          <button type="button" onClick={() => onGo("/scenarios")} className="mt-1 w-fit text-sm font-semibold text-vehicsim-primary underline-offset-4 hover:underline">
            {c.families_baseline_pending} họ kịch bản mới chưa chạy baseline · Chạy ngay
          </button>
        )}
    </NextActionCard>
  );
}

/** Năm bước của vòng hiện tại theo thứ tự: trạng thái thật, số liệu và lối vào từng bước. */
export function JourneyTimeline({ journey, onGo, disabled, showNextAction }: { journey: ProjectJourney; onGo: (href: string) => void; disabled?: string; showNextAction?: boolean }) {
  const rows = JOURNEY_STEPS.map((step) => {
    const status = statusOf(journey, step.key);
    const current = journey.next === step.key;
    return {
      key: step.key,
      status,
      current,
      summary: stepSummary(step.key, journey),
      action: current && showNextAction ? null : (
        <button type="button" disabled={!!disabled} title={disabled} aria-label={`Mở bước ${step.title.toLowerCase()}`}
          onClick={() => onGo(stepHref(step.key, journey))}
          className="min-h-11 text-[13px] font-semibold text-vehicsim-primary hover:underline disabled:cursor-not-allowed disabled:text-vehicsim-faint">
          {status === "RUNNING" ? "Xem tiến độ" : current ? "Làm bước này" : "Mở"}
        </button>
      ),
    };
  });

  return <JourneyList title={`Quy trình kiểm thử · vòng ${journey.round}`} rows={rows} />;
}

type JourneyRow = { key: JourneyStepKey; status: JourneyStatus; current: boolean; summary: string; action: ReactNode };

export function JourneyList({ title, rows }: { title: string; rows: JourneyRow[] }) {
  return (
    <Card className="flex min-w-0 flex-1 flex-col gap-3 p-5">
      <h2 className="text-[17px] font-bold text-vehicsim-ink">{title}</h2>
      <ol className="divide-y divide-vehicsim-line">
        {rows.map((row) => {
          const step = stepDefinition(row.key);
          return (
            <li key={step.key} aria-current={row.current ? "step" : undefined} className="flex gap-3 py-3 first:pt-0 last:pb-0">
              <StepStatusIcon status={row.status} n={step.n} current={row.current} size="sm" />
              <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <div className="flex min-w-0 flex-1 basis-40 flex-col gap-1">
                  <span className={cx("text-sm font-bold", row.current ? "text-vehicsim-primary" : "text-vehicsim-ink")}>{step.title}</span>
                  <span className={cx("break-words text-[13px]", row.status === "FAILED" ? "text-vehicsim-danger" : "text-vehicsim-muted")}>
                    {row.summary}
                  </span>
                </div>
                {row.action && <div className="flex flex-wrap items-center gap-x-3 gap-y-1">{row.action}</div>}
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

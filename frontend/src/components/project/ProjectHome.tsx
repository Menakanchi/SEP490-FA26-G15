"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
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
        <ProjectAvatar id={project.id} name={project.name} />
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
            className="flex items-center gap-2 rounded-full bg-vehicsim-ink px-4 py-[10px] text-[13px] font-semibold text-white hover:bg-black/80"
          >
            {next.key ? `Tiếp tục: ${next.cta}` : next.cta}
            <ArrowRight aria-hidden className="size-4" />
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

export function NextActionCard({ eyebrow, title, detail, action, children }: {
  eyebrow: string;
  title: string;
  detail: string;
  action: NextAction;
  children?: ReactNode;
}) {
  return (
    <section aria-labelledby="next-step-title" className="flex w-full flex-col items-start gap-5 rounded-[24px] bg-vehicsim-ink p-5 text-white shadow-vehicsim-card lg:flex-row lg:items-center lg:gap-8 lg:p-7">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="text-[12px] font-bold uppercase tracking-[0.8px] text-white/70">{eyebrow}</span>
        <h2 id="next-step-title" className="text-[26px] font-extrabold leading-[1.2] tracking-[-0.5px]">{title}</h2>
        <p className="max-w-[640px] text-[15px] leading-[1.55] text-white/85">{detail}</p>
        {children}
      </div>
      <PillButton href={action.href} onClick={action.onClick} className="max-w-full shrink-0">
        <span className="whitespace-normal">{action.label}</span>
        <ArrowRight aria-hidden className="size-4 shrink-0" />
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
      eyebrow={`Gợi ý tiếp theo · vòng ${journey.round}`}
      title={action.title}
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
              className="h-2 flex-1 overflow-hidden rounded-full bg-white/20"
            >
              <div className="h-full rounded-full bg-white transition-[width] duration-500" style={{ width: `${progress}%` }} />
            </div>
            <span className="text-[13px] font-semibold tabular-nums">
              {c.baseline_completed}/{c.variants}
            </span>
          </div>
        )}
        {pending && (
          <button type="button" onClick={() => onGo("/scenarios")} className="mt-1 w-fit text-[14px] font-semibold text-white underline-offset-4 hover:underline">
            {c.families_baseline_pending} họ kịch bản mới chưa chạy baseline · Chạy ngay →
          </button>
        )}
    </NextActionCard>
  );
}

/** Năm bước của vòng hiện tại theo thứ tự: trạng thái thật, số liệu và lối vào từng bước. */
export function JourneyTimeline({ journey, onGo, disabled }: { journey: ProjectJourney; onGo: (href: string) => void; disabled?: string }) {
  const rows = JOURNEY_STEPS.map((step) => {
    const status = statusOf(journey, step.key);
    const current = journey.next === step.key;
    return {
      key: step.key,
      status,
      current,
      summary: stepSummary(step.key, journey),
      action: (
        <PillButton variant={current ? "dark" : "light"} disabled={!!disabled} title={disabled}
          onClick={() => onGo(stepHref(step.key, journey))} className="shrink-0 px-4 py-2">
          {status === "RUNNING" ? "Xem tiến độ" : current ? "Làm bước này" : "Mở"}
        </PillButton>
      ),
    };
  });

  return <JourneyList title={`Hành trình · vòng ${journey.round}`} rows={rows} />;
}

type JourneyRow = { key: JourneyStepKey; status: JourneyStatus; current: boolean; summary: string; action: ReactNode };

export function JourneyList({ title, rows }: { title: string; rows: JourneyRow[] }) {
  return (
    <Card className="flex min-w-0 flex-1 flex-col gap-5 p-6">
      <h2 className="text-[17px] font-bold text-vehicsim-ink">{title}</h2>
      <ol className="flex flex-col">
        {rows.map((row, i) => {
          const step = stepDefinition(row.key);
          const last = i === rows.length - 1;
          return (
            <li key={step.key} className="flex gap-4">
              <div className="flex flex-col items-center">
                <StepStatusIcon status={row.status} n={step.n} current={row.current} />
                {!last && <span aria-hidden className="my-1 w-[2px] flex-1 rounded-full bg-vehicsim-line" />}
              </div>
              <div className={cx("flex min-w-0 flex-1 flex-wrap items-start justify-between gap-3", !last && "pb-6")}>
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-[16px] font-bold text-vehicsim-ink">
                    {STEP_NUMBER[i]} {step.title}
                  </span>
                  <span className="text-[14px] text-vehicsim-muted">{step.question}</span>
                  <span className={cx("text-[14px] font-semibold", row.status === "FAILED" ? "text-vehicsim-danger" : "text-vehicsim-ink")}>
                    {row.summary}
                  </span>
                </div>
                {row.action}
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
